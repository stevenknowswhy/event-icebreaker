from __future__ import annotations

import httpx


class YouResearchClient:
    def __init__(
        self,
        api_key: str,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._api_key = api_key
        self._client = client

    async def research(self, query: str) -> dict:
        if self._client is None:
            async with httpx.AsyncClient(timeout=35) as client:
                response = await self._post(client, query)
        else:
            response = await self._post(self._client, query)
        response.raise_for_status()
        value = response.json()
        if not isinstance(value, dict):
            raise ValueError("You.com Research returned an invalid response")
        return value

    async def _post(self, client: httpx.AsyncClient, query: str) -> httpx.Response:
        return await client.post(
            "https://api.you.com/v1/research",
            headers={"X-API-Key": self._api_key},
            json={"input": query, "research_effort": "standard"},
        )
