from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import AsyncIterator


@dataclass
class ProviderResult:
    content: str
    confidence: float = 1.0
    provider: str = "unknown"
    model: str = ""
    metadata: dict = field(default_factory=dict)


@dataclass
class EmbedResult:
    vector: list[float]
    provider: str
    dimension: int
    model: str = ""


@dataclass
class RerankResult:
    scored_docs: list[dict]
    provider: str
    model: str = ""


class AIProvider(ABC):
    provider_name: str = "base"

    @abstractmethod
    async def generate(self, prompt: str, system: str = "", **kwargs) -> ProviderResult:
        ...

    @abstractmethod
    async def embed(self, texts: list[str]) -> list[EmbedResult]:
        ...

    @abstractmethod
    async def rerank(self, query: str, documents: list[dict], top_k: int = 10) -> RerankResult:
        ...

    @abstractmethod
    async def is_available(self) -> bool:
        ...
