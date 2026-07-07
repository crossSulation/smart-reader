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


RELATION_SYSTEM = """You are a knowledge graph linker. Given a list of knowledge point pairs, determine which have meaningful semantic relationships.

For each pair, analyze whether the two knowledge points are related. Return a JSON array of results, one per pair.

Input format: {"pairs": [{"id": 0, "source": "Label1", "target": "Label2", "source_desc": "desc1", "target_desc": "desc2"}, ...]}

Return: {"results": [{"id": 0, "related": true/false, "relation_type": "related_to|prerequisite_of|derived_from|contradicts|extends", "confidence": 0.0-1.0}, ...]}

Only include pairs where related=true (skip unrelated pairs). If no pairs are related, return {"results": []}.

Example: {"results": [{"id": 0, "related": true, "relation_type": "prerequisite_of", "confidence": 0.85}, {"id": 2, "related": true, "relation_type": "extends", "confidence": 0.65}]}
"""

BATCH_SIZE = 25  # pairs per LLM call to stay within token limits


def _parse_llm_relation_json(raw: str) -> dict:
    """Parse a single-pair response (kept for compatibility)."""
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


def _parse_batch_result(raw: str) -> list[dict]:
    """Parse batch LLM response: extract JSON array of results."""
    if not raw:
        return []
    cleaned = raw.strip()
    m = re.search(r'\[[\s\S]*\]', cleaned)
    if not m:
        return []
    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError:
        return []
    if isinstance(data, dict) and "results" in data:
        return data["results"]
    if isinstance(data, list):
        return data
    return []


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

    if not pairs:
        return 0

    settings = get_settings()
    count = 0

    # Batch LLM calls: send up to BATCH_SIZE pairs per call
    for batch_start in range(0, len(pairs), BATCH_SIZE):
        batch = pairs[batch_start:batch_start + BATCH_SIZE]
        batch_payload = {
            "pairs": [
                {
                    "id": i,
                    "source": src.label,
                    "target": tgt.label,
                    "source_desc": src.description or "",
                    "target_desc": tgt.description or "",
                }
                for i, (src, tgt, _) in enumerate(batch)
            ]
        }
        prompt = json.dumps(batch_payload)
        raw = complete_and_log(prompt, RELATION_SYSTEM, settings, db, user_id, "knowledge_extraction")
        results = _parse_batch_result(raw)

        # Map results back to pairs
        result_map: dict[int, dict] = {}
        for r in results:
            rid = r.get("id")
            if isinstance(rid, int) and 0 <= rid < len(batch):
                result_map[rid] = r

        for i, (src_kp, tgt_kp, _) in enumerate(batch):
            result = result_map.get(i, {})
            related = result.get("related", False)
            confidence = result.get("confidence", 0.0)

            if not related or confidence < min_confidence:
                continue

            link = KnowledgeLink(
                source_kp_id=src_kp.id,
                target_kp_id=tgt_kp.id,
                relation_type=result.get("relation_type", "related_to"),
                weight=round(confidence, 2),
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
