"""Laya question definitions for the shape pass and the dimension pass.

Rules from the integration brief baked in here:
- questions ask what the text says (perception), never what to do about it;
- every option carries a description — the description is what the model matches against;
- option lists are short (≤8) and each option is truncated at 48 tokens by the model,
  with a shared ~192-token budget on the English checkpoint;
- numeric comparisons are resolved in code before they reach the state.

Question sets: "default" plus alternative phrasings ("b", "c") registered per question id.
eval.py measures each set on the labeled corpus; a dimension that misses its threshold is
rephrased or demoted to code logic. Only the default set ships in the scoring path.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.schemas import DIMENSION_LABELS
from app.validation import SharedProfileIn

MAX_INTEREST_OPTIONS = 8

SHAPE_OPTIONS: dict[str, str] = {
    "peer": "both people work in the same domain at a similar level, on similar problems",
    "collab": "they work in different domains that fit together on a shared project or product",
    "mentor": "one person is clearly more experienced and could guide the other in that person's field",
    "investor": "one person backs or funds people and companies, and the other builds or runs one",
    "customer": "one person offers a product or service that the other might buy or use",
    "unclear": "the two profiles do not show enough to tell what the relationship would be",
}

# Per-question thresholds, applied to the CALIBRATED confidence (`answer_confidence`,
# max-prob — the quantity the checkpoint's temperature scaling fits), never to the
# entropy-based `confidence` the library also returns: its own docs warn it is not
# calibrated and collapses on many-option questions (measured: shape precision 61% at
# entropy 0.30 but 100% at calibrated 0.60). A dimension's confident answers must be
# right ~90% of the time at its threshold or it does not ship as a model read.
# goal_fit, complementarity, stage_gap and the shared-interest choice failed that bar
# in two phrasing rounds and are demoted to code logic (app/textmatch.py); the
# deterministic dimensions ride at 1.0.
DETERMINISTIC_CONFIDENCE = 1.0
DIMENSION_THRESHOLDS: dict[str, float] = {
    "bridge": DETERMINISTIC_CONFIDENCE,
    "goal_fit": DETERMINISTIC_CONFIDENCE,
    "complementarity": DETERMINISTIC_CONFIDENCE,
    "offer_search": 0.5,  # 1→2 was 31/31 correct; calibrated confidences cluster ≥0.8
    "curiosity_gap": 0.4,  # unlabeled personalization signal; low confidence hides the pick
    "stage_gap": DETERMINISTIC_CONFIDENCE,  # question dropped from the pass; slot unused
}

# Shape thresholds on the calibrated confidence, from the measured precision curve
# (EVAL.md, 45 pairs): ≥0.60 → 100% (5/45); 0.40–0.60 → 86–88% (named but escalated);
# <0.40 → 61–72%, too soft to name — demoted to unclear and escalated.
SHAPE_THRESHOLD_ROUTE = 0.60  # shape confidence at/above this asserts the kind
SHAPE_THRESHOLD_ESCALATE = 0.40  # below this the shape call itself is demoted to "unclear"


@dataclass(frozen=True)
class InterestCandidates:
    """Interests pre-computed in code (brief: set intersections live in code)."""

    shared: list[str] = field(default_factory=list)  # listed by both people
    sender_only: list[str] = field(default_factory=list)  # listed only by person 1 (sender)
    receiver_only: list[str] = field(default_factory=list)  # listed only by person 2 (receiver)

    @property
    def bridge_candidates(self) -> list[str]:
        """Shared first, then cross-side fill, capped — the bridge choice options."""
        fill: list[str] = []
        for interest in self.sender_only + self.receiver_only:
            if len(fill) >= MAX_INTEREST_OPTIONS - len(self.shared):
                break
            fill.append(interest)
        return (self.shared + fill)[:MAX_INTEREST_OPTIONS]

    @property
    def curiosity_candidates(self) -> list[str]:
        """Person 1's interests furthest from person 2's world, capped."""
        return self.sender_only[:MAX_INTEREST_OPTIONS]


def interest_candidates(sender: SharedProfileIn, receiver: SharedProfileIn) -> InterestCandidates:
    sender_set = {interest.casefold() for interest in sender.x}
    receiver_set = {interest.casefold() for interest in receiver.x}
    shared = [i for i in sender.x if i.casefold() in receiver_set]
    sender_only = [i for i in sender.x if i.casefold() not in receiver_set]
    receiver_only = [i for i in receiver.x if i.casefold() not in sender_set]
    return InterestCandidates(shared=shared, sender_only=sender_only, receiver_only=receiver_only)


def shape_questions() -> dict:
    """Stage 1 — one forward pass classifying the relationship shape."""
    return {
        "shape": {
            "type": "choice",
            "instructions": (
                "Reading only the two profile descriptions, what is the professional relationship "
                "between these two people?"
            ),
            "criteria": SHAPE_OPTIONS,
        },
    }


def dimension_questions(candidates: InterestCandidates) -> dict:
    """Stage 2 — one batched forward pass over the two eval-validated questions.

    The measured eval demoted the other dimensions to code logic (app/textmatch.py):
    goal fit, reverse offer→search, stage gap, and the shared-interest choice never
    reached 90% confident-answer precision in two phrasing rounds (EVAL.md). Only the
    1→2 offer→search judgment (31/31 correct) ships as a scored model read; the
    curiosity-gap pick personalizes rung 3 and is hidden when it reads uncertain.
    """
    questions: dict = {
        "offer_search_1_to_2": {
            "type": "noul",
            "instructions": (
                "Does what person 1 can help with match what person 2 is looking for? "
                "Answer true only if person 1's skills are the kind of thing person 2 asked for."
            ),
            "criteria": {
                "true": "person 1 offers the kind of thing person 2 asked for",
                "false": "person 1 does not offer the kind of thing person 2 asked for",
            },
        },
    }

    if candidates.curiosity_candidates:
        questions["curiosity_gap"] = {
            "type": "choice",
            "instructions": (
                "Which of these interests of person 1 is furthest from person 2's own world? "
                "Answer with the interest name itself."
            ),
            "criteria": {
                interest: "an interest of person 1 that person 2's profile says nothing about"
                for interest in candidates.curiosity_candidates
            },
        }

    return questions


def questions_for(question_id: str, set_name: str) -> dict | None:
    """Return the question definition for a given phrasing set (eval harness uses this)."""
    builder = _SET_BUILDERS.get(set_name)
    if builder is None:
        raise KeyError(f"unknown question set: {set_name}")
    return builder().get(question_id)


# Alternative phrasings, measured by eval.py. Registered as full-set builders so a
# variant can reword several questions coherently; each returns the same ids/shapes.
def _default_set() -> dict:
    questions = shape_questions()
    questions.update(dimension_questions(_ALL_CANDIDATES))
    return questions


def _set_b() -> dict:
    questions = _default_set()
    questions["shape"] = {
        "type": "choice",
        "instructions": (
            "Two people meet at an event. Judging strictly from the profile text, which "
            "relationship fits them?"
        ),
        "criteria": SHAPE_OPTIONS,
    }
    return questions


def _set_c() -> dict:
    questions = _default_set()
    questions["offer_search_1_to_2"] = {
        "type": "noul",
        "instructions": (
            "Person 1 can help with certain things. Person 2 is looking for certain things. "
            "Does person 1's offer answer person 2's search?"
        ),
        "criteria": {
            "true": "the offer directly answers the search",
            "false": "the offer does not answer the search",
        },
    }
    return questions


# Synthetic candidates used only so the full question set (with the curiosity question)
# can be enumerated for warm-up and for eval of question phrasing.
_ALL_CANDIDATES = InterestCandidates(shared=["artificial intelligence"], sender_only=["robotics"])


_SET_BUILDERS = {"default": _default_set, "b": _set_b, "c": _set_c}
QUESTION_SET_NAMES = tuple(_SET_BUILDERS)

# Re-export for pipeline use
LABELS = DIMENSION_LABELS
