"""Persistent storage for Agent Studio orchestration runs."""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path

logger = logging.getLogger("agent_firewall.agent_studio.storage")


class AgentStudioRunStore:
    """Append-only JSONL storage for orchestration runs."""

    def __init__(self, data_dir: str | Path) -> None:
        self._data_dir = Path(data_dir)
        self._data_dir.mkdir(parents=True, exist_ok=True)
        self._file_path = self._data_dir / "orchestration_runs.jsonl"
        self._file_path.touch(exist_ok=True)

    async def save_run(self, run: dict[str, object]) -> None:
        line = json.dumps(run, ensure_ascii=False) + "\n"
        await asyncio.to_thread(self._append_line_sync, line)

    async def list_runs(self, limit: int = 20, offset: int = 0) -> list[dict[str, object]]:
        rows = await asyncio.to_thread(self._read_all_sync)
        rows = sorted(rows, key=lambda item: str(item.get("created_at", "")), reverse=True)
        return rows[offset : offset + limit]

    async def get_run(self, run_id: str) -> dict[str, object] | None:
        rows = await asyncio.to_thread(self._read_all_sync)
        for row in rows:
            if row.get("id") == run_id:
                return row
        return None

    def _append_line_sync(self, line: str) -> None:
        with self._file_path.open("a", encoding="utf-8") as handle:
            handle.write(line)

    def _read_all_sync(self) -> list[dict[str, object]]:
        rows: list[dict[str, object]] = []
        with self._file_path.open("r", encoding="utf-8") as handle:
            for raw in handle:
                line = raw.strip()
                if not line:
                    continue
                try:
                    parsed = json.loads(line)
                    if isinstance(parsed, dict):
                        rows.append(parsed)
                except Exception as exc:
                    logger.debug("Skip malformed orchestration run row: %s", exc)
                    continue
        return rows
