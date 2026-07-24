import base64
import json
from email import message_from_bytes

import httpx
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app, configured_pica
from app.models import ActionRequest, ActionResponse
from app.tools.pica import PicaActionClient


class FakePica:
    def __init__(self) -> None:
        self.sent: ActionRequest | None = None

    async def send_email(self, request: ActionRequest) -> ActionResponse:
        self.sent = request
        return ActionResponse(status="sent", provider_id="provider-123")


def test_action_requires_literal_human_approval() -> None:
    try:
        ActionRequest(
            recipient="maya@example.com",
            subject="Warm introduction",
            message="Would you be comfortable helping?",
            approved=False,
        )
    except ValidationError:
        pass
    else:
        raise AssertionError("an unapproved action must be impossible")


def test_approved_action_sends_only_previewed_fields() -> None:
    fake = FakePica()
    app.dependency_overrides[configured_pica] = lambda: fake
    payload = {
        "recipient": "maya@example.com",
        "subject": "Warm introduction",
        "message": "Would you be comfortable helping?",
        "approved": True,
    }
    try:
        response = TestClient(app).post("/v1/actions/email", json=payload)
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    assert fake.sent is not None
    assert fake.sent.model_dump() == payload


def test_provider_failure_does_not_expose_raw_error() -> None:
    class FailingPica:
        async def send_email(self, request):
            raise httpx.ConnectError("secret upstream detail")

    app.dependency_overrides[configured_pica] = FailingPica
    try:
        response = TestClient(app).post(
            "/v1/actions/email",
            json={
                "recipient": "maya@example.com",
                "subject": "Intro",
                "message": "Would you help?",
                "approved": True,
            },
        )
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 502
    assert "secret upstream detail" not in response.text


async def test_pica_adapter_uses_configured_action_and_gmail_mime() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/passthrough/users/me/messages"
        assert request.headers["x-pica-action-id"] == "account-action-id"
        raw = json.loads(request.content)["raw"]
        decoded = base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4))
        email = message_from_bytes(decoded)
        assert email["From"] == "founder@example.com"
        assert email["To"] == "maya@example.com"
        assert email["Subject"] == "Warm introduction"
        assert "comfortable helping" in email.get_payload(decode=True).decode()
        return httpx.Response(200, json={"id": "gmail-message-123"})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    pica = PicaActionClient(
        secret="server-secret",
        connection_key="connection-key",
        action_id="account-action-id",
        from_email="founder@example.com",
        client=client,
    )
    response = await pica.send_email(
        ActionRequest(
            recipient="maya@example.com",
            subject="Warm introduction",
            message="Would you be comfortable helping?",
            approved=True,
        )
    )
    await client.aclose()
    assert response.provider_id == "gmail-message-123"
