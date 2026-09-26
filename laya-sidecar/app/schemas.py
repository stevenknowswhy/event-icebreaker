"""Response models. The JSON these produce IS the MatchDossier contract.

Contract mirror of the spec's TypeScript type (see contract/match-dossier.schema.json):

    Rung         = { level: 1|2|3; question: string; why: string }
    MatchDossier = {
      shape: { kind: "peer"|"collab"|"mentor"|"investor"|"customer"|"unclear"; confidence: number }
      dimensions: { id; label; verdict; confidence; evidence: string[] }[]
      bridge: { interest; why } | null
      curiosityGap: { interest; why } | null
      score: { value: number; band: "low"|"some"|"strong"; byShape: string }
      bestFirstMove: string
      ladder: Rung[]            // rungs 2-3 only; rung 1 IS bestFirstMove
      escalated: boolean
    }

The parallel TypeScript client (lib/match.ts) is built against the same type; zero drift tolerated.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ShapeKind = Literal["peer", "collab", "mentor", "investor", "customer", "unclear"]
ScoreBand = Literal["low", "some", "strong"]

# Dimension ids — stable wire identifiers used by the client and the weight tables.
DIM_BRIDGE = "bridge"
DIM_GOAL_FIT = "goal_fit"
DIM_COMPLEMENTARITY = "complementarity"
DIM_OFFER_SEARCH = "offer_search"
DIM_STAGE_GAP = "stage_gap"
DIM_CURIOSITY_GAP = "curiosity_gap"

DIMENSION_IDS = (
    DIM_BRIDGE,
    DIM_GOAL_FIT,
    DIM_COMPLEMENTARITY,
    DIM_OFFER_SEARCH,
    DIM_STAGE_GAP,
    DIM_CURIOSITY_GAP,
)

DIMENSION_LABELS = {
    DIM_BRIDGE: "Shared ground",
    DIM_GOAL_FIT: "Goal fit",
    DIM_COMPLEMENTARITY: "Skill complementarity",
    DIM_OFFER_SEARCH: "Offer → search fit",
    DIM_STAGE_GAP: "Stage gap",
    DIM_CURIOSITY_GAP: "Curiosity gap",
}


class ShapeOut(BaseModel):
    model_config = ConfigDict(json_schema_extra={"additionalProperties": False})
    kind: ShapeKind
    confidence: float = Field(ge=0.0, le=1.0)


class DimensionOut(BaseModel):
    model_config = ConfigDict(json_schema_extra={"additionalProperties": False})
    id: str
    label: str
    verdict: str
    confidence: float = Field(ge=0.0, le=1.0)
    evidence: list[str]


class DetailOut(BaseModel):
    """The bridge / curiosityGap payload."""

    model_config = ConfigDict(json_schema_extra={"additionalProperties": False})
    interest: str
    why: str


class ScoreOut(BaseModel):
    model_config = ConfigDict(json_schema_extra={"additionalProperties": False})
    value: int = Field(ge=0, le=100)
    band: ScoreBand
    byShape: str


class RungOut(BaseModel):
    model_config = ConfigDict(json_schema_extra={"additionalProperties": False})
    level: Literal[1, 2, 3]
    question: str
    why: str


class MatchDossierOut(BaseModel):
    model_config = ConfigDict(json_schema_extra={"additionalProperties": False})
    shape: ShapeOut
    dimensions: list[DimensionOut]
    bridge: DetailOut | None
    curiosityGap: DetailOut | None
    score: ScoreOut
    bestFirstMove: str
    ladder: list[RungOut]
    escalated: bool


class GuardrailContactOut(BaseModel):
    """Contact judgment — `matched` names the deterministic detectors that fired."""

    model_config = ConfigDict(json_schema_extra={"additionalProperties": False})
    present: bool
    confidence: float = Field(ge=0.0, le=1.0)
    matched: list[str] = Field(default_factory=list)


class GuardrailToneOut(BaseModel):
    """Tone judgment — a model noul read; no deterministic `matched` exists for tone."""

    model_config = ConfigDict(json_schema_extra={"additionalProperties": False})
    present: bool
    confidence: float = Field(ge=0.0, le=1.0)


class GuardrailsOut(BaseModel):
    model_config = ConfigDict(json_schema_extra={"additionalProperties": False})
    contact: GuardrailContactOut
    tone: GuardrailToneOut


class HealthOut(BaseModel):
    model_config = ConfigDict(json_schema_extra={"additionalProperties": False})
    status: Literal["ok", "warming"]
    model: str
