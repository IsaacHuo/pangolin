from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse
from typing import Any, AsyncIterator
import os
import json
import logging
import asyncio
import time
import uuid
import mimetypes
from datetime import datetime, timezone
from pathlib import Path
from ..models import DashboardEvent, AuditEntry
from ..main import _state, _direction_from_message

from ..main import (
    DEFAULT_GATEWAY_PORT,
    _HTTP_ACCESS_RE,
    _WS_ACCESS_RE,
    _CONNECTION_STATE_RE,
    _APP_LOG_RE,
    _ALLOWED_EXTENSIONS,
    _read_gateway_info_from_local_config,
    _resolve_gateway_runtime_port,
    _first_non_empty_env,
    _get_gateway_auth,
    _probe_gateway_auth,
    _tavily_web_search,
    _normalize_custom_mcp_servers,
    _invoke_custom_mcp_server,
    _get_skill_registry,
    _get_gateway_tool_registry
)
from ..engine.tools.gateway_tools import GatewayToolRegistry

from fastapi.responses import JSONResponse

router = APIRouter()
logger = logging.getLogger("agent_firewall.routes.dashboard")



def _parse_backend_log_event(raw_line: str, seq: int) -> dict[str, Any]:
    """Parse backend log lines into structured stream events for the dashboard."""

    line = raw_line.rstrip("\n")
    now_iso = datetime.now(timezone.utc).isoformat()
    event: dict[str, Any] = {
        "id": f"log-{int(time.time() * 1000)}-{seq}",
        "receivedAt": now_iso,
        "timestamp": None,
        "direction": "internal",
        "kind": "runtime",
        "level": "INFO",
        "source": "backend",
        "peer": None,
        "method": None,
        "path": None,
        "statusCode": None,
        "statusText": None,
        "summary": line,
        "raw": line,
    }

    http_match = _HTTP_ACCESS_RE.match(line)
    if http_match:
        method = http_match.group("method")
        path = http_match.group("path")
        status_code = int(http_match.group("status"))
        status_text = (http_match.group("status_text") or "").strip() or None
        suffix = f" {status_text}" if status_text else ""
        event.update(
            {
                "direction": "inbound",
                "kind": "http",
                "level": http_match.group("level"),
                "source": "uvicorn.access",
                "peer": http_match.group("peer"),
                "method": method,
                "path": path,
                "statusCode": status_code,
                "statusText": status_text,
                "summary": f"{method} {path} -> {status_code}{suffix}",
            }
        )
        return event

    ws_match = _WS_ACCESS_RE.match(line)
    if ws_match:
        path = ws_match.group("path")
        ws_state = ws_match.group("ws_state")
        event.update(
            {
                "direction": "inbound",
                "kind": "websocket",
                "level": ws_match.group("level"),
                "source": "uvicorn.ws",
                "peer": ws_match.group("peer"),
                "path": path,
                "statusText": ws_state,
                "summary": f"WebSocket {path} [{ws_state}]",
            }
        )
        return event

    connection_match = _CONNECTION_STATE_RE.match(line)
    if connection_match:
        state = connection_match.group("state")
        event.update(
            {
                "kind": "websocket",
                "level": connection_match.group("level"),
                "source": "uvicorn.ws",
                "statusText": state,
                "summary": f"WebSocket connection {state}",
            }
        )
        return event

    app_match = _APP_LOG_RE.match(line)
    if app_match:
        message = app_match.group("message")
        level = app_match.group("level")
        direction = _direction_from_message(message)
        event.update(
            {
                "timestamp": app_match.group("timestamp"),
                "direction": direction,
                "kind": "service",
                "level": level,
                "source": app_match.group("source"),
                "summary": message,
            }
        )
        return event

    return event

@router.get("/api/logs/stream")
async def stream_logs(request: Request) -> StreamingResponse:
    """Stream backend logs via Server-Sent Events (SSE)."""

    async def event_generator() -> AsyncIterator[str]:
        log_file = Path("logs/backend.log")
        seq = 0

        def serialize_event(line: str) -> str:
            nonlocal seq
            seq += 1
            parsed = _parse_backend_log_event(line, seq)
            return f"data: {json.dumps(parsed, ensure_ascii=True)}\\n\\n"

        if not log_file.exists():
            missing_event = {
                "id": "log-missing",
                "receivedAt": datetime.now(timezone.utc).isoformat(),
                "timestamp": None,
                "direction": "internal",
                "kind": "runtime",
                "level": "WARNING",
                "source": "stream",
                "peer": None,
                "method": None,
                "path": None,
                "statusCode": None,
                "statusText": None,
                "summary": "Log file not found",
                "raw": "Log file not found",
            }
            yield f"data: {json.dumps(missing_event, ensure_ascii=True)}\n\n"
            return

        # Initial read of recent lines for context
        try:
            with open(log_file, encoding="utf-8", errors="ignore") as f:
                lines = f.readlines()
                for line in lines[-120:]:
                    yield serialize_event(line)

                # Follow tail
                f.seek(0, 2)  # Go to end
                while True:
                    if await request.is_disconnected():
                        break

                    line = f.readline()
                    if line:
                        yield serialize_event(line)
                    else:
                        await asyncio.sleep(0.1)
        except Exception as e:
            error_event = {
                "id": "log-read-error",
                "receivedAt": datetime.now(timezone.utc).isoformat(),
                "timestamp": None,
                "direction": "internal",
                "kind": "runtime",
                "level": "ERROR",
                "source": "stream",
                "peer": None,
                "method": None,
                "path": None,
                "statusCode": None,
                "statusText": None,
                "summary": f"Error reading log: {str(e)}",
                "raw": f"Error reading log: {str(e)}",
            }
            yield f"data: {json.dumps(error_event, ensure_ascii=True)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "agent-firewall"}

@router.get("/api/file")
async def serve_local_file(path: str) -> FileResponse:
    """Serve a local file so the browser can render audio/image/doc inline.

    Only serves files with allowed extensions. The *path* query param is the
    absolute filesystem path, e.g. `/api/file?path=/tmp/voice.mp3`.
    """
    file_path = Path(path)
    if not file_path.exists():
        return JSONResponse({"error": "File not found"}, status_code=404)  # type: ignore[return-value]
    if not file_path.is_file():
        return JSONResponse({"error": "Not a file"}, status_code=400)  # type: ignore[return-value]
    ext = file_path.suffix.lower()
    if ext not in _ALLOWED_EXTENSIONS:
        return JSONResponse({"error": f"Extension {ext} not allowed"}, status_code=403)  # type: ignore[return-value]
    media_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=file_path.name,
    )

@router.get("/api/gateway-info")
async def gateway_info() -> dict[str, Any]:
    """Read the local gateway config to auto-provide connection details.

    This endpoint discovers likely local gateway config paths (env overrides,
    profile-based defaults, and legacy locations) and extracts port/auth data,
    so the browser frontend can connect without manual token entry.
    It only works when the firewall backend runs on the same machine as the gateway.
    """
    discovered = _read_gateway_info_from_local_config()
    if not discovered.get("configured"):
        return {"configured": False}

    configured_port = int(discovered.get("port", DEFAULT_GATEWAY_PORT))
    effective_port = _resolve_gateway_runtime_port("127.0.0.1", configured_port)

    result: dict[str, Any] = {
        "configured": True,
        "port": effective_port,
        "configuredPort": configured_port,
        "bind": discovered.get("bind", "loopback"),
        "mode": discovered.get("mode", "local"),
        "configPath": discovered.get("configPath"),
        "allowedOrigins": discovered.get("allowedOrigins", []),
    }
    if discovered.get("token"):
        result["token"] = discovered["token"]
    if discovered.get("password"):
        result["hasPassword"] = True
    return result

@router.get("/api/monitor/status")
async def monitor_status() -> dict[str, Any]:
    """Continuous dashboard monitor for backend health and gateway token validity."""

    now_iso = datetime.now(timezone.utc).isoformat()
    discovered = _read_gateway_info_from_local_config()

    gateway_result: dict[str, Any] = {
        "configured": bool(discovered.get("configured")),
        "status": "not_configured",
        "tokenValid": False,
        "pairingRequired": False,
        "message": "Gateway config not found",
        "port": discovered.get("port", DEFAULT_GATEWAY_PORT),
        "bind": discovered.get("bind", "loopback"),
        "configPath": discovered.get("configPath"),
        "lastChecked": now_iso,
    }

    if discovered.get("configured"):
        configured_port = int(discovered.get("port", DEFAULT_GATEWAY_PORT))
        port = _resolve_gateway_runtime_port("127.0.0.1", configured_port)
        bind_mode = str(discovered.get("bind", "loopback"))
        probe_host = (
            "127.0.0.1" if bind_mode in ("loopback", "localhost", "127.0.0.1") else "127.0.0.1"
        )
        ws_url = f"ws://{probe_host}:{port}/ws"

        probe = await _probe_gateway_auth(
            ws_url=ws_url,
            token=str(discovered.get("token") or "") or None,
            password=str(discovered.get("password") or "") or None,
        )

        gateway_result.update(
            {
                "status": probe.get("status", "unknown"),
                "tokenValid": probe.get("tokenValid"),
                "pairingRequired": probe.get("pairingRequired", False),
                "message": probe.get("message", ""),
                "wsUrl": ws_url,
                "configuredPort": configured_port,
                "effectivePort": port,
                "protocol": probe.get("protocol"),
                "role": probe.get("role"),
                "hasToken": bool(discovered.get("token")),
                "hasPassword": bool(discovered.get("password")),
            }
        )

    return {
        "backend": {
            "ok": True,
            "status": "healthy",
            "service": "agent-firewall",
            "lastChecked": now_iso,
        },
        "gateway": gateway_result,
    }

@router.get("/api/audit")
async def get_audit(request: Request) -> JSONResponse:
    """
    Return audit log entries in the format expected by the frontend:
    { "entries": [...], "has_more": boolean }

    Each entry is normalized to include top-level fields that the
    frontend AuditEntry TypeScript type expects (id, threat_level,
    matched_patterns, etc.), extracted from the nested analysis object.
    """
    s = _state(request)
    limit = int(request.query_params.get("limit", 50))
    offset = int(request.query_params.get("offset", 0))
    verdict_filter = request.query_params.get("verdict")
    since_str = request.query_params.get("since")

    raw_entries = await s.audit_logger.get_recent_entries(limit + offset + 1)

    # Apply filters
    if verdict_filter:
        raw_entries = [
            e for e in raw_entries if str(e.get("verdict", "")).upper() == verdict_filter.upper()
        ]
    if since_str:
        since_ts = float(since_str)
        raw_entries = [e for e in raw_entries if e.get("timestamp", 0) >= since_ts]

    total = len(raw_entries)
    paginated = raw_entries[offset : offset + limit]

    # Transform each entry to match frontend AuditEntry type
    entries = []
    for raw in paginated:
        analysis = raw.get("analysis") or {}
        entries.append(
            {
                "id": analysis.get("request_id", raw.get("session_id", "")),
                "timestamp": raw.get("timestamp", 0),
                "session_id": raw.get("session_id", ""),
                "agent_id": raw.get("agent_id", ""),
                "method": raw.get("method", ""),
                "verdict": str(raw.get("verdict", "ALLOW")).upper(),
                "threat_level": str(analysis.get("threat_level", "NONE")).upper(),
                "matched_patterns": analysis.get("l1_matched_patterns", []),
                "payload_hash": raw.get("session_id", ""),
                "payload_preview": raw.get("params_summary", ""),
            }
        )

    return JSONResponse({"entries": entries, "has_more": total > offset + limit})

@router.get("/api/stats")
async def stats(request: Request) -> JSONResponse:
    s = _state(request)
    return JSONResponse(
        {
            "uptime_seconds": round(s.uptime_seconds, 1),
            "active_sessions": s.session_manager.active_count,
            "dashboard_clients": s.dashboard_hub.client_count,
            "audit": s.audit_logger.stats,
        }
    )

@router.websocket("/ws/dashboard")
async def dashboard_websocket(ws: WebSocket) -> None:
    s = ws.app.state.firewall
    await s.dashboard_hub.handle_client(ws)

@router.post("/api/chat/send")
async def chat_send(request: Request):
    """
    Red Team Chat Lab endpoint — **streaming NDJSON**.

    Accepts a chat message (with optional modified/injected version),
    runs L1/L2 analysis, and optionally forwards to the upstream LLM.
    Results are streamed back as newline-delimited JSON events so the
    frontend can display progress incrementally.

    Event types:
      {"type": "analysis", "analysis": {...}, "blocked": bool}
      {"type": "tool_call", "tool_call": {...}}
      {"type": "content", "content": "..."}
      {"type": "error", "error": "..."}
      {"type": "done"}
    """
    import uuid

    s = _state(request)
    data = await request.json()
    messages = data.get("messages", [])
    model = data.get("model", "openai/gpt-4o-mini")
    modified_content = data.get("modified_content", None)
    force_forward = data.get("force_forward", False)
    analyze_only = data.get("analyze_only", False)
    temperature = data.get("temperature", None)
    max_tokens = data.get("max_tokens", None)
    top_p = data.get("top_p", None)
    enable_tools = data.get("enable_tools", True)
    external_tools = data.get(
        "external_tools", []
    )  # tools provided by frontend (e.g. gateway skills)

    if not messages:
        return JSONResponse({"error": "No messages provided"}, status_code=400)

    async def _event_stream():
        """Async generator yielding NDJSON lines."""
        from .models import AnalysisResult, AuditEntry, DashboardEvent, ThreatLevel, Verdict

        def _extract_text(content: Any) -> str:
            if isinstance(content, str):
                return content
            if isinstance(content, list):
                return "\n".join(
                    part.get("text", "") if isinstance(part, dict) else str(part)
                    for part in content
                )
            return str(content) if content else ""

        def _emit(obj: dict) -> str:
            return json.dumps(obj, ensure_ascii=False) + "\n"

        original_content = "\n".join(
            [_extract_text(m.get("content", "")) for m in messages if m.get("role") == "user"]
        )
        analyze_content = modified_content if modified_content else original_content
        forwarded_messages = list(messages)

        if modified_content:
            for i in range(len(forwarded_messages) - 1, -1, -1):
                if forwarded_messages[i].get("role") == "user":
                    forwarded_messages[i] = {"role": "user", "content": modified_content}
                    break

        # L1 Analysis
        l1_result = s.static_analyzer.analyze(analyze_content)
        l1_blocked = l1_result.threat_level in (ThreatLevel.CRITICAL, ThreatLevel.HIGH)

        # L2 Analysis
        l2_confidence = 0.0
        l2_reasoning = ""
        l2_is_injection = False
        try:
            l2_result = await s.semantic_analyzer.analyze(
                method="chat/completions",
                params=analyze_content,
                session_context=[],
            )
            l2_confidence = l2_result.confidence
            l2_reasoning = l2_result.reasoning
            l2_is_injection = l2_result.is_injection
        except Exception as e:
            l2_reasoning = f"L2 analysis error: {e}"

        l2_blocked = l2_is_injection and l2_confidence >= 0.7
        is_blocked = l1_blocked or l2_blocked
        verdict = "BLOCK" if is_blocked else "ALLOW"
        if is_blocked and l2_confidence >= 0.9:
            verdict = "ESCALATE"

        threat_level = l1_result.threat_level
        if l2_blocked:
            threat_level = ThreatLevel.HIGH if l2_confidence < 0.9 else ThreatLevel.CRITICAL

        analysis_result = AnalysisResult(
            request_id=str(uuid.uuid4()),
            verdict=verdict,
            threat_level=threat_level,
            l1_matched_patterns=l1_result.matched_patterns,
            l2_is_injection=l2_is_injection,
            l2_confidence=l2_confidence,
            l2_reasoning=l2_reasoning,
            blocked_reason=(
                f"L1: {', '.join(l1_result.matched_patterns)}"
                if l1_blocked
                else f"L2: {l2_reasoning}"
                if l2_blocked
                else ""
            ),
        )

        # Emit dashboard + audit events
        event = DashboardEvent(
            event_type="chat_lab_request",
            timestamp=time.time(),
            session_id="chat-lab",
            agent_id="red-team-tester",
            method="chat/completions",
            payload_preview=(
                analyze_content[:200] + "..." if len(analyze_content) > 200 else analyze_content
            ),
            analysis=analysis_result,
            is_alert=(verdict != "ALLOW"),
        )
        await s._emit_dashboard(event)
        audit_entry = AuditEntry(
            timestamp=time.time(),
            session_id="chat-lab",
            agent_id="red-team-tester",
            method="chat/completions",
            params_summary=analyze_content[:500],
            analysis=analysis_result,
            verdict=verdict,
        )
        await s._emit_audit(audit_entry)

        # Emit Trace
        if hasattr(s, "storage") and s.storage:
            trace_entry = {
                "id": analysis_result.request_id,
                "session_id": "chat-lab",
                "timestamp": time.time(),
                "verdict": verdict,
                "threat_level": threat_level.value
                if hasattr(threat_level, "value")
                else str(threat_level),
                "messages": messages,
                "analysis": {
                    "verdict": verdict,
                    "threat_level": threat_level.value
                    if hasattr(threat_level, "value")
                    else str(threat_level),
                    "l1_patterns": l1_result.matched_patterns,
                    "l2_confidence": l2_confidence,
                    "l2_reasoning": l2_reasoning,
                },
            }
            try:
                await s.storage.save_trace(trace_entry)
            except Exception as e:
                logger.error(f"Failed to save trace: {e}")

        analysis_payload = {
            "request_id": analysis_result.request_id,
            "verdict": verdict,
            "threat_level": threat_level.value
            if hasattr(threat_level, "value")
            else str(threat_level),
            "l1_patterns": l1_result.matched_patterns,
            "l2_is_injection": l2_is_injection,
            "l2_confidence": l2_confidence,
            "l2_reasoning": l2_reasoning,
            "blocked_reason": analysis_result.blocked_reason,
        }

        # ── Stream: analysis event ──
        # ESCALATE should be actionable by operator buttons (Allow/Block),
        # so we do not mark it blocked until a human verdict arrives.
        is_initially_blocked = verdict == "BLOCK" and not force_forward
        yield _emit(
            {
                "type": "analysis",
                "analysis": analysis_payload,
                "blocked": is_initially_blocked,
                "requires_human_verdict": (
                    verdict == "ESCALATE" and not force_forward and not analyze_only
                ),
            }
        )

        if analyze_only:
            yield _emit({"type": "done"})
            return

        if verdict == "ESCALATE" and not force_forward:
            human_verdict = await s.dashboard_hub.request_human_verdict(
                analysis_result.request_id,
                timeout=30.0,
            )
            resolved_verdict = human_verdict.value
            resolved_blocked = human_verdict == Verdict.BLOCK
            resolved_reason = (
                analysis_result.blocked_reason if resolved_blocked else "Allowed by human reviewer"
            )

            resolved_analysis_payload = {
                **analysis_payload,
                "verdict": resolved_verdict,
                "blocked_reason": resolved_reason,
            }

            yield _emit(
                {
                    "type": "analysis",
                    "analysis": resolved_analysis_payload,
                    "blocked": resolved_blocked,
                    "resolution": ("human_block" if resolved_blocked else "human_allow"),
                }
            )

            analysis_result.verdict = human_verdict
            analysis_result.blocked_reason = resolved_reason

            await s._emit_dashboard(
                DashboardEvent(
                    event_type="verdict",
                    timestamp=time.time(),
                    session_id="chat-lab",
                    agent_id="red-team-tester",
                    method="chat/completions",
                    payload_preview=(
                        analyze_content[:200] + "..."
                        if len(analyze_content) > 200
                        else analyze_content
                    ),
                    analysis=analysis_result,
                    is_alert=resolved_blocked,
                )
            )

            if resolved_blocked:
                yield _emit({"type": "done"})
                return

        elif verdict == "BLOCK" and not force_forward:
            yield _emit({"type": "done"})
            return

        # ── Forward to upstream LLM ──
        try:
            import httpx

            upstream_url = f"{s.openai_adapter.upstream_url}/chat/completions"
            upstream_headers: dict[str, str] = {
                "content-type": "application/json",
                "accept": "application/json",
            }

            request_api_key = request.headers.get("x-api-key", "").strip()
            if not request_api_key:
                auth_header = request.headers.get("authorization", "")
                if auth_header.lower().startswith("bearer "):
                    request_api_key = auth_header[7:].strip()

            effective_api_key = request_api_key or s.openai_adapter.api_key
            if not effective_api_key and str(model).startswith("openrouter/"):
                effective_api_key = _first_non_empty_env("OPENROUTER_API_KEY", "AF_L2_API_KEY")

            if effective_api_key:
                upstream_headers["Authorization"] = f"Bearer {effective_api_key}"
            active_api_key = effective_api_key or ""

            gw_host, gw_port, gw_auth_primary, gw_auth_secondary = _get_gateway_auth()

            async def _invoke_gateway_with_auth_fallback(
                resolved_tool_name: str,
                resolved_args: dict[str, Any],
            ) -> str:
                result = await GatewayToolRegistry.execute(
                    gw_host,
                    gw_port,
                    gw_auth_primary,
                    resolved_tool_name,
                    resolved_args,
                )
                if (
                    "[Gateway auth error]" in result
                    and gw_auth_secondary
                    and gw_auth_secondary != gw_auth_primary
                ):
                    logger.warning(
                        "Gateway auth failed with primary credential; retrying tool %s with secondary credential.",
                        resolved_tool_name,
                    )
                    result = await GatewayToolRegistry.execute(
                        gw_host,
                        gw_port,
                        gw_auth_secondary,
                        resolved_tool_name,
                        resolved_args,
                    )
                return result

            registry = _get_skill_registry()
            gw_registry = _get_gateway_tool_registry()

            # Merge external tools from frontend (e.g. gateway skills)
            gw_tools_map = gw_registry.tools.copy()
            if external_tools:
                from .engine.tools.gateway_tools import GatewayToolDef

                for t in external_tools:
                    name = t.get("name")
                    desc = t.get("description", "")
                    # Treat external tools as gateway tools so they use invoke_gateway
                    if name and name not in gw_tools_map:
                        gw_tools_map[name] = GatewayToolDef(
                            name=name, description=desc, source_file="external"
                        )

            # Re-generate invoke_gateway tool definition with expanded tool list
            tool_names = sorted(gw_tools_map.keys())
            invoke_gateway_tool = {
                "type": "function",
                "function": {
                    "name": "invoke_gateway",
                    "description": (
                        "Invoke an OpenClaw gateway tool. "
                        f"Available tools: {', '.join(tool_names)}. "
                        "Check the system prompt for tool descriptions and expected arguments."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "tool_name": {
                                "type": "string",
                                "description": (
                                    f"Gateway tool to invoke. One of: {', '.join(tool_names)}"
                                ),
                                "enum": tool_names,
                            },
                            "arguments": {
                                "type": "object",
                                "description": (
                                    "Arguments to pass to the tool as a JSON object. "
                                    "Refer to tool descriptions for expected fields."
                                ),
                            },
                        },
                        "required": ["tool_name"],
                    },
                },
            }

            openai_tools = [invoke_gateway_tool] + registry.get_openai_tools()

            # Re-generate system prompt for gateway tools
            gw_parts = [
                "# Available Gateway Tools",
                "",
                "Use `invoke_gateway(tool_name, arguments)` to call these OpenClaw gateway tools.",
                "Pass arguments as a JSON object with the expected fields for each tool.",
                "",
            ]
            for name in tool_names:
                t = gw_tools_map[name]
                gw_parts.append(f"- **{name}**: {t.description}")
            gw_parts.append("")
            gateway_prompt = "\n".join(gw_parts)

            # NEW: Tool Selection Policy (to guide LLM preference)
            policy_prompt = (
                "# Tool Selection Policy\n"
                "1. **Prioritize Specialized Skills**: Always check the 'Available Skills' list via `get_skill_docs`. If a skill exists, use `run_skill`.\n"
                "2. **Feishu/Lark Operations**: \n"
                "   - **Docs/Wiki**: The `feishu_doc` tool is a Gateway Tool. Use `invoke_gateway(tool_name='feishu_doc', arguments={'action': 'create', 'title': '...', 'content': '...'})`. Do NOT use `run_skill` for it.\n"
                "   - **Chat/Messages**: Use `invoke_gateway(tool_name='message', arguments={'action': 'send', 'channel': 'feishu', 'target': '...', 'message': '...'})`.\n"
                "3. **Skill Usage**: \n"
                "   - For CLI skills (e.g. `apple-notes`), use `get_skill_docs` then `run_skill`.\n"
                "   - For Gateway tools (e.g. `feishu_doc`, `browser`), use `invoke_gateway`.\n"
            )

            skills_prompt = registry.get_skills_system_prompt()
            combined_prompt = "\n\n".join(
                p for p in [gateway_prompt, skills_prompt, policy_prompt] if p
            )

            if combined_prompt and enable_tools:
                chat_body_messages = list(forwarded_messages)
                has_system = chat_body_messages and chat_body_messages[0].get("role") == "system"
                if has_system:
                    existing = chat_body_messages[0].get("content", "")
                    chat_body_messages[0] = {
                        "role": "system",
                        "content": existing + "\n\n" + combined_prompt,
                    }
                else:
                    chat_body_messages.insert(0, {"role": "system", "content": combined_prompt})
            else:
                chat_body_messages = list(forwarded_messages)

            chat_body: dict[str, Any] = {
                "model": model,
                "messages": chat_body_messages,
                "stream": False,
            }
            if temperature is not None:
                chat_body["temperature"] = float(temperature)
            if max_tokens is not None:
                chat_body["max_tokens"] = int(max_tokens)
            if top_p is not None:
                chat_body["top_p"] = float(top_p)
            if openai_tools and enable_tools:
                chat_body["tools"] = openai_tools
                chat_body["tool_choice"] = "auto"

            tool_calls_log: list[dict[str, Any]] = []
            max_iterations = 100
            max_retries = 4
            mock_toolchain_mode = str(model).strip().lower() in {
                "mock/toolchain",
                "mock/tools",
            }

            async with httpx.AsyncClient(
                timeout=httpx.Timeout(connect=15.0, read=120.0, write=30.0, pool=30.0),
                limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
            ) as client:
                for iteration in range(max_iterations):
                    resp = None
                    resp_json = None
                    if mock_toolchain_mode:
                        if iteration == 0:
                            mock_gateway_tool = tool_names[0] if tool_names else "web_search"
                            resp_json = {
                                "choices": [
                                    {
                                        "message": {
                                            "role": "assistant",
                                            "content": None,
                                            "tool_calls": [
                                                {
                                                    "id": f"call_{uuid.uuid4().hex[:8]}",
                                                    "function": {
                                                        "name": "get_skill_docs",
                                                        "arguments": json.dumps(
                                                            {"skill_name": "weather"},
                                                            ensure_ascii=False,
                                                        ),
                                                    },
                                                },
                                                {
                                                    "id": f"call_{uuid.uuid4().hex[:8]}",
                                                    "function": {
                                                        "name": "invoke_gateway",
                                                        "arguments": json.dumps(
                                                            {
                                                                "tool_name": mock_gateway_tool,
                                                                "arguments": {
                                                                    "method": "tools/list",
                                                                    "params": {},
                                                                },
                                                            },
                                                            ensure_ascii=False,
                                                        ),
                                                    },
                                                },
                                            ],
                                        },
                                        "finish_reason": "tool_calls",
                                    }
                                ]
                            }
                        else:
                            resp_json = {
                                "choices": [
                                    {
                                        "message": {
                                            "role": "assistant",
                                            "content": "Mock toolchain mode complete. Skills and MCP gateway tool were invoked.",
                                        },
                                        "finish_reason": "stop",
                                    }
                                ]
                            }
                    else:
                        for attempt in range(max_retries):
                            try:
                                resp = await client.post(
                                    upstream_url, headers=upstream_headers, json=chat_body
                                )

                                if resp.status_code == 401 and str(model).startswith("openrouter/"):
                                    fallback_key = (
                                        _first_non_empty_env("OPENROUTER_API_KEY", "AF_L2_API_KEY")
                                        or ""
                                    )
                                    if fallback_key and fallback_key != active_api_key:
                                        retry_headers = dict(upstream_headers)
                                        retry_headers["Authorization"] = f"Bearer {fallback_key}"
                                        logger.warning(
                                            "Upstream 401 with current API key; retrying once with fallback key."
                                        )
                                        retry_resp = await client.post(
                                            upstream_url,
                                            headers=retry_headers,
                                            json=chat_body,
                                        )
                                        resp = retry_resp
                                        if retry_resp.status_code == 200:
                                            upstream_headers = retry_headers
                                            active_api_key = fallback_key

                                if resp.status_code == 429 or resp.status_code >= 502:
                                    wait = (2**attempt) + 0.5
                                    logger.warning(
                                        "Upstream %d on attempt %d/%d, retrying in %.1fs",
                                        resp.status_code,
                                        attempt + 1,
                                        max_retries,
                                        wait,
                                    )
                                    await asyncio.sleep(wait)
                                    continue
                                if resp.status_code == 200:
                                    resp_json = resp.json()
                                break
                            except (
                                httpx.RemoteProtocolError,
                                httpx.ReadError,
                                httpx.ReadTimeout,
                                httpx.ConnectError,
                                httpx.ConnectTimeout,
                            ) as exc:
                                wait = (2**attempt) + 0.5
                                logger.warning(
                                    "Upstream connection error on attempt %d/%d: %s, retrying in %.1fs",
                                    attempt + 1,
                                    max_retries,
                                    exc,
                                    wait,
                                )
                                if attempt < max_retries - 1:
                                    await asyncio.sleep(wait)
                                else:
                                    raise

                    if mock_toolchain_mode:
                        pass
                    elif resp is None or resp.status_code != 200:
                        if resp and resp.status_code in (401, 403):
                            logger.warning(f"Upstream auth failed ({resp.status_code}).")
                            try:
                                error_json = resp.json()
                                error_msg = error_json.get("error", {}).get("message", resp.text)
                            except Exception:
                                error_msg = resp.text

                            if (
                                s.openai_adapter.api_key
                                and "openrouter" in s.config.l2_model_endpoint
                            ):
                                logger.info(
                                    "Attempting fallback to direct OpenRouter call since gateway failed."
                                )
                                try:
                                    direct_url = "https://openrouter.ai/api/v1/chat/completions"
                                    direct_headers = {
                                        "Authorization": f"Bearer {s.openai_adapter.api_key}",
                                        "Content-Type": "application/json",
                                    }
                                    direct_resp = await client.post(
                                        direct_url, headers=direct_headers, json=chat_body
                                    )
                                    if direct_resp.status_code == 200:
                                        resp = direct_resp
                                        resp_json = direct_resp.json()
                                    else:
                                        logger.warning(
                                            f"Direct fallback failed: {direct_resp.status_code}"
                                        )
                                except Exception as e:
                                    logger.warning(f"Direct fallback exception: {e}")

                            if resp_json:
                                break

                            yield _emit(
                                {
                                    "type": "content",
                                    "content": f"The firewall successfully inspected the request (ALLOW). However, the upstream gateway rejected the connection ({resp.status_code}: {error_msg[:100]}).\n\nThis confirms the firewall is active and enforcing security policies. To fix the upstream connection, check your Gateway credentials.",
                                }
                            )
                            yield _emit({"type": "done"})
                            break

                        err_detail = resp.text[:500] if resp else "No response"
                        status = resp.status_code if resp else 0
                        yield _emit(
                            {
                                "type": "error",
                                "error": f"Upstream error {status}: {err_detail}",
                            }
                        )
                        break

                    if not resp_json:
                        yield _emit({"type": "error", "error": "Empty response body from upstream"})
                        break

                    choices = resp_json.get("choices", [])
                    if not choices:
                        yield _emit({"type": "error", "error": "No choices in LLM response"})
                        break

                    assistant_msg = choices[0].get("message", {})
                    finish_reason = choices[0].get("finish_reason", "stop")
                    pending_tool_calls = assistant_msg.get("tool_calls", [])

                    # Heuristic: If content is JSON and looks like web search arguments, force it as tool call
                    # (Minimax sometimes outputs raw JSON instead of tool calls)
                    content_str = assistant_msg.get("content", "")
                    if (
                        not pending_tool_calls
                        and content_str
                        and content_str.strip().startswith("{")
                        and "query" in content_str
                    ):
                        try:
                            parsed = json.loads(content_str)
                            # Check for common search/gateway tool patterns
                            if isinstance(parsed, dict) and "query" in parsed:
                                logger.info(
                                    "Detected implicit web_search JSON: %s", content_str[:100]
                                )
                                pending_tool_calls = [
                                    {
                                        "id": f"call_{uuid.uuid4().hex[:8]}",
                                        "function": {
                                            "name": "invoke_gateway",
                                            "arguments": json.dumps(
                                                {"tool_name": "web_search", "arguments": parsed}
                                            ),
                                        },
                                    }
                                ]
                                # Clear content so we don't output the raw JSON to user
                                assistant_msg["content"] = None
                        except Exception:
                            pass

                    if finish_reason == "tool_calls" or pending_tool_calls:
                        chat_body["messages"].append(assistant_msg)

                        for tc in pending_tool_calls:
                            tc_id = tc.get("id", "")
                            func = tc.get("function", {})
                            tool_name = func.get("name", "").strip()
                            try:
                                tool_args = json.loads(func.get("arguments", "{}"))
                            except Exception:
                                tool_args = {}

                            # L1 analysis on the tool call
                            tool_content_str = f"tools/call {tool_name} {json.dumps(tool_args)}"
                            tool_l1 = s.static_analyzer.analyze(tool_content_str)
                            tool_l1_blocked = tool_l1.threat_level in (
                                ThreatLevel.CRITICAL,
                                ThreatLevel.HIGH,
                            )

                            tool_call_record: dict[str, Any] = {
                                "tool_name": tool_name,
                                "arguments": tool_args,
                                "iteration": iteration,
                                "l1_patterns": tool_l1.matched_patterns,
                                "l1_blocked": tool_l1_blocked,
                            }

                            # L2 analysis on the tool call
                            tool_l2_confidence = 0.0
                            tool_l2_reasoning = ""
                            tool_l2_blocked = False
                            try:
                                tool_l2_result = await s.semantic_analyzer.analyze(
                                    method=f"tools/call/{tool_name}",
                                    params=tool_content_str,
                                    session_context=[],
                                )
                                tool_l2_confidence = tool_l2_result.confidence
                                tool_l2_reasoning = tool_l2_result.reasoning
                                tool_l2_blocked = (
                                    tool_l2_result.is_injection and tool_l2_confidence >= 0.7
                                )
                            except Exception as e:
                                tool_l2_reasoning = f"L2 tool analysis error: {e}"

                            tool_call_record["l2_confidence"] = tool_l2_confidence
                            tool_call_record["l2_reasoning"] = tool_l2_reasoning
                            tool_call_record["l2_blocked"] = tool_l2_blocked

                            if tool_l1_blocked or tool_l2_blocked:
                                block_reasons = []
                                if tool_l1_blocked:
                                    block_reasons.append(
                                        f"L1 patterns: {', '.join(tool_l1.matched_patterns)}"
                                    )
                                if tool_l2_blocked:
                                    block_reasons.append(
                                        f"L2 ({tool_l2_confidence:.0%}): {tool_l2_reasoning}"
                                    )
                                tool_result = f"[BLOCKED by firewall] {'; '.join(block_reasons)}"
                                tool_call_record["blocked"] = True
                                tool_call_record["result_preview"] = tool_result[:200]
                            else:
                                if tool_name == "get_skill_docs":
                                    skill_name = tool_args.get("skill_name", "")
                                    tool_result = registry.get_skill_docs(skill_name)
                                elif tool_name == "get_gateway_tool_docs":
                                    gw_tool_name = tool_args.get("tool_name", "")
                                    gw_registry = _get_gateway_tool_registry()
                                    tool_result = gw_registry.get_tool_docs(gw_tool_name)
                                elif tool_name == "run_skill":
                                    skill_name = tool_args.get("skill_name", "")
                                    command = tool_args.get("command", "")
                                    explanation = tool_args.get("explanation", "")
                                    logger.info(
                                        "run_skill: %s → %s (%s)",
                                        skill_name,
                                        command[:100],
                                        explanation[:80],
                                    )
                                    tool_result = await registry.execute_skill(skill_name, command)
                                elif tool_name == "invoke_gateway":
                                    gw_tool_name = tool_args.get("tool_name", "")
                                    gw_arguments = tool_args.get("arguments", {})

                                    # Fix: Handle stringified JSON for arguments (LLM confusion)
                                    if isinstance(gw_arguments, str):
                                        try:
                                            gw_arguments = json.loads(gw_arguments)
                                        except Exception:
                                            pass
                                    if not isinstance(gw_arguments, dict):
                                        gw_arguments = {}

                                    logger.info(
                                        "invoke_gateway: %s args=%s",
                                        gw_tool_name,
                                        json.dumps(gw_arguments, ensure_ascii=False)[:200],
                                    )
                                    custom_servers = _normalize_custom_mcp_servers()
                                    custom_server = custom_servers.get(str(gw_tool_name))
                                    if custom_server:
                                        tool_result = await _invoke_custom_mcp_server(
                                            custom_server, gw_arguments
                                        )
                                    elif gw_tool_name == "web_search":
                                        search_query = gw_arguments.get("query", "")
                                        search_count = gw_arguments.get("count", 5)
                                        tool_result = await _tavily_web_search(
                                            search_query, search_count
                                        )
                                    else:
                                        tool_result = await _invoke_gateway_with_auth_fallback(
                                            gw_tool_name,
                                            gw_arguments,
                                        )
                                        # Fix: Retry with underscore if hyphenated name not found (e.g. feishu-doc -> feishu_doc)
                                        if (
                                            "[Gateway HTTP 404]" in tool_result
                                            and "not available" in tool_result
                                            and "-" in gw_tool_name
                                        ):
                                            alt_name = gw_tool_name.replace("-", "_")
                                            logger.info(
                                                "Retrying tool %s as %s", gw_tool_name, alt_name
                                            )
                                            tool_result = await _invoke_gateway_with_auth_fallback(
                                                alt_name,
                                                gw_arguments,
                                            )
                                else:
                                    # Fix: Handle wrapped arguments (LLM confusion when calling tools directly)
                                    real_args = tool_args
                                    if (
                                        isinstance(tool_args, dict)
                                        and "arguments" in tool_args
                                        and len(tool_args) == 1
                                    ):
                                        val = tool_args["arguments"]
                                        if isinstance(val, dict):
                                            real_args = val
                                        elif isinstance(val, str):
                                            try:
                                                real_args = json.loads(val)
                                            except Exception:
                                                pass

                                    tool_result = await _invoke_gateway_with_auth_fallback(
                                        tool_name,
                                        real_args,
                                    )
                                    # Fix: Retry with underscore if hyphenated name not found
                                    if (
                                        "[Gateway HTTP 404]" in tool_result
                                        and "not available" in tool_result
                                        and "-" in tool_name
                                    ):
                                        alt_name = tool_name.replace("-", "_")
                                        logger.info("Retrying tool %s as %s", tool_name, alt_name)
                                        tool_result = await _invoke_gateway_with_auth_fallback(
                                            alt_name,
                                            real_args,
                                        )
                                tool_call_record["blocked"] = False
                                tool_call_record["result_preview"] = tool_result[:200]

                            tool_calls_log.append(tool_call_record)

                            # Emit dashboard event for each tool call
                            tool_event = DashboardEvent(
                                event_type="chat_lab_tool_call",
                                timestamp=time.time(),
                                session_id="chat-lab",
                                agent_id="red-team-tester",
                                method=f"tools/call/{tool_name}",
                                payload_preview=tool_content_str[:200],
                                analysis=AnalysisResult(
                                    request_id=str(uuid.uuid4()),
                                    verdict="BLOCK"
                                    if (tool_l1_blocked or tool_l2_blocked)
                                    else "ALLOW",
                                    threat_level=tool_l1.threat_level
                                    if tool_l1_blocked
                                    else (
                                        ThreatLevel.HIGH if tool_l2_blocked else ThreatLevel.NONE
                                    ),
                                    l1_matched_patterns=tool_l1.matched_patterns,
                                    l2_is_injection=tool_l2_blocked,
                                    l2_confidence=tool_l2_confidence,
                                    l2_reasoning=tool_l2_reasoning,
                                    blocked_reason=(
                                        f"L1: {', '.join(tool_l1.matched_patterns)}"
                                        if tool_l1_blocked
                                        else (f"L2: {tool_l2_reasoning}" if tool_l2_blocked else "")
                                    ),
                                ),
                                is_alert=(tool_l1_blocked or tool_l2_blocked),
                            )
                            await s._emit_dashboard(tool_event)

                            # Append tool result to conversation
                            chat_body["messages"].append(
                                {"role": "tool", "tool_call_id": tc_id, "content": tool_result}
                            )

                            # ── Stream: tool call event ──
                            yield _emit({"type": "tool_call", "tool_call": tool_call_record})

                        continue

                    # No tool calls — final response
                    yield _emit({"type": "content", "content": assistant_msg.get("content", "")})
                    break
                else:
                    yield _emit(
                        {"type": "content", "content": "[Max tool-call iterations reached]"}
                    )

        except Exception as e:
            logger.error(f"Chat lab upstream error: {e}")
            yield _emit({"type": "error", "error": str(e)})

        yield _emit({"type": "done"})

    return StreamingResponse(_event_stream(), media_type="application/x-ndjson")

@router.post("/api/test/analyze")
async def test_analyze(request: Request) -> dict[str, Any]:
    import json
    import uuid

    from .models import AnalysisResult, DashboardEvent, ThreatLevel

    s = _state(request)
    data = await request.json()
    payload_str = data.get("payload", "")

    # L1 Analysis
    l1_result = s.static_analyzer.analyze(payload_str)
    l1_verdict = "BLOCK" if l1_result.threat_level != ThreatLevel.NONE else "ALLOW"

    # L2 Analysis
    l2_verdict = "ALLOW"
    l2_confidence = 0.0
    l2_reasoning = ""
    method = "unknown"

    try:
        parsed = json.loads(payload_str)
        method = parsed.get("method", "unknown")
        params = parsed.get("params", {})

        # Run L2 classification
        l2_result = await s.semantic_analyzer.analyze(
            method=method,
            params=params,
            session_context=[],
        )
        l2_confidence = l2_result.confidence
        l2_reasoning = l2_result.reasoning
        if l2_result.is_injection:
            l2_verdict = "BLOCK"
            if l2_result.threat_level == ThreatLevel.CRITICAL:
                l2_verdict = "ESCALATE"
    except json.JSONDecodeError:
        pass

    # Final Verdict Logic
    final_verdict = "ALLOW"
    if l1_verdict != "ALLOW":
        final_verdict = l1_verdict
    elif l2_verdict != "ALLOW":
        final_verdict = l2_verdict

    # Determine threat level
    threat_level = l1_result.threat_level
    if final_verdict == "BLOCK":
        threat_level = ThreatLevel.HIGH
    elif final_verdict == "ESCALATE":
        threat_level = ThreatLevel.CRITICAL

    # Emit dashboard event for test requests
    analysis = AnalysisResult(
        request_id=str(uuid.uuid4()),
        verdict=final_verdict,
        threat_level=threat_level,
        l1_matched_patterns=l1_result.matched_patterns,
        l2_is_injection=(l2_verdict != "ALLOW"),
        l2_confidence=l2_confidence,
        l2_reasoning=l2_reasoning,
        blocked_reason=", ".join(l1_result.matched_patterns) if l1_result.matched_patterns else "",
    )

    event = DashboardEvent(
        event_type="request_analyzed",
        timestamp=time.time(),
        session_id="test-lab",
        agent_id="security-tester",
        method=method,
        payload_preview=payload_str[:200] + ("..." if len(payload_str) > 200 else ""),
        analysis=analysis,
        is_alert=(final_verdict != "ALLOW"),
    )

    await s._emit_dashboard(event)

    # Also log to audit
    from .models import AuditEntry

    audit_entry = AuditEntry(
        id=analysis.request_id,
        timestamp=time.time(),
        session_id="test-lab",
        agent_id="security-tester",
        method=method,
        verdict=final_verdict,
        threat_level=threat_level,
        matched_patterns=l1_result.matched_patterns,
        payload_hash="test",
        payload_preview=payload_str[:500],
    )
    await s._emit_audit(audit_entry)

    return {
        "verdict": final_verdict,
        "l1_patterns": l1_result.matched_patterns,
        "l2_confidence": l2_confidence,
    }