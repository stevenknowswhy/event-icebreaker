"""Stage 3 — composition. Pure Python, no model: verdicts and confidences in, dossier out.

Everything the client shows is traceable: the score is a weighted sum over dimension
subscores using the shape's weight row, evidence strings quote actual profile lines, and
escalation is a count — never a vibe. All magic numbers live in the eval-gated constants
below; eval.py exists to justify them.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.questions import (
    DETERMINISTIC_CONFIDENCE,
    DIMENSION_THRESHOLDS,
    SHAPE_OPTIONS,
    SHAPE_THRESHOLD_ESCALATE,
    SHAPE_THRESHOLD_ROUTE,
    InterestCandidates,
)
from app.schemas import (
    DIM_BRIDGE,
    DIM_COMPLEMENTARITY,
    DIM_CURIOSITY_GAP,
    DIM_OFFER_SEARCH,
    DIMENSION_LABELS,
    DetailOut,
    DimensionOut,
    MatchDossierOut,
    RungOut,
    ScoreOut,
    ShapeOut,
)
from app.state import _shorten
from app.textmatch import complementarity_code, offer_search_code
from app.validation import SharedProfileIn

# Shape-specific weight tables. Every row sums to exactly 1.0 (enforced by tests).
# stage_gap was demoted by the first eval round (0–60% across phrasings); goal_fit by
# the second (model 34–37%, token code 14% — semantic goal alignment is not readable
# from short profile text, so it no longer carries score weight anywhere).
WEIGHTS: dict[str, dict[str, float]] = {
    "peer": {DIM_BRIDGE: 0.40, DIM_COMPLEMENTARITY: 0.25, DIM_OFFER_SEARCH: 0.35},
    "collab": {DIM_BRIDGE: 0.30, DIM_COMPLEMENTARITY: 0.40, DIM_OFFER_SEARCH: 0.30},
    "mentor": {DIM_BRIDGE: 0.15, DIM_COMPLEMENTARITY: 0.50, DIM_OFFER_SEARCH: 0.35},
    "investor": {DIM_BRIDGE: 0.30, DIM_COMPLEMENTARITY: 0.15, DIM_OFFER_SEARCH: 0.55},
    "customer": {DIM_BRIDGE: 0.25, DIM_COMPLEMENTARITY: 0.20, DIM_OFFER_SEARCH: 0.55},
    "unclear": {DIM_BRIDGE: 0.35, DIM_COMPLEMENTARITY: 0.30, DIM_OFFER_SEARCH: 0.35},
}

# Maps raw model outcomes to 0..1 subscores. Eval-gated constants.
COMPLEMENTARITY_VALUES = {"identical": 0.6, "overlapping": 0.8, "complementary": 1.0, "unrelated": 0.15}
BRIDGE_SHARED_VALUE = 1.0  # chosen interest is listed by both people
BRIDGE_ADJACENT_VALUE = 0.5  # chosen interest is adjacent (single-side), not shared
BRIDGE_NONE_VALUE = 0.0
CURIOSITY_PRESENT_VALUE = 1.0  # a genuine sender-only interest exists
CURIOSITY_NONE_VALUE = 0.0
OFFER_SEARCH_YES_THRESHOLD = 0.6  # brief: yes/no gates compare P(true) against a chosen threshold

# Score bands: strong ≥ 70, some ≥ 40, low below.
BAND_STRONG_MIN = 70
BAND_SOME_MIN = 40

EVIDENCE_CHARS = 110  # evidence lines are quoted, capped profile text


def answer_conf(raw_answer: dict) -> float:
    """The checkpoint's calibrated confidence (max-prob), for gating.

    The library returns two numbers: `confidence` (normalized-entropy — uncalibrated,
    collapses on many-option questions) and `answer_confidence` (max-prob — the
    quantity temperature scaling fits). All thresholds gate on the calibrated one;
    the fallback keeps hand-built test fakes (entropy key only) working.
    """
    return float(raw_answer.get("answer_confidence", raw_answer["confidence"]))
COMPLEMENTARITY_VERDICTS = {
    "identical": "Similar skill sets",
    "overlapping": "Overlapping skills with distinct strengths",
    "complementary": "Complementary skills",
    "unrelated": "Unrelated skill sets",
}


@dataclass(frozen=True)
class ShapeCall:
    kind: str
    confidence: float
    escalated: bool = False  # dossier-level flag: shown as "want a sharper read?" client-side
    demoted: bool = False  # the kind itself was demoted to "unclear" (below the escalate line)

    @property
    def effective_kind(self) -> str:
        if self.demoted or self.kind == "unclear":
            return "unclear"
        return self.kind


@dataclass
class Dimension:
    id: str
    verdict: str
    confidence: float
    evidence: list[str] = field(default_factory=list)
    subscore: float = 0.0
    # bridge / curiosity_gap carry their DetailOut here when one exists
    detail: DetailOut | None = None

    def to_out(self) -> DimensionOut:
        return DimensionOut(
            id=self.id,
            label=DIMENSION_LABELS[self.id],
            verdict=self.verdict,
            confidence=round(self.confidence, 4),
            evidence=self.evidence,
        )


@dataclass
class MatchInputs:
    """Everything the composition stage reads, gathered by the two model passes."""

    sender: SharedProfileIn
    receiver: SharedProfileIn
    candidates: InterestCandidates
    shape: ShapeCall
    answers: dict  # raw Laya answers from the dimension pass, keyed by question id


def quote(text: str) -> str:
    return _shorten(text.strip(), EVIDENCE_CHARS)


def shape_verdict_line(shape: ShapeCall) -> str:
    if shape.effective_kind == "unclear":
        return "Not confident enough to name the relationship"
    return {
        "peer": "Reads like two people solving similar problems in the same domain",
        "collab": "Reads like two different domains that fit on one project",
        "mentor": "Reads like a mentor–mentee gap in experience",
        "investor": "Reads like a backer talking with a builder",
        "customer": "Reads like a provider talking with a potential customer",
    }[shape.effective_kind]


def subscores(inputs: MatchInputs) -> dict[str, float]:
    """0..1 per scored dimension. Demoted dimensions come from code (app/textmatch.py);
    the eval measured the model's reads on them as too unreliable to ship."""
    answers = inputs.answers
    sender, receiver = inputs.sender, inputs.receiver

    # Bridge — deterministic: the shared set is computed exactly in code, so the model
    # pick (44% accurate) was demoted. First shared interest wins; else first adjacent.
    if inputs.candidates.shared:
        bridge_value = BRIDGE_SHARED_VALUE
    elif inputs.candidates.bridge_candidates:
        bridge_value = BRIDGE_ADJACENT_VALUE
    else:
        bridge_value = BRIDGE_NONE_VALUE

    p_1_to_2 = float(answers["offer_search_1_to_2"]["noul"])  # Laya: 31/31 on eval
    code_2_to_1, _ = offer_search_code(receiver.h, sender.q)  # code: model failed 2×
    offer_search_value = (p_1_to_2 + (1.0 if code_2_to_1 else 0.0)) / 2.0

    either_direction_fit = code_2_to_1 or p_1_to_2 >= OFFER_SEARCH_YES_THRESHOLD
    comp_kind, _ = complementarity_code(sender, receiver, either_direction_fit)
    complementarity_value = COMPLEMENTARITY_VALUES[comp_kind]

    curiosity_choice = answers.get("curiosity_gap", {}).get("choice")
    curiosity_value = CURIOSITY_PRESENT_VALUE if curiosity_choice else CURIOSITY_NONE_VALUE

    return {
        DIM_BRIDGE: bridge_value,
        DIM_COMPLEMENTARITY: complementarity_value,
        DIM_OFFER_SEARCH: offer_search_value,
        DIM_CURIOSITY_GAP: curiosity_value,
    }


def band_of(score: int) -> str:
    if score >= BAND_STRONG_MIN:
        return "strong"
    if score >= BAND_SOME_MIN:
        return "some"
    return "low"


def build_dimensions(inputs: MatchInputs) -> list[Dimension]:
    """Per-dimension verdicts with evidence quoted from the actual profile lines.

    Wire order: bridge, complementarity, offer→search, curiosity gap.
    stage_gap was demoted entirely after eval round 1 (0–60% across phrasings; no code
    rule can derive it); goal_fit after round 2 (model 34–37%, token code 14%). Neither
    renders. Every demoted dimension cites the deterministic rule that decided it, at
    confidence 1.0 — honest about being code, not model.
    """
    sender, receiver = inputs.sender, inputs.receiver
    answers = inputs.answers
    values = subscores(inputs)

    dimensions: list[Dimension] = []

    # Bridge — deterministic pick from the exact shared-interest set.
    if inputs.candidates.shared:
        interest = inputs.candidates.shared[0]
        evidence = [
            f"Person 1 lists: {quote(interest)}",
            f"Person 2 lists: {quote(interest)}",
        ]
        dimensions.append(
            Dimension(
                id=DIM_BRIDGE,
                verdict=interest,
                confidence=DETERMINISTIC_CONFIDENCE,
                evidence=evidence,
                subscore=values[DIM_BRIDGE],
                detail=DetailOut(interest=interest, why="Both profiles list this interest"),
            )
        )
    elif inputs.candidates.bridge_candidates:
        interest = inputs.candidates.bridge_candidates[0]
        owner_is_sender = interest in sender.x
        owner_label = "Person 1" if owner_is_sender else "Person 2"
        dimensions.append(
            Dimension(
                id=DIM_BRIDGE,
                verdict=f"Adjacent interest: {interest}",
                confidence=DETERMINISTIC_CONFIDENCE,
                evidence=[
                    f"{owner_label} lists: {quote(interest)} — not shared, but nearest the other person's world"
                ],
                subscore=values[DIM_BRIDGE],
                detail=DetailOut(
                    interest=interest,
                    why="Adjacent — listed on one side, near the other's world",
                ),
            )
        )
    else:
        dimensions.append(
            Dimension(
                id=DIM_BRIDGE,
                verdict="No shared or adjacent interests visible",
                confidence=DETERMINISTIC_CONFIDENCE,  # deterministic absence
                subscore=BRIDGE_NONE_VALUE,
            )
        )

    # Goal fit is gone: eval round 2 measured the model at 34–37% and the token rule at
    # 14% — neither clears any bar, so the looking-for lines surface only as evidence
    # inside the offer→search chip below.

    # Skill complementarity — code rule (eval: model stuck at 67%, never 90% precise).
    p_1_to_2 = float(answers["offer_search_1_to_2"]["noul"])
    code_2_to_1, code_2_to_1_ev = offer_search_code(receiver.h, sender.q)
    either_direction_fit = code_2_to_1 or p_1_to_2 >= OFFER_SEARCH_YES_THRESHOLD
    comp_kind, comp_ev = complementarity_code(sender, receiver, either_direction_fit)
    comp_evidence = []
    if sender.h:
        comp_evidence.append(f"Person 1 can help with: {quote(sender.h)}")
    if receiver.h:
        comp_evidence.append(f"Person 2 can help with: {quote(receiver.h)}")
    dimensions.append(
        Dimension(
            id=DIM_COMPLEMENTARITY,
            verdict=COMPLEMENTARITY_VERDICTS[comp_kind],
            confidence=DETERMINISTIC_CONFIDENCE,
            evidence=comp_evidence + [quote(line) for line in comp_ev],
            subscore=values[DIM_COMPLEMENTARITY],
        )
    )

    # Offer→search fit, rendered as one chip: the 1→2 direction is the eval-validated
    # model read; the 2→1 direction is the deterministic rule (model failed 2 rounds).
    one_to_two = p_1_to_2 >= OFFER_SEARCH_YES_THRESHOLD
    if one_to_two and code_2_to_1:
        os_verdict = "Useful in both directions"
    elif one_to_two:
        os_verdict = "Useful from person 1 to person 2"
    elif code_2_to_1:
        os_verdict = "Useful from person 2 to person 1"
    else:
        os_verdict = "No useful direction found"
    os_evidence = []
    if sender.h and receiver.q:
        os_evidence.append(f"Person 1 offers: {quote(sender.h)} — person 2 seeks: {quote(receiver.q)}")
    if receiver.h and sender.q:
        os_evidence.append(f"Person 2 offers: {quote(receiver.h)} — person 1 seeks: {quote(sender.q)}")
        os_evidence.append(quote(code_2_to_1_ev[0]))
    if not os_evidence:
        os_evidence = ["Offer or search text missing on one side"]
    dimensions.append(
        Dimension(
            id=DIM_OFFER_SEARCH,
            verdict=os_verdict,
            confidence=answer_conf(answers["offer_search_1_to_2"]),
            evidence=os_evidence,
            subscore=values[DIM_OFFER_SEARCH],
        )
    )

    # Curiosity gap — person 1's interest furthest from person 2's world.
    curiosity_choice = answers.get("curiosity_gap", {}).get("choice")
    curiosity_conf = answer_conf(answers["curiosity_gap"]) if "curiosity_gap" in answers else 1.0
    if curiosity_choice is None:
        dimensions.append(
            Dimension(
                id=DIM_CURIOSITY_GAP,
                verdict="Person 1's interests all overlap person 2's",
                confidence=1.0,  # deterministic absence
                subscore=CURIOSITY_NONE_VALUE,
            )
        )
    else:
        dimensions.append(
            Dimension(
                id=DIM_CURIOSITY_GAP,
                verdict=f"Curious: {curiosity_choice}",
                confidence=curiosity_conf,
                evidence=[
                    f"Person 1 lists: {quote(curiosity_choice)} — absent from person 2's interests"
                ],
                subscore=values[DIM_CURIOSITY_GAP],
                detail=DetailOut(
                    interest=curiosity_choice,
                    why=f"Person 1's {quote(curiosity_choice)} sits outside person 2's listed interests",
                ),
            )
        )

    return dimensions


def low_dimensions(dimensions: list[Dimension]) -> list[Dimension]:
    return [d for d in dimensions if d.confidence < DIMENSION_THRESHOLDS[d.id]]


def compose(
    inputs: MatchInputs,
    dimensions: list[Dimension],
    ladder: list[RungOut],
    best_first_move: str,
) -> MatchDossierOut:
    weights = WEIGHTS[inputs.shape.effective_kind]
    values = subscores(inputs)
    # Iterate the weight row, not DIMENSION_IDS: curiosity_gap carries weight only in
    # the investor/customer rows, and stage_gap is gone entirely.
    raw = sum(weight * values[dim] for dim, weight in weights.items())
    score = round(100 * raw)

    low = low_dimensions(dimensions)
    escalated = inputs.shape.escalated or len(low) >= 2

    weight_summary = ", ".join(
        f"{DIMENSION_LABELS[dim]} {round(weight * 100)}%"
        for dim, weight in weights.items()
        if weight > 0
    )
    if inputs.shape.demoted:
        by_shape = (
            f"Low shape confidence ({inputs.shape.confidence:.2f}) demotes this to an unclear "
            f"match — scored with flat weights: {weight_summary}"
        )
    elif inputs.shape.escalated:
        by_shape = (
            f"Shape confidence ({inputs.shape.confidence:.2f}) is below the routing line — "
            f"flagged, not hidden. Scored as a {inputs.shape.effective_kind} match: {weight_summary}"
        )
    else:
        by_shape = f"Scored as a {inputs.shape.effective_kind} match — weights: {weight_summary}"

    bridge = next((d.detail for d in dimensions if d.id == DIM_BRIDGE), None)
    curiosity_gap = next((d.detail for d in dimensions if d.id == DIM_CURIOSITY_GAP), None)

    return MatchDossierOut(
        shape=ShapeOut(kind=inputs.shape.effective_kind, confidence=round(inputs.shape.confidence, 4)),
        dimensions=[d.to_out() for d in dimensions],
        bridge=bridge,
        curiosityGap=curiosity_gap,
        score=ScoreOut(value=score, band=band_of(score), byShape=by_shape),
        bestFirstMove=best_first_move,
        ladder=ladder,
        escalated=escalated,
    )


def classify_shape(raw_answer: dict) -> ShapeCall:
    """Turn the shape pass answer into a ShapeCall, applying the spec's strict thresholds
    on the calibrated confidence."""
    kind = raw_answer["choice"]
    if kind not in SHAPE_OPTIONS:
        raise ValueError(f"model returned unknown shape: {kind!r}")
    confidence = answer_conf(raw_answer)
    if kind == "unclear" or confidence < SHAPE_THRESHOLD_ESCALATE:
        return ShapeCall(kind=kind, confidence=confidence, escalated=True, demoted=True)
    # Between demote (0.40) and route (0.60): the kind holds, the dossier is flagged.
    if confidence < SHAPE_THRESHOLD_ROUTE:
        return ShapeCall(kind=kind, confidence=confidence, escalated=True, demoted=False)
    return ShapeCall(kind=kind, confidence=confidence, escalated=False, demoted=False)
