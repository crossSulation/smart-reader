"""
Service for building and maintaining the cross-document knowledge graph.
Handles relationship inference between knowledge points.
"""
import json
import re
from collections import defaultdict
from typing import List, Dict, Tuple
from sqlalchemy.orm import Session

from app.models import KnowledgePoint, KnowledgeLink, DocumentChunk
from app.services.llm_service import complete_and_log
from app.config import get_settings


RELATION_SYSTEM = """You are a knowledge graph linker. Given two knowledge points from different contexts, determine if they have a meaningful semantic relationship.

For each pair, return a JSON object with:
- related: true/false
- relation_type: one of "related_to", "prerequisite_of", "derived_from", "contradicts", "extends" (only if related=true)
- confidence: 0.0 to 1.0
- explanation: one short sentence

Input format: {"source": "Label1", "target": "Label2", "source_desc": "description1", "target_desc": "description2"}

Return ONLY a JSON object. Example:
{"related": true, "relation_type": "prerequisite_of", "confidence": 0.85, "explanation": "Understanding X is required before grasping Y"}

If no relationship exists, return {"related": false, "confidence": 0.0}
"""


def _parse_llm_relation_json(raw: str) -> dict:
    if not raw:
        return {"related": False, "confidence": 0.0}
    cleaned = raw.strip()
    match = re.search(r'\{[\s\S]*\}', cleaned)
    if match:
        cleaned = match.group(0)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return {"related": False, "confidence": 0.0}


def _cooccurrence_weight(
    source_chunks: List[int],
    target_chunks: List[int],
) -> float:
    """Calculate Jaccard similarity of source chunk sets."""
    if not source_chunks or not target_chunks:
        return 0.0
    s = set(source_chunks)
    t = set(target_chunks)
    intersection = len(s & t)
    if intersection == 0:
        return 0.0
    return intersection / len(s | t)


def infer_relationships(
    user_id: int,
    db: Session,
    max_pairs: int = 50,
    min_confidence: float = 0.5,
) -> int:
    """
    Use LLM to infer relationships between knowledge points that co-occur in
    the same or related chunks. Also uses co-occurrence as a signal.

    Returns number of new links created.
    """
    kps = (
        db.query(KnowledgePoint)
        .filter(KnowledgePoint.user_id == user_id)
        .all()
    )
    if len(kps) < 2:
        return 0

    existing_links = set()
    for link in db.query(KnowledgeLink).all():
        existing_links.add((link.source_kp_id, link.target_kp_id))
        existing_links.add((link.target_kp_id, link.source_kp_id))

    kp_chunks = {}
    for kp in kps:
        try:
            kp_chunks[kp.id] = set(json.loads(kp.source_chunk_ids or "[]"))
        except (json.JSONDecodeError, TypeError):
            kp_chunks[kp.id] = set()

    pairs = []
    for i in range(len(kps)):
        for j in range(i + 1, len(kps)):
            if (kps[i].id, kps[j].id) in existing_links:
                continue
            cooc = _cooccurrence_weight(kp_chunks.get(kps[i].id, set()), kp_chunks.get(kps[j].id, set()))
            pairs.append((kps[i], kps[j], cooc))

    pairs.sort(key=lambda x: -x[2])
    pairs = pairs[:max_pairs]

    count = 0
    for src_kp, tgt_kp, cooc in pairs:
        prompt = json.dumps({
            "source": src_kp.label,
            "target": tgt_kp.label,
            "source_desc": src_kp.description or "",
            "target_desc": tgt_kp.description or "",
        })
        settings = get_settings()
        raw = complete_and_log(prompt, RELATION_SYSTEM, settings, db, user_id, "knowledge_extraction")
        result = _parse_llm_relation_json(raw)

        related = result.get("related", False)
        confidence = result.get("confidence", 0.0)

        combined_confidence = max(confidence, cooc * 0.5)

        if related and combined_confidence >= min_confidence:
            link = KnowledgeLink(
                source_kp_id=src_kp.id,
                target_kp_id=tgt_kp.id,
                relation_type=result.get("relation_type", "related_to"),
                weight=round(combined_confidence, 2),
                evidence_chunk_ids=json.dumps(
                    list(kp_chunks.get(src_kp.id, set()) | kp_chunks.get(tgt_kp.id, set()))
                ),
            )
            db.add(link)
            count += 1

    if count > 0:
        db.commit()

    return count


def build_knowledge_graph_for_book(
    book_id: int,
    user_id: int,
    db: Session,
) -> dict:
    """
    Extract knowledge points for a book, then infer relationships
    among all of the user's existing knowledge points.
    """
    from app.services.knowledge_extraction_service import extract_knowledge_points_for_book
    extracted = extract_knowledge_points_for_book(book_id, user_id, db)

    links_created = 0
    if extracted > 0:
        links_created = infer_relationships(user_id, db)

    return {
        "book_id": book_id,
        "knowledge_points_extracted": extracted,
        "relationships_created": links_created,
    }
