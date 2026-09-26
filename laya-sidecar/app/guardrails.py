"""Save-time guardrails — advisory, never blocking.

Two judgments per free-text field:
1. pasted contact info — the app's one real privacy footgun (a forever-valid URL in a
   shared profile). Detection is primarily deterministic (regex — the brief's rule:
   code resolves what code resolves); the model adds a backstop for prose invitations
   like "DM me" that regex cannot see.
2. tone that would read wrong in a professional room — a model (noul) judgment.

Both judgments ride ONE predict call. A regex hit forces contact.present regardless of
the model. Unreachable model never fails a save — the caller treats errors as pass.
"""

from __future__ import annotations

import re

from app.schemas import GuardrailContactOut, GuardrailsOut, GuardrailToneOut

# Deterministic contact detection. Ordered, named kinds for the `matched` list.
CONTACT_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("email", re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)),
    ("url", re.compile(r"(?:https?://|www\.)[^\s]+", re.IGNORECASE)),
    ("handle", re.compile(r"(?:^|\s)@[A-Za-z0-9_]{3,}")),
    ("phone", re.compile(r"(?<!\d)(?:\+?\d[\d\-(). ]{6,}\d)(?!\d)")),
]

CONTACT_QUESTION = {
    "contact": {
        "type": "noul",
        "instructions": (
            "Does this profile text contain, or invite the reader toward, a way to contact the "
            "person outside this app — such as an email address, phone number, link, or social "
            "handle?"
        ),
        "criteria": {
            "true": "the text contains or invites direct contact details",
            "false": "the text has no contact details in it",
        },
    },
    "tone": {
        "type": "noul",
        "instructions": (
            "Would this profile text read as inappropriate, offensive, or uncomfortable in a "
            "professional setting at a live event?"
        ),
        "criteria": {
            "true": "the tone would read wrong in a professional room",
            "false": "the tone is fine for a professional room",
        },
    },
}

TONE_YES_THRESHOLD = 0.6  # advisory only — chosen low-cost-of-miss per the brief's guidance
CONTACT_YES_THRESHOLD = 0.6


def regex_contact_hits(text: str) -> list[str]:
    return [kind for kind, pattern in CONTACT_PATTERNS if pattern.search(text)]


def guardrail_questions() -> dict:
    return {k: dict(v) for k, v in CONTACT_QUESTION.items()}


def evaluate_guardrails(text: str, answers: dict) -> GuardrailsOut:
    """Map one Laya forward pass (+ deterministic regex) to the response contract."""
    matched = regex_contact_hits(text)
    contact_p = float(answers["contact"]["noul"])
    contact_conf = max(1.0 if matched else 0.0, contact_p)
    contact = GuardrailContactOut(
        present=bool(matched) or contact_p >= CONTACT_YES_THRESHOLD,
        confidence=contact_conf,
        matched=matched,
    )

    tone_p = float(answers["tone"]["noul"])
    tone = GuardrailToneOut(
        present=tone_p >= TONE_YES_THRESHOLD,
        confidence=tone_p,
    )
    return GuardrailsOut(contact=contact, tone=tone)
