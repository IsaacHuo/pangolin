"""GET /v1/models — available model catalog."""

from fastapi import APIRouter
from pydantic import BaseModel

from src.llm.providers import EXTERNAL_MODELS

router = APIRouter(tags=["models"])


class ModelInfo(BaseModel):
    id: str
    provider: str
    name: str


class ModelsResponse(BaseModel):
    models: list[ModelInfo]


OPENROUTER_MODELS: list[dict[str, str]] = [
    {"id": "openrouter/auto", "provider": "openrouter", "name": "OpenRouter Auto"},
    {
        "id": "openai/gpt-4o-mini",
        "provider": "openrouter",
        "name": "GPT-4o mini (via OpenRouter)",
    },
    {
        "id": "qwen/qwen3.6-plus",
        "provider": "openrouter",
        "name": "Qwen 3.6 Plus (via OpenRouter)",
    },
    {
        "id": "anthropic/claude-3.7-sonnet",
        "provider": "openrouter",
        "name": "Claude 3.7 Sonnet (via OpenRouter)",
    },
    {
        "id": "google/gemini-2.0-flash-001",
        "provider": "openrouter",
        "name": "Gemini 2.0 Flash (via OpenRouter)",
    },
    {
        "id": "mistralai/mistral-small-3.1",
        "provider": "openrouter",
        "name": "Mistral Small 3.1 (via OpenRouter)",
    },
    {
        "id": "minimax/minimax-m2.7",
        "provider": "openrouter",
        "name": "Minimax-m2.7 (via OpenRouter)",
    },
]


@router.get("/v1/models", response_model=ModelsResponse)
async def list_models() -> ModelsResponse:
    models = [ModelInfo(**m) for m in OPENROUTER_MODELS]
    models.extend(ModelInfo(**m) for m in EXTERNAL_MODELS)
    models.append(ModelInfo(id="demo", provider="mock", name="Demo (Mock)"))
    return ModelsResponse(models=models)
