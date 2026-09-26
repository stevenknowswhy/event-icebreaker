"""Tests for the deterministic text rules that replaced the demoted model dimensions."""

from __future__ import annotations

from conftest import make_profile

from app.textmatch import (
    complementarity_code,
    content_tokens,
    goal_fit_code,
    jaccard,
    offer_search_code,
)


def test_content_tokens_drops_stopwords_and_short_tokens():
    tokens = content_tokens("I am looking for a Seed Capital for my AI startup!")
    assert "seed" in tokens
    assert "capital" in tokens
    assert "startup" in tokens
    assert "for" not in tokens  # stopword
    assert "a" not in tokens  # too short


def test_jaccard_empty_side_is_zero():
    assert jaccard(set(), {"a"}) == 0.0
    assert jaccard({"a"}, set()) == 0.0


def test_offer_search_code_finds_shared_words():
    hit, evidence = offer_search_code("Capital, investor introductions", "Seed capital for robotics")
    assert hit is True
    assert any("capital" in line for line in evidence)


def test_offer_search_code_misses_when_unrelated():
    hit, evidence = offer_search_code("Firmware and supply-chain setup", "Intro to Bay Area robotics meetups")
    assert hit is False
    assert evidence


def test_goal_fit_code_levels():
    same = make_profile(n="A", q="Seed capital for climate hardware")
    also_same = make_profile(n="B", q="Seeking seed capital for climate hardware")
    level, _ = goal_fit_code(same, also_same)
    assert level == 2

    partial = make_profile(n="B", q="Go-to-market help for climate robotics")
    level, _ = goal_fit_code(same, partial)
    assert level == 1  # shares "climate" but not the same pursuit

    other = make_profile(n="B", q="Beginner yoga classes near the office")
    level, _ = goal_fit_code(same, other)
    assert level == 0


def test_goal_fit_code_without_looking_for_lines():
    level, evidence = goal_fit_code(make_profile(n="A"), make_profile(n="B"))
    assert level == 0
    assert evidence == ["Neither profile states what they are looking for"]


def test_complementarity_code_identical_overlapping_and_unrelated():
    a = make_profile(n="A", h="Python backend systems and data pipelines")
    b = make_profile(n="B", h="Python backend systems and developer tooling")
    kind, _ = complementarity_code(a, b, either_direction_fit=False)
    assert kind == "overlapping"

    identical = make_profile(n="B", h="Python backend systems and data pipelines")
    kind, _ = complementarity_code(a, identical, either_direction_fit=False)
    assert kind == "identical"

    unrelated = make_profile(n="B", h="Wedding photography and portrait art")
    kind, _ = complementarity_code(a, unrelated, either_direction_fit=False)
    assert kind == "unrelated"


def test_complementarity_code_claims_complementary_only_with_a_real_fit():
    a = make_profile(n="A", h="Python backend systems and data pipelines")
    b = make_profile(n="B", h="Wedding photography and portrait art")
    kind, _ = complementarity_code(a, b, either_direction_fit=False)
    assert kind == "unrelated"  # no fit found — code must not invent complementarity
    kind, _ = complementarity_code(a, b, either_direction_fit=True)
    assert kind == "complementary"
