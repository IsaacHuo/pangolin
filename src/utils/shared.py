import os
import re
import json
import time
import asyncio
import logging
import websockets
from pathlib import Path
from typing import Any, TYPE_CHECKING
from fastapi import Request
import logging
import re
import asyncio
import time
import json
import os

if TYPE_CHECKING:
    from ..app_state import AppState

logger = logging.getLogger("pangolin")

_HTTP_ACCESS_RE = re.compile(
    r'^(?P<level>[A-Z]+):\s+(?P<peer>[^ ]+)\s-\s"(?P<method>[A-Z]+)\s'
    r'(?P<path>[^\"]+)\sHTTP/[^\"]+"\s(?P<status>\d{3})'
    r"(?:\s(?P<status_text>.*))?$"
)
_WS_ACCESS_RE = re.compile(
    r'^(?P<level>[A-Z]+):\s+(?P<peer>[^ ]+)\s-\s"WebSocket\s'
    r'(?P<path>[^\"]+)"\s\[(?P<ws_state>[^\]]+)\]$'
)
_CONNECTION_STATE_RE = re.compile(r"^(?P<level>[A-Z]+):\s+connection\s(?P<state>open|closed)$")
_APP_LOG_RE = re.compile(
    r"^(?P<timestamp>\d{4}-\d{2}-\d{2}T[^ ]+)\s+\[(?P<level>[A-Z]+)\]\s+"
    r"(?P<source>[^:]+):\s+(?P<message>.*)$"
)

_ALLOWED_EXTENSIONS = {
    # Audio
    ".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac", ".webm",
    # Image
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico",
    # Documents
    ".txt", ".pdf", ".docx", ".xlsx", ".csv", ".json", ".md", ".html",
    # Video
    ".mp4", ".mov", ".avi", ".mkv",
}

def _direction_from_message(message: str) -> str:
    lowered = message.lower()
    if any(token in lowered for token in ("upstream", "forward", "proxying", "sent to")):
        return "outbound"
    if any(
        token in lowered
        for token in ("connected", "accepted", "received", "request", "dashboard client")
    ):
        return "inbound"
    return "internal"

def _state(request: Request | None = None) -> Any:
    """Extract AppState from the ASGI app."""
    if request is not None:
        return request.app.state.firewall  # type: ignore[no-any-return]
    raise RuntimeError("No request context")

async def _probe_gateway_auth(
    *,
    ws_url: str,
    token: str | None,
    password: str | None,
    timeout_seconds: float = 4.0,
) -> dict[str, Any]:
    """Probe gateway auth health by performing connect.challenge -> connect handshake."""
    if not token and not password:
        return {
            "status": "missing_token",
            "tokenValid": False,
            "pairingRequired": False,
            "message": "No gateway token/password configured",
        }

    request_id = f"monitor-{int(time.time() * 1000)}"
    try:
        async with websockets.connect(
            ws_url,
            open_timeout=timeout_seconds,
            close_timeout=1,
            ping_interval=None,
        ) as socket:
            deadline = time.monotonic() + timeout_seconds
            while time.monotonic() < deadline:
                remaining = max(0.1, deadline - time.monotonic())
                raw_message = await asyncio.wait_for(socket.recv(), timeout=remaining)
                message = json.loads(str(raw_message))

                if message.get("type") == "event" and message.get("event") == "connect.challenge":
                    auth_payload: dict[str, str] = {}
                    if token: auth_payload["token"] = token
                    if password: auth_payload["password"] = password

                    await socket.send(
                        json.dumps({
                            "type": "req",
                            "id": request_id,
                            "method": "connect",
                            "params": {
                                "minProtocol": 3,
                                "maxProtocol": 3,
                                "client": {"id": "gateway-client", "version": "1.0.0", "platform": "backend", "mode": "backend"},
                                "role": "operator",
                                "scopes": ["operator.admin"],
                                "auth": auth_payload,
                            },
                        })
                    )
                    continue

                if message.get("type") == "res" and str(message.get("id")) == request_id:
                    if message.get("ok"):
                        payload = message.get("payload") or {}
                        return {
                            "status": "ok",
                            "tokenValid": True,
                            "pairingRequired": False,
                            "message": "Gateway hello-ok",
                            "protocol": payload.get("protocol"),
                            "role": payload.get("role"),
                        }

                    err = message.get("error") or {}
                    code = str(err.get("code") or "")
                    text = str(err.get("message") or "connect rejected")
                    combined = f"{code}: {text}" if code else text

                    if re.search(r"NOT_PAIRED|device identity required", combined, re.IGNORECASE):
                        return {"status": "pairing_required", "tokenValid": True, "pairingRequired": True, "message": combined}

                    if re.search(r"unauthorized|auth|token", combined, re.IGNORECASE):
                        return {"status": "invalid_token", "tokenValid": False, "pairingRequired": False, "message": combined}
                    
                    return {"status": "error", "message": combined}
            
            return {"status": "timeout", "message": "Handshake timed out"}

    except Exception as exc:
        return {
            "status": "unreachable",
            "tokenValid": None,
            "pairingRequired": False,
            "message": str(exc),
        }

def _get_gateway_auth() -> tuple[str, int, str, str]:
    """Resolve gateway host/port and preferred auth secrets from config."""
    from src.gateway.discovery import _read_gateway_info_from_local_config, _resolve_gateway_runtime_port, DEFAULT_GATEWAY_PORT
    discovered = _read_gateway_info_from_local_config()
    host = "127.0.0.1"
    configured_port = int(discovered.get("port", DEFAULT_GATEWAY_PORT))
    port = _resolve_gateway_runtime_port(host, configured_port)
    token = str(discovered.get("token") or "").strip()
    password = str(discovered.get("password") or "").strip()
    auth_mode = str(discovered.get("authMode") or "").strip().lower()

    if auth_mode == "password":
        primary_secret = password or token
        secondary_secret = token if token and token != primary_secret else ""
    else:
        primary_secret = token or password
        secondary_secret = password if password and password != primary_secret else ""

    return host, port, primary_secret, secondary_secret

# ── Custom MCP Servers & Skills CRUD ─────────────────────────────
import uuid

_CUSTOM_CONFIG_PATH = Path(__file__).parent.parent.parent / "custom_config.json"

def _load_custom_config() -> dict[str, Any]:
    """Load custom MCP servers and skills from JSON file."""
    if _CUSTOM_CONFIG_PATH.exists():
        try:
            return json.loads(_CUSTOM_CONFIG_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"mcp_servers": [], "skills": []}

def _save_custom_config(data: dict[str, Any]) -> None:
    """Persist custom config to JSON file."""
    _CUSTOM_CONFIG_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

def _normalize_custom_mcp_servers() -> dict[str, dict[str, Any]]:
    cfg = _load_custom_config()
    servers = cfg.get("mcp_servers", [])
    normalized: dict[str, dict[str, Any]] = {}
    if not isinstance(servers, list):
        return normalized
    for item in servers:
        if not isinstance(item, dict):
            continue
        sid = str(item.get("id", "")).strip()
        if not sid:
            continue
        normalized[sid] = {
            "id": sid,
            "name": str(item.get("name", sid)).strip() or sid,
            "transport": str(item.get("transport", "streamable_http")).strip().lower()
            or "streamable_http",
            "url": str(item.get("url", "")).strip(),
        }
    return normalized

def _build_custom_gateway_tools() -> list[dict[str, str]]:
    servers = _normalize_custom_mcp_servers()
    tools: list[dict[str, str]] = []
    for server in servers.values():
        name = server["id"]
        transport = server["transport"]
        endpoint = server["url"] or "(missing url)"
        tools.append(
            {
                "name": name,
                "description": (
                    f"Custom MCP server {server['name']} via {transport}. "
                    f"Use invoke_gateway(tool_name='{name}', arguments={{method, params}}). "
                    f"Endpoint: {endpoint}"
                ),
                "source": "custom_mcp",
            }
        )
    return tools

async def _invoke_custom_mcp_server(server: dict[str, Any], arguments: dict[str, Any]) -> str:
    transport = str(server.get("transport", "streamable_http")).strip().lower()
    base_url = str(server.get("url", "")).strip()
    if not base_url:
        return "[Custom MCP error] Missing server url in custom config."

    method = str(arguments.get("method", "tools/list")).strip() or "tools/list"
    params = arguments.get("params", {})
    if not isinstance(params, dict):
        params = {}

    if transport not in {"streamable_http", "http", "https"}:
        return f"[Custom MCP error] Unsupported transport '{transport}'. Use streamable_http/http."

    import httpx

    payload = {
        "jsonrpc": "2.0",
        "id": str(uuid.uuid4()),
        "method": method,
        "params": params,
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                base_url, json=payload, headers={"content-type": "application/json"}
            )
            if resp.status_code != 200:
                return f"[Custom MCP HTTP {resp.status_code}] {resp.text[:500]}"
            data = resp.json()
            if isinstance(data, dict) and "error" in data:
                err = data.get("error")
                return f"[Custom MCP error] {json.dumps(err, ensure_ascii=False)[:500]}"
            result = data.get("result") if isinstance(data, dict) else data
            return json.dumps(result, ensure_ascii=False)[:4000]
    except Exception as e:
        return f"[Custom MCP exception] {e}"

async def _tavily_web_search(query: str, max_results: int = 5) -> str:
    """Execute a web search via Tavily API."""
    import httpx
    TAVILY_SEARCH_URL = "https://api.tavily.com/search"
    tavily_api_key = os.getenv("AF_TAVILY_API_KEY", "")
    if not tavily_api_key:
        return "[Tavily error] AF_TAVILY_API_KEY not configured. Set it in Settings."

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                TAVILY_SEARCH_URL,
                json={
                    "api_key": tavily_api_key,
                    "query": query,
                    "max_results": max_results,
                    "include_answer": True,
                    "search_depth": "basic",
                },
            )
            if resp.status_code != 200:
                return f"[Tavily error] HTTP {resp.status_code}: {resp.text[:300]}"
            data = resp.json()
            parts = []
            if data.get("answer"):
                parts.append(f"**Answer:** {data['answer']}\n")
            for i, r in enumerate(data.get("results", [])[:max_results], 1):
                title = r.get("title", "")
                url = r.get("url", "")
                content = r.get("content", "")[:300]
                parts.append(f"{i}. [{title}]({url})\n   {content}")
            return "\n\n".join(parts) if parts else "No results found."
    except Exception as e:
        return f"[Tavily search error]: {e}"
