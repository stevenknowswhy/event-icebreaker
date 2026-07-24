from __future__ import annotations

import base64
from email.message import EmailMessage

import httpx

from app.models import ActionRequest, ActionResponse


class PicaActionClient:
    def __init__(
        self,
        secret: str,
        connection_key: str,
        action_id: str,
        from_email: str,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._secret = secret
        self._connection_key = connection_key
        self._action_id = action_id
        self._from_email = from_email
        self._client = client

    async def send_email(self, request: ActionRequest) -> ActionResponse:
        email = EmailMessage()
        email["From"] = self._from_email
        email["To"] = request.recipient
        email["Subject"] = request.subject
        email.set_content(request.message)
        raw = base64.urlsafe_b64encode(email.as_bytes()).rstrip(b"=").decode()
        if self._client is None:
            async with httpx.AsyncClient(timeout=20) as client:
                response = await self._post(client, raw)
        else:
            response = await self._post(self._client, raw)
        response.raise_for_status()
        body = response.json()
        provider_id = body.get("id") if isinstance(body, dict) else None
        if not isinstance(provider_id, str) or not provider_id:
            raise ValueError("Pica returned an invalid action receipt")
        return ActionResponse(status="sent", provider_id=provider_id)

    async def _post(self, client: httpx.AsyncClient, raw: str) -> httpx.Response:
        return await client.post(
            "https://api.picaos.com/v1/passthrough/users/me/messages",
            headers={
                "x-pica-secret": self._secret,
                "x-pica-connection-key": self._connection_key,
                "x-pica-action-id": self._action_id,
            },
            json={"raw": raw},
        )
