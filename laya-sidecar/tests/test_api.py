"""API behavior: health gating, request caps, CORS allowlist, strict validation."""

from __future__ import annotations

from dataclasses import replace

from conftest import FOUNDER, INVESTOR, FakeAgent
from fastapi.testclient import TestClient

from app.agent import LayaAgent
from app.config import Settings
from app.main import create_app


def profile_json(profile) -> dict:
    return profile.model_dump()


def match_payload() -> dict:
    return {"sender": profile_json(INVESTOR), "receiver": profile_json(FOUNDER)}


def test_root_is_quiet_metadata(client):
    body = client.get("/").json()
    assert body["stateless"] is True


def test_match_happy_path(client):
    response = client.post("/v1/match/deep", json=match_payload())
    assert response.status_code == 200
    assert response.json()["score"]["band"] in ("low", "some", "strong")


def test_match_rejects_unknown_fields(client):
    payload = {**match_payload(), "intent": "match"}
    assert client.post("/v1/match/deep", json=payload).status_code == 422


def test_match_rejects_bad_intent(client):
    payload = {
        **match_payload(),
        "sender": {**profile_json(INVESTOR), "i": "date"},
    }
    assert client.post("/v1/match/deep", json=payload).status_code == 422


def test_guardrails_rejects_bad_intent(client):
    response = client.post("/v1/profile-guardrails", json={"text": "hi", "intent": "save"})
    assert response.status_code == 422


def test_guardrails_rejects_oversized_text(client):
    response = client.post("/v1/profile-guardrails", json={"text": "x" * 3000})
    assert response.status_code == 422


def test_body_cap_returns_413():
    settings = replace(Settings.from_env(), max_body_bytes=100)
    client = TestClient(create_app(agent=FakeAgent(), settings=settings))
    # Middleware checks content-length before FastAPI parses the body, so the
    # (invalid) JSON payload never reaches validation — the cap short-circuits.
    response = client.post(
        "/v1/match/deep",
        content=b"{" + b" " * 500,
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 413


def test_health_reflects_real_agent_states():
    agent = LayaAgent(Settings.from_env())  # never loads: no laya import in tests
    client = TestClient(create_app(agent=agent))

    warming = client.get("/health")
    assert warming.status_code == 503
    assert warming.json()["status"] == "warming"

    # Simulate a completed load with a fake inner agent — no weights touched.
    agent._agent = FakeAgent()
    agent._ready.set()
    ok = client.get("/health")
    assert ok.status_code == 200
    assert ok.json()["status"] == "ok"

    match = client.post("/v1/match/deep", json=match_payload())
    assert match.status_code == 200


def test_health_reports_load_failure_as_503_with_error_name():
    agent = LayaAgent(Settings.from_env())
    client = TestClient(create_app(agent=agent))
    agent.load_error = "OSError"
    failed = client.get("/health")
    assert failed.status_code == 503
    assert failed.json()["error"] == "OSError"
    assert failed.json()["detail"] == "model failed to load"


def test_cors_allowlisted_origin_gets_headers():
    settings = replace(Settings.from_env(), allowed_origins=["https://icebreaker.example.org"])
    client = TestClient(create_app(agent=FakeAgent(), settings=settings))
    response = client.get(
        "/health",
        headers={"Origin": "https://icebreaker.example.org"},
    )
    assert response.headers.get("access-control-allow-origin") == "https://icebreaker.example.org"


def test_cors_denies_unknown_origin():
    settings = replace(Settings.from_env(), allowed_origins=["https://icebreaker.example.org"])
    client = TestClient(create_app(agent=FakeAgent(), settings=settings))
    response = client.get("/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in response.headers


def test_default_settings_have_no_cors_entry():
    settings = Settings.from_env()
    assert settings.allowed_origins == []
