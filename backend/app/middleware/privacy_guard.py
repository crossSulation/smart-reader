import logging
from dataclasses import dataclass, field
from typing import Optional

from fastapi import Request, HTTPException

logger = logging.getLogger(__name__)


@dataclass
class PrivacyContext:
    enabled: bool = False
    blocked_providers: list[str] = field(default_factory=lambda: ["cloud", "openai"])
    audit_log: list[dict] = field(default_factory=list)

    def block_cloud(self, provider: str, operation: str) -> None:
        if self.enabled and provider in self.blocked_providers:
            raise HTTPException(
                status_code=403,
                detail=f"Cloud provider '{provider}' is blocked in privacy mode for operation '{operation}'",
            )

    def log_access(self, provider: str, operation: str, data_summary: str) -> None:
        self.audit_log.append({
            "provider": provider,
            "operation": operation,
            "data_summary": data_summary,
            "privacy_mode": self.enabled,
        })


def extract_privacy_context(request: Request) -> PrivacyContext:
    privacy_header = request.headers.get("X-Privacy-Mode", "false").lower()
    return PrivacyContext(
        enabled=privacy_header in ("true", "1", "on"),
    )


def validate_document_safety(chunks: list[str], privacy_mode: bool) -> None:
    if not privacy_mode:
        return

    total_chars = sum(len(c) for c in chunks)
    if total_chars > 5000:
        logger.warning(
            "Privacy mode: large document context (%d chars) — consider reducing chunk size",
            total_chars,
        )
