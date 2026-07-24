from __future__ import annotations
import logging

from app.providers.base import AIProvider, ProviderResult, EmbedResult, RerankResult

logger = logging.getLogger(__name__)


class LocalProvider(AIProvider):
    provider_name = "local"

    def __init__(self, settings=None):
        self.settings = settings
        self._ollama_checked = False
        self._ollama_available = False

    async def generate(self, prompt: str, system: str = "", **kwargs) -> ProviderResult:
        import requests
        if self.settings is None:
            raise RuntimeError("LocalProvider not configured")

        base_url = (self.settings.LLM_BASE_URL or "http://localhost:11434").rstrip("/")
        url = f"{base_url}/api/chat"
        model = self.settings.LLM_MODEL or "llama3"

        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": model,
            "messages": messages,
            "stream": False,
            "options": {
                "num_predict": self.settings.LLM_MAX_TOKENS,
                "temperature": self.settings.LLM_TEMPERATURE,
            },
        }

        try:
            resp = requests.post(url, json=payload, timeout=120)
            resp.raise_for_status()
            data = resp.json()
            text = data["message"]["content"].strip()
            return ProviderResult(
                content=text,
                confidence=0.8,
                provider="ollama",
                model=model,
                metadata={
                    "prompt_tokens": data.get("prompt_eval_count", 0),
                    "completion_tokens": data.get("eval_count", 0),
                },
            )
        except Exception as exc:
            logger.error("Ollama generate failed: %s", exc)
            raise RuntimeError(f"Local LLM request failed: {exc}") from exc

    async def embed(self, texts: list[str]) -> list[EmbedResult]:
        import requests
        if self.settings is None:
            raise RuntimeError("LocalProvider not configured")

        base_url = (self.settings.LLM_BASE_URL or "http://localhost:11434").rstrip("/")
        url = f"{base_url}/api/embeddings"
        model = self.settings.EMBEDDING_MODEL or "all-MiniLM-L6-v2"

        results = []
        for text in texts:
            payload = {"model": model, "prompt": text}
            try:
                resp = requests.post(url, json=payload, timeout=30)
                resp.raise_for_status()
                data = resp.json()
                vector = data.get("embedding", [])
                results.append(EmbedResult(vector=vector, provider="ollama", dimension=len(vector), model=model))
            except Exception as exc:
                logger.error("Ollama embed failed: %s", exc)
                raise RuntimeError(f"Local embedding failed: {exc}") from exc

        return results

    async def rerank(self, query: str, documents: list[dict], top_k: int = 10) -> RerankResult:
        raise NotImplementedError("Local reranker not yet implemented (Phase 3.3)")

    async def is_available(self) -> bool:
        if self.settings is None:
            return False
        if self._ollama_checked:
            return self._ollama_available

        import requests
        base_url = (self.settings.LLM_BASE_URL or "http://localhost:11434").rstrip("/")
        try:
            resp = requests.get(f"{base_url}/api/tags", timeout=3)
            self._ollama_available = resp.status_code == 200
        except Exception:
            self._ollama_available = False

        self._ollama_checked = True
        logger.info("LocalProvider availability: %s", self._ollama_available)
        return self._ollama_available
