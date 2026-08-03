from fastapi import Request
from app.config import get_settings, Settings


def get_effective_settings(request: Request | None = None) -> Settings:
    """Return settings with optional LLM overrides from request headers."""
    settings = get_settings()

    if request is None:
        return settings

    provider = request.headers.get("X-LLM-Provider")
    model = request.headers.get("X-LLM-Model")
    base_url = request.headers.get("X-LLM-Base-URL")
    api_key = request.headers.get("X-LLM-API-Key")
    max_tokens = request.headers.get("X-LLM-Max-Tokens")
    temperature = request.headers.get("X-LLM-Temperature")

    if provider:
        settings.LLM_PROVIDER = provider
    if model:
        settings.LLM_MODEL = model
    if base_url:
        settings.LLM_BASE_URL = base_url
    if api_key:
        settings.LLM_API_KEY = api_key
    if max_tokens:
        try:
            settings.LLM_MAX_TOKENS = int(max_tokens)
        except ValueError:
            pass
    if temperature:
        try:
            settings.LLM_TEMPERATURE = float(temperature)
        except ValueError:
            pass

    return settings
