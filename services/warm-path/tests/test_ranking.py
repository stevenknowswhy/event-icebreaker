from app.models import CandidateEdge, CandidatePath, Citation, PublicEdge, TargetSummary
from app.ranking import rank_paths

TARGET = TargetSummary(name="Elena Park", url="https://fund.example/elena")


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
                    "to": "Elena Park",
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
        [
            path("Low", 0.4),
            path("Best", 0.95),
            path("Mid", 0.65),
            path("Fourth", 0.6),
        ],
        TARGET,
    )
    assert [item.contact_name for item in ranked] == ["Best", "Mid", "Fourth"]
    assert ranked[0].strength == "strong"


def test_strong_requires_high_identity_confidence() -> None:
    ranked = rank_paths([path("Ambiguous Alex", 0.95, confidence=0.6)], TARGET)
    assert ranked[0].strength == "possible"


def test_empty_candidates_return_honest_empty_result() -> None:
    assert rank_paths([], TARGET) == []


def test_uncited_candidate_is_removed_instead_of_failing_the_run() -> None:
    item = path("Maya", 0.9)
    item.edges = [
        CandidateEdge(
            **{
                "from": "Maya",
                "relationship": "claims to know",
                "to": "Elena Park",
                "citations": [],
            }
        )
    ]
    assert rank_paths([item], TARGET) == []


def test_cited_candidate_edges_are_promoted_to_public_edges() -> None:
    item = path("Maya", 0.9)
    item.edges = [
        CandidateEdge(
            **{
                "from": "Maya",
                "relationship": "program mentor",
                "to": "Elena Park",
                "citations": [
                    Citation(
                        title="Mentor directory",
                        url="https://evidence.example/mentors",
                    )
                ],
            }
        )
    ]

    ranked = rank_paths([item], TARGET)

    assert isinstance(ranked[0].edges[0], PublicEdge)


def test_broken_and_circular_routes_are_removed() -> None:
    broken = path("Maya", 0.9)
    broken.edges = [
        PublicEdge(
            **{
                "from": "Maya",
                "relationship": "mentor",
                "to": "Civic Futures",
                "citations": [
                    Citation(title="Program", url="https://evidence.example/program")
                ],
            }
        ),
        PublicEdge(
            **{
                "from": "Different Entity",
                "relationship": "advisor",
                "to": "Elena Park",
                "citations": [
                    Citation(title="Advisor", url="https://evidence.example/advisor")
                ],
            }
        ),
    ]
    circular = path("Maya", 0.9)
    circular.edges = [
        PublicEdge(
            **{
                "from": "Maya",
                "relationship": "mentor",
                "to": "Civic Futures",
                "citations": [
                    Citation(title="Program", url="https://evidence.example/program")
                ],
            }
        ),
        PublicEdge(
            **{
                "from": "Civic Futures",
                "relationship": "lists",
                "to": "Maya",
                "citations": [
                    Citation(title="Directory", url="https://evidence.example/list")
                ],
            }
        ),
    ]
    assert rank_paths([broken, circular], TARGET) == []
