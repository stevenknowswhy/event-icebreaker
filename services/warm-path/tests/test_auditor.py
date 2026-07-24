from app.auditor import apply_audit, claim_fingerprint
from app.models import (
    AuditArtifact,
    AuditDecision,
    CandidatePath,
    Citation,
    PublicEdge,
)


def candidate() -> CandidatePath:
    return CandidatePath(
        contact_name="Maya Chen",
        explanation="Publicly documented program overlap.",
        uncertainty="The evidence does not prove they know each other.",
        edges=[
            PublicEdge(
                **{
                    "from": "Maya Chen",
                    "relationship": "mentor",
                    "to": "Civic Futures",
                    "citations": [
                        Citation(
                            title="Mentors",
                            url="https://evidence.example/mentors",
                        )
                    ],
                }
            )
        ],
        intro_request="Would you be comfortable helping?",
        evidence_completeness=0.9,
        path_directness=0.9,
        target_relevance=0.9,
        evidence_recency=0.9,
        identity_confidence=0.95,
    )


def test_auditor_cannot_introduce_or_substitute_claims() -> None:
    item = candidate()
    audit = AuditArtifact(
        decisions=[
            AuditDecision(
                path_index=0,
                decision="approve",
                reason="Looks supported",
                allowed_claim_fingerprints=["invented-claim"],
            )
        ]
    )
    assert apply_audit([item], audit) == []


def test_downgrade_caps_confidence() -> None:
    item = candidate()
    audit = AuditArtifact(
        decisions=[
            AuditDecision(
                path_index=0,
                decision="downgrade",
                reason="Common name creates identity uncertainty",
                allowed_claim_fingerprints=[claim_fingerprint(item)],
            )
        ]
    )
    [result] = apply_audit([item], audit)
    assert result.identity_confidence == 0.64
    assert result.evidence_completeness == 0.69
