"""
LLM service — provider-agnostic text generation.

Supported providers (set LLM_PROVIDER env var):
  mock    – deterministic offline stub, useful for development/testing
  openai  – OpenAI Chat Completions API (also works with any OpenAI-compatible endpoint)
  ollama  – local Ollama server (http://localhost:11434 by default)

All providers expose the same call signature:
  complete(prompt: str, system: str | None, settings: Settings) -> CompletionResult
"""

import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class CompletionResult:
    """Returned by LLM provider calls — carries both the generated text and token usage."""
    text: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    model: str = ""
    provider: str = ""

    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def complete(prompt: str, system: Optional[str], settings) -> CompletionResult:
    """
    Generate a completion for *prompt* using the configured LLM provider.
    Returns a CompletionResult with text and token usage.
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


def complete_and_log(
    prompt: str,
    system: Optional[str],
    settings,
    db,
    user_id: int,
    capability: str,
    interaction_id: Optional[int] = None,
) -> str:
    """
    Convenience: call complete() and automatically log token usage.
    Returns just the text string for backward compatibility.
    """
    result = complete(prompt, system, settings)
    try:
        from app.services.token_counter import log_token_usage
        log_token_usage(
            db=db,
            user_id=user_id,
            capability=capability,
            provider=result.provider,
            model=result.model,
            prompt_tokens=result.prompt_tokens,
            completion_tokens=result.completion_tokens,
            interaction_id=interaction_id,
        )
    except Exception as e:
        logger.warning("Failed to log token usage (non-fatal): %s", e)
    return result.text


# ---------------------------------------------------------------------------
# Prompt builders
# ---------------------------------------------------------------------------

def build_qa_prompt(
    question: str,
    context_chunks: list[str],
    explanation_level: str = "intermediate",
) -> tuple[str, str]:
    """Return (system, user) prompt strings for a RAG Q&A call."""
    context = "\n\n---\n\n".join(context_chunks)

    level = (explanation_level or "intermediate").lower()
    if level == "beginner":
        style_instruction = (
            "Explain in simple terms, avoid jargon, and use short sentences. "
            "If technical terms are necessary, define them briefly."
        )
    elif level == "expert":
        style_instruction = (
            "Use precise technical language, include nuanced trade-offs, "
            "and keep explanations dense and direct."
        )
    else:
        style_instruction = (
            "Use balanced detail with clear structure suitable for an intermediate reader."
        )

    system = (
        "You are a helpful reading assistant. "
        "Answer the user's question using ONLY the provided book excerpts. "
        "If the answer is not contained in the excerpts, say so clearly. "
        "Be concise and cite the relevant passage when possible. "
        f"Explanation style: {style_instruction}"
    )
    user = f"Book excerpts:\n\n{context}\n\nQuestion: {question}"
    return system, user


def build_summary_prompt(
    context_chunks: list[str],
    title: str,
    template: str = "bullet_points",
) -> tuple[str, str]:
    """Return (system, user) prompt strings for a book summary call."""
    context = "\n\n---\n\n".join(context_chunks)

    normalized_template = (template or "bullet_points").lower()
    if normalized_template == "cornell":
        schema_instruction = (
            '{"template":"cornell","cue_questions":["..."],"notes":["..."],"summary":["..."]}'
        )
    elif normalized_template == "sq3r":
        schema_instruction = (
            '{"template":"sq3r","survey":["..."],"question":["..."],"read":["..."],"recite":["..."],"review":["..."]}'
        )
    else:
        schema_instruction = (
            '{"template":"bullet_points","sections":[{"heading":"...","bullets":["...","..."]}]}'
        )

    system = (
        "You are a helpful reading assistant. "
        "Summarise the provided book excerpts using concise factual points from the excerpts. "
        "Return ONLY valid JSON, no markdown, no code fences, no extra commentary. "
        f"JSON schema for this request: {schema_instruction}"
    )
    user = (
        f'Book title: "{title}"\n\n'
        f'Template: {normalized_template}\n\n'
        f'Excerpts:\n\n{context}\n\n'
        "Return strict JSON matching the schema exactly."
    )
    return system, user


# ---------------------------------------------------------------------------
# Providers
# ---------------------------------------------------------------------------

def _mock_complete(prompt: str, system: Optional[str]) -> CompletionResult:
    """Offline deterministic stub — useful for dev/test without API keys."""
    logger.debug("LLM mock provider called (prompt length=%d)", len(prompt))
    system_text = (system or "").lower()

    def _result(text: str) -> CompletionResult:
        return CompletionResult(text=text, model="mock", provider="mock")

    if "simple terms" in system_text:
        return _result(
            "[Mock beginner answer] This means the main idea is explained in easy words. "
            "Think of it as a simple step-by-step concept from the book excerpts."
        )
    if "technical language" in system_text:
        return _result(
            "[Mock expert answer] The excerpts indicate a higher-order mechanism characterized by interacting constraints, "
            "trade-off boundaries, and implementation implications that are best interpreted through a systems-level lens. "
            "In practical terms, this implies a context-sensitive optimization strategy rather than a single universally optimal rule."
        )

    if "summarise" in (system or "").lower() or "summary" in prompt.lower():
        if "cornell" in system_text:
            return _result(
                '{"template":"cornell","cue_questions":["What is the core topic?","Which ideas are emphasized?"],'
                '"notes":["The excerpts introduce core concepts and practical steps.","Key themes are repeated across sections to build understanding."],'
                '"summary":["The text presents foundational ideas and actionable guidance in a structured progression."]}'
            )
        if "sq3r" in system_text:
            return _result(
                '{"template":"sq3r","survey":["The material is organized by phases and key topics."],'
                '"question":["What is the main focus of each phase?"],'
                '"read":["Core ideas and tasks are introduced progressively."],'
                '"recite":["The main takeaway is a staged learning path with practical checkpoints."],'
                '"review":["Revisit each phase goal and verify completion against concrete outcomes."]}'
            )
        return _result(
            '{"template":"bullet_points","sections":['
            '{"heading":"Main ideas","bullets":["The excerpts cover key themes across the selected passages.","Core arguments are repeated to reinforce understanding."]},'
            '{"heading":"Actionable points","bullets":["Track the progression of concepts from basic to advanced.","Review recurring terms to retain the structure."]}'
            ']}'
        )
    return _result(
        "[Mock answer] Based on the provided excerpts, the answer relates to the "
        "content in the book passages above. For a real answer, configure LLM_PROVIDER "
        "to 'openai' or 'ollama' in your .env file."
    )


def _openai_complete(prompt: str, system: Optional[str], settings) -> CompletionResult:
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

    model = settings.LLM_MODEL or "gpt-3.5-turbo"
    payload = {
        "model": model,
        "messages": messages,
        "max_tokens": settings.LLM_MAX_TOKENS,
        "temperature": settings.LLM_TEMPERATURE,
    }
    try:
        resp = _requests.post(url, json=payload, headers=headers, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        text = data["choices"][0]["message"]["content"].strip()
        usage = data.get("usage", {})
        return CompletionResult(
            text=text,
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
            model=model,
            provider="openai",
        )
    except Exception as exc:
        logger.error("OpenAI call failed: %s", exc)
        raise RuntimeError(f"LLM request failed: {exc}") from exc


def _ollama_complete(prompt: str, system: Optional[str], settings) -> CompletionResult:
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

    model = settings.LLM_MODEL or "llama3"
    payload = {
        "model": model,
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
        text = data["message"]["content"].strip()
        return CompletionResult(
            text=text,
            prompt_tokens=data.get("prompt_eval_count", 0),
            completion_tokens=data.get("eval_count", 0),
            model=model,
            provider="ollama",
        )
    except Exception as exc:
        logger.error("Ollama call failed: %s", exc)
        raise RuntimeError(f"LLM request failed: {exc}") from exc
