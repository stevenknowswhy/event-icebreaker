"""Request validation mirroring lib/icebreaker.ts validateSharedProfile, exactly.

The sidecar never sees more than a receiver would see: it accepts the decoded
SharedProfile object the app already validates client-side. Field caps below are
the TEXT_LIMITS from lib/icebreaker.ts; extra keys are rejected so contract drift
between client and sidecar surfaces loudly instead of silently scoring stale data.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator

# TEXT_LIMITS from lib/icebreaker.ts
NAME_MAX = 80
ROLE_MAX = 120
INTEREST_MAX = 50
SPARK_MAX = 160
SPARK_DETAILS_MAX = 360
CAN_HELP_MAX = 280
LOOKING_FOR_MAX = 280
VALUE_MAX = 40
COMMUNICATION_MAX = 160
FUN_FACT_MAX = 220

INTERESTS_MAX_ITEMS = 8
VALUES_MAX_ITEMS = 6

INTENTS = ("networking", "friendship", "dating", "general")


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class SharedProfileIn(_StrictModel):
    v: int = Field(default=1)
    n: str = Field(min_length=1, max_length=NAME_MAX)
    o: int = Field(ge=1, le=4)
    i: str
    x: list[str] = Field(max_length=INTERESTS_MAX_ITEMS)
    r: str | None = Field(default=None, min_length=1, max_length=ROLE_MAX)
    s: str | None = Field(default=None, min_length=1, max_length=SPARK_MAX)
    sd: str | None = Field(default=None, min_length=1, max_length=SPARK_DETAILS_MAX)
    h: str | None = Field(default=None, min_length=1, max_length=CAN_HELP_MAX)
    q: str | None = Field(default=None, min_length=1, max_length=LOOKING_FOR_MAX)
    va: list[str] | None = Field(default=None, max_length=VALUES_MAX_ITEMS)
    c: str | None = Field(default=None, min_length=1, max_length=COMMUNICATION_MAX)
    f: str | None = Field(default=None, min_length=1, max_length=FUN_FACT_MAX)
    # strict=False here only: JSON.stringify(1.0) emits `1`, and int→float must be accepted.
    p: list[float] | None = Field(default=None, min_length=5, max_length=5, strict=False)

    @field_validator("v")
    @classmethod
    def _v_must_be_one(cls, value: int) -> int:
        if value != 1:
            raise ValueError("unsupported profile version")
        return value

    @field_validator("i")
    @classmethod
    def _intent_known(cls, value: str) -> str:
        if value not in INTENTS:
            raise ValueError("unknown intent")
        return value

    @field_validator("n", "x", "r", "s", "sd", "h", "q", "va", "c", "f")
    @classmethod
    def _no_blank_strings(cls, value: str | list[str] | None) -> str | list[str] | None:
        # Mirrors the client: required text is non-empty after stripping; list items non-blank.
        if isinstance(value, str):
            if not value.strip():
                raise ValueError("blank text field")
        elif isinstance(value, list) and any(not item.strip() for item in value):
            raise ValueError("blank list item")
        return value

    @field_validator("x", "va")
    @classmethod
    def _item_lengths_capped(cls, value: list[str] | None, info: ValidationInfo) -> list[str] | None:
        if value is None:
            return None
        item_max = INTEREST_MAX if info.field_name == "x" else VALUE_MAX
        if any(len(item) > item_max for item in value):
            raise ValueError("list item too long")
        return value

    @field_validator("p")
    @classmethod
    def _personality_in_range(cls, value: list[float] | None) -> list[float] | None:
        if value is not None and any(not 0.0 <= v <= 1.0 for v in value):
            raise ValueError("personality scores must be between 0 and 1")
        return value


class MatchRequest(_StrictModel):
    """Person 1 is the sender (whose card was scanned); person 2 is the receiver."""

    sender: SharedProfileIn
    receiver: SharedProfileIn


class GuardrailsRequest(_StrictModel):
    # Reject oversized text (422) rather than truncate — matches Settings.profile_text_limit.
    text: str = Field(min_length=1, max_length=2000)


def validate_shared_profile(profile: SharedProfileIn) -> bool:
    """True iff the shared profile is usable for scoring.

    Construction-time checks (field caps, types, unknown-key rejection) already ran in
    pydantic; this is the explicit semantic gate the endpoints call — the seam where
    future cross-field rules land, mirroring the app's validateSharedProfile.
    """
    return isinstance(profile, SharedProfileIn)
