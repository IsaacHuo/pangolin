"""LoggingNode — audit log to local pipeline logs.

Runs as the **last** node in all pipeline paths (ALLOW, MODIFY, BLOCK).
Errors are swallowed so logging never blocks the response.
"""

from __future__ import annotations

import structlog

from src.engine.pipeline.nodes import timed_node
from src.engine.pipeline.state import PipelineState

logger = structlog.get_logger("pangolin.pipeline.logging")

@timed_node("logging")
async def logging_node(state: PipelineState) -> PipelineState:
    """Log the final decision to structlog locally."""
    try:
        logger.debug(
            "pipeline_state_recorded",
            request_id=state.get("request_id"),
            decision=state.get("decision"),
            risk_score=state.get("risk_score"),
            intent=state.get("intent")
        )
    except Exception as exc:
        logger.error("logging_node_failed", error=str(exc))

    return state
