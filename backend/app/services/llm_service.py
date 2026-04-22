"""
LLM service — provider-agnostic text generation.

Supported providers (set LLM_PROVIDER env var):
  mock    – deterministic offline stub, useful for development/testing
  openai  – OpenAI Chat Completions API (also works with any OpenAI-compatible endpoint)
  ollama  – local Ollama server (http://localhost:11434 by default)

All providers expose the same call signature:
  complete(prompt: str, system: str | None, settings: Settings) -> str
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def complete(prompt: str, system: Optional[str], settings) -> str:
    """
    Generate a completion for *prompt* using the configured LLM provider.
    Returns the model's text response as a plain string.
    Raises RuntimeError on unrecoverable provider errors.
    """
    provider = (settings.LLM_PROVIDER or "mock").lower()
    if provider == "mock":
        return _mock_complete(prompt, system)
    if provider == "openai":
        return _openai_complete(prompt, system, settings)
    if provider == "ollama":
        return _ollama_complete(prompt, system, settings)
    raise RuntimeError(f"Unknown LLM_PROVIDER: {provider!r}. Use mock, openai, or ollama.")


# ---------------------------------------------------------------------------
# Prompt builders
# ---------------------------------------------------------------------------

def build_qa_prompt(question: str, context_chunks: list[str]) -> tuple[str, str]:
    """Return (system, user) prompt strings for a RAG Q&A call."""
    context = "\n\n---\n\n".join(context_chunks)
    system = (
        "You are a helpful reading assistant. "
        "Answer the user's question using ONLY the provided book excerpts. "
        "If the answer is not contained in the excerpts, say so clearly. "
        "Be concise and cite the relevant passage when possible."
    )
    user = f"Book excerpts:\n\n{context}\n\nQuestion: {question}"
    return system, user


def build_summary_prompt(context_chunks: list[str], title: str) -> tuple[str, str]:
    """Return (system, user) prompt strings for a book summary call."""
    context = "\n\n---\n\n".join(context_chunks)
    system = (
        "You are a helpful reading assistant. "
        "Summarise the provided book excerpts in a clear, structured way. "
        "Include the main topics and key ideas. Be concise."
    )
    user = f'Book title: "{title}"\n\nExcerpts:\n\n{context}\n\nPlease provide a summary.'
    return system, user


# ---------------------------------------------------------------------------
# Providers
# ---------------------------------------------------------------------------

def _mock_complete(prompt: str, system: Optional[str]) -> str:
    """Offline deterministic stub — useful for dev/test without API keys."""
    logger.debug("LLM mock provider called (prompt length=%d)", len(prompt))
    if "summarise" in (system or "").lower() or "summary" in prompt.lower():
        return (
            "[Mock summary] This text covers several topics including the main themes "
            "of the provided excerpts. Key ideas and arguments are presented across "
            "the selected passages."
        )
    return (
        "[Mock answer] Based on the provided excerpts, the answer relates to the "
        "content in the book passages above. For a real answer, configure LLM_PROVIDER "
        "to 'openai' or 'ollama' in your .env file."
    )


def _openai_complete(prompt: str, system: Optional[str], settings) -> str:
    """OpenAI Chat Completions (also compatible with Azure OpenAI and local proxies)."""
    try:
        import requests as _requests
    except ImportError as exc:
        raise RuntimeError("requests library is required") from exc

    base_url = (settings.LLM_BASE_URL or "https://api.openai.com").rstrip("/")
    url = f"{base_url}/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.LLM_API_KEY}",
    }
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": settings.LLM_MODEL,
        "messages": messages,
        "max_tokens": settings.LLM_MAX_TOKENS,
        "temperature": settings.LLM_TEMPERATURE,
    }
    try:
        resp = _requests.post(url, json=payload, headers=headers, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"].strip()
    except Exception as exc:
        logger.error("OpenAI call failed: %s", exc)
        raise RuntimeError(f"LLM request failed: {exc}") from exc


def _ollama_complete(prompt: str, system: Optional[str], settings) -> str:
    """Ollama local inference server (http://localhost:11434)."""
    try:
        import requests as _requests
    except ImportError as exc:
        raise RuntimeError("requests library is required") from exc

    base_url = (settings.LLM_BASE_URL or "http://localhost:11434").rstrip("/")
    url = f"{base_url}/api/chat"
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": settings.LLM_MODEL,
        "messages": messages,
        "stream": False,
        "options": {
            "num_predict": settings.LLM_MAX_TOKENS,
            "temperature": settings.LLM_TEMPERATURE,
        },
    }
    try:
        resp = _requests.post(url, json=payload, timeout=120)
        resp.raise_for_status()
        data = resp.json()
        return data["message"]["content"].strip()
    except Exception as exc:
        logger.error("Ollama call failed: %s", exc)
        raise RuntimeError(f"LLM request failed: {exc}") from exc
