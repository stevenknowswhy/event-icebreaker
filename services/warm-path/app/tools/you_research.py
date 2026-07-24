from __future__ import annotations

import httpx


class YouResearchClient:
    def __init__(
        self,
        api_key: str,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._api_key = api_key
        self._client = client or httpx.AsyncClient(timeout=35)

    async def research(self, query: str) -> dict:
        response = await self._client.post(
            "https://api.you.com/v1/research",
            headers={"X-API-Key": self._api_key},
            json={"input": query, "research_effort": "standard"},
        )
        response.raise_for_status()
        value = response.json()
        if not isinstance(value, dict):
            raise ValueError("You.com Research returned an invalid response")
        return value
