from __future__ import annotations

from pathlib import Path

from src import skills as skills_module
from src.skills import SkillRegistry, _parse_frontmatter


def test_parse_frontmatter_without_yaml_module() -> None:
    original_yaml = skills_module.yaml
    skills_module.yaml = None
    try:
        frontmatter = """
name: shell-helper
description: Quick shell helper
homepage: https://example.com/skill
metadata: {"openclaw":{"emoji":"🛠️","os":["darwin"],"requires":{"bins":["bash","curl"]}}}
"""
        parsed = _parse_frontmatter(frontmatter)
        assert parsed is not None
        assert parsed["name"] == "shell-helper"
        assert parsed["description"] == "Quick shell helper"
        assert parsed["metadata"]["openclaw"]["emoji"] == "🛠️"
        assert parsed["metadata"]["openclaw"]["os"] == ["darwin"]
        assert parsed["metadata"]["openclaw"]["requires"]["bins"] == ["bash", "curl"]
    finally:
        skills_module.yaml = original_yaml


def test_registry_discovers_skill_without_yaml_module(tmp_path: Path) -> None:
    original_yaml = skills_module.yaml
    skills_module.yaml = None
    try:
        skill_dir = tmp_path / "skills" / "demo-skill"
        skill_dir.mkdir(parents=True)
        (skill_dir / "SKILL.md").write_text(
            """---
name: demo-skill
description: Demo skill
metadata: {"openclaw":{"emoji":"✨"}}
---
Run demo commands.
""",
            encoding="utf-8",
        )
        registry = SkillRegistry(tmp_path / "skills")
        registry.discover()
        assert "demo-skill" in registry.all_skills
    finally:
        skills_module.yaml = original_yaml
