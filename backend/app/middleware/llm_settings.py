from fastapi import Request
from sqlalchemy.orm import Session

from app.config import get_settings, Settings
from app.models import AppSetting


def _get_db_setting(db: Session, key: str) -> str | None:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    return row.value if row else None


def get_effective_settings(request: Request | None = None, db: Session | None = None) -> Settings:
    """Return settings with DB > header > .env priority."""
    settings = get_settings()

    # Priority 1: DB settings (persisted)
    if db is not None:
        provider = _get_db_setting(db, "llm_provider")
        if provider:
            settings.LLM_PROVIDER = provider
        model = _get_db_setting(db, "llm_model")
        if model:
            settings.LLM_MODEL = model
        base_url = _get_db_setting(db, "llm_base_url")
        if base_url:
            settings.LLM_BASE_URL = base_url
        api_key = _get_db_setting(db, "llm_api_key")
        if api_key:
            settings.LLM_API_KEY = api_key
        max_tok = _get_db_setting(db, "llm_max_tokens")
        if max_tok:
            try:
                settings.LLM_MAX_TOKENS = int(max_tok)
            except ValueError:
                pass
        temp = _get_db_setting(db, "llm_temperature")
        if temp:
            try:
                settings.LLM_TEMPERATURE = float(temp)
            except ValueError:
                pass

    # Priority 2: Request headers (from Settings page)
    if request is not None:
        provider = request.headers.get("X-LLM-Provider")
        if provider:
            settings.LLM_PROVIDER = provider
        model = request.headers.get("X-LLM-Model")
        if model:
            settings.LLM_MODEL = model
        base_url = request.headers.get("X-LLM-Base-URL")
        if base_url:
            settings.LLM_BASE_URL = base_url
        api_key = request.headers.get("X-LLM-API-Key")
        if api_key:
            settings.LLM_API_KEY = api_key
        max_tokens = request.headers.get("X-LLM-Max-Tokens")
        if max_tokens:
            try:
                settings.LLM_MAX_TOKENS = int(max_tokens)
            except ValueError:
                pass
        temperature = request.headers.get("X-LLM-Temperature")
        if temperature:
            try:
                settings.LLM_TEMPERATURE = float(temperature)
            except ValueError:
                pass

    return settings
