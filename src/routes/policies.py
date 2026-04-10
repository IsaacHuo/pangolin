from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.config import get_config

router = APIRouter(tags=["policies"])


class PolicyRead(BaseModel):
    id: str
    name: str
    description: str | None = None
    config: dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True
    version: int = 1
    created_at: datetime
    updated_at: datetime


class PolicyCreate(BaseModel):
    name: str
    description: str | None = None
    config: dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True


class PolicyUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    config: dict[str, Any] | None = None
    is_active: bool | None = None


_BUILTIN_CREATED_AT = datetime(2026, 1, 1, tzinfo=timezone.utc)
_BUILTIN_POLICY_DATA: tuple[dict[str, Any], ...] = (
    {
        "id": "builtin-fast",
        "name": "fast",
        "description": "Low latency with minimal filtering.",
        "config": {
            "nodes": ["static"],
            "thresholds": {"max_risk": 0.95},
        },
    },
    {
        "id": "builtin-balanced",
        "name": "balanced",
        "description": "Recommended default with static + semantic checks.",
        "config": {
            "nodes": ["static", "semantic"],
            "thresholds": {"max_risk": 0.7},
        },
    },
    {
        "id": "builtin-strict",
        "name": "strict",
        "description": "High sensitivity for adversarial and policy risks.",
        "config": {
            "nodes": ["static", "semantic", "pii"],
            "thresholds": {"max_risk": 0.45},
        },
    },
    {
        "id": "builtin-paranoid",
        "name": "paranoid",
        "description": "Maximum protection with aggressive blocking.",
        "config": {
            "nodes": ["static", "semantic", "pii", "output-filter"],
            "thresholds": {"max_risk": 0.3},
        },
    },
)

_BUILTIN_POLICIES: tuple[PolicyRead, ...] = tuple(
    PolicyRead(
        id=item["id"],
        name=item["name"],
        description=item["description"],
        config=item["config"],
        is_active=True,
        version=1,
        created_at=_BUILTIN_CREATED_AT,
        updated_at=_BUILTIN_CREATED_AT,
    )
    for item in _BUILTIN_POLICY_DATA
)
_BUILTIN_IDS = {item.id for item in _BUILTIN_POLICIES}


def _policies_file_path() -> Path:
    config = get_config()
    data_dir = Path(config.storage_path)
    data_dir.mkdir(parents=True, exist_ok=True)
    file_path = data_dir / "policies.jsonl"
    file_path.touch(exist_ok=True)
    return file_path


def _coerce_datetime(value: Any, fallback: datetime) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value), tz=timezone.utc)
        except Exception:
            return fallback
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except Exception:
            return fallback
    return fallback


def _normalize_policy_record(raw: Any) -> PolicyRead | None:
    if not isinstance(raw, dict):
        return None

    name = str(raw.get("name") or "").strip()
    if not name:
        return None

    now = datetime.now(timezone.utc)
    policy_id = str(raw.get("id") or f"custom-{uuid.uuid4().hex[:12]}")
    description_raw = raw.get("description")
    description = None if description_raw is None else str(description_raw)

    config_raw = raw.get("config")
    config = config_raw if isinstance(config_raw, dict) else {}

    is_active_raw = raw.get("is_active")
    if is_active_raw is None:
        is_active_raw = raw.get("enabled", True)
    is_active = bool(is_active_raw)

    try:
        version = max(1, int(raw.get("version", 1)))
    except Exception:
        version = 1

    created_at = _coerce_datetime(raw.get("created_at"), now)
    updated_at = _coerce_datetime(raw.get("updated_at"), created_at)

    return PolicyRead(
        id=policy_id,
        name=name,
        description=description,
        config=config,
        is_active=is_active,
        version=version,
        created_at=created_at,
        updated_at=updated_at,
    )


def _read_custom_policies() -> dict[str, PolicyRead]:
    file_path = _policies_file_path()
    custom: dict[str, PolicyRead] = {}

    try:
        for raw_line in file_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line:
                continue
            try:
                parsed = json.loads(line)
            except Exception:
                continue

            policy = _normalize_policy_record(parsed)
            if policy is None or policy.id in _BUILTIN_IDS:
                continue
            # Keep the latest record for each id.
            custom[policy.id] = policy
    except Exception:
        return {}

    return custom


def _write_custom_policies(custom_policies: list[PolicyRead]) -> None:
    file_path = _policies_file_path()
    lines: list[str] = []

    for policy in custom_policies:
        payload = policy.model_dump()
        payload["created_at"] = policy.created_at.isoformat()
        payload["updated_at"] = policy.updated_at.isoformat()
        lines.append(json.dumps(payload, ensure_ascii=False))

    file_path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")


def _all_policies_sorted(custom_map: dict[str, PolicyRead]) -> list[PolicyRead]:
    custom_sorted = sorted(custom_map.values(), key=lambda item: item.name.lower())
    return [*_BUILTIN_POLICIES, *custom_sorted]


def _ensure_unique_name(
    name: str, custom_map: dict[str, PolicyRead], exclude_id: str | None = None
) -> None:
    target = name.strip().lower()
    if not target:
        raise HTTPException(status_code=400, detail="Policy name is required")

    for policy in _BUILTIN_POLICIES:
        if policy.id != exclude_id and policy.name.lower() == target:
            raise HTTPException(status_code=409, detail=f"Policy name '{name}' already exists")

    for policy in custom_map.values():
        if policy.id != exclude_id and policy.name.lower() == target:
            raise HTTPException(status_code=409, detail=f"Policy name '{name}' already exists")


def _require_custom_policy(policy_id: str, custom_map: dict[str, PolicyRead]) -> PolicyRead:
    if policy_id in _BUILTIN_IDS:
        raise HTTPException(status_code=400, detail="Built-in policies are read-only")
    policy = custom_map.get(policy_id)
    if policy is None:
        raise HTTPException(status_code=404, detail="Policy not found")
    return policy


@router.get("/v1/policies", response_model=list[PolicyRead])
async def list_policies(active_only: bool = False) -> list[PolicyRead]:
    custom_map = _read_custom_policies()
    all_policies = _all_policies_sorted(custom_map)
    if active_only:
        return [policy for policy in all_policies if policy.is_active]
    return all_policies


@router.get("/v1/policies/{policy_id}", response_model=PolicyRead)
async def get_policy(policy_id: str) -> PolicyRead:
    for policy in _BUILTIN_POLICIES:
        if policy.id == policy_id:
            return policy

    custom_map = _read_custom_policies()
    policy = custom_map.get(policy_id)
    if policy is None:
        raise HTTPException(status_code=404, detail="Policy not found")
    return policy


@router.post("/v1/policies", response_model=PolicyRead)
async def create_policy(policy: PolicyCreate) -> PolicyRead:
    custom_map = _read_custom_policies()
    name = policy.name.strip()
    _ensure_unique_name(name, custom_map)

    now = datetime.now(timezone.utc)
    created = PolicyRead(
        id=f"custom-{uuid.uuid4().hex[:12]}",
        name=name,
        description=policy.description,
        config=policy.config,
        is_active=policy.is_active,
        version=1,
        created_at=now,
        updated_at=now,
    )

    custom_map[created.id] = created
    _write_custom_policies(list(custom_map.values()))
    return created


def _update_custom_policy(policy_id: str, patch: PolicyUpdate) -> PolicyRead:
    custom_map = _read_custom_policies()
    current = _require_custom_policy(policy_id, custom_map)

    next_name = patch.name.strip() if isinstance(patch.name, str) else current.name
    _ensure_unique_name(next_name, custom_map, exclude_id=policy_id)

    updated = current.model_copy(
        update={
            "name": next_name,
            "description": patch.description
            if patch.description is not None
            else current.description,
            "config": patch.config if patch.config is not None else current.config,
            "is_active": patch.is_active if patch.is_active is not None else current.is_active,
            "version": current.version + 1,
            "updated_at": datetime.now(timezone.utc),
        }
    )

    custom_map[policy_id] = updated
    _write_custom_policies(list(custom_map.values()))
    return updated


@router.put("/v1/policies/{policy_id}", response_model=PolicyRead)
async def update_policy(policy_id: str, policy: PolicyUpdate) -> PolicyRead:
    return _update_custom_policy(policy_id, policy)


@router.patch("/v1/policies/{policy_id}", response_model=PolicyRead)
async def patch_policy(policy_id: str, policy: PolicyUpdate) -> PolicyRead:
    return _update_custom_policy(policy_id, policy)


@router.delete("/v1/policies/{policy_id}")
async def delete_policy(policy_id: str) -> dict[str, bool]:
    custom_map = _read_custom_policies()
    _require_custom_policy(policy_id, custom_map)
    custom_map.pop(policy_id, None)
    _write_custom_policies(list(custom_map.values()))
    return {"ok": True}
