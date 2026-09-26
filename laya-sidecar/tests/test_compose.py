"""Composition module tests: weight sums, bands, thresholds, evidence tracing, escalation."""

from __future__ import annotations

import pytest
from conftest import FOUNDER, INVESTOR, make_profile

from app.compose import (
    BAND_SOME_MIN,
    BAND_STRONG_MIN,
    WEIGHTS,
    MatchInputs,
    ShapeCall,
    band_of,
    build_dimensions,
    classify_shape,
    compose,
    low_dimensions,
    subscores,
)
from app.questions import DIMENSION_THRESHOLDS, interest_candidates
from app.schemas import DIMENSION_IDS

# --- weight tables -------------------------------------------------------------------


def test_every_weight_row_sums_to_one():
    for shape, row in WEIGHTS.items():
        assert sum(row.values()) == pytest.approx(1.0), f"{shape} weights must sum to 1"


def test_every_weight_row_covers_exactly_the_scored_dimensions():
    # Curiosity_gap is display-only (unweighted everywhere); demoted dims are excluded.
    scored = ("bridge", "complementarity", "offer_search")
    for shape, row in WEIGHTS.items():
        assert set(row) == set(scored), f"{shape} row keys drifted"


def test_demoted_dimensions_have_no_weight_in_any_row():
    # stage_gap (eval round 1) and goal_fit (eval round 2) carry no score weight.
    for row in WEIGHTS.values():
        assert "stage_gap" not in row
        assert "goal_fit" not in row


# --- bands and thresholds -------------------------------------------------------------


@pytest.mark.parametrize(
    ("score", "expected"),
    [
        (0, "low"),
        (39, "low"),
        (40, "some"),
        (BAND_SOME_MIN, "some"),
        (69, "some"),
        (BAND_STRONG_MIN, "strong"),
        (100, "strong"),
    ],
)
def test_band_boundaries(score, expected):
    assert band_of(score) == expected


def test_classify_shape_confident_routes_clean():
    call = classify_shape({"choice": "investor", "confidence": 0.8})
    assert call.effective_kind == "investor"
    assert not call.escalated


def test_classify_shape_unclear_kind_escalates():
    call = classify_shape({"choice": "unclear", "confidence": 0.95})
    assert call.effective_kind == "unclear"
    assert call.escalated


def test_classify_shape_below_escalate_threshold_demotes():
    call = classify_shape({"choice": "peer", "confidence": 0.15})
    assert call.effective_kind == "unclear"
    assert call.escalated


def test_classify_shape_between_demote_and_route_is_flagged_but_named():
    call = classify_shape({"choice": "peer", "confidence": 0.50})
    assert call.effective_kind == "peer"  # kind holds
    assert call.escalated  # but the dossier is flagged


def test_classify_shape_confidences_below_demote_line_are_unclear():
    call = classify_shape({"choice": "peer", "confidence": 0.25})
    assert call.effective_kind == "unclear"
    assert call.escalated


def test_classify_shape_rejects_unknown_kind():
    with pytest.raises(ValueError, match="unknown shape"):
        classify_shape({"choice": "nemesis", "confidence": 0.99})


# --- subscores ------------------------------------------------------------------------


def make_inputs(sender, receiver, answers, shape_conf=0.9, kind="peer") -> MatchInputs:
    return MatchInputs(
        sender=sender,
        receiver=receiver,
        candidates=interest_candidates(sender, receiver),
        shape=ShapeCall(kind=kind, confidence=shape_conf, escalated=False),
        answers=answers,
    )


# Only the two eval-validated questions remain in the dimension pass; the rest of the
# dossier is code logic (app/textmatch.py), so no answers exist for it to ignore.
DIM_ANSWERS = {
    "offer_search_1_to_2": {"noul": 0.9, "confidence": 0.9},
    "curiosity_gap": {"choice": "Venture Capital", "confidence": 0.9},
}


def test_subscores_mapping():
    values = subscores(make_inputs(INVESTOR, FOUNDER, DIM_ANSWERS))
    # goal_fit no longer ships at all: model 34–37%, token code 14% (EVAL.md).
    assert "goal_fit" not in values
    # Code rule: no skill overlap, but the validated 1→2 model read found a fit.
    assert values["complementarity"] == pytest.approx(1.0)
    assert values["offer_search"] == pytest.approx(0.45)  # mean(0.9 model, 0 code)
    assert values["curiosity_gap"] == pytest.approx(1.0)  # gap exists
    # "Artificial Intelligence" is listed by both → shared bridge
    assert values["bridge"] == pytest.approx(1.0)


def test_bridge_adjacent_interest_scores_half():
    sender = make_profile(n="A One", x=["Hiking"])
    receiver = make_profile(n="B Two", x=["Kayaking"])
    values = subscores(make_inputs(sender, receiver, DIM_ANSWERS))
    assert values["bridge"] == pytest.approx(0.5)


def test_bridge_absent_scores_zero():
    sender = make_profile(n="A One", x=[])
    receiver = make_profile(n="B Two", x=[])
    values = subscores(make_inputs(sender, receiver, DIM_ANSWERS))
    assert values["bridge"] == pytest.approx(0.0)


# --- evidence tracing -------------------------------------------------------------------


def test_evidence_quotes_actual_profile_lines():
    dims = build_dimensions(make_inputs(INVESTOR, FOUNDER, DIM_ANSWERS))
    # The looking-for lines survive only as offer→search evidence — goal_fit is demoted.
    assert all(d.id != "goal_fit" for d in dims)
    offer = next(d for d in dims if d.id == "offer_search")
    assert any("climate" in line.lower() for line in offer.evidence)
    comp = next(d for d in dims if d.id == "complementarity")
    assert any("fundraising coaching" in line for line in comp.evidence)
    assert all(d.id != "stage_gap" for d in dims)


def test_demoted_dimensions_are_deterministic():
    # Code-decided dimensions ride at confidence 1.0: honest about being code, not model.
    dims = build_dimensions(make_inputs(INVESTOR, FOUNDER, DIM_ANSWERS))
    for dim_id in ("bridge", "complementarity"):
        dim = next(d for d in dims if d.id == dim_id)
        assert dim.confidence == 1.0, dim_id


def test_bridge_dimension_carries_detail():
    dims = build_dimensions(make_inputs(INVESTOR, FOUNDER, DIM_ANSWERS))
    bridge = next(d for d in dims if d.id == "bridge")
    assert bridge.detail is not None
    assert bridge.detail.interest == "Artificial Intelligence"
    curiosity = next(d for d in dims if d.id == "curiosity_gap")
    assert curiosity.detail is not None
    assert curiosity.detail.interest == "Venture Capital"


def test_deterministic_absence_confidence_is_one():
    # No interests at all → no shared_interest question → absence is certain, not uncertain.
    answers = {
        k: v
        for k, v in DIM_ANSWERS.items()
        if k not in ("shared_interest", "curiosity_gap")
    }
    sender = make_profile(n="Blank A", x=[])
    receiver = make_profile(n="Blank B", x=[])
    dims = build_dimensions(make_inputs(sender, receiver, answers))
    bridge = next(d for d in dims if d.id == "bridge")
    curiosity = next(d for d in dims if d.id == "curiosity_gap")
    assert bridge.confidence == 1.0
    assert bridge.detail is None
    assert curiosity.confidence == 1.0
    assert curiosity.detail is None


# --- escalation -------------------------------------------------------------------------


def test_escalation_two_low_dimensions():
    # Only the two model reads can go low: offer_search (threshold 0.5) and
    # curiosity_gap (0.4). Code dimensions ride at 1.0 and never escalate.
    answers = {
        **DIM_ANSWERS,
        "offer_search_1_to_2": {"noul": 0.9, "confidence": 0.3},  # under 0.5
        "curiosity_gap": {"choice": "Venture Capital", "confidence": 0.3},  # under 0.4
    }
    inputs = make_inputs(INVESTOR, FOUNDER, answers)
    dims = build_dimensions(inputs)
    assert len(low_dimensions(dims)) == 2


def test_compose_escalates_on_two_low_dimensions():
    answers = {
        **DIM_ANSWERS,
        "offer_search_1_to_2": {"noul": 0.9, "confidence": 0.3},
        "curiosity_gap": {"choice": "Venture Capital", "confidence": 0.3},
    }
    inputs = make_inputs(INVESTOR, FOUNDER, answers)
    dossier = compose(inputs, build_dimensions(inputs), [], "ask something")
    assert dossier.escalated is True


def test_compose_does_not_escalate_on_one_low_dimension():
    answers = {
        **DIM_ANSWERS,
        "curiosity_gap": {"choice": "Venture Capital", "confidence": 0.3},  # exactly one low
    }
    inputs = make_inputs(INVESTOR, FOUNDER, answers)
    dossier = compose(inputs, build_dimensions(inputs), [], "ask something")
    assert dossier.escalated is False


def test_compose_escalates_when_shape_demoted():
    inputs = make_inputs(INVESTOR, FOUNDER, DIM_ANSWERS, shape_conf=0.5, kind="peer")
    inputs.shape = ShapeCall(kind="peer", confidence=0.5, escalated=True, demoted=True)
    dossier = compose(inputs, build_dimensions(inputs), [], "ask something")
    assert dossier.escalated is True
    assert dossier.shape.kind == "unclear"


def test_compose_score_is_weighted_sum():
    inputs = make_inputs(INVESTOR, FOUNDER, DIM_ANSWERS)
    weights = WEIGHTS[inputs.shape.effective_kind]
    values = subscores(inputs)
    expected = round(100 * sum(weights[k] * values[k] for k in weights))
    dossier = compose(inputs, build_dimensions(inputs), [], "ask something")
    assert dossier.score.value == expected
    # stage_gap and goal_fit are demoted and render nowhere; the other four always ship.
    assert {d.id for d in dossier.dimensions} == set(DIMENSION_IDS) - {"stage_gap", "goal_fit"}


def test_thresholds_cover_all_dimensions():
    assert set(DIMENSION_THRESHOLDS) == set(DIMENSION_IDS)
