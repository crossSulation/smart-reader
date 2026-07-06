"""
Service for building and maintaining the cross-document knowledge graph.
Handles relationship inference between knowledge points.
"""
import json
import re
import math
from typing import List
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


def _cosine_similarity(a: List[float], b: List[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def _embed_kp_texts(kps: List[KnowledgePoint]) -> List[List[float]]:
    """Embed label + description for each knowledge point.
    Falls back to zero vectors if embedding fails."""
    texts = []
    for kp in kps:
        parts = [kp.label]
        if kp.description:
            parts.append(kp.description)
        texts.append(" ".join(parts))

    try:
        from app.services.embedding_service import embed_texts
        from app.config import get_settings
        settings = get_settings()
        return embed_texts(texts, settings.EMBEDDING_MODEL)
    except Exception:
        # Fallback: zero vectors — pairs will rank by label overlap
        return [[0.0] * 10 for _ in texts]


def infer_relationships(
    user_id: int,
    db: Session,
    max_pairs: int = 50,
    min_confidence: float = 0.5,
) -> int:
    """
    Use embedding similarity to find the most semantically related knowledge
    point pairs, then use LLM to infer relationship types and validity.

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

    # Embed all KP texts and compute pairwise cosine similarity
    vectors = _embed_kp_texts(kps)
    pairs = []
    all_zero = all(sum(v) == 0 for v in vectors)
    for i in range(len(kps)):
        for j in range(i + 1, len(kps)):
            if (kps[i].id, kps[j].id) in existing_links:
                continue
            if all_zero:
                sim = _label_overlap_score(kps[i].label, kps[j].label)
            else:
                sim = _cosine_similarity(vectors[i], vectors[j])
            pairs.append((kps[i], kps[j], sim))

    pairs.sort(key=lambda x: -x[2])
    pairs = pairs[:max_pairs]

    count = 0
    for src_kp, tgt_kp, sim in pairs:
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
        combined = max(confidence, sim * 0.3)

        if related and combined >= min_confidence:
            link = KnowledgeLink(
                source_kp_id=src_kp.id,
                target_kp_id=tgt_kp.id,
                relation_type=result.get("relation_type", "related_to"),
                weight=round(combined, 2),
                evidence_chunk_ids=json.dumps([]),
            )
            db.add(link)
            count += 1

    if count > 0:
        db.commit()

    return count


def _label_overlap_score(label_a: str, label_b: str) -> float:
    """Simple word overlap score when embeddings are unavailable."""
    words_a = set(label_a.lower().split())
    words_b = set(label_b.lower().split())
    if not words_a or not words_b:
        return 0.0
    intersection = len(words_a & words_b)
    return intersection / min(len(words_a), len(words_b))


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
