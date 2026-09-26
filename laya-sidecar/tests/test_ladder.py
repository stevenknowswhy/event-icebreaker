"""Ladder tests: bank invariants, professional-room screening, rung→dimension tracing."""

from __future__ import annotations

import pytest
from conftest import FOUNDER, INVESTOR, SPARSE, make_profile

from app.compose import MatchInputs, ShapeCall, build_dimensions
from app.ladder import (
    BANK,
    BRIDGE_GENERIC_MOVE,
    BRIDGE_INTEREST_MOVE,
    best_first_move,
    build_ladder,
)
from app.questions import interest_candidates
from app.schemas import (
    DIM_BRIDGE,
    DIM_COMPLEMENTARITY,
    DIM_CURIOSITY_GAP,
    DIM_GOAL_FIT,
    DIM_OFFER_SEARCH,
    DIMENSION_IDS,
)

# Words that must never appear in a professional event setting (Aron's original set
# includes death/regret/family items — the bank borrows the curve, not the payload).
FORBIDDEN_SUBSTRINGS = (
    "death",
    "die",
    "dying",
    "funeral",
    "regret",
    "family history",
    "your mother",
    "your father",
    "your parents",
    "childhood home",
    "last argument",
    "wish you had",
)

ALL_TAGS = {
    DIM_BRIDGE,
    DIM_GOAL_FIT,
    DIM_COMPLEMENTARITY,
    DIM_OFFER_SEARCH,
    DIM_CURIOSITY_GAP,
}


def test_bank_has_thirteen_entries_across_three_rungs():
    assert len(BANK) == 13
    by_rung = {1: 0, 2: 0, 3: 0}
    for entry in BANK:
        by_rung[entry.rung] += 1
    assert by_rung == {1: 4, 2: 6, 3: 3}


def test_every_bank_entry_is_tagged_to_a_real_dimension():
    for entry in BANK:
        assert entry.tag in ALL_TAGS


def test_every_bank_entry_is_ask_each_other():
    for entry in BANK:
        assert entry.question.startswith("Ask each other"), entry.question


def test_bank_is_professional_room_safe():
    for entry in BANK:
        text = f"{entry.question} {entry.why}".lower()
        for forbidden in FORBIDDEN_SUBSTRINGS:
            assert forbidden not in text, f"{forbidden!r} in: {entry.question}"


def test_rendered_entries_never_leak_unfilled_slots():
    for entry in BANK:
        rendered = entry.render(interest="Open Source")
        assert "{" not in rendered.question
        assert "{" not in rendered.why


def make_inputs(sender, receiver, kind="peer", conf=0.9, answers=None) -> MatchInputs:
    return MatchInputs(
        sender=sender,
        receiver=receiver,
        candidates=interest_candidates(sender, receiver),
        shape=ShapeCall(kind=kind, confidence=conf, escalated=False),
        answers=answers if answers is not None else answers_for(sender, receiver),
    )


def answers_for(sender, receiver, **overrides):
    from app.questions import dimension_questions

    questions = dimension_questions(interest_candidates(sender, receiver))
    answers = {}
    for qid, question in questions.items():
        kind = question["type"]
        if kind == "choice":
            answers[qid] = {"choice": next(iter(question["criteria"])), "confidence": 0.9}
        elif kind == "score":
            answers[qid] = {"score": 1.0, "confidence": 0.9}
        else:
            answers[qid] = {"noul": 0.9, "confidence": 0.9}
    answers.update(overrides)
    return answers


def test_build_ladder_returns_exactly_rungs_two_and_three():
    dims = build_dimensions(make_inputs(INVESTOR, FOUNDER))
    ladder = build_ladder(dims, "Climate")
    assert [rung.level for rung in ladder] == [2, 3]


def test_rung_two_traces_to_offer_search_when_both_directions():
    # 1→2 model read says yes (FakeAgent noul 0.9) and the 2→1 code rule finds a token
    # match both ways → "Useful in both directions" outranks the skills rung.
    sender = make_profile(
        n="C One",
        h="Climate hardware prototyping",
        q="Seed capital for climate hardware",
    )
    receiver = make_profile(
        n="D Two",
        h="Seed capital diligence",
        q="Climate hardware prototyping help",
    )
    dims = build_dimensions(make_inputs(sender, receiver))
    ladder = build_ladder(dims, None)
    lowered = ladder[0].question.lower()
    assert "problem" in lowered  # FIT_BOTH_DIRECTIONS entry


def test_rung_two_traces_to_offer_search_when_one_direction():
    # Overlapping skills (so the code rule is not "complementary") plus a code-found 2→1
    # fit while the 1→2 model read misses → the one-direction offer→search rung fires.
    sender = make_profile(
        n="C One",
        h="Agent evaluation pipelines and LLM ops",
        q="Peer review for agent reliability benchmarks",
    )
    receiver = make_profile(
        n="D Two",
        h="Agent evaluation pipelines and developer tooling",
        q="Feedback on enterprise sales decks",
    )
    answers = answers_for(sender, receiver)
    answers["offer_search_1_to_2"] = {"noul": 0.1, "confidence": 0.9}
    dims = build_dimensions(make_inputs(sender, receiver, answers=answers))
    ladder = build_ladder(dims, None)
    assert "door" in ladder[0].question.lower()  # FIT_ONE_DIRECTION entry


def test_rung_two_traces_to_complementarity_when_complementary():
    # Code rule: different skills (no h overlap) but the 2→1 offer→search rule finds a
    # real fit (both mention "grant") → "Complementary skills" outranks one-direction.
    sender = make_profile(
        n="E One",
        h="Grant writing and community organizing",
        q="Mentorship for first-time founders",
    )
    receiver = make_profile(
        n="F Two",
        h="Startup operations and hiring",
        q="Help running a grant program",
    )
    dims = build_dimensions(make_inputs(sender, receiver))
    ladder = build_ladder(dims, None)
    assert "skills" in ladder[0].question.lower()


def test_sparse_profiles_yield_generic_but_safe_rungs():
    dims = build_dimensions(make_inputs(SPARSE, SPARSE))
    ladder = build_ladder(dims, None)
    for rung in ladder:
        assert rung.question  # non-empty
        assert "{" not in rung.question  # no unfilled slots
        text = rung.question.lower()
        for forbidden in FORBIDDEN_SUBSTRINGS:
            assert forbidden not in text


def test_rung_three_why_cites_curiosity_gap():
    dims = build_dimensions(make_inputs(INVESTOR, FOUNDER))
    ladder = build_ladder(dims, "Robotics")
    assert "Robotics" in ladder[1].why or "Robotics" in ladder[1].question


def test_rung_selection_is_deterministic():
    dims = build_dimensions(make_inputs(INVESTOR, FOUNDER))
    a = build_ladder(dims, "Climate")
    b = build_ladder(dims, "Climate")
    assert [(r.question, r.why) for r in a] == [(r.question, r.why) for r in b]


def test_best_first_move_uses_bridge_interest():
    shape = ShapeCall(kind="peer", confidence=0.9, escalated=False)
    move = best_first_move("Climate", shape)
    assert "Climate" in move
    assert move == BANK[BRIDGE_INTEREST_MOVE].render(interest="Climate").question


def test_best_first_move_generic_when_no_bridge():
    shape = ShapeCall(kind="peer", confidence=0.9, escalated=False)
    move = best_first_move(None, shape)
    assert move == BANK[BRIDGE_GENERIC_MOVE].render().question
    assert "{" not in move


def test_investor_flavored_first_move():
    shape = ShapeCall(kind="investor", confidence=0.9, escalated=False)
    move = best_first_move("Climate", shape)
    assert "Climate" in move
    assert "back" in move or "build" in move


@pytest.mark.parametrize("dim_id", sorted(DIMENSION_IDS))
def test_non_stage_dimensions_have_bank_coverage(dim_id):
    # stage_gap intentionally has no rung (context, not a conversation seed).
    tags = {entry.tag for entry in BANK}
    if dim_id != "stage_gap":
        assert dim_id in tags
