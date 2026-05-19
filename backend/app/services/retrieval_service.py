"""
Hybrid Retrieval Service
------------------------
Combines BM25 (keyword-based) and vector (semantic) retrieval with weighted merging.

Strategy:
1. Split queries into tokens for keyword matching
2. Score all chunks using BM25 (lexical relevance)
3. Score all chunks using vector similarity (semantic relevance)
4. Normalize scores to 0-1 range
5. Merge with configurable weights (default: 0.3 BM25, 0.7 vector)
6. Return top-k candidates

This provides both lexical precision (BM25 for exact terms) and semantic understanding
(embeddings for meaning), reducing hallucination and improving relevance.
"""

import logging
import re
from typing import List, Tuple, Dict, Optional

from rank_bm25 import BM25Okapi

from app.services.embedding_service import (
    cosine_similarity,
    from_json,
)

logger = logging.getLogger(__name__)


class HybridRetriever:
    """Hybrid BM25 + Vector retriever for book chunks."""

    def __init__(
        self,
        bm25_weight: float = 0.3,
        vector_weight: float = 0.7,
    ):
        """
        Args:
            bm25_weight: Weight for BM25 scores in merge (0.0-1.0)
            vector_weight: Weight for vector scores in merge (0.0-1.0)
        """
        self.bm25_weight = bm25_weight
        self.vector_weight = vector_weight
        self.bm25_index: Optional[BM25Okapi] = None
        self.chunk_texts: Dict[int, str] = {}  # chunk_id -> text for BM25
        self.chunk_embeddings: Dict[int, List[float]] = {}  # chunk_id -> embedding

    def build_index(self, chunks: List[Tuple[int, str, str]]) -> None:
        """
        Build BM25 index from chunks.
        
        Args:
            chunks: List of (chunk_id, text, embedding_json) tuples
        """
        self.chunk_texts = {}
        self.chunk_embeddings = {}
        texts_to_index = []

        for chunk_id, text, emb_json in chunks:
            self.chunk_texts[chunk_id] = text
            # Parse embedding if available
            if emb_json:
                try:
                    self.chunk_embeddings[chunk_id] = from_json(emb_json)
                except Exception as e:
                    logger.warning(f"Failed to parse embedding for chunk {chunk_id}: {e}")

            # Tokenize for BM25
            tokens = self._tokenize(text)
            texts_to_index.append(tokens)

        # Build BM25 index
        self.bm25_index = BM25Okapi(texts_to_index)
        logger.info(
            f"Built hybrid retrieval index: {len(self.chunk_texts)} chunks, "
            f"{len(self.chunk_embeddings)} with embeddings"
        )

    def retrieve(
        self,
        query: str,
        query_vector: Optional[List[float]] = None,
        top_k: int = 5,
    ) -> List[Tuple[int, float]]:
        """
        Retrieve top-k most relevant chunks using hybrid scoring.
        
        Args:
            query: The query text (for BM25 keyword matching)
            query_vector: The query embedding (for vector similarity)
            top_k: Number of results to return
            
        Returns:
            List of (chunk_id, merged_score) tuples, sorted by score descending
        """
        if not self.bm25_index or not self.chunk_texts:
            return []

        # Get BM25 scores
        query_tokens = self._tokenize(query)
        bm25_scores_raw = self.bm25_index.get_scores(query_tokens)

        # Get vector scores if embedding provided
        vector_scores_raw = {}
        if query_vector:
            for chunk_id, emb in self.chunk_embeddings.items():
                vector_scores_raw[chunk_id] = cosine_similarity(query_vector, emb)

        # Normalize scores to 0-1 range
        bm25_scores_norm = self._normalize_scores(
            {i: score for i, score in enumerate(bm25_scores_raw)}
        )
        vector_scores_norm = self._normalize_scores(vector_scores_raw) if vector_scores_raw else {}

        # Merge scores
        merged_scores = {}
        chunk_ids = list(self.chunk_texts.keys())
        
        for i, chunk_id in enumerate(chunk_ids):
            bm25_score = bm25_scores_norm.get(i, 0.0)
            vector_score = vector_scores_norm.get(chunk_id, 0.0) if query_vector else 0.0

            # Weighted merge
            merged = (self.bm25_weight * bm25_score) + (self.vector_weight * vector_score)
            merged_scores[chunk_id] = merged

        # Sort and return top-k
        results = sorted(merged_scores.items(), key=lambda x: x[1], reverse=True)
        return results[:top_k]

    def _tokenize(self, text: str) -> List[str]:
        """Simple tokenization for BM25."""
        # Convert to lowercase, split on whitespace and punctuation
        text = text.lower()
        tokens = re.findall(r'\b\w+\b', text)
        return tokens

    def _normalize_scores(self, scores: Dict[int, float]) -> Dict[int, float]:
        """Normalize scores to 0-1 range."""
        if not scores:
            return {}
        
        min_score = min(scores.values())
        max_score = max(scores.values())
        range_score = max_score - min_score

        if range_score == 0:
            return {k: 0.5 for k in scores}  # All equal, return 0.5 for each

        return {
            k: (v - min_score) / range_score
            for k, v in scores.items()
        }


# Global retriever instance (per-book is better, but global is simpler for MVP)
_global_retrievers: Dict[int, HybridRetriever] = {}


def build_retriever_for_book(book_id: int, chunks: List[Tuple[int, str, str]]) -> HybridRetriever:
    """
    Build and cache a hybrid retriever for a book.
    
    Args:
        book_id: The book ID
        chunks: List of (chunk_id, text, embedding_json) tuples
        
    Returns:
        A HybridRetriever instance
    """
    retriever = HybridRetriever()
    retriever.build_index(chunks)
    _global_retrievers[book_id] = retriever
    return retriever


def retrieve_hybrid(
    book_id: int,
    query: str,
    query_vector: Optional[List[float]] = None,
    top_k: int = 5,
    chunks: Optional[List[Tuple[int, str, str]]] = None,
) -> List[Tuple[int, float]]:
    """
    Hybrid retrieve from a book. Automatically builds index if not cached.
    
    Args:
        book_id: The book ID
        query: The query text
        query_vector: The query embedding (optional)
        top_k: Number of results
        chunks: If provided, builds index from these chunks (for on-demand indexing)
        
    Returns:
        List of (chunk_id, score) tuples
    """
    # Use cached retriever if available
    if book_id in _global_retrievers:
        retriever = _global_retrievers[book_id]
    elif chunks:
        # Build on-demand
        retriever = build_retriever_for_book(book_id, chunks)
    else:
        logger.warning(f"No retriever for book {book_id} and no chunks provided")
        return []

    return retriever.retrieve(query, query_vector, top_k)


def clear_retriever(book_id: int) -> None:
    """Clear cached retriever for a book (e.g., after re-indexing)."""
    _global_retrievers.pop(book_id, None)
