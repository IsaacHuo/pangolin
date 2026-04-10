"""Attack-scenario catalogue."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/v1/scenarios", tags=["scenarios"])

_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "scenarios"

CatalogueKind = Literal["playground", "agent", "compare"]

@lru_cache(maxsize=4)
def _load_catalogue(kind: str) -> list[dict]:
    path = _DATA_DIR / f"{kind}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Catalogue '{kind}' not found")
    return json.loads(path.read_text(encoding="utf-8"))

@router.get("/{kind}")
async def get_scenarios(kind: CatalogueKind) -> list[dict]:
    return _load_catalogue(kind)
