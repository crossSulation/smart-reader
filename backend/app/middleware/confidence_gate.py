import logging
from dataclasses import dataclass

from app.providers.base import ProviderResult

logger = logging.getLogger(__name__)

DEFAULT_CONFIDENCE_THRESHOLD = 0.6


@dataclass
class GatedResult:
    result: ProviderResult
    fallback_used: bool = False


class ConfidenceGate:
    def __init__(self, threshold: float = DEFAULT_CONFIDENCE_THRESHOLD):
        self.threshold = threshold

    async def evaluate(
        self,
        local_result: ProviderResult,
        cloud_generate,
        privacy_mode: bool = False,
    ) -> GatedResult:
        if local_result.confidence >= self.threshold:
            return GatedResult(result=local_result)

        if privacy_mode:
            logger.debug("Confidence %.2f < %.2f, but privacy mode prevents cloud fallback",
                         local_result.confidence, self.threshold)
            return GatedResult(result=local_result)

        logger.info("Confidence %.2f < %.2f, upgrading to cloud", local_result.confidence, self.threshold)
        try:
            cloud_result = await cloud_generate()
            return GatedResult(result=cloud_result, fallback_used=True)
        except Exception as exc:
            logger.warning("Cloud fallback failed: %s", exc)
            return GatedResult(result=local_result)
