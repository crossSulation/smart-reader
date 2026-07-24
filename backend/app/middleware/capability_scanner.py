import asyncio
import logging
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class RuntimeCapabilities:
    # Backend-side probes
    ollama_available: bool = False
    openai_configured: bool = False

    # Frontend-reported probes (updated via POST /api/capabilities/report)
    is_desktop_app: bool = False
    webgpu_available: bool = False
    transformers_model_cached: bool = False
    onnx_available: bool = False
    is_online: bool = True

    # Derived
    local_llm_available: bool = False
    local_embed_available: bool = False

    def __post_init__(self):
        self.local_llm_available = self.ollama_available
        self.local_embed_available = self.transformers_model_cached


_capabilities: Optional[RuntimeCapabilities] = None


def get_capabilities() -> RuntimeCapabilities:
    global _capabilities
    if _capabilities is None:
        _capabilities = RuntimeCapabilities()
    return _capabilities


def update_frontend_capabilities(data: dict):
    caps = get_capabilities()
    caps.is_desktop_app = data.get("is_desktop_app", caps.is_desktop_app)
    caps.webgpu_available = data.get("webgpu_available", caps.webgpu_available)
    caps.transformers_model_cached = data.get("transformers_model_cached", caps.transformers_model_cached)
    caps.onnx_available = data.get("onnx_available", caps.onnx_available)
    caps.is_online = data.get("is_online", caps.is_online)


async def scan_backend_capabilities(settings):
    caps = get_capabilities()
    caps.openai_configured = bool(settings.LLM_API_KEY)

    import requests
    ollama_host = getattr(settings, "LLM_BASE_URL", "http://localhost:11434")
    try:
        resp = requests.get(f"{ollama_host}/api/tags", timeout=3)
        caps.ollama_available = resp.status_code == 200
    except Exception:
        caps.ollama_available = False

    logger.info(
        "Capability scan: ollama=%s openai=%s",
        caps.ollama_available,
        caps.openai_configured,
    )
