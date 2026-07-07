"""
Service for extracting knowledge points from document chunks using LLM.
"""
import json
import re
from typing import List, Dict
from sqlalchemy.orm import Session

from app.models import KnowledgePoint, DocumentChunk
from app.services.llm_service import complete_and_log
from app.config import get_settings


EXTRACTION_SYSTEM = """You are a knowledge extraction engine. Given a list of text excerpts from a document, extract the most important knowledge points (concepts, key terms, named entities, events).

For each knowledge point, provide:
1. label: A concise name (2-8 words)
2. entity_type: One of "concept", "term", "person", "event"
3. description: A one-sentence explanation (optional, omit if unclear)
4. aliases: Alternative names or abbreviations (optional)
5. chunk_id: The id of the source excerpt this knowledge point was extracted from

Input format: {"chunks": [{"id": 0, "text": "..."}, {"id": 1, "text": "..."}]}

Return ONLY a JSON object with a "results" array. Example:
{"results": [
  {"label": "Mitochondria", "entity_type": "concept", "description": "Organelle responsible for cellular respiration", "aliases": ["mitochondrion"], "chunk_id": 0},
  {"label": "ATP Synthesis", "entity_type": "concept", "description": "Process of converting ADP to ATP", "aliases": [], "chunk_id": 1}
]}

If no meaningful knowledge points can be extracted, return {"results": []}.
"""

BATCH_SIZE = 10  # chunks per LLM call


def _parse_llm_json(raw: str) -> List[dict]:
    """Robust JSON extraction from LLM output, handling markdown code fences and different wrappers."""
    if not raw:
        return []
    cleaned = raw.strip()
    match = re.search(r'\{[\s\S]*\}', cleaned)
    if match:
        cleaned = match.group(0)
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        # Fallback: try array format
        arr_match = re.search(r'\[[\s\S]*\]', cleaned)
        if arr_match:
            try:
                data = json.loads(arr_match.group(0))
            except json.JSONDecodeError:
                return []
        else:
            return []

    if isinstance(data, dict) and "results" in data:
        return data["results"]
    if isinstance(data, list):
        return data
    return []


def _deduplicate_kps(existing_labels: set, new_kps: List[dict]) -> List[dict]:
    """Filter out new KPs whose label already exists (case-insensitive)."""
    return [
        kp for kp in new_kps
        if kp.get("label", "").strip().lower() not in existing_labels
    ]


def extract_knowledge_points_from_chunks(
    chunk_ids: List[int],
    book_id: int,
    user_id: int,
    db: Session,
    max_chunks: int = 20,
) -> List[int]:
    """
    Extract knowledge points from selected chunks and persist them.
    Processes chunks in batches to minimize LLM calls.

    Returns list of created KnowledgePoint IDs.
    """
    if not chunk_ids:
        return []

    chunks = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.id.in_(chunk_ids[:max_chunks]))
        .all()
    )
    if not chunks:
        return []

    # Build chunk lookup: chunk_id -> chunk
    chunk_map: dict[int, DocumentChunk] = {ch.id: ch for ch in chunks}
    existing_labels = {
        row[0].lower()
        for row in db.query(KnowledgePoint.label)
        .filter(KnowledgePoint.user_id == user_id)
        .all()
    }

    chunk_batches = [chunks[i:i + BATCH_SIZE] for i in range(0, len(chunks), BATCH_SIZE)]
    settings = get_settings()
    created_ids = []

    for batch in chunk_batches:
        batch_payload = {
            "chunks": [
                {
                    "id": idx,
                    "text": ch.text[:2000] if ch.text else "",
                }
                for idx, ch in enumerate(batch)
            ]
        }
        prompt = json.dumps(batch_payload)
        raw = complete_and_log(prompt, EXTRACTION_SYSTEM, settings, db, user_id, "knowledge_extraction")
        extracted = _parse_llm_json(raw)
        new_kps = _deduplicate_kps(existing_labels, extracted)

        for kp_data in new_kps:
            label = kp_data.get("label", "").strip()
            if not label:
                continue

            # Map batch-local index back to real chunk_id
            cid_local = kp_data.get("chunk_id", 0)
            real_chunk = batch[cid_local] if 0 <= cid_local < len(batch) else None
            source_ids = [real_chunk.id] if real_chunk else []

            kp = KnowledgePoint(
                user_id=user_id,
                label=label,
                aliases=json.dumps(kp_data.get("aliases", []) or []),
                description=kp_data.get("description"),
                source_chunk_ids=json.dumps(source_ids),
                entity_type=kp_data.get("entity_type", "concept"),
            )
            db.add(kp)
            db.flush()
            created_ids.append(kp.id)
            existing_labels.add(label.lower())

    db.commit()
    return created_ids


def extract_knowledge_points_for_book(
    book_id: int,
    user_id: int,
    db: Session,
    sample_count: int = 30,
) -> int:
    """
    Convenience: extract KPs from evenly sampled chunks of a given book.
    Returns total extracted count.
    """
    all_chunks = (
        db.query(DocumentChunk.id)
        .filter(DocumentChunk.book_id == book_id)
        .order_by(DocumentChunk.chunk_index)
        .all()
    )
    if not all_chunks:
        return 0

    step = max(1, len(all_chunks) // sample_count)
    sampled = [row[0] for i, row in enumerate(all_chunks) if i % step == 0][:sample_count]

    ids = extract_knowledge_points_from_chunks(sampled, book_id, user_id, db)
    return len(ids)
