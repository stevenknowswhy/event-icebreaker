from __future__ import annotations

import hashlib

from app.models import AuditArtifact, CandidatePath


def claim_fingerprint(path: CandidatePath) -> str:
    claims = "|".join(
        f"{edge.from_}\u241f{edge.relationship}\u241f{edge.to}" for edge in path.edges
    )
    return hashlib.sha256(claims.encode()).hexdigest()


def apply_audit(
    candidates: list[CandidatePath], audit: AuditArtifact
) -> list[CandidatePath]:
    """Apply decisions without allowing the auditor to introduce a claim."""
    accepted: list[CandidatePath] = []
    decisions = {decision.path_index: decision for decision in audit.decisions}
    for index, candidate in enumerate(candidates):
        decision = decisions.get(index)
        if decision is None or decision.decision == "reject":
            continue
        fingerprint = claim_fingerprint(candidate)
        if fingerprint not in decision.allowed_claim_fingerprints:
            continue
        if decision.decision == "downgrade":
            candidate = candidate.model_copy(
                update={
                    "identity_confidence": min(candidate.identity_confidence, 0.64),
                    "evidence_completeness": min(candidate.evidence_completeness, 0.69),
                }
            )
        accepted.append(candidate)
    return accepted
