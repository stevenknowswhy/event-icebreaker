import json

import httpx
import pytest

from app.tools.you_research import YouResearchClient


@pytest.mark.asyncio
async def test_research_uses_lite_effort_for_interactive_latency() -> None:
    payload: dict = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        payload.update(json.loads(request.content))
        return httpx.Response(200, json={"output": {"content": "", "sources": []}})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        await YouResearchClient("you-key", client).research("Find a public path")

    assert payload["research_effort"] == "lite"
