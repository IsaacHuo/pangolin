import json
import logging
from typing import Any
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from ..app_state import AppState

logger = logging.getLogger("agent_firewall.routes")
router = APIRouter()

@router.post("/v1/chat/completions")
async def openai_chat_completions(request: Request) -> StreamingResponse:
    s = _state(request)
    return await s.openai_adapter.handle_chat_completion(request)

@router.post("/v1/responses")
async def openai_responses(request: Request) -> StreamingResponse:
    s = _state(request)
    # Reuse the same handler logic if the body is compatible (JSON chat completion)
    return await s.openai_adapter.handle_chat_completion(request)

def _all_tools_openai_format(request: Request) -> list[dict[str, Any]]:
    """Build OpenAI function-calling tools from dynamic registries (gateway + skills).

    Note: Feishu tools are now auto-discovered via Gateway (TypeScript implementation).
    """
    # Gateway tools (auto-discovered from TypeScript source, includes all Feishu tools)
    gw_registry = _get_gateway_tool_registry()
    gateway_tools = gw_registry.get_openai_tools()

    # Add get_gateway_tool_docs tool
    tool_names = sorted(gw_registry.tools.keys())
    gateway_docs_tool = {
        "type": "function",
        "function": {
            "name": "get_gateway_tool_docs",
            "description": f"Get detailed documentation for a gateway tool. Available tools: {', '.join(tool_names)}. Call this BEFORE invoke_gateway to learn the exact parameters and usage.",
            "parameters": {
                "type": "object",
                "properties": {
                    "tool_name": {
                        "type": "string",
                        "description": f"Gateway tool to get docs for. One of: {', '.join(tool_names)}",
                        "enum": tool_names,
                    }
                },
                "required": ["tool_name"],
            },
        },
    }

    # Skill tools (auto-discovered from SKILL.md files)
    skill_registry = _get_skill_registry()
    skill_tools = skill_registry.get_openai_tools()

    return gateway_tools + [gateway_docs_tool] + skill_tools
