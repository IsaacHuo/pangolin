import os
import json
import socket
import logging
from pathlib import Path
from typing import Any

DEFAULT_GATEWAY_PORT = 19001
LEGACY_GATEWAY_PORT = 18789

def _build_gateway_config_candidates() -> list[Path]:
    candidates: list[Path] = []
    seen: set[str] = set()

    def add_candidate(raw: str | Path | None) -> None:
        if raw is None:
            return
        value = str(raw).strip()
        if not value:
            return
        candidate = Path(value).expanduser()
        key = str(candidate)
        if key in seen:
            return
        seen.add(key)
        candidates.append(candidate)

    # Highest priority: explicit config path overrides.
    for env_var in (
        "AGENT_SHIELD_CONFIG_PATH",
        "CLAWDBOT_CONFIG_PATH",
        "OPENCLAW_CONFIG_PATH",
    ):
        add_candidate(os.getenv(env_var))

    # Next: state-dir overrides mapped to known config filenames.
    for env_var in ("AGENT_SHIELD_STATE_DIR", "CLAWDBOT_STATE_DIR", "OPENCLAW_STATE_DIR"):
        state_dir = os.getenv(env_var)
        if not state_dir:
            continue
        state_path = Path(state_dir).expanduser()
        add_candidate(state_path / "agent-shield.json")
        add_candidate(state_path / "openclaw.json")

    # Profile default (e.g. dev => ~/.agent-shield-dev/agent-shield.json).
    profile = (os.getenv("AGENT_SHIELD_PROFILE") or "").strip()
    if profile:
        suffix = "" if profile.lower() == "default" else f"-{profile}"
        add_candidate(Path.home() / f".agent-shield{suffix}" / "agent-shield.json")

    # Common defaults and legacy locations.
    add_candidate(Path.home() / ".agent-shield" / "agent-shield.json")
    add_candidate(Path.home() / ".agent-shield-dev" / "agent-shield.json")
    add_candidate(Path.home() / ".openclaw" / "openclaw.json")
    return candidates

def _first_non_empty_env(*names: str) -> str | None:
    for name in names:
        value = os.getenv(name)
        if value and value.strip():
            return value.strip()
    return None

def _resolve_gateway_port(default_port: int) -> int:
    raw = _first_non_empty_env(
        "AGENT_SHIELD_GATEWAY_PORT",
        "CLAWDBOT_GATEWAY_PORT",
        "OPENCLAW_GATEWAY_PORT",
    )
    if not raw:
        return default_port
    try:
        return int(raw)
    except ValueError:
        return default_port

def _is_tcp_reachable(host: str, port: int, timeout_seconds: float = 0.2) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout_seconds):
            return True
    except OSError:
        return False

def _resolve_gateway_runtime_port(host: str, preferred_port: int) -> int:
    candidates = [preferred_port, DEFAULT_GATEWAY_PORT, LEGACY_GATEWAY_PORT]
    seen: set[int] = set()
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        if _is_tcp_reachable(host, candidate):
            return candidate
    return preferred_port

def _read_gateway_info_from_local_config() -> dict[str, Any]:
    """Discover local gateway config and return parsed connection/auth metadata."""

    result: dict[str, Any] = {"configured": False}
    for config_path in _build_gateway_config_candidates():
        if not config_path.exists():
            continue
        try:
            data = json.loads(config_path.read_text(encoding="utf-8"))
            gw = data.get("gateway", {})
            if not gw:
                continue

            auth = gw.get("auth", {})
            control_ui = gw.get("controlUi", {})
            result = {
                "configured": True,
                "port": gw.get("port", DEFAULT_GATEWAY_PORT),
                "bind": gw.get("bind", "loopback"),
                "mode": gw.get("mode", "local"),
                "token": auth.get("token"),
                "password": auth.get("password"),
                "authMode": auth.get("mode"),
                "configPath": str(config_path),
                "allowedOrigins": control_ui.get("allowedOrigins", []),
            }
            break
        except Exception:
            logging.getLogger(__name__).warning("Failed to read gateway config", exc_info=True)

    # Env overrides are runtime source-of-truth for gateway auth in many setups.
    env_token = _first_non_empty_env(
        "AGENT_SHIELD_GATEWAY_TOKEN",
        "CLAWDBOT_GATEWAY_TOKEN",
        "OPENCLAW_GATEWAY_TOKEN",
    )
    env_password = _first_non_empty_env(
        "AGENT_SHIELD_GATEWAY_PASSWORD",
        "CLAWDBOT_GATEWAY_PASSWORD",
        "OPENCLAW_GATEWAY_PASSWORD",
    )
    configured_token = str(result.get("token") or "").strip()
    configured_password = str(result.get("password") or "").strip()

    # Prefer explicit gateway config values and only use env vars as fallback when
    # the corresponding config field is missing.
    if env_token and not configured_token:
        result["token"] = env_token
    if env_password and not configured_password:
        result["password"] = env_password

    if env_token or env_password:
        result.setdefault("configured", True)
        result.setdefault("bind", "loopback")
        result.setdefault("mode", "local")
        result.setdefault("allowedOrigins", [])

    result["port"] = _resolve_gateway_port(int(result.get("port", DEFAULT_GATEWAY_PORT)))
    return result
