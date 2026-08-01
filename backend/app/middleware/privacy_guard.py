import logging
from dataclasses import dataclass, field

from fastapi import Request, HTTPException

logger = logging.getLogger(__name__)

CLOUD_PROVIDERS = {"cloud", "openai", "langchain"}


@dataclass
class PrivacyContext:
    enabled: bool = False
    audit_log: list[dict] = field(default_factory=list)


def extract_privacy_context(request: Request) -> PrivacyContext:
    header = request.headers.get("X-Privacy-Mode", "false").lower()
    return PrivacyContext(enabled=header in ("true", "1", "on"))


async def privacy_middleware(request: Request, call_next):
    """FastAPI middleware: block cloud-bound requests in privacy mode."""
    ctx = extract_privacy_context(request)

    if ctx.enabled and _is_cloud_dangerous(request):
        logger.warning("Privacy mode blocked: %s %s", request.method, request.url.path)
        raise HTTPException(status_code=403, detail="Cloud access blocked in privacy mode")

    response = await call_next(request)
    response.headers["X-Privacy-Active"] = str(ctx.enabled).lower()
    return response


def _is_cloud_dangerous(request: Request) -> bool:
    """Check if the request path/body indicates cloud LLM usage."""
    path = request.url.path.lower()
    dangerous_prefixes = ["/api/books/search", "/api/embed"]
    return any(path.startswith(p) for p in dangerous_prefixes)


def validate_document_safety(chunks: list[str], privacy_mode: bool) -> None:
    if not privacy_mode:
        return
    total_chars = sum(len(c) for c in chunks)
    if total_chars > 10000:
        raise HTTPException(
            status_code=400,
            detail=f"Document context too large for privacy mode ({total_chars} chars). Reduce chunk count.",
        )
    if 0 < total_chars <= 10000:
        logger.debug("Privacy mode: processing %d chars of document context", total_chars)
