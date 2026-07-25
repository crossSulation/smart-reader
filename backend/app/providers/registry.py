from __future__ import annotations
from typing import Optional

from app.providers.base import AIProvider


class ProviderRegistry:
    def __init__(self):
        self._providers: dict[str, AIProvider] = {}

    def register(self, provider: AIProvider):
        self._providers[provider.provider_name] = provider

    def get(self, name: str) -> Optional[AIProvider]:
        return self._providers.get(name)

    def get_available(self) -> list[AIProvider]:
        return [p for p in self._providers.values()]

    def resolve(self, capability: str = "generate", prefer: str = "cloud") -> AIProvider:
        preferred = self._providers.get(prefer)
        if preferred and hasattr(preferred, capability):
            return preferred
        for provider in self._providers.values():
            if hasattr(provider, capability):
                return provider
        raise RuntimeError(f"No provider available for capability: {capability}")


_registry: Optional[ProviderRegistry] = None


def get_registry() -> ProviderRegistry:
    global _registry
    if _registry is None:
        _registry = ProviderRegistry()
    return _registry


def init_providers(settings):
    registry = get_registry()

    from app.providers.cloud_provider import CloudProvider
    from app.providers.mock_provider import MockProvider
    from app.providers.local_provider import LocalProvider

    registry.register(CloudProvider(settings))
    registry.register(MockProvider())
    registry.register(LocalProvider(settings))
