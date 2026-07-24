from __future__ import annotations
from dataclasses import dataclass
from typing import Literal, Optional

from app.middleware.capability_scanner import get_capabilities

TaskType = Literal[
    "rag_qa",
    "summary",
    "complex_agent",
    "quiz",
    "knowledge_graph",
    "embedding",
    "rerank",
]


@dataclass
class RouteDecision:
    target: Literal["local", "cloud", "queue", "reject"]
    reason: str
    fallback: Optional[str] = None


ROUTING_MATRIX: dict[TaskType, dict] = {
    "rag_qa":            {"priority": "local", "fallback": "cloud", "offline_ok": True},
    "summary":           {"priority": "local", "fallback": "cloud", "offline_ok": True},
    "complex_agent":     {"priority": "cloud", "fallback": None,    "offline_ok": False},
    "quiz":              {"priority": "cloud", "fallback": "local",  "offline_ok": True},
    "knowledge_graph":   {"priority": "cloud", "fallback": "queue",  "offline_ok": False},
    "embedding":         {"priority": "local", "fallback": "cloud",  "offline_ok": True},
    "rerank":            {"priority": "local", "fallback": "cloud",  "offline_ok": True},
}


def classify(task_type: TaskType, privacy_mode: bool = False, context_size: int = 0) -> RouteDecision:
    if task_type not in ROUTING_MATRIX:
        return RouteDecision(target="cloud", reason=f"Unknown task type: {task_type}")

    caps = get_capabilities()
    rule = ROUTING_MATRIX[task_type]

    if privacy_mode:
        if task_type == "complex_agent":
            return RouteDecision(target="reject", reason="Complex agent not available in privacy mode")
        if task_type == "knowledge_graph":
            return RouteDecision(target="queue", reason="Knowledge graph queued in privacy mode")
        return RouteDecision(target="local", reason="Privacy mode: force local")

    if task_type == "complex_agent" or task_type == "knowledge_graph":
        return RouteDecision(target="cloud", reason=f"Large context task: {task_type}")

    if not caps.is_online and rule.get("offline_ok"):
        return RouteDecision(target="local", reason="Offline: use local")

    if rule["priority"] == "local" and caps.local_llm_available:
        return RouteDecision(target="local", reason="Local LLM available", fallback=rule.get("fallback"))

    return RouteDecision(target="cloud", reason="Default cloud route", fallback=rule.get("fallback"))
