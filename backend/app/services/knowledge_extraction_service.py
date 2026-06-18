"""
Service for extracting knowledge points from document chunks using LLM.
"""
import json
import re
from typing import List, Dict
from sqlalchemy.orm import Session

from app.models import KnowledgePoint, DocumentChunk
from app.services.llm_service import complete
from app.config import get_settings


EXTRACTION_SYSTEM = """You are a knowledge extraction engine. Given a text excerpt from a document, extract the most important knowledge points (concepts, key terms, named entities, events).

For each knowledge point, provide:
1. label: A concise name (2-8 words)
2. entity_type: One of "concept", "term", "person", "event"
3. description: A one-sentence explanation (optional, omit if unclear)
4. aliases: Alternative names or abbreviations (optional)

Return ONLY a JSON array of objects. Example:
[
  {"label": "Mitochondria", "entity_type": "concept", "description": "Organelle responsible for cellular respiration and energy production", "aliases": ["mitochondrion"]},
  {"label": "ATP Synthesis", "entity_type": "concept", "description": "Process of converting ADP to ATP using proton gradient", "aliases": []}
]

If no meaningful knowledge points can be extracted, return an empty array [].
"""


def _parse_llm_json(raw: str) -> List[dict]:
    """Robust JSON extraction from LLM output, handling markdown code fences."""
    if not raw:
        return []
    cleaned = raw.strip()
    match = re.search(r'\[[\s\S]*\]', cleaned)
    if match:
        cleaned = match.group(0)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
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

    existing_labels = {
        row[0].lower()
        for row in db.query(KnowledgePoint.label)
        .filter(KnowledgePoint.user_id == user_id)
        .all()
    }

    created_ids = []
    for chunk in chunks:
        if not chunk.text:
            continue

        text = chunk.text[:2000]
        settings = get_settings()
        raw = complete(text, EXTRACTION_SYSTEM, settings)
        extracted = _parse_llm_json(raw)
        new_kps = _deduplicate_kps(existing_labels, extracted)

        for kp_data in new_kps:
            label = kp_data.get("label", "").strip()
            if not label:
                continue

            kp = KnowledgePoint(
                user_id=user_id,
                label=label,
                aliases=json.dumps(kp_data.get("aliases", []) or []),
                description=kp_data.get("description"),
                source_chunk_ids=json.dumps([chunk.id]),
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
