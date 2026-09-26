"""The invisible conversation ladder — Aron et al. (1997) escalation curve, event-safe payload.

Borrowed structure, not questionnaire: rung 1 is the bridge (it IS the best first move),
rung 2 is the fit, rung 3 is the curiosity gap. Every entry is phrased ask-each-other
(reciprocity is structural), pre-screened against the same "reads wrong in a professional
room" standard the guardrails apply — no death, regret, or family-history items — and
nothing advances on a timer: the client gates rung 3 behind a second tap.

build_ladder is deterministic selection from dossier dimensions (no extra model pass);
sparse profiles yield generic-but-safe rungs.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.compose import Dimension, ShapeCall, shape_verdict_line
from app.schemas import (
    DIM_BRIDGE,
    DIM_COMPLEMENTARITY,
    DIM_CURIOSITY_GAP,
    DIM_GOAL_FIT,
    DIM_OFFER_SEARCH,
    RungOut,
)
from app.state import _shorten

MOVE_CHARS = 220  # ladder strings stay speakable


@dataclass(frozen=True)
class BankEntry:
    rung: int
    tag: str  # the dimension this entry serves
    question: str  # {interest} slot where relevant
    why: str  # traceability for the client; {interest} slot where relevant

    def render(self, interest: str = "") -> RungOut:
        return RungOut(
            level=self.rung,
            question=_shorten(self.question.format(interest=interest).strip(), MOVE_CHARS),
            why=_shorten(self.why.format(interest=interest).strip(), MOVE_CHARS),
        )


# 13 entries across 3 rungs. Static data shipped with the sidecar; selection
# never invents questions — it only picks and slot-fills from here.
BANK: list[BankEntry] = [
    # Rung 1 — the bridge (rung 1 renders as bestFirstMove, never inside ladder[])
    BankEntry(1, DIM_BRIDGE,
              "Ask each other: what first pulled you into {interest} — and what has kept you there?",
              "You both list {interest} — start where you already overlap."),
    BankEntry(1, DIM_BRIDGE,
              "Ask each other: what is the most surprising thing each of you has seen lately in "
              "{interest}?",
              "You both list {interest} — trade what is new in it."),
    BankEntry(1, DIM_BRIDGE,
              "Ask each other: where does {interest} show up in what you are each building right now?",
              "You both list {interest} — connect it to your current work."),
    BankEntry(1, DIM_BRIDGE,
              "Ask each other: what brought you to this event, and what would make tonight worth it?",
              "No clear overlap in the profiles — a safe opener that still goes somewhere."),
    # Rung 2 — the fit
    BankEntry(2, DIM_OFFER_SEARCH,
              "Ask each other: what is one problem you are facing that the other person's work has "
              "already touched?",
              "The dossier found a real offer→search fit between you."),
    BankEntry(2, DIM_OFFER_SEARCH,
              "Ask each other: what are you each looking for right now that the other might open a "
              "door on?",
              "One direction of offer→search fit showed up — test it out loud."),
    BankEntry(2, DIM_COMPLEMENTARITY,
              "Ask each other: what is the hardest part of your own work that the other person's "
              "skills make easier?",
              "Your skills are complementary — name the seam."),
    BankEntry(2, DIM_COMPLEMENTARITY,
              "Ask each other: what do you each do differently when you hit the same kind of problem?",
              "Your skills overlap — compare approaches."),
    BankEntry(2, DIM_GOAL_FIT,
              "Ask each other: what would need to be true a year from now to call your current push "
              "a win?",
              "Your goals point the same way — compare finish lines."),
    BankEntry(2, DIM_GOAL_FIT,
              "Ask each other: what is the most useful conversation you could have tonight?",
              "The profiles were too sparse to personalize this rung — safe and still useful."),
    # Rung 3 — the gap (never renders unasked; the client tap-gates it)
    BankEntry(3, DIM_CURIOSITY_GAP,
              "Ask each other: {interest} is outside what the other does day to day — what "
              "beginner's question have you always wanted to ask about it?",
              "{interest} sits far from the other person's world — a genuine gap, asked gently."),
    BankEntry(3, DIM_CURIOSITY_GAP,
              "Ask each other: what do people usually get wrong about {interest}?",
              "{interest} is the curiosity gap — a misconception is an easy door into it."),
    BankEntry(3, DIM_CURIOSITY_GAP,
              "Ask each other: what rabbit hole outside your own field would you happily fall into "
              "tonight?",
              "No clear curiosity gap in the profiles — a safe stand-in that still escalates."),
]

# Bank indexes used by selection — named constants so tests can pin behavior.
BRIDGE_INTEREST_MOVE = 0
BRIDGE_GENERIC_MOVE = 3
FIT_BOTH_DIRECTIONS = 4
FIT_ONE_DIRECTION = 5
FIT_COMPLEMENTARY = 6
FIT_OVERLAPPING = 7
FIT_ALIGNED_GOALS = 8
FIT_GENERIC = 9
GAP_WITH_INTEREST = 10
GAP_GENERIC = 12


def _first(dimensions: list[Dimension], dim_id: str) -> Dimension | None:
    return next((d for d in dimensions if d.id == dim_id), None)


def best_first_move(bridge_interest: str | None, shape: ShapeCall) -> str:
    """Rung 1 — the primary action. Bridge-calibrated; generic-but-safe without one."""
    if bridge_interest:
        if shape.effective_kind == "investor":
            return _shorten(
                f"Ask each other where {bridge_interest} shows up in what you each back and build.",
                MOVE_CHARS,
            )
        return BANK[BRIDGE_INTEREST_MOVE].render(interest=bridge_interest).question
    return BANK[BRIDGE_GENERIC_MOVE].render().question


def _rung_two(dimensions: list[Dimension]) -> RungOut:
    fit = _first(dimensions, DIM_OFFER_SEARCH)
    comp = _first(dimensions, DIM_COMPLEMENTARITY)
    goal = _first(dimensions, DIM_GOAL_FIT)
    if fit and "both directions" in fit.verdict:
        return BANK[FIT_BOTH_DIRECTIONS].render()
    if comp and comp.verdict == "Complementary skills":
        return BANK[FIT_COMPLEMENTARY].render()
    if fit and fit.verdict.startswith("Useful from"):
        return BANK[FIT_ONE_DIRECTION].render()
    if comp and comp.verdict.startswith("Overlapping"):
        return BANK[FIT_OVERLAPPING].render()
    if goal and "clearly aligned" in goal.verdict:
        return BANK[FIT_ALIGNED_GOALS].render()
    return BANK[FIT_GENERIC].render()


def _rung_three(curiosity_interest: str | None) -> RungOut:
    if curiosity_interest:
        return BANK[GAP_WITH_INTEREST].render(interest=curiosity_interest)
    return BANK[GAP_GENERIC].render()


def build_ladder(
    dimensions: list[Dimension],
    curiosity_interest: str | None,
) -> list[RungOut]:
    """Deterministic selection: rung 2 from the fit dimensions, rung 3 from the curiosity gap.

    Rung 1 is not returned — it IS bestFirstMove (see the MatchDossier contract).
    Always exactly two rungs; sparse profiles get the generic-but-safe entries.
    """
    return [_rung_two(dimensions), _rung_three(curiosity_interest)]


def shape_line(shape: ShapeCall) -> str:
    return shape_verdict_line(shape)
