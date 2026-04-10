"""Denylist service — check text against per-policy denylist phrases."""

from __future__ import annotations

from dataclasses import dataclass

from src.config import get_config


@dataclass
class DenylistHit:
    """Structured result from a denylist match."""

    phrase: str
    category: str
    action: str  # "block" | "flag" | "score_boost"
    severity: str  # "low" | "medium" | "high" | "critical"
    is_regex: bool
    description: str

async def check_denylist(text: str, policy_name: str) -> list[DenylistHit]:
    """Check *text* against denylist phrases for *policy_name*.

    Returns a list of DenylistHit objects with action/severity/description.
    """
    hits: list[DenylistHit] = []
    text_lower = text.lower()

    config = get_config()

    for phrase in config.blocked_commands:
        if phrase.lower() in text_lower:
            hits.append(
                DenylistHit(
                    phrase=phrase,
                    category="system_rules",
                    action="block",
                    severity="high",
                    is_regex=False,
                    description=f"Matched banned command pattern: {phrase}",
                )
            )
    return hits
