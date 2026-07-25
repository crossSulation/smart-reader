from __future__ import annotations
from app.providers.base import AIProvider, ProviderResult, EmbedResult, RerankResult
from app.services.llm_service import complete
from app.services.embedding_service import embed_texts
from app.services.reranker_service import rerank_candidates


class CloudProvider(AIProvider):
    provider_name = "cloud"

    def __init__(self, settings):
        self.settings = settings

    async def generate(self, prompt: str, system: str = "", **kwargs) -> ProviderResult:
        result = complete(prompt, system, self.settings)
        return ProviderResult(
            content=result.text,
            provider=self.settings.LLM_PROVIDER,
            model=result.model,
            metadata={
                "prompt_tokens": result.prompt_tokens,
                "completion_tokens": result.completion_tokens,
            },
        )

    async def embed(self, texts: list[str]) -> list[EmbedResult]:
        model_name = self.settings.EMBEDDING_MODEL
        vectors = embed_texts(texts, model_name)
        return [
            EmbedResult(vector=v, provider="cloud", dimension=len(v), model=model_name)
            for v in vectors
        ]

    async def rerank(self, query: str, documents: list[dict], top_k: int = 10) -> RerankResult:
        results = rerank_candidates(query, documents, top_k=top_k)
        return RerankResult(scored_docs=results, provider="cloud")

    async def is_available(self) -> bool:
        return bool(self.settings.LLM_API_KEY)
