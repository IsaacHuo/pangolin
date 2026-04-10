from fastapi import APIRouter, Request, HTTPException
from typing import Any
import os
from ..models import FirewallConfig
from ..main import _state

from ..main import (
    DEFAULT_GATEWAY_PORT,
    _read_gateway_info_from_local_config,
    _resolve_gateway_runtime_port,
    _first_non_empty_env,
    _get_gateway_auth,
    _probe_gateway_auth,
    _normalize_custom_mcp_servers
)

router = APIRouter()



@router.get("/api/config")
async def get_config(request: Request) -> dict[str, Any]:
    s = _state(request)
    c = s.config
    # Transform flat config to nested structure for frontend
    return {
        "network": {
            "listen_host": c.listen_host,
            "listen_port": c.listen_port,
            "upstream_host": c.upstream_host,
            "upstream_port": c.upstream_port,
            "transport_mode": c.transport_mode,
        },
        "engine": {
            "l1_enabled": c.l1_enabled,
            "l2_enabled": c.l2_enabled,
            "l2_model_endpoint": c.l2_model_endpoint,
            "l2_api_key": c.l2_api_key,
            "l2_model": c.l2_model,
            "l2_timeout_seconds": c.l2_timeout_seconds,
        },
        "services": {
            "tavily_api_key": c.tavily_api_key,
        },
        "session": {
            # These might be missing in config.py, check source
            "ring_buffer_size": getattr(c, "session_ring_buffer_size", 64),
            "ttl_seconds": getattr(c, "session_ttl_seconds", 3600),
        },
        "rate_limit": {
            "requests_per_sec": getattr(c, "rate_limit_requests_per_sec", 100),
            "burst": getattr(c, "rate_limit_burst", 200),
        },
        "audit_log_path": c.audit_log_path,
        "blocked_commands": sorted(list(c.blocked_commands)),
    }

@router.patch("/api/config")
async def patch_config(request: Request) -> dict[str, Any]:
    s = _state(request)
    updates = await request.json()

    # Flatten updates if nested
    flat_updates = {}

    # Copy top-level fields
    for k, v in updates.items():
        if not isinstance(v, dict):
            flat_updates[k] = v

    if "network" in updates:
        flat_updates.update(updates["network"])
    if "engine" in updates:
        flat_updates.update(updates["engine"])
    if "services" in updates:
        flat_updates.update(updates["services"])
    if "session" in updates:
        # Prefix session fields
        for k, v in updates["session"].items():
            if k == "ring_buffer_size":
                flat_updates["session_ring_buffer_size"] = v
            elif k == "ttl_seconds":
                flat_updates["session_ttl_seconds"] = v
            else:
                flat_updates[k] = v  # fallback

    if "rate_limit" in updates:
        for k, v in updates["rate_limit"].items():
            if k == "requests_per_sec":
                flat_updates["rate_limit_requests_per_sec"] = v
            elif k == "burst":
                flat_updates["rate_limit_burst"] = v
            else:
                flat_updates[k] = v

    await s.reload_config(flat_updates)

    # Return NEW config in nested format (call get_config logic conceptually)
    # Since get_config reads s.config, and we just updated it, calling get_config logic is best.
    # But get_config extracts from request. Let's just manually re-serialize or return ok.
    # The frontend expects the new config back.

    # Re-use the response structure from get_config
    c = s.config
    return {
        "network": {
            "listen_host": c.listen_host,
            "listen_port": c.listen_port,
            "upstream_host": c.upstream_host,
            "upstream_port": c.upstream_port,
            "transport_mode": c.transport_mode,
        },
        "engine": {
            "l1_enabled": c.l1_enabled,
            "l2_enabled": c.l2_enabled,
            "l2_model_endpoint": c.l2_model_endpoint,
            "l2_api_key": c.l2_api_key,
            "l2_model": c.l2_model,
            "l2_timeout_seconds": c.l2_timeout_seconds,
        },
        "services": {
            "tavily_api_key": c.tavily_api_key,
        },
        "session": {
            "ring_buffer_size": getattr(c, "session_ring_buffer_size", 64),
            "ttl_seconds": getattr(c, "session_ttl_seconds", 3600),
        },
        "rate_limit": {
            "requests_per_sec": getattr(c, "rate_limit_requests_per_sec", 100),
            "burst": getattr(c, "rate_limit_burst", 200),
        },
        "audit_log_path": c.audit_log_path,
        "blocked_commands": sorted(list(c.blocked_commands)),
    }