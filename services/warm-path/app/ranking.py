from __future__ import annotations

from app.models import CandidatePath, PublicEdge, RankedPath, TargetSummary

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


def _key(value: str) -> str:
    return " ".join(value.casefold().split())


def is_complete_path(path: CandidatePath, target: TargetSummary) -> bool:
    if not path.edges or _key(path.edges[0].from_) != _key(path.contact_name):
        return False
    nodes = [path.edges[0].from_]
    for index, edge in enumerate(path.edges):
        if not edge.citations:
            return False
        if index and _key(path.edges[index - 1].to) != _key(edge.from_):
            return False
        nodes.append(edge.to)
    if len({_key(node) for node in nodes}) != len(nodes):
        return False
    terminals = {_key(target.name)}
    if target.organization:
        terminals.add(_key(target.organization))
    return _key(nodes[-1]) in terminals


def rank_paths(paths: list[CandidatePath], target: TargetSummary) -> list[RankedPath]:
    valid = [
        path
        for path in paths
        if 1 <= len(path.edges) <= 3
        and is_complete_path(path, target)
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
            edges=[
                PublicEdge.model_validate(edge.model_dump(by_alias=True))
                for edge in path.edges
            ],
            intro_request=path.intro_request,
        )
        for path in ordered[:3]
    ]
