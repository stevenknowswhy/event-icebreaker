"""Guardrail tests: regex cascade, threshold mapping, model backstop."""

from __future__ import annotations

from app.guardrails import (
    CONTACT_PATTERNS,
    evaluate_guardrails,
    guardrail_questions,
    regex_contact_hits,
)


def test_regex_email_hit():
    assert "email" in regex_contact_hits("reach me at vera@example.com anytime")


def test_regex_url_hit():
    assert "url" in regex_contact_hits("check out https://veraventure.xyz for more")
    assert "url" in regex_contact_hits("my site is www.veraventure.xyz")


def test_regex_handle_hit():
    assert "handle" in regex_contact_hits("find me @veraventure on the apps")


def test_regex_phone_hit():
    assert "phone" in regex_contact_hits("call +1 415 555 0123")


def test_clean_text_has_no_hits():
    assert regex_contact_hits("Capital, investor introductions, fundraising coaching") == []


def test_guardrail_questions_are_noul_with_binary_criteria():
    questions = guardrail_questions()
    assert set(questions) == {"contact", "tone"}
    for question in questions.values():
        assert question["type"] == "noul"
        assert set(question["criteria"]) == {"true", "false"}


def test_regex_hit_forces_contact_present_even_when_model_disagrees():
    answers = {
        "contact": {"noul": 0.1, "confidence": 0.9},
        "tone": {"noul": 0.1, "confidence": 0.9},
    }
    result = evaluate_guardrails("email me at a@b.co", answers)
    assert result.contact.present is True
    assert result.contact.matched == ["email"]
    assert result.contact.confidence == 1.0
    assert result.tone.present is False


def test_model_backstop_flags_contact_without_regex_hit():
    answers = {
        "contact": {"noul": 0.8, "confidence": 0.9},
        "tone": {"noul": 0.1, "confidence": 0.9},
    }
    result = evaluate_guardrails("just DM me and I will send my details", answers)
    assert result.contact.present is True  # model yes crosses the 0.6 threshold
    assert result.contact.matched == []


def test_tone_mapping_respects_threshold():
    answers = {
        "contact": {"noul": 0.1, "confidence": 0.9},
        "tone": {"noul": 0.55, "confidence": 0.9},
    }
    assert evaluate_guardrails("mild text", answers).tone.present is False
    answers = {
        "contact": {"noul": 0.1, "confidence": 0.9},
        "tone": {"noul": 0.61, "confidence": 0.9},
    }
    assert evaluate_guardrails("rude text", answers).tone.present is True


def test_contact_patterns_are_named_kinds():
    kinds = [kind for kind, _ in CONTACT_PATTERNS]
    assert kinds == ["email", "url", "handle", "phone"]
