from fastapi import APIRouter, Request, HTTPException
from typing import Any
import time

from ..main import _state

import logging
from fastapi.responses import JSONResponse

router = APIRouter()
logger = logging.getLogger('pangolin.routes.rules')




_pattern_rules: dict[str, dict[str, Any]] = {}

_method_rules: list[dict[str, Any]] = []

_agent_rules: list[dict[str, Any]] = []

_default_action: str = "ALLOW"

def _init_default_rules(blocked_commands: frozenset[str]) -> None:
    """Initialize pattern rules from blocked_commands config."""
    global _pattern_rules
    if not _pattern_rules:
        for i, cmd in enumerate(sorted(blocked_commands)):
            rule_id = f"default-{i + 1}"
            _pattern_rules[rule_id] = {
                "id": rule_id,
                "name": f"Block: {cmd}",
                "pattern": cmd,
                "type": "literal",
                "action": "BLOCK",
                "threat_level": "HIGH",
                "enabled": True,
                "description": f"Default blocked pattern: {cmd}",
                "created_at": time.time(),
                "updated_at": time.time(),
            }

@router.get("/api/rules")
async def get_rules(request: Request) -> dict[str, Any]:
    """Get all rules in the format expected by frontend."""
    s = _state(request)
    _init_default_rules(s.config.blocked_commands)

    return {
        "pattern_rules": list(_pattern_rules.values()),
        "method_rules": _method_rules,
        "agent_rules": _agent_rules,
        "default_action": _default_action,
    }

@router.post("/api/rules/patterns")
async def create_pattern_rule(request: Request) -> dict[str, Any]:
    """Create a new pattern rule."""
    s = _state(request)
    data = await request.json()

    rule_id = data.get("id") or f"rule-{int(time.time() * 1000)}"
    now = time.time()

    rule = {
        "id": rule_id,
        "name": data.get("name", "Unnamed Rule"),
        "pattern": data.get("pattern", ""),
        "type": data.get("type", "literal"),
        "action": data.get("action", "BLOCK"),
        "threat_level": data.get("threat_level", "HIGH"),
        "enabled": data.get("enabled", True),
        "description": data.get("description", ""),
        "created_at": data.get("created_at") or now,
        "updated_at": now,
    }

    _pattern_rules[rule_id] = rule

    # Also add to static analyzer if enabled and is literal type
    if rule["enabled"] and rule["type"] == "literal":
        s.static_analyzer.add_rule(rule["pattern"])

    return rule

@router.put("/api/rules/patterns")
async def update_pattern_rule(request: Request) -> dict[str, Any]:
    """Update an existing pattern rule."""
    s = _state(request)
    data = await request.json()
    rule_id = data.get("id")

    if not rule_id or rule_id not in _pattern_rules:
        return {"error": "Rule not found"}

    old_rule = _pattern_rules[rule_id]

    # Remove old pattern from analyzer if it was active
    if old_rule["enabled"] and old_rule["type"] == "literal":
        s.static_analyzer.remove_rule(old_rule["pattern"])

    # Update rule
    rule = {
        **old_rule,
        "name": data.get("name", old_rule["name"]),
        "pattern": data.get("pattern", old_rule["pattern"]),
        "type": data.get("type", old_rule["type"]),
        "action": data.get("action", old_rule["action"]),
        "threat_level": data.get("threat_level", old_rule["threat_level"]),
        "enabled": data.get("enabled", old_rule["enabled"]),
        "description": data.get("description", old_rule["description"]),
        "updated_at": time.time(),
    }

    _pattern_rules[rule_id] = rule

    # Add new pattern to analyzer if enabled and literal
    if rule["enabled"] and rule["type"] == "literal":
        s.static_analyzer.add_rule(rule["pattern"])

    return rule

@router.delete("/api/rules/patterns/{rule_id}")
async def delete_pattern_rule(request: Request, rule_id: str) -> dict[str, Any]:
    """Delete a pattern rule."""
    s = _state(request)

    if rule_id not in _pattern_rules:
        return {"error": "Rule not found"}

    rule = _pattern_rules[rule_id]

    # Remove from analyzer if it was active
    if rule["enabled"] and rule["type"] == "literal":
        s.static_analyzer.remove_rule(rule["pattern"])

    del _pattern_rules[rule_id]

    return {"status": "ok", "deleted": rule_id}

@router.post("/api/rules/patterns/{rule_id}/toggle")
async def toggle_pattern_rule(request: Request, rule_id: str) -> dict[str, Any]:
    """Toggle a pattern rule's enabled state."""
    s = _state(request)
    data = await request.json()

    if rule_id not in _pattern_rules:
        return {"error": "Rule not found"}

    rule = _pattern_rules[rule_id]
    new_enabled = data.get("enabled", not rule["enabled"])

    # Update analyzer accordingly
    if rule["type"] == "literal":
        if new_enabled and not rule["enabled"]:
            s.static_analyzer.add_rule(rule["pattern"])
        elif not new_enabled and rule["enabled"]:
            s.static_analyzer.remove_rule(rule["pattern"])

    rule["enabled"] = new_enabled
    rule["updated_at"] = time.time()

    return rule

@router.post("/api/rules/default")
async def update_default_action(request: Request) -> dict[str, Any]:
    """Update the default action for unmatched requests."""
    global _default_action
    data = await request.json()
    _default_action = data.get("action", "ALLOW")
    return {"status": "ok", "default_action": _default_action}

@router.post("/api/v1/policy/evaluate")
async def evaluate_policy(request: Request):
    """
    Evaluate a policy against a trace.

    Request body:
    {
        "policy": "raise \"High risk\" if: threat_level >= \"HIGH\"",
        "trace": {
            "messages": [...],
            "analysis": {
                "verdict": "ALLOW",
                "threat_level": "LOW",
                "l1_result": {...},
                "l2_result": {...}
            }
        }
    }

    Returns:
    {
        "passed": true/false,
        "message": "...",
        "details": {...}
    }
    """
    from src.engine.policy_dsl import PolicyEngine

    try:
        body = await request.json()
        policy_code = body.get("policy", "")
        trace = body.get("trace", {})

        # Build evaluation context from trace
        analysis = trace.get("analysis", {})
        context = {
            "threat_level": analysis.get("threat_level", "LOW"),
            "verdict": analysis.get("verdict", "ALLOW"),
            "l1_result": analysis.get("l1_result", {}),
            "l2_result": analysis.get("l2_result", {}),
            "messages": trace.get("messages", []),
            "tool_calls": [],
        }

        # Extract tool calls from messages
        for msg in context["messages"]:
            if msg.get("tool_calls"):
                context["tool_calls"].extend(msg["tool_calls"])

        # Evaluate policy
        engine = PolicyEngine()
        result = await engine.evaluate(policy_code, context)

        return {
            "passed": result.passed,
            "message": result.message,
            "details": result.details,
            "error": result.error,
        }

    except Exception as e:
        logger.error(f"Policy evaluation error: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"error": str(e), "passed": True})