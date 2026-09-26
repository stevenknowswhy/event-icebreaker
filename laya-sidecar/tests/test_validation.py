"""Shared-profile request validation tests — mirrors the app's own caps."""

from __future__ import annotations

import pytest
from conftest import make_profile
from pydantic import ValidationError

from app.validation import MatchRequest, validate_shared_profile


def test_valid_full_profile_passes():
    profile = make_profile(
        x=["A", "B", "C"],
        va=["Conviction", "Speed"],
        p=[0.8, 0.6, 0.4, 0.2, 0.9],
    )
    assert validate_shared_profile(profile) is True


def test_openness_must_be_1_to_4():
    with pytest.raises(ValidationError):
        make_profile(o=5)
    with pytest.raises(ValidationError):
        make_profile(o=0)


def test_version_must_be_one():
    with pytest.raises(ValidationError):
        make_profile(v=2)


def test_interest_item_length_cap():
    with pytest.raises(ValidationError):
        make_profile(x=["a" * 51])


def test_interest_count_cap():
    with pytest.raises(ValidationError):
        make_profile(x=[f"i{n}" for n in range(9)])


def test_values_item_length_cap():
    with pytest.raises(ValidationError):
        make_profile(va=["a" * 41])


def test_personality_must_be_five_items():
    with pytest.raises(ValidationError):
        make_profile(p=[0.5, 0.5, 0.5, 0.5])


def test_personality_values_bounded():
    with pytest.raises(ValidationError):
        make_profile(p=[1.5, 0.5, 0.5, 0.5, 0.5])
    with pytest.raises(ValidationError):
        make_profile(p=[-0.1, 0.5, 0.5, 0.5, 0.5])


def test_integer_personality_from_json_is_accepted():
    # JSON.stringify(1.0) → `1`; the p field must accept int-shaped floats.
    profile = make_profile(p=[1, 0.5, 0, 0.5, 1])
    assert profile.p == [1.0, 0.5, 0.0, 0.5, 1.0]


def test_unknown_fields_rejected():
    with pytest.raises(ValidationError):
        make_profile(email="attacker@example.com")


def test_values_count_cap():
    # The app allows up to 6 values (VALUES_MAX_ITEMS in lib/icebreaker.ts).
    with pytest.raises(ValidationError):
        make_profile(va=[f"v{n}" for n in range(7)])


def test_unknown_fields_at_match_level_rejected():
    with pytest.raises(ValidationError):
        MatchRequest.model_validate(
            {
                "sender": make_profile().model_dump(),
                "receiver": make_profile().model_dump(),
                "intent": "match",
            }
        )


def test_empty_names_rejected():
    with pytest.raises(ValidationError):
        make_profile(n="")
