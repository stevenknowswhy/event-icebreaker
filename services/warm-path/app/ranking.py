from __future__ import annotations

from app.models import CandidatePath, RankedPath

WEIGHTS = {
    "evidence_completeness": 0.35,
    "path_directness": 0.25,
    "target_relevance": 0.20,
    "evidence_recency": 0.10,
    "identity_confidence": 0.10,
}


def score_path(path: CandidatePath) -> float:
    return sum(getattr(path, field) * weight for field, weight in WEIGHTS.items())


def strength_for(path: CandidatePath, score: float) -> str:
    fully_cited = all(edge.citations for edge in path.edges)
    if score >= 0.8 and fully_cited and path.identity_confidence >= 0.85:
        return "strong"
    if score >= 0.55:
        return "possible"
    return "tentative"


def rank_paths(paths: list[CandidatePath]) -> list[RankedPath]:
    valid = [
        path
        for path in paths
        if 1 <= len(path.edges) <= 3
        and all(edge.citations for edge in path.edges)
        and path.intro_request.strip()
    ]
    ordered = sorted(
        valid,
        key=lambda path: (-score_path(path), path.contact_name.casefold()),
    )
    return [
        RankedPath(
            contact_name=path.contact_name,
            strength=strength_for(path, score_path(path)),
            explanation=path.explanation,
            uncertainty=path.uncertainty,
            edges=path.edges,
            intro_request=path.intro_request,
        )
        for path in ordered[:3]
    ]
