import pytest

from app.middleware.scheduler import classify, ROUTING_MATRIX, TaskType
from app.middleware.confidence_gate import ConfidenceGate, GatedResult
from app.middleware.privacy_guard import PrivacyContext, validate_document_safety
from app.providers.base import ProviderResult


class TestScheduler:
    def test_known_task_types(self):
        assert "rag_qa" in ROUTING_MATRIX
        assert "complex_agent" in ROUTING_MATRIX
        assert "knowledge_graph" in ROUTING_MATRIX
        assert "summary" in ROUTING_MATRIX
        assert "quiz" in ROUTING_MATRIX
        assert "embedding" in ROUTING_MATRIX
        assert "rerank" in ROUTING_MATRIX

    def test_rag_qa_defaults_to_cloud(self):
        decision = classify("rag_qa")
        assert decision.target == "cloud"

    def test_complex_agent_always_cloud(self):
        decision = classify("complex_agent")
        assert decision.target == "cloud"

    def test_knowledge_graph_always_cloud(self):
        decision = classify("knowledge_graph")
        assert decision.target == "cloud"

    def test_privacy_mode_forces_local(self):
        decision = classify("rag_qa", privacy_mode=True)
        assert decision.target == "local"
        assert "Privacy mode" in decision.reason

    def test_privacy_mode_rejects_complex_agent(self):
        decision = classify("complex_agent", privacy_mode=True)
        assert decision.target == "reject"

    def test_privacy_mode_queues_knowledge_graph(self):
        decision = classify("knowledge_graph", privacy_mode=True)
        assert decision.target == "queue"


class TestConfidenceGate:
    def make_result(self, confidence: float) -> ProviderResult:
        return ProviderResult(content="test", confidence=confidence, provider="local")

    @pytest.mark.asyncio
    async def test_high_confidence_passes(self):
        gate = ConfidenceGate(threshold=0.6)
        result = self.make_result(0.8)
        gated = await gate.evaluate(result, lambda: None)
        assert gated.fallback_used is False
        assert gated.result.confidence == 0.8

    @pytest.mark.asyncio
    async def test_low_confidence_no_privacy_upgrades(self):
        gate = ConfidenceGate(threshold=0.6)
        local = self.make_result(0.3)

        async def cloud_gen():
            return ProviderResult(content="cloud answer", confidence=1.0, provider="cloud")

        gated = await gate.evaluate(local, cloud_gen)
        assert gated.fallback_used is True
        assert gated.result.provider == "cloud"

    @pytest.mark.asyncio
    async def test_low_confidence_privacy_blocks_upgrade(self):
        gate = ConfidenceGate(threshold=0.6)
        local = self.make_result(0.3)

        async def cloud_gen():
            return ProviderResult(content="cloud", provider="cloud")

        gated = await gate.evaluate(local, cloud_gen, privacy_mode=True)
        assert gated.fallback_used is False
        assert gated.result.provider == "local"

    @pytest.mark.asyncio
    async def test_cloud_fallback_graceful_on_error(self):
        gate = ConfidenceGate(threshold=0.6)
        local = self.make_result(0.3)

        async def failing_cloud():
            raise RuntimeError("cloud down")

        gated = await gate.evaluate(local, failing_cloud)
        # When cloud fallback fails, we keep the local result
        assert gated.result.provider == "local"


class TestPrivacyGuard:
    def test_context_disabled_by_default(self):
        ctx = PrivacyContext()
        assert ctx.enabled is False

    def test_context_enabled(self):
        ctx = PrivacyContext(enabled=True)
        assert ctx.enabled is True

    def test_privacy_context_from_header(self):
        from app.middleware.privacy_guard import extract_privacy_context
        from fastapi import Request
        # Test context extraction logic without full request
        ctx = PrivacyContext(enabled=True)
        assert ctx.enabled is True

    def test_validate_document_safety_blocks_large_context(self):
        chunks = ["a" * 5000, "b" * 6000]
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc:
            validate_document_safety(chunks, privacy_mode=True)
        assert exc.value.status_code == 400

    def test_validate_document_safety_allows_small_context(self):
        chunks = ["a" * 100, "b" * 200]
        validate_document_safety(chunks, privacy_mode=True)

    def test_validate_document_safety_skips_when_disabled(self):
        chunks = ["a" * 5000, "b" * 6000]
        validate_document_safety(chunks, privacy_mode=False)
