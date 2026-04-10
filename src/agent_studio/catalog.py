"""Agent Studio profile catalog loader.

Loads a curated core roster from agency-agents-main frontmatter so the
frontend can render role cards and the orchestrator can build role-aware prompts.
"""

from __future__ import annotations

import logging
import re
from dataclasses import asdict, dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

try:
    import yaml  # type: ignore[import-not-found]
except Exception:
    yaml = None


logger = logging.getLogger("agent_firewall.agent_studio.catalog")


@dataclass(frozen=True)
class AgentProfile:
    id: str
    name: str
    description: str
    category: str
    emoji: str
    vibe: str
    source_file: str
    instructions_excerpt: str


CORE_AGENT_FILES: tuple[tuple[str, str], ...] = (
    ("agents-orchestrator", "specialized/agents-orchestrator.md"),
    ("workflow-architect", "specialized/specialized-workflow-architect.md"),
    (
        "feishu-integration-developer",
        "engineering/engineering-feishu-integration-developer.md",
    ),
    ("trend-researcher", "product/product-trend-researcher.md"),
    ("content-creator", "marketing/marketing-content-creator.md"),
    ("finance-tracker", "support/support-finance-tracker.md"),
    ("ui-designer", "design/design-ui-designer.md"),
    ("frontend-developer", "engineering/engineering-frontend-developer.md"),
    ("backend-architect", "engineering/engineering-backend-architect.md"),
    ("reality-checker", "testing/testing-reality-checker.md"),
)


FALLBACK_PROFILES: dict[str, dict[str, str]] = {
    "agents-orchestrator": {
        "name": "Agents Orchestrator",
        "description": "Coordinates specialists, tracks progress, and synthesizes delivery.",
        "emoji": "🎛️",
        "vibe": "Runs a strict dev-QA pipeline.",
        "category": "specialized",
    },
    "workflow-architect": {
        "name": "Workflow Architect",
        "description": "Maps complete workflow trees and handoff contracts.",
        "emoji": "🗺️",
        "vibe": "Every branch is explicit before implementation.",
        "category": "specialized",
    },
    "feishu-integration-developer": {
        "name": "Feishu Integration Developer",
        "description": "Builds Feishu/Lark integrations and document workflows.",
        "emoji": "🔗",
        "vibe": "Turns Feishu APIs into practical automation.",
        "category": "engineering",
    },
    "trend-researcher": {
        "name": "Trend Researcher",
        "description": "Finds market signals, competitors, and opportunity vectors.",
        "emoji": "🔍",
        "vibe": "Grounds direction in external evidence.",
        "category": "product",
    },
    "content-creator": {
        "name": "Content Creator",
        "description": "Creates cross-channel copy and structured narratives.",
        "emoji": "✍️",
        "vibe": "Produces clear, conversion-ready messaging.",
        "category": "marketing",
    },
    "finance-tracker": {
        "name": "Finance Tracker",
        "description": "Builds estimates, budgets, and risk-aware financial analysis.",
        "emoji": "💰",
        "vibe": "Keeps assumptions explicit and numbers auditable.",
        "category": "support",
    },
    "ui-designer": {
        "name": "UI Designer",
        "description": "Designs visual systems and production-ready interface specs.",
        "emoji": "🎨",
        "vibe": "Balances clarity, consistency, and accessibility.",
        "category": "design",
    },
    "frontend-developer": {
        "name": "Frontend Developer",
        "description": "Implements performant, accessible web UI with modern frameworks.",
        "emoji": "🖥️",
        "vibe": "Ships responsive, pixel-accurate experiences.",
        "category": "engineering",
    },
    "backend-architect": {
        "name": "Backend Architect",
        "description": "Designs APIs, data models, and scalable service architecture.",
        "emoji": "🏗️",
        "vibe": "Turns product requirements into robust backend systems.",
        "category": "engineering",
    },
    "reality-checker": {
        "name": "Reality Checker",
        "description": "Evaluates output quality and blocks weak conclusions.",
        "emoji": "🔍",
        "vibe": "Default stance is evidence-first skepticism.",
        "category": "testing",
    },
}


def _project_root() -> Path:
    return Path(__file__).resolve().parent.parent.parent


def _agency_root() -> Path:
    return _project_root() / "agency-agents-main"


def _parse_frontmatter(raw_frontmatter: str) -> dict[str, Any]:
    if yaml is not None:
        try:
            parsed = yaml.safe_load(raw_frontmatter)
            if isinstance(parsed, dict):
                return parsed
        except Exception as exc:
            logger.debug("Frontmatter YAML parse fallback: %s", exc)

    values: dict[str, Any] = {}
    for key in ("name", "description", "emoji", "vibe"):
        match = re.search(rf"(?m)^\s*{re.escape(key)}\s*:\s*(.+?)\s*$", raw_frontmatter)
        if match:
            val = match.group(1).strip()
            if len(val) >= 2 and val[0] == val[-1] and val[0] in {'"', "'"}:
                val = val[1:-1].strip()
            values[key] = val
    return values


def _extract_frontmatter(raw: str) -> tuple[dict[str, Any], str]:
    text = raw.strip()
    if not text.startswith("---"):
        return {}, text

    # Split "--- frontmatter --- body"
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}, text

    frontmatter_raw = parts[1].strip()
    body = parts[2].strip()
    return _parse_frontmatter(frontmatter_raw), body


def _read_profile(agent_id: str, rel_path: str) -> AgentProfile:
    file_path = _agency_root() / rel_path
    fallback = FALLBACK_PROFILES[agent_id]

    if not file_path.exists():
        return AgentProfile(
            id=agent_id,
            name=fallback["name"],
            description=fallback["description"],
            category=fallback["category"],
            emoji=fallback["emoji"],
            vibe=fallback["vibe"],
            source_file=rel_path,
            instructions_excerpt="",
        )

    raw = file_path.read_text(encoding="utf-8")
    frontmatter, body = _extract_frontmatter(raw)

    name = str(frontmatter.get("name") or fallback["name"])
    description = str(frontmatter.get("description") or fallback["description"])
    emoji = str(frontmatter.get("emoji") or fallback["emoji"])
    vibe = str(frontmatter.get("vibe") or fallback["vibe"])
    excerpt = body[:1800].strip()

    category = rel_path.split("/", 1)[0]
    return AgentProfile(
        id=agent_id,
        name=name,
        description=description,
        category=category,
        emoji=emoji,
        vibe=vibe,
        source_file=rel_path,
        instructions_excerpt=excerpt,
    )


@lru_cache(maxsize=1)
def load_core_agent_profiles() -> list[AgentProfile]:
    profiles: list[AgentProfile] = []
    for agent_id, rel_path in CORE_AGENT_FILES:
        profiles.append(_read_profile(agent_id, rel_path))
    return profiles


def get_core_profiles_by_ids(agent_ids: list[str] | None = None) -> list[AgentProfile]:
    profiles = load_core_agent_profiles()
    if not agent_ids:
        return profiles

    requested = {x.strip() for x in agent_ids if isinstance(x, str) and x.strip()}
    if not requested:
        return profiles

    selected = [profile for profile in profiles if profile.id in requested]
    return selected or profiles


def serialize_profiles(profiles: list[AgentProfile]) -> list[dict[str, Any]]:
    return [asdict(profile) for profile in profiles]
