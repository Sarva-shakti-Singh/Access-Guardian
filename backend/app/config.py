"""Environment-driven settings. Reads .env from the project root if present."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def load_dotenv(path: Path | None = None) -> None:
    env = path or ROOT / ".env"
    if not env.exists():
        return
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


@dataclass(frozen=True)
class Settings:
    database: Path
    cors_origins: list[str]
    allowed_ports: frozenset[int]
    axe_path: Path
    ai_base_url: str
    ai_model: str
    ai_api_key: str
    vision_base_url: str
    vision_model: str
    vision_api_key: str
    vision_timeout: int
    vision_max_image_bytes: int

    @property
    def artifacts_dir(self) -> Path:
        return self.database.parent


def _path(value: str | None, default: str) -> Path:
    p = Path(value or default)
    return p if p.is_absolute() else ROOT / p


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, "") or default)
    except ValueError:
        return default


def get_settings() -> Settings:
    g = os.environ.get
    return Settings(
        database=_path(g("ACCESS_GUARDIAN_DATABASE"), "backend/artifacts/access-guardian.sqlite3"),
        cors_origins=[
            o.strip()
            for o in (g("ACCESS_GUARDIAN_CORS_ORIGINS") or "http://localhost:5173,http://127.0.0.1:5173").split(",")
            if o.strip()
        ],
        allowed_ports=frozenset(
            int(p) for p in (g("ACCESS_GUARDIAN_ALLOWED_SCAN_PORTS") or "80,443").split(",") if p.strip().isdigit()
        ),
        axe_path=_path(g("ACCESS_GUARDIAN_AXE_PATH"), "frontend/node_modules/axe-core/axe.min.js"),
        ai_base_url=(g("ACCESS_GUARDIAN_AI_BASE_URL") or "http://127.0.0.1:11434/v1").strip(),
        ai_model=(g("ACCESS_GUARDIAN_AI_MODEL") or "qwen2.5-coder:7b").strip(),
        ai_api_key=(g("ACCESS_GUARDIAN_AI_API_KEY") or "").strip(),
        vision_base_url=(g("ACCESS_GUARDIAN_VISION_BASE_URL") or "").strip(),
        vision_model=(g("ACCESS_GUARDIAN_VISION_MODEL") or "").strip(),
        vision_api_key=(g("ACCESS_GUARDIAN_VISION_API_KEY") or "").strip(),
        vision_timeout=_int("ACCESS_GUARDIAN_VISION_TIMEOUT_SECONDS", 35),
        vision_max_image_bytes=_int("ACCESS_GUARDIAN_VISION_MAX_IMAGE_BYTES", 3_000_000),
    )
