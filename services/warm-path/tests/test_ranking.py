from app.models import CandidatePath, Citation, PublicEdge
from app.ranking import rank_paths


def path(name: str, score: float, confidence: float = 0.9) -> CandidatePath:
    return CandidatePath(
        contact_name=name,
        explanation="A cited professional overlap is worth asking about.",
        uncertainty="Public overlap does not prove a personal relationship.",
        edges=[
            PublicEdge(
                **{
                    "from": name,
                    "relationship": "program mentor",
                    "to": "Civic Futures",
                    "citations": [
                        Citation(
                            title="Mentor directory",
                            url="https://evidence.example/mentors",
                        )
                    ],
                }
            )
        ],
        intro_request="Would you be comfortable helping with an introduction?",
        evidence_completeness=score,
        path_directness=score,
        target_relevance=score,
        evidence_recency=score,
        identity_confidence=confidence,
    )


def test_ranking_uses_approved_weights_and_limits_results() -> None:
    ranked = rank_paths(
        [path("Low", 0.4), path("Best", 0.95), path("Mid", 0.65), path("Fourth", 0.6)]
    )
    assert [item.contact_name for item in ranked] == ["Best", "Mid", "Fourth"]
    assert ranked[0].strength == "strong"


def test_strong_requires_high_identity_confidence() -> None:
    ranked = rank_paths([path("Ambiguous Alex", 0.95, confidence=0.6)])
    assert ranked[0].strength == "possible"


def test_empty_candidates_return_honest_empty_result() -> None:
    assert rank_paths([]) == []
