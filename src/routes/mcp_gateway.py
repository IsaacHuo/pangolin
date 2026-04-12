import json
import logging
from typing import Any
from fastapi import APIRouter, Request, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, Response
from ..app_state import AppState
from ..models import JsonRpcRequest, DashboardEvent
import uuid

from .openai_gateway import _all_tools_openai_format
from ..utils.shared import _state, _build_custom_gateway_tools, _load_custom_config
from ..engine.tools.gateway_tools import get_gateway_tool_registry as _get_gateway_tool_registry
from ..engine.tools.skills import get_skill_registry as _get_skill_registry

logger = logging.getLogger("pangolin.routes")
router = APIRouter()

@router.get("/api/mcp/tools")
async def list_mcp_tools(request: Request) -> JSONResponse:
    """List available tools: gateway (auto-discovered) + skills (from SKILL.md)."""
    tools = _all_tools_openai_format(request)

    # Gateway tools info
    gw_registry = _get_gateway_tool_registry()
    gateway_info = [
        {"name": t.name, "description": t.description, "source": "gateway"}
        for t in gw_registry.tools.values()
    ]
    custom_gateway_info = _build_custom_gateway_tools()

    # Skill tools info
    skill_registry = _get_skill_registry()
    skills_info = [
        {
            "name": s.name,
            "description": s.description,
            "emoji": s.emoji,
            "bins": s.required_bins,
            "source": "skill",
        }
        for s in skill_registry.ready_skills.values()
    ]
    cfg = _load_custom_config()
    custom_skills = cfg.get("skills", [])
    if isinstance(custom_skills, list):
        for item in custom_skills:
            if not isinstance(item, dict):
                continue
            sid = str(item.get("id", "")).strip()
            if not sid:
                continue
            skills_info.append(
                {
                    "name": sid,
                    "description": str(item.get("description", "")).strip(),
                    "emoji": "🧩",
                    "bins": [],
                    "source": "custom_skill",
                }
            )

    return JSONResponse(
        {
            "tools": tools,
            "count": len(tools),
            "gateway_tools": gateway_info + custom_gateway_info,
            "skills": skills_info,
        }
    )

@router.post("/mcp/{path:path}")
async def mcp_post(request: Request) -> JSONResponse:
    s = _state(request)
    response = await s.sse_adapter.handle_post(request)
    return response  # type: ignore[return-value]

@router.post("/mcp")
async def mcp_post_root(request: Request) -> JSONResponse:
    s = _state(request)
    response = await s.sse_adapter.handle_post(request)
    return response  # type: ignore[return-value]

@router.get("/mcp/sse")
async def mcp_sse(request: Request):  # noqa: ANN201
    s = _state(request)
    return await s.sse_adapter.handle_sse(request)

@router.websocket("/ws/mcp")
async def mcp_websocket(ws: WebSocket) -> None:
    s = ws.app.state.firewall
    await s.ws_adapter.handle_websocket(ws)
