"""
Embedding service
-----------------
- Lazy-loads a sentence-transformers model on first use (model is cached in memory).
- Encodes text to float vectors, serialised as JSON for SQLite storage.
- Provides cosine similarity search over a list of (chunk_id, embedding_json) pairs.

Model default: all-MiniLM-L6-v2  (~22 MB, 384-dim, fast CPU inference)
Override with EMBEDDING_MODEL env var.
"""

import json
import logging
import math
from typing import List, Tuple

logger = logging.getLogger(__name__)

_model = None          # cached SentenceTransformer instance
_model_name: str = ""  # name of the loaded model


def _get_model(model_name: str):
    global _model, _model_name
    if _model is None or _model_name != model_name:
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as exc:
            raise RuntimeError(
                "sentence-transformers is required for embeddings. "
                "Install it with: pip install sentence-transformers"
            ) from exc
        logger.info("Loading embedding model: %s", model_name)
        _model = SentenceTransformer(model_name)
        _model_name = model_name
        logger.info("Embedding model loaded.")
    return _model


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def embed_texts(texts: List[str], model_name: str) -> List[List[float]]:
    """Return a list of embedding vectors (one per input text)."""
    model = _get_model(model_name)
    vectors = model.encode(texts, show_progress_bar=False, batch_size=32)
    return [v.tolist() for v in vectors]


def embed_single(text: str, model_name: str) -> List[float]:
    return embed_texts([text], model_name)[0]


def to_json(vector: List[float]) -> str:
    return json.dumps(vector)


def from_json(blob: str) -> List[float]:
    return json.loads(blob)


def cosine_similarity(a: List[float], b: List[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def search_chunks(
    query_vector: List[float],
    candidates: List[Tuple[int, str]],   # [(chunk_id, embedding_json), ...]
    top_k: int = 5,
) -> List[Tuple[int, float]]:
    """
    Return top_k (chunk_id, score) pairs sorted by cosine similarity descending.
    Skips candidates with null/empty embeddings.
    """
    scores: List[Tuple[int, float]] = []
    for chunk_id, emb_json in candidates:
        if not emb_json:
            continue
        try:
            vec = from_json(emb_json)
            score = cosine_similarity(query_vector, vec)
            scores.append((chunk_id, score))
        except Exception:
            continue

    scores.sort(key=lambda x: x[1], reverse=True)
    return scores[:top_k]
