"""
Reranking Service
-----------------
Uses a cross-encoder model to rerank candidate chunks for improved relevance.
A cross-encoder directly scores query-document pairs, often outperforming
hybrid retrieval alone for precision ranking.

Flow:
1. Take top-N candidates from hybrid retrieval
2. Score each (query, candidate) pair with cross-encoder
3. Sort by cross-encoder score
4. Return top-k reranked results
"""

import logging
from typing import List, Tuple, Optional

logger = logging.getLogger(__name__)

_model = None  # cached cross-encoder model
_model_name = ""  # name of loaded model


def _get_cross_encoder(model_name: str):
    """Lazy-load and cache cross-encoder model."""
    global _model, _model_name
    if _model is None or _model_name != model_name:
        try:
            from sentence_transformers import CrossEncoder
        except ImportError as exc:
            raise RuntimeError(
                "sentence-transformers is required for cross-encoding. "
                "Install it with: pip install sentence-transformers"
            ) from exc
        
        logger.info(f"Loading cross-encoder model: {model_name}")
        _model = CrossEncoder(model_name)
        _model_name = model_name
        logger.info("Cross-encoder model loaded.")
    
    return _model


def rerank_candidates(
    query: str,
    candidates: List[Tuple[int, str, float]],
    model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2",
    top_k: int = 5,
) -> List[Tuple[int, float]]:
    """
    Rerank candidates using a cross-encoder model.
    
    Args:
        query: The search query
        candidates: List of (chunk_id, chunk_text, hybrid_score) tuples
        model_name: Cross-encoder model to use
        top_k: Number of results to return
        
    Returns:
        List of (chunk_id, rerank_score) tuples, sorted by score descending
    """
    if not candidates:
        return []
    
    try:
        cross_encoder = _get_cross_encoder(model_name)
    except Exception as e:
        logger.error(f"Failed to load cross-encoder: {e}")
        # Fallback: return candidates sorted by original score
        return [(cid, score) for cid, _, score in candidates][:top_k]
    
    # Prepare query-document pairs for cross-encoder
    pairs = [(query, text) for _, text, _ in candidates]
    
    try:
        # Get cross-encoder scores
        scores = cross_encoder.predict(pairs, show_progress_bar=False)
        
        # Map back to chunk_ids with scores
        reranked = [
            (cid, float(score))
            for (cid, _, _), score in zip(candidates, scores)
        ]
        
        # Sort by rerank score descending
        reranked.sort(key=lambda x: x[1], reverse=True)
        
        logger.debug(f"Reranked {len(candidates)} candidates to top-{top_k}")
        return reranked[:top_k]
    
    except Exception as e:
        logger.error(f"Error during cross-encoding: {e}")
        # Fallback: return candidates sorted by original score
        return [(cid, score) for cid, _, score in candidates][:top_k]
