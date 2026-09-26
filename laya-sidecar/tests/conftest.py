"""Shared fixtures: realistic profiles, a scriptable fake agent, and app clients.

The fake agent derives valid answers from the question definitions themselves
(choice → first option, score → middle level, noul → 0.9), so pipeline changes that
alter question shapes fail loudly instead of silently passing on stale canned data.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.pipeline import MatchPipeline
from app.validation import MatchRequest, SharedProfileIn

HIGH = 0.9  # confident fake answers
LOW = 0.4  # low-confidence fake answers


def make_profile(**overrides) -> SharedProfileIn:
    base: dict = {
        "v": 1,
        "n": "Sample Person",
        "o": 4,
        "i": "networking",
        "x": ["Artificial Intelligence"],
        "r": None,
        "s": None,
        "sd": None,
        "h": None,
        "q": None,
        "va": None,
        "c": None,
        "f": None,
        "p": None,
    }
    base.update(overrides)
    return SharedProfileIn(**base)


INVESTOR = make_profile(
    n="Vera Venture",
    x=["Venture Capital", "Artificial Intelligence", "Climate"],
    r="Partner at a seed-stage climate fund",
    h="Capital, investor introductions, fundraising coaching",
    q="Founders applying AI to grid resilience and climate hardware",
    va=["Conviction", "Speed"],
    c="Direct, fast, asks hard questions early",
)

FOUNDER = make_profile(
    n="Sam Builder",
    x=["Robotics", "Climate Hardware", "Artificial Intelligence"],
    r="Founder of an early-stage robotics startup",
    h="Prototype engineering, firmware, supply-chain setup",
    q="Seed capital and go-to-market help for climate robotics",
    va=["Building", "Honesty"],
    c="Warm, curious, detail-first",
)

SPARSE = make_profile(
    n="Quiet Attendee",
    o=1,
    x=["Hiking"],
)

PEER = make_profile(
    n="Pat Peer",
    x=["Artificial Intelligence", "Agents"],
    r="AI engineer at a mid-size platform company",
    h="Agent evaluation pipelines, LLM ops",
    q="Peers working on agent reliability benchmarks",
)


class FakeAgent:
    """Scriptable agent: derives answers from question shapes, applies overrides."""

    def __init__(self, **overrides):
        self.overrides = overrides
        self.calls: list[tuple] = []

    def predict(self, state, questions) -> dict:
        self.calls.append((state, dict(questions)))
        answers = {}
        for qid, question in questions.items():
            override = self.overrides.get(qid, {})
            base = self._default_answer(question)
            base.update(override)
            answers[qid] = base
        return {"answers": answers}

    @staticmethod
    def _default_answer(question: dict) -> dict:
        kind = question["type"]
        if kind == "choice":
            first_option = next(iter(question["criteria"]))
            return {"choice": first_option, "confidence": HIGH}
        if kind == "score":
            return {"score": 1.0, "confidence": HIGH}
        if kind == "noul":
            return {"noul": HIGH, "confidence": HIGH}
        raise ValueError(f"unknown question type: {kind}")

    def ready(self) -> bool:
        return True


@pytest.fixture
def investor_founder() -> tuple[SharedProfileIn, SharedProfileIn]:
    return INVESTOR, FOUNDER


@pytest.fixture
def fake_agent() -> FakeAgent:
    return FakeAgent()


@pytest.fixture
def pipeline(fake_agent: FakeAgent) -> MatchPipeline:
    return MatchPipeline(fake_agent)


@pytest.fixture
def match_request(investor_founder) -> MatchRequest:
    sender, receiver = investor_founder
    return MatchRequest(sender=sender, receiver=receiver)


@pytest.fixture
def client(fake_agent: FakeAgent) -> TestClient:
    """App with an injected agent — no model load, no warming state."""
    return TestClient(create_app(agent=fake_agent))
