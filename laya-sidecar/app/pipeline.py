"""The three-stage deep pipeline: shape pass → dimension pass → composition.

Exactly two Laya forward passes per request (the brief: one combined call per stage),
then deterministic Python composition. The agent is injected so tests run without
weights and the lock lives in one place.
"""

from __future__ import annotations

from typing import Protocol

from app.compose import (
    MatchInputs,
    build_dimensions,
    classify_shape,
    compose,
)
from app.ladder import best_first_move, build_ladder
from app.questions import dimension_questions, interest_candidates, shape_questions
from app.schemas import MatchDossierOut
from app.state import pair_state
from app.validation import MatchRequest


class AgentLike(Protocol):
    def predict(self, state, questions) -> dict: ...


class MatchPipeline:
    def __init__(self, agent: AgentLike) -> None:
        self._agent = agent

    def run(self, request: MatchRequest) -> MatchDossierOut:
        sender, receiver = request.sender, request.receiver
        state = pair_state(sender, receiver)
        candidates = interest_candidates(sender, receiver)

        # Stage 1 — shape: one forward pass.
        shape_answer = self._agent.predict(state, shape_questions())["answers"]["shape"]
        shape = classify_shape(shape_answer)

        # Stage 2 — dimensions: one batched forward pass.
        answers = self._agent.predict(state, dimension_questions(candidates))["answers"]

        # Stage 3 — composition: pure Python, no model.
        inputs = MatchInputs(
            sender=sender,
            receiver=receiver,
            candidates=candidates,
            shape=shape,
            answers=answers,
        )
        dimensions = build_dimensions(inputs)
        bridge = next((d.detail.interest for d in dimensions if d.id == "bridge" and d.detail), None)
        curiosity = next(
            (d.detail.interest for d in dimensions if d.id == "curiosity_gap" and d.detail), None
        )
        move = best_first_move(bridge, shape)
        ladder = build_ladder(dimensions, curiosity)
        return compose(inputs, dimensions, ladder, move)
