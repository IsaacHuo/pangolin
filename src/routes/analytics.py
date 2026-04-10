from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["analytics"])


class AnalyticsSummary(BaseModel):
    total_requests: int
    blocked: int
    modified: int
    allowed: int
    block_rate: float
    avg_risk: float
    avg_latency_ms: float
    top_intent: str | None


@router.get("/v1/analytics/summary", response_model=AnalyticsSummary)
async def get_summary(hours: int = 24):
    return AnalyticsSummary(
        total_requests=100,
        blocked=10,
        modified=5,
        allowed=85,
        block_rate=0.1,
        avg_risk=0.05,
        avg_latency_ms=120.5,
        top_intent="chat",
    )


@router.get("/v1/analytics/timeline", response_model=list[dict])
async def get_timeline(hours: int = 24, resolution: str = "1h"):
    return []


@router.get("/v1/analytics/risks", response_model=list[dict])
async def get_risk_distribution(hours: int = 24):
    return []
