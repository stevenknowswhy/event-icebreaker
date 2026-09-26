"""Environment-driven settings. Nothing here is per-request state — the sidecar is stateless."""

from __future__ import annotations

import os
from dataclasses import dataclass, field

MODEL_ID = "convaiinnovations/laya"  # English checkpoint, the launch default per the approved spec


def _split_origins(raw: str) -> list[str]:
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


@dataclass(frozen=True)
class Settings:
    allowed_origins: list[str] = field(default_factory=list)
    max_body_bytes: int = 32 * 1024
    model_id: str = MODEL_ID
    # Empty string lets Laya auto-pick (CUDA → MPS → CPU); set LAYA_DEVICE=cpu to force CPU.
    device: str = ""

    @classmethod
    def from_env(cls) -> Settings:
        return cls(
            allowed_origins=_split_origins(os.environ.get("LAYA_ALLOWED_ORIGINS", "")),
            max_body_bytes=int(os.environ.get("LAYA_MAX_BODY_BYTES", str(32 * 1024))),
            model_id=os.environ.get("LAYA_MODEL_ID", MODEL_ID),
            device=os.environ.get("LAYA_DEVICE", ""),
        )
