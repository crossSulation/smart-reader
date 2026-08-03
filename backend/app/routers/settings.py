from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AppSetting
from app.routers.auth import get_current_user

router = APIRouter(prefix="/api/settings", tags=["settings"])

LLM_KEYS = {"llm_provider", "llm_model", "llm_base_url", "llm_api_key", "llm_max_tokens", "llm_temperature"}


@router.get("/llm")
def get_llm_settings(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(AppSetting).filter(AppSetting.key.in_(LLM_KEYS)).all()
    result = {r.key: r.value for r in rows}
    return {
        "provider": result.get("llm_provider", ""),
        "model": result.get("llm_model", ""),
        "base_url": result.get("llm_base_url", ""),
        "api_key": result.get("llm_api_key", ""),
        "max_tokens": int(result.get("llm_max_tokens", "512")),
        "temperature": float(result.get("llm_temperature", "0.3")),
    }


@router.put("/llm")
def update_llm_settings(payload: dict, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    key_map = {
        "provider": "llm_provider",
        "model": "llm_model",
        "base_url": "llm_base_url",
        "api_key": "llm_api_key",
        "max_tokens": "llm_max_tokens",
        "temperature": "llm_temperature",
    }

    for json_key, db_key in key_map.items():
        if json_key in payload:
            value = str(payload[json_key])
            setting = db.query(AppSetting).filter(AppSetting.key == db_key).first()
            if setting:
                setting.value = value
            else:
                db.add(AppSetting(key=db_key, value=value))

    db.commit()
    return {"ok": True}
