from __future__ import annotations

import httpx


class YouSearchClient:
    def __init__(
        self,
        api_key: str,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._api_key = api_key
        self._client = client or httpx.AsyncClient(timeout=20)

    async def search(self, query: str) -> dict:
        response = await self._client.post(
            "https://ydc-index.io/v1/search",
            headers={"X-API-Key": self._api_key},
            json={"query": query, "count": 10},
        )
        response.raise_for_status()
        value = response.json()
        if not isinstance(value, dict):
            raise ValueError("You.com Search returned an invalid response")
        return value
