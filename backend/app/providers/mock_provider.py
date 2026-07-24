from __future__ import annotations
import json as _json

from app.providers.base import AIProvider, ProviderResult, EmbedResult, RerankResult


class MockProvider(AIProvider):
    provider_name = "mock"

    async def generate(self, prompt: str, system: str = "", **kwargs) -> ProviderResult:
        from app.services.llm_service import complete
        settings = _mock_settings()
        result = complete(prompt, system, settings)
        return ProviderResult(
            content=result.text,
            provider="mock",
            model="mock",
            metadata={
                "prompt_tokens": result.prompt_tokens,
                "completion_tokens": result.completion_tokens,
            },
        )

    async def embed(self, texts: list[str]) -> list[EmbedResult]:
        import hashlib
        results = []
        for text in texts:
            h = hashlib.sha256(text.encode()).digest()
            vector = [(b / 255.0) * 2 - 1 for b in h[:384]]
            results.append(EmbedResult(vector=vector, provider="mock", dimension=384, model="mock"))
        return results

    async def rerank(self, query: str, documents: list[dict], top_k: int = 10) -> RerankResult:
        scored = [{"id": d.get("id", i), "text": d.get("text", ""), "score": 0.5}
                  for i, d in enumerate(documents[:top_k])]
        return RerankResult(scored_docs=scored, provider="mock")

    async def is_available(self) -> bool:
        return True


def _mock_settings():
    from app.config import get_settings
    settings = get_settings()
    settings.LLM_PROVIDER = "mock"
    settings.LLM_MODEL = "mock"
    return settings
