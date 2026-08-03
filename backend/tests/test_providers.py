import pytest
import asyncio

from app.providers.base import AIProvider, ProviderResult, EmbedResult, RerankResult
from app.providers.mock_provider import MockProvider
from app.providers.cloud_provider import CloudProvider
from app.providers.local_provider import LocalProvider
from app.providers.registry import ProviderRegistry, get_registry, init_providers


class TestProviderBase:
    def test_provider_result_defaults(self):
        result = ProviderResult(content="test")
        assert result.content == "test"
        assert result.confidence == 1.0
        assert result.provider == "unknown"
        assert result.model == ""
        assert result.metadata == {}

    def test_provider_result_full(self):
        result = ProviderResult(content="hello", confidence=0.9, provider="openai", model="gpt-4", metadata={"tokens": 100})
        assert result.confidence == 0.9
        assert result.provider == "openai"
        assert result.model == "gpt-4"
        assert result.metadata["tokens"] == 100

    def test_embed_result(self):
        result = EmbedResult(vector=[0.1, 0.2, 0.3], provider="local", dimension=3)
        assert result.vector == [0.1, 0.2, 0.3]
        assert result.dimension == 3

    def test_rerank_result(self):
        result = RerankResult(scored_docs=[{"id": 1, "score": 0.9}], provider="cloud")
        assert result.scored_docs[0]["score"] == 0.9


class TestMockProvider:
    @pytest.mark.asyncio
    async def test_is_available(self):
        p = MockProvider()
        assert await p.is_available() is True

    @pytest.mark.asyncio
    async def test_generate_returns_result(self):
        p = MockProvider()
        result = await p.generate("What is AI?", "")
        assert isinstance(result, ProviderResult)
        assert result.provider == "mock"
        assert len(result.content) > 0

    @pytest.mark.asyncio
    async def test_embed_returns_384dim(self):
        p = MockProvider()
        results = await p.embed(["hello", "world"])
        assert len(results) == 2
        assert results[0].dimension == 384
        assert results[0].provider == "mock"

    @pytest.mark.asyncio
    async def test_rerank_returns_results(self):
        p = MockProvider()
        result = await p.rerank("query", [{"id": "a", "text": "doc A"}, {"id": "b", "text": "doc B"}], top_k=1)
        assert len(result.scored_docs) == 1
        assert result.provider == "mock"


class TestCloudProvider:
    @pytest.mark.asyncio
    async def test_not_available_without_api_key(self, mock_settings):
        p = CloudProvider(mock_settings)
        assert await p.is_available() is False

    @pytest.mark.asyncio
    async def test_available_with_api_key(self, openai_settings):
        p = CloudProvider(openai_settings)
        assert await p.is_available() is True


class TestLocalProvider:
    @pytest.mark.asyncio
    async def test_not_available_by_default(self, mock_settings):
        p = LocalProvider(mock_settings)
        assert await p.is_available() is False


class TestProviderRegistry:
    def test_init_and_register(self, mock_settings):
        init_providers(mock_settings)
        reg = get_registry()

        names = [p.provider_name for p in reg.get_available()]
        assert "cloud" in names
        assert "mock" in names
        assert "local" in names

    def test_get_by_name(self, mock_settings):
        init_providers(mock_settings)
        reg = get_registry()

        cloud = reg.get("cloud")
        assert cloud is not None
        assert cloud.provider_name == "cloud"

        nonexistent = reg.get("nonexistent")
        assert nonexistent is None

    def test_resolve_returns_cloud(self, mock_settings):
        init_providers(mock_settings)
        reg = get_registry()

        provider = reg.resolve("generate", prefer="cloud")
        assert provider is not None
        assert provider.provider_name == "cloud"

    def test_resolve_returns_fallback_when_missing(self, mock_settings):
        init_providers(mock_settings)
        reg = get_registry()

        provider = reg.resolve("generate", prefer="nonexistent")
        assert provider is not None
