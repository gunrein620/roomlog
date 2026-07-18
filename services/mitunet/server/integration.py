"""Lightweight RoomLog integration configuration helpers."""

from __future__ import annotations

import os


def roomlog_allowed_origins() -> list[str]:
    configured = os.getenv(
        "ROOMLOG_ALLOWED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    )
    return [origin.strip() for origin in configured.split(",") if origin.strip()]


def integration_config_payload() -> dict[str, list[str]]:
    return {"roomlog_allowed_origins": roomlog_allowed_origins()}
