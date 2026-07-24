import asyncio

from fastapi.testclient import TestClient

from app.auditor import claim_fingerprint
from app.crew import WarmPathOrchestrator
from app.main import app, configured_orchestrator
from app.models import (
    AuditArtifact,
    AuditDecision,
    CandidatePath,
    Citation,
    IntroDraft,
    PublicEdge,
    ScoutArtifact,
    TargetArtifact,
    TargetSummary,
)


class FakeResearch:
    def __init__(self, events: list[str]) -> None:
        self.events = events

    async def research(self, query: str) -> dict:
        self.events.append("you:research")
        return {"answer": "Target evidence", "sources": []}


class FakeSearch:
    def __init__(self, events: list[str]) -> None:
        self.events = events

    async def search(self, query: str) -> dict:
        self.events.append(f"you:search:{query.split()[0]}")
        await asyncio.sleep(0)
        return {"hits": [{"url": "https://evidence.example/program"}]}


class FakeRoles:
    def __init__(self, events: list[str]) -> None:
        self.events = events

    async def target(self, target_url: str, research_output: dict) -> TargetArtifact:
        self.events.append("agent:investor")
        return TargetArtifact(
            target=TargetSummary(
                name="Elena Park",
                organization="Aster Ventures",
                url=target_url,
            ),
            themes=["climate"],
            sources=[],
        )

    async def scout(self, contact, target, search_output) -> ScoutArtifact:
        self.events.append(f"agent:scout:{contact.name}")
        return ScoutArtifact(
            contact_name=contact.name,
            paths=[
                CandidatePath(
                    contact_name=contact.name,
                    explanation="A cited accelerator overlap.",
                    uncertainty="Overlap does not prove a personal relationship.",
                    edges=[
                        PublicEdge(
                            **{
                                "from": contact.name,
                                "relationship": "program mentor",
                                "to": "Civic Futures",
                                "citations": [
                                    Citation(
                                        title="Program directory",
                                        url="https://evidence.example/program",
                                    )
                                ],
                            }
                        )
                    ],
                    evidence_completeness=0.95,
                    path_directness=0.9,
                    target_relevance=0.85,
                    evidence_recency=0.8,
                    identity_confidence=0.95,
                )
            ],
        )

    async def audit(self, candidates) -> AuditArtifact:
        self.events.append("agent:audit")
        return AuditArtifact(
            decisions=[
                AuditDecision(
                    path_index=index,
                    decision="approve",
                    reason="Citations support the bounded claim.",
                    allowed_claim_fingerprints=[claim_fingerprint(candidate)],
                )
                for index, candidate in enumerate(candidates)
            ]
        )

    async def intro(self, candidate, target) -> IntroDraft:
        self.events.append(f"agent:intro:{candidate.contact_name}")
        return IntroDraft(
            message=(
                f"Hi {candidate.contact_name}, would you be comfortable helping "
                "me understand whether an introduction would be appropriate?"
            )
        )


def request_payload() -> dict:
    return {
        "targetUrl": "https://fund.example/elena",
        "contacts": [
            {
                "name": "Maya",
                "role": "Founder",
                "publicProfileUrl": "https://people.example/maya",
                "askConfirmed": True,
            },
            {
                "name": "Jordan",
                "publicProfileUrl": "https://people.example/jordan",
                "askConfirmed": True,
            },
        ],
    }


def test_flow_orders_research_before_parallel_scouting_and_audit() -> None:
    events: list[str] = []
    orchestrator = WarmPathOrchestrator(
        FakeResearch(events), FakeSearch(events), FakeRoles(events)
    )
    app.dependency_overrides[configured_orchestrator] = lambda: orchestrator
    try:
        response = TestClient(app).post("/v1/warm-paths", json=request_payload())
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200, response.text
    assert len(response.json()["paths"]) == 2
    assert events.index("you:research") < events.index("agent:investor")
    first_search = next(
        index for index, value in enumerate(events) if value.startswith("you:search:")
    )
    assert events.index("agent:investor") < first_search
    assert events.index("agent:audit") > max(
        index for index, value in enumerate(events) if "agent:scout" in value
    )
    assert events[-2:] == ["agent:intro:Maya", "agent:intro:Jordan"]


def test_zero_supported_paths_is_successful() -> None:
    events: list[str] = []
    roles = FakeRoles(events)

    async def empty_scout(contact, target, search_output):
        return ScoutArtifact(contact_name=contact.name, paths=[])

    roles.scout = empty_scout
    orchestrator = WarmPathOrchestrator(FakeResearch(events), FakeSearch(events), roles)
    app.dependency_overrides[configured_orchestrator] = lambda: orchestrator
    try:
        response = TestClient(app).post("/v1/warm-paths", json=request_payload())
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json()["paths"] == []


def test_missing_configuration_is_safe_and_generic(monkeypatch) -> None:
    monkeypatch.delenv("YOU_API_KEY", raising=False)
    monkeypatch.delenv("PARASAIL_API_KEY", raising=False)
    response = TestClient(app).post("/v1/warm-paths", json=request_payload())
    assert response.status_code == 503
    assert "configured" in response.json()["detail"]


def test_configured_service_token_is_required(monkeypatch) -> None:
    events: list[str] = []
    orchestrator = WarmPathOrchestrator(
        FakeResearch(events), FakeSearch(events), FakeRoles(events)
    )
    monkeypatch.setenv("SERVICE_TOKEN", "shared-secret")
    app.dependency_overrides[configured_orchestrator] = lambda: orchestrator
    try:
        unauthorized = TestClient(app).post("/v1/warm-paths", json=request_payload())
        authorized = TestClient(app).post(
            "/v1/warm-paths",
            json=request_payload(),
            headers={"authorization": "Bearer shared-secret"},
        )
    finally:
        app.dependency_overrides.clear()

    assert unauthorized.status_code == 401
    assert authorized.status_code == 200
