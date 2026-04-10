"""Agent Studio routes for multi-agent orchestration."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from src.agent_studio.catalog import (
    AgentProfile,
    get_core_profiles_by_ids,
    serialize_profiles,
)
from src.agent_studio.storage import AgentStudioRunStore
from src.config import get_config

router = APIRouter(prefix="/api/agent-studio", tags=["agent-studio"])
logger = logging.getLogger("pangolin.routes.agent_studio")


@dataclass(frozen=True)
class StepSpec:
    id: str
    agent_id: str
    objective: str
    depends_on: tuple[str, ...]


class AgentStudioRunRequest(BaseModel):
    task: str = Field(min_length=2)
    model: str = "openrouter/auto"
    agent_ids: list[str] = Field(default_factory=list)
    max_parallel: int = 3


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _emit_event(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False) + "\n"


def _build_step_batches(profile_map: dict[str, AgentProfile]) -> list[list[StepSpec]]:
    def has(agent_id: str) -> bool:
        return agent_id in profile_map

    batches: list[list[StepSpec]] = []

    batch1: list[StepSpec] = []
    if has("feishu-integration-developer"):
        batch1.append(
            StepSpec(
                id="requirements_feishu",
                agent_id="feishu-integration-developer",
                objective=(
                    "Extract concrete requirements from Feishu docs or provide an actionable "
                    "missing-information checklist when docs are unavailable."
                ),
                depends_on=(),
            )
        )
    if has("trend-researcher"):
        batch1.append(
            StepSpec(
                id="market_research",
                agent_id="trend-researcher",
                objective=(
                    "Perform web research: benchmark competing solutions, identify best practices, "
                    "and list evidence-backed recommendations."
                ),
                depends_on=(),
            )
        )
    if batch1:
        batches.append(batch1)

    batch2: list[StepSpec] = []
    if has("ui-designer"):
        batch2.append(
            StepSpec(
                id="ui_direction",
                agent_id="ui-designer",
                objective=(
                    "Create the interface direction: layout map, style system, component plan, "
                    "and responsive behavior."
                ),
                depends_on=("requirements_feishu", "market_research"),
            )
        )
    if has("content-creator"):
        batch2.append(
            StepSpec(
                id="content_strategy",
                agent_id="content-creator",
                objective=(
                    "Write core content for the website: hero copy, "
                    "value proposition, key sections, "
                    "and CTA variants."
                ),
                depends_on=("requirements_feishu", "market_research"),
            )
        )
    if has("finance-tracker"):
        batch2.append(
            StepSpec(
                id="finance_estimation",
                agent_id="finance-tracker",
                objective=(
                    "Produce financial estimates: scope budget, cost assumptions, ROI baseline, "
                    "and risk controls."
                ),
                depends_on=("requirements_feishu", "market_research"),
            )
        )
    if batch2:
        batches.append(batch2)

    batch3: list[StepSpec] = []
    if has("backend-architect"):
        batch3.append(
            StepSpec(
                id="backend_plan",
                agent_id="backend-architect",
                objective="Design backend/API architecture and service boundaries for delivery.",
                depends_on=("requirements_feishu", "market_research"),
            )
        )
    if has("frontend-developer"):
        batch3.append(
            StepSpec(
                id="frontend_plan",
                agent_id="frontend-developer",
                objective=(
                    "Create implementation plan for frontend pages, "
                    "state/data flow, and milestones."
                ),
                depends_on=("ui_direction", "content_strategy", "backend_plan"),
            )
        )
    if batch3:
        batches.append(batch3)

    batch4: list[StepSpec] = []
    if has("workflow-architect"):
        batch4.append(
            StepSpec(
                id="workflow_map",
                agent_id="workflow-architect",
                objective=(
                    "Map end-to-end execution workflow including happy path, failure branches, "
                    "handoff contracts, and observable states."
                ),
                depends_on=(
                    "requirements_feishu",
                    "market_research",
                    "ui_direction",
                    "content_strategy",
                    "finance_estimation",
                    "backend_plan",
                    "frontend_plan",
                ),
            )
        )
    if batch4:
        batches.append(batch4)

    batch5: list[StepSpec] = []
    if has("reality-checker"):
        batch5.append(
            StepSpec(
                id="quality_gate",
                agent_id="reality-checker",
                objective=(
                    "Audit the collected artifacts, identify weak assumptions, and output "
                    "a pass/fail style quality verdict with fixes."
                ),
                depends_on=(
                    "ui_direction",
                    "content_strategy",
                    "finance_estimation",
                    "backend_plan",
                    "frontend_plan",
                    "workflow_map",
                ),
            )
        )
    if batch5:
        batches.append(batch5)

    return batches


def _compact_artifact_context(artifacts: list[dict[str, Any]], max_items: int = 6) -> str:
    if not artifacts:
        return "No prior artifacts available."

    chosen = artifacts[-max_items:]
    sections: list[str] = []
    for item in chosen:
        content = str(item.get("content", "")).strip()
        if len(content) > 1400:
            content = content[:1400] + "..."
        sections.append(
            "\n".join(
                [
                    f"Agent: {item.get('agent_name', item.get('agent_id', 'unknown'))}",
                    f"Step: {item.get('step_id', 'unknown')}",
                    "Output:",
                    content or "(empty output)",
                ]
            )
        )

    return "\n\n---\n\n".join(sections)


def _build_agent_system_prompt(profile: AgentProfile) -> str:
    excerpt = profile.instructions_excerpt[:2200].strip()
    return "\n\n".join(
        [
            f"You are {profile.name}.",
            f"Role summary: {profile.description}",
            f"Working style: {profile.vibe}",
            "Output rules:",
            "1. Keep output practical and structured.",
            "2. Cite assumptions explicitly when uncertain.",
            "3. End with handoff-ready next actions.",
            "Reference instructions excerpt:",
            excerpt or "(No extended instructions available)",
        ]
    )


def _build_agent_user_prompt(task: str, step: StepSpec, artifacts: list[dict[str, Any]]) -> str:
    context = _compact_artifact_context(artifacts)
    return "\n\n".join(
        [
            f"Human task: {task}",
            f"Assigned objective: {step.objective}",
            f"Depends on steps: {', '.join(step.depends_on) if step.depends_on else 'none'}",
            "Context from previous specialists:",
            context,
            "Deliverable format:",
            "- Key findings",
            "- Concrete output",
            "- Risks and assumptions",
            "- Handoff to next specialist",
        ]
    )


async def _call_chat_send(
    *,
    base_url: str,
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
) -> dict[str, Any]:
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if api_key:
        headers["x-api-key"] = api_key

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "enable_tools": True,
        "force_forward": True,
    }

    analysis: dict[str, Any] | None = None
    tool_calls: list[dict[str, Any]] = []
    content_parts: list[str] = []
    stream_error: str | None = None

    timeout = httpx.Timeout(connect=15.0, read=240.0, write=30.0, pool=30.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream(
            "POST",
            f"{base_url}/api/chat/send",
            headers=headers,
            json=payload,
        ) as response:
            if response.status_code != 200:
                body = (await response.aread()).decode("utf-8", errors="ignore")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=body[:400] or "Agent chat call failed",
                )

            async for raw_line in response.aiter_lines():
                line = raw_line.strip()
                if not line:
                    continue
                try:
                    event = json.loads(line)
                except Exception:
                    logger.debug("Skip malformed /api/chat/send event line")
                    continue

                event_type = str(event.get("type", ""))
                if event_type == "analysis" and isinstance(event.get("analysis"), dict):
                    analysis = event.get("analysis")
                elif event_type == "tool_call" and isinstance(event.get("tool_call"), dict):
                    tool_calls.append(event["tool_call"])
                elif event_type == "content":
                    content = event.get("content", "")
                    if isinstance(content, str) and content:
                        content_parts.append(content)
                elif event_type == "error":
                    err = event.get("error")
                    if isinstance(err, str):
                        stream_error = err
                elif event_type == "done":
                    break

    content = "\n".join(x.strip() for x in content_parts if x and x.strip()).strip()
    if not content and stream_error:
        content = f"[Agent error] {stream_error}"

    return {
        "content": content,
        "analysis": analysis or {},
        "tool_calls": tool_calls,
        "stream_error": stream_error,
    }


def _normalize_tool_events(raw_tool_calls: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []

    for raw in raw_tool_calls:
        if not isinstance(raw, dict):
            continue

        raw_args = raw.get("arguments")
        if isinstance(raw_args, dict):
            args = raw_args
        else:
            alt_args = raw.get("args")
            args = alt_args if isinstance(alt_args, dict) else {}

        blocked = bool(raw.get("blocked") or raw.get("l1_blocked") or raw.get("l2_blocked"))

        blocked_reason = raw.get("blocked_reason")
        if not isinstance(blocked_reason, str) or not blocked_reason.strip():
            preview = raw.get("result_preview")
            blocked_reason = preview if blocked and isinstance(preview, str) else None

        tool_name = raw.get("tool_name")
        if not isinstance(tool_name, str) or not tool_name.strip():
            alt_tool = raw.get("tool")
            tool_name = alt_tool if isinstance(alt_tool, str) and alt_tool.strip() else "unknown"

        l1_patterns_value = raw.get("l1_patterns")
        l1_patterns: list[str] = []
        if isinstance(l1_patterns_value, list):
            l1_patterns = [str(item) for item in l1_patterns_value if isinstance(item, str)]

        l2_confidence_value = raw.get("l2_confidence")
        l2_confidence = (
            float(l2_confidence_value) if isinstance(l2_confidence_value, (int, float)) else None
        )

        l2_reasoning = raw.get("l2_reasoning")
        if not isinstance(l2_reasoning, str):
            l2_reasoning = ""

        result_preview = raw.get("result_preview")
        if not isinstance(result_preview, str):
            result_preview = ""

        normalized.append(
            {
                "tool": tool_name,
                "args": args,
                "result_preview": result_preview,
                "allowed": not blocked,
                "blocked_reason": blocked_reason,
                "l1_patterns": l1_patterns,
                "l2_confidence": l2_confidence,
                "l2_reasoning": l2_reasoning,
            }
        )

    return normalized


def _build_orchestrator_synthesis_prompt(task: str, artifacts: list[dict[str, Any]]) -> str:
    context = _compact_artifact_context(artifacts, max_items=12)
    return "\n\n".join(
        [
            f"Original human task: {task}",
            (
                "You are the orchestration lead. Consolidate all specialist outputs "
                "into a final delivery package."
            ),
            "Required sections:",
            "1. Executive summary",
            "2. Website solution proposal",
            "3. Feishu requirements status",
            "4. Market research synthesis",
            "5. Content and messaging package",
            "6. Financial analysis and constraints",
            "7. Execution milestones",
            "8. Open risks and decision requests",
            "Specialist artifacts:",
            context,
        ]
    )


def _fallback_synthesis(task: str, artifacts: list[dict[str, Any]]) -> str:
    lines: list[str] = ["Executive summary", f"Task: {task}", "", "Specialist outputs"]
    for item in artifacts:
        name = item.get("agent_name", item.get("agent_id", "unknown"))
        content = str(item.get("content", "")).strip()
        if len(content) > 600:
            content = content[:600] + "..."
        lines.append(f"- {name}: {content or '(empty output)'}")
    return "\n".join(lines)


@router.get("/profiles")
async def list_profiles() -> dict[str, Any]:
    profiles = get_core_profiles_by_ids()
    return {"profiles": serialize_profiles(profiles)}


@router.get("/runs")
async def list_runs(limit: int = 20, offset: int = 0) -> dict[str, Any]:
    config = get_config()
    store = AgentStudioRunStore(config.storage_path)
    all_items = await store.list_runs(limit=5000, offset=0)
    paged = all_items[offset : offset + max(1, limit)]

    summaries = [
        {
            "id": item.get("id"),
            "task": item.get("task"),
            "status": item.get("status"),
            "created_at": item.get("created_at"),
            "completed_at": item.get("completed_at"),
            "artifact_count": len(item.get("artifacts", [])),
            "agent_count": len(item.get("agents", [])),
        }
        for item in paged
    ]
    return {"items": summaries, "total": len(all_items), "limit": limit, "offset": offset}


@router.get("/runs/{run_id}")
async def get_run(run_id: str) -> dict[str, Any]:
    config = get_config()
    store = AgentStudioRunStore(config.storage_path)
    found = await store.get_run(run_id)
    if not found:
        raise HTTPException(status_code=404, detail="Run not found")
    return found


@router.post("/runs/stream")
async def run_orchestration(
    payload: AgentStudioRunRequest,
    request: Request,
) -> StreamingResponse:
    task = payload.task.strip()
    if not task:
        raise HTTPException(status_code=400, detail="task cannot be empty")

    # Ensure orchestrator is always available for final synthesis.
    selected_ids = [x.strip() for x in payload.agent_ids if x and x.strip()]
    if "agents-orchestrator" not in selected_ids:
        selected_ids.append("agents-orchestrator")

    profiles = get_core_profiles_by_ids(selected_ids)
    profile_map = {profile.id: profile for profile in profiles}

    batches = _build_step_batches(profile_map)
    if not batches:
        raise HTTPException(status_code=400, detail="No executable steps for selected agents")

    run_id = f"run-{uuid.uuid4().hex[:12]}"
    created_at = _utc_now_iso()
    api_key = request.headers.get("x-api-key", "").strip()
    base_url = str(request.base_url).rstrip("/")
    max_parallel = max(1, min(payload.max_parallel, 4))

    config = get_config()
    store = AgentStudioRunStore(config.storage_path)

    async def _event_stream() -> AsyncIterator[str]:
        artifacts: list[dict[str, Any]] = []
        timeline: list[dict[str, Any]] = []

        yield _emit_event(
            {
                "type": "run_started",
                "run": {
                    "id": run_id,
                    "task": task,
                    "model": payload.model,
                    "created_at": created_at,
                    "agent_ids": [profile.id for profile in profiles],
                },
            }
        )

        semaphore = asyncio.Semaphore(max_parallel)

        async def _execute_step(
            step: StepSpec,
            context_snapshot: list[dict[str, Any]],
        ) -> tuple[dict[str, Any], dict[str, Any]]:
            profile = profile_map[step.agent_id]
            system_prompt = _build_agent_system_prompt(profile)
            user_prompt = _build_agent_user_prompt(task, step, context_snapshot)

            async with semaphore:
                started = _utc_now_iso()
                result = await _call_chat_send(
                    base_url=base_url,
                    api_key=api_key,
                    model=payload.model,
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                )
                ended = _utc_now_iso()

            raw_tool_calls = result.get("tool_calls", [])
            tool_calls = raw_tool_calls if isinstance(raw_tool_calls, list) else []
            blocked_calls = [
                call
                for call in tool_calls
                if isinstance(call, dict)
                and bool(call.get("blocked") or call.get("l1_blocked") or call.get("l2_blocked"))
            ]
            tool_events = _normalize_tool_events(tool_calls)

            artifact = {
                "id": f"artifact-{step.id}-{uuid.uuid4().hex[:8]}",
                "step_id": step.id,
                "agent_id": profile.id,
                "agent_name": profile.name,
                "objective": step.objective,
                "depends_on": list(step.depends_on),
                "content": result.get("content", ""),
                "tool_calls": len(tool_calls),
                "blocked_tool_calls": len(blocked_calls),
                "tool_events": tool_events,
                "analysis": result.get("analysis", {}),
                "started_at": started,
                "ended_at": ended,
            }

            result_event = {
                "run_id": run_id,
                "step_id": step.id,
                "agent_id": profile.id,
                "agent_name": profile.name,
                "objective": step.objective,
                "depends_on": list(step.depends_on),
                "content": result.get("content", ""),
                "analysis": result.get("analysis", {}),
                "tool_calls": len(tool_calls),
                "blocked_tool_calls": len(blocked_calls),
                "tool_events": tool_events,
                "started_at": started,
                "ended_at": ended,
            }
            return artifact, result_event

        final_report = ""
        failed_error: str | None = None

        try:
            for batch_index, batch in enumerate(batches, start=1):
                stage_id = f"stage-{batch_index}"
                stage_agents = [profile_map[step.agent_id].name for step in batch]

                yield _emit_event(
                    {
                        "type": "stage_started",
                        "stage": {
                            "id": stage_id,
                            "index": batch_index,
                            "agent_count": len(batch),
                            "agents": stage_agents,
                        },
                    }
                )

                context_snapshot = list(artifacts)
                for step in batch:
                    profile = profile_map[step.agent_id]
                    delegation_event = {
                        "run_id": run_id,
                        "stage_id": stage_id,
                        "step_id": step.id,
                        "from_agent": "agents-orchestrator",
                        "to_agent": profile.id,
                        "to_agent_name": profile.name,
                        "objective": step.objective,
                        "depends_on": list(step.depends_on),
                        "timestamp": _utc_now_iso(),
                    }
                    timeline.append({"type": "delegation", **delegation_event})
                    yield _emit_event({"type": "agent_delegation", "event": delegation_event})

                results = await asyncio.gather(
                    *[_execute_step(step, context_snapshot) for step in batch],
                    return_exceptions=True,
                )

                for index, result in enumerate(results):
                    step = batch[index]
                    if isinstance(result, Exception):
                        failed_error = f"Step {step.id} failed: {result}"
                        raise result

                    artifact, result_event = result
                    artifacts.append(artifact)
                    timeline.append({"type": "result", **result_event})
                    yield _emit_event({"type": "agent_result", "result": result_event})

                yield _emit_event(
                    {
                        "type": "stage_done",
                        "stage": {
                            "id": stage_id,
                            "index": batch_index,
                            "artifact_count": len(artifacts),
                        },
                    }
                )

            orchestrator = profile_map.get("agents-orchestrator") or profiles[0]
            synthesis = await _call_chat_send(
                base_url=base_url,
                api_key=api_key,
                model=payload.model,
                system_prompt=_build_agent_system_prompt(orchestrator),
                user_prompt=_build_orchestrator_synthesis_prompt(task, artifacts),
            )
            final_report = (synthesis.get("content") or "").strip()
            if not final_report:
                final_report = _fallback_synthesis(task, artifacts)

            yield _emit_event(
                {
                    "type": "synthesis",
                    "result": {
                        "run_id": run_id,
                        "agent_id": orchestrator.id,
                        "agent_name": orchestrator.name,
                        "content": final_report,
                    },
                }
            )

            run_record = {
                "id": run_id,
                "task": task,
                "model": payload.model,
                "status": "completed",
                "created_at": created_at,
                "completed_at": _utc_now_iso(),
                "agents": [
                    {
                        "id": profile.id,
                        "name": profile.name,
                        "description": profile.description,
                        "emoji": profile.emoji,
                        "category": profile.category,
                    }
                    for profile in profiles
                ],
                "timeline": timeline,
                "artifacts": artifacts,
                "final_report": final_report,
            }
            await store.save_run(run_record)

            yield _emit_event({"type": "done", "run_id": run_id, "status": "completed"})
        except Exception as exc:
            error_message = failed_error or str(exc)
            failed_record = {
                "id": run_id,
                "task": task,
                "model": payload.model,
                "status": "failed",
                "created_at": created_at,
                "completed_at": _utc_now_iso(),
                "agents": [
                    {
                        "id": profile.id,
                        "name": profile.name,
                        "description": profile.description,
                        "emoji": profile.emoji,
                        "category": profile.category,
                    }
                    for profile in profiles
                ],
                "timeline": timeline,
                "artifacts": artifacts,
                "final_report": final_report,
                "error": error_message,
            }
            await store.save_run(failed_record)
            yield _emit_event({"type": "error", "error": error_message})
            yield _emit_event({"type": "done", "run_id": run_id, "status": "failed"})

    return StreamingResponse(_event_stream(), media_type="application/x-ndjson")
