"""Contract tests — zero drift tolerated between the sidecar JSON and the spec's TS type.

Validates the live /v1/match/deep response against contract/match-dossier.schema.json
(the same file a TypeScript client is built against) and asserts exact key equality.
"""

from __future__ import annotations

import json
from pathlib import Path

import jsonschema
import pytest
from conftest import FakeAgent
from fastapi.testclient import TestClient

from app.main import create_app

SCHEMA_PATH = Path(__file__).resolve().parent.parent / "contract" / "match-dossier.schema.json"


@pytest.fixture
def schema() -> dict:
    return json.loads(SCHEMA_PATH.read_text())


def profile_json(profile) -> dict:
    return profile.model_dump()


def test_match_response_validates_against_schema(client, investor_founder, schema):
    sender, receiver = investor_founder
    response = client.post(
        "/v1/match/deep",
        json={"sender": profile_json(sender), "receiver": profile_json(receiver)},
    )
    assert response.status_code == 200
    jsonschema.validate(instance=response.json(), schema=schema)


def test_response_keys_match_schema_exactly(client, investor_founder, schema):
    sender, receiver = investor_founder
    response = client.post(
        "/v1/match/deep",
        json={"sender": profile_json(sender), "receiver": profile_json(receiver)},
    )
    body = response.json()
    assert set(body) == set(schema["required"])
    assert set(body["shape"]) == {"kind", "confidence"}
    assert set(body["score"]) == {"value", "band", "byShape"}


def test_ladder_has_exactly_two_rungs_at_levels_two_and_three(client, investor_founder, schema):
    sender, receiver = investor_founder
    response = client.post(
        "/v1/match/deep",
        json={"sender": profile_json(sender), "receiver": profile_json(receiver)},
    )
    ladder = response.json()["ladder"]
    assert len(ladder) == 2
    assert [rung["level"] for rung in ladder] == [2, 3]
    assert all(set(rung) == {"level", "question", "why"} for rung in ladder)


def test_dimension_ids_match_schema_enum(client, investor_founder, schema):
    sender, receiver = investor_founder
    response = client.post(
        "/v1/match/deep",
        json={"sender": profile_json(sender), "receiver": profile_json(receiver)},
    )
    # dimensions items are a $ref into $defs — resolve it before reading the enum.
    allowed = set(schema["$defs"]["dimension"]["properties"]["id"]["enum"])
    returned = {d["id"] for d in response.json()["dimensions"]}
    # stage_gap (eval round 1) and goal_fit (eval round 2) were demoted and no longer
    # ship; the schema enum still allows them so older dossiers remain valid.
    assert returned <= allowed
    assert returned == allowed - {"stage_gap", "goal_fit"}


def test_four_dimensions_in_stable_order(client, investor_founder):
    from app.schemas import DIMENSION_IDS

    sender, receiver = investor_founder
    response = client.post(
        "/v1/match/deep",
        json={"sender": profile_json(sender), "receiver": profile_json(receiver)},
    )
    returned = [d["id"] for d in response.json()["dimensions"]]
    assert returned == [d for d in DIMENSION_IDS if d not in ("stage_gap", "goal_fit")]


def test_guardrails_response_shape(client, schema):
    response = client.post("/v1/profile-guardrails", json={"text": "hard-working engineer"})
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"contact", "tone"}
    assert set(body["contact"]) == {"present", "confidence", "matched"}
    assert set(body["tone"]) == {"present", "confidence"}


# --- /v1/profile-guardrails wire contract (profile-guardrails.schema.json) ---
# The known drift this pins: a client posting a per-field map {fields: {...}}
# used to 422 on every real request while both suites stayed green, because
# only the match-dossier shape was under contract. Request AND response are
# now pinned; if either side drifts, these fail loudly.

GUARDRAILS_SCHEMA_PATH = (
    Path(__file__).resolve().parent.parent / "contract" / "profile-guardrails.schema.json"
)


@pytest.fixture
def guardrails_schema() -> dict:
    return json.loads(GUARDRAILS_SCHEMA_PATH.read_text())


def test_guardrails_request_validates_against_schema(guardrails_schema):
    request = {"text": "hard-working engineer"}
    jsonschema.validate(instance=request, schema=guardrails_schema["$defs"]["request"])


def test_guardrails_rejects_the_per_field_map(client, guardrails_schema):
    # The drifted client shape must never come back as a 200: the strict
    # request model rejects the extra "fields" key with a 422.
    response = client.post(
        "/v1/profile-guardrails",
        json={"fields": {"canHelp": "hard-working engineer"}},
    )
    assert response.status_code == 422


def test_guardrails_rejects_extra_request_keys(client, guardrails_schema):
    response = client.post(
        "/v1/profile-guardrails",
        json={"text": "engineer", "field": "canHelp"},
    )
    assert response.status_code == 422


def test_guardrails_rejects_oversized_text(client, guardrails_schema):
    response = client.post("/v1/profile-guardrails", json={"text": "x" * 2001})
    assert response.status_code == 422


def test_guardrails_response_validates_against_schema(client, guardrails_schema):
    response = client.post("/v1/profile-guardrails", json={"text": "hard-working engineer"})
    assert response.status_code == 200
    jsonschema.validate(instance=response.json(), schema=guardrails_schema)


def test_guardrails_contact_hit_response_validates_against_schema(client, guardrails_schema):
    response = client.post(
        "/v1/profile-guardrails",
        json={"text": "reach me at vera@example.com anytime"},
    )
    assert response.status_code == 200
    body = response.json()
    jsonschema.validate(instance=body, schema=guardrails_schema)
    assert body["contact"]["present"] is True
    assert "email" in body["contact"]["matched"]


def test_escalated_payload_still_fits_contract(investor_founder, schema):
    sender, receiver = investor_founder
    escalator = FakeAgent(
        offer_search_1_to_2={"confidence": 0.3},  # under the 0.5 dimension threshold
        curiosity_gap={"confidence": 0.3},  # under the 0.4 threshold — second low dim
    )
    escalated_client = TestClient(create_app(agent=escalator))
    response = escalated_client.post(
        "/v1/match/deep",
        json={"sender": profile_json(sender), "receiver": profile_json(receiver)},
    )
    assert response.status_code == 200
    body = response.json()
    jsonschema.validate(instance=body, schema=schema)
    assert body["escalated"] is True
