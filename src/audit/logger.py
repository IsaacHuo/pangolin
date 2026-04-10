from __future__ import annotations

import asyncio
import json
import logging
import os
from collections.abc import Mapping
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import TypeAlias

JSONPrimitive: TypeAlias = str | int | float | bool | None
JSONValue: TypeAlias = JSONPrimitive | list["JSONValue"] | dict[str, "JSONValue"]
JSONDict: TypeAlias = dict[str, JSONValue]

LOGGER = logging.getLogger(__name__)


class AuditLogger:
    """Lightweight async audit logger with in-memory recent buffer + JSONL append."""

    def __init__(self, log_path: str, max_buffer: int = 2000) -> None:
        self._log_path = Path(log_path)
        self._max_buffer = max_buffer
        self._buffer: list[JSONDict] = []
        self._lock = asyncio.Lock()
        self._started = False
        self._written = 0

    async def start(self) -> None:
        self._log_path.parent.mkdir(parents=True, exist_ok=True)
        if not self._log_path.exists():
            self._log_path.write_text("", encoding="utf-8")
        self._started = True

    async def stop(self) -> None:
        self._started = False

    @property
    def stats(self) -> JSONDict:
        size_bytes = self._log_path.stat().st_size if self._log_path.exists() else 0
        return {
            "started": self._started,
            "in_memory_entries": len(self._buffer),
            "written_entries": self._written,
            "path": str(self._log_path),
            "size_bytes": size_bytes,
        }

    @staticmethod
    def _to_jsonable(value: object) -> JSONValue:
        if is_dataclass(value):
            return AuditLogger._to_jsonable(asdict(value))
        if isinstance(value, (str, int, float, bool)) or value is None:
            return value
        if isinstance(value, Mapping):
            return {str(k): AuditLogger._to_jsonable(v) for k, v in value.items()}
        if isinstance(value, (list, tuple, set)):
            return [AuditLogger._to_jsonable(v) for v in value]
        return str(value)

    def _normalize_entry(self, entry: object) -> JSONDict:
        if is_dataclass(entry):
            raw = asdict(entry)
        elif isinstance(entry, Mapping):
            raw = {str(k): v for k, v in entry.items()}
        else:
            raw = {"message": str(entry)}

        return {str(k): self._to_jsonable(v) for k, v in raw.items()}

    async def log(self, entry: object) -> None:
        normalized = self._normalize_entry(entry)

        async with self._lock:
            self._buffer.insert(0, normalized)
            if len(self._buffer) > self._max_buffer:
                self._buffer = self._buffer[: self._max_buffer]

            self._log_path.parent.mkdir(parents=True, exist_ok=True)
            with self._log_path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(normalized, ensure_ascii=False) + os.linesep)
            self._written += 1

    async def get_recent_entries(self, limit: int = 50) -> list[JSONDict]:
        if limit <= 0:
            return []

        async with self._lock:
            if self._buffer:
                return self._buffer[:limit]

        # Lazy file fallback when memory buffer is empty.
        if not self._log_path.exists():
            return []

        lines: list[str] = []
        with self._log_path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                lines.append(line)

        recent: list[JSONDict] = []
        for line in reversed(lines[-limit:]):
            try:
                parsed = json.loads(line)
                if isinstance(parsed, Mapping):
                    recent.append(self._normalize_entry(parsed))
            except json.JSONDecodeError as exc:
                LOGGER.debug("Skipping malformed audit log line: %s", exc)
                continue

        async with self._lock:
            if recent and not self._buffer:
                self._buffer = recent[: self._max_buffer]

        return recent
