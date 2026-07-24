from __future__ import annotations

import os
import re
import secrets
from typing import Annotated

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from app.crew import (
    AGENT_PERMISSIONS,
    CrewAIRoleExecutor,
    WarmPathOrchestrator,
    WarmPathResearchFlow,
)
from app.models import (
    ActionRequest,
    ActionResponse,
    WarmPathRequest,
    WarmPathResponse,
)
from app.tools.pica import PicaActionClient
from app.tools.you_research import YouResearchClient
from app.tools.you_search import YouSearchClient

app = FastAPI(
    title="Coffee or Disco Warm Path",
    version="0.1.0",
    docs_url=None,
    redoc_url=None,
)

MAX_REQUEST_BYTES = 32_000


@app.middleware("http")
async def limit_request_size(request: Request, call_next):
    if request.method == "POST":
        content_length = request.headers.get("content-length")
        if content_length and content_length.isdigit():
            if int(content_length) > MAX_REQUEST_BYTES:
                return JSONResponse(
                    {"detail": "Request body is too large."}, status_code=413
                )
        body = await request.body()
        if len(body) > MAX_REQUEST_BYTES:
            return JSONResponse(
                {"detail": "Request body is too large."}, status_code=413
            )
    return await call_next(request)


def configured_orchestrator() -> WarmPathOrchestrator:
    you_key = os.getenv("YOU_API_KEY")
    parasail_key = os.getenv("PARASAIL_API_KEY")
    if not you_key or not parasail_key:
        raise HTTPException(
            status_code=503,
            detail="Live Warm Path research is not configured.",
        )
    roles = CrewAIRoleExecutor(
        auditor_api_key=parasail_key,
        bedrock_model=os.getenv("BEDROCK_MODEL", "bedrock/amazon.nova-lite-v1:0"),
        bedrock_region=os.getenv("AWS_DEFAULT_REGION", "us-east-1"),
        auditor_model=os.getenv("PARASAIL_AUDITOR_MODEL", "parasail-deepseek-31"),
    )
    return WarmPathOrchestrator(
        research_client=YouResearchClient(you_key),
        search_client=YouSearchClient(you_key),
        roles=roles,
    )


def configured_pica() -> PicaActionClient:
    secret = os.getenv("PICA_SECRET")
    connection_key = os.getenv("PICA_CONNECTION_KEY")
    action_id = os.getenv("PICA_GMAIL_SEND_ACTION_ID")
    from_email = os.getenv("PICA_FROM_EMAIL")
    if not secret or not connection_key or not action_id or not from_email:
        raise HTTPException(
            status_code=503,
            detail="Approved email actions are not configured.",
        )
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", from_email):
        raise HTTPException(
            status_code=503,
            detail="Approved email actions are not configured.",
        )
    return PicaActionClient(
        secret,
        connection_key,
        action_id,
        from_email,
    )


def require_service_token(
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    expected = os.getenv("SERVICE_TOKEN")
    if not expected:
        if os.getenv("ENVIRONMENT") == "production":
            raise HTTPException(
                status_code=503, detail="Service authentication missing."
            )
        return
    supplied = (
        authorization.removeprefix("Bearer ")
        if authorization and authorization.startswith("Bearer ")
        else ""
    )
    if not secrets.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Unauthorized.")


OrchestratorDependency = Annotated[
    WarmPathOrchestrator, Depends(configured_orchestrator)
]
PicaDependency = Annotated[PicaActionClient, Depends(configured_pica)]
ServiceTokenDependency = Annotated[None, Depends(require_service_token)]


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/v1/capabilities")
async def capabilities() -> dict:
    return {
        "workflow": [
            "validate",
            "research target",
            "scout contacts in parallel",
            "audit",
            "rank",
            "draft",
        ],
        "agents": [
            {"role": role, "canAccess": list(access)}
            for role, access in AGENT_PERMISSIONS.items()
        ],
        "externalActionsRequireApproval": True,
    }


@app.post("/v1/warm-paths", response_model=WarmPathResponse)
async def warm_paths(
    request: WarmPathRequest,
    orchestrator: OrchestratorDependency,
    _authorized: ServiceTokenDependency,
) -> WarmPathResponse:
    try:
        flow = WarmPathResearchFlow(orchestrator, request)
        result = await flow.akickoff()
        return WarmPathResponse.model_validate(result)
    except httpx.TimeoutException as error:
        raise HTTPException(
            status_code=504, detail="The research providers timed out."
        ) from error
    except httpx.HTTPStatusError as error:
        status = 429 if error.response.status_code == 429 else 502
        detail = (
            "The research provider rate limit was reached."
            if status == 429
            else "A research provider could not complete the request."
        )
        raise HTTPException(status_code=status, detail=detail) from error
    except (ValueError, RuntimeError) as error:
        raise HTTPException(
            status_code=502, detail="The research result failed evidence validation."
        ) from error


@app.post("/v1/actions/email", response_model=ActionResponse)
async def send_approved_email(
    request: ActionRequest,
    pica: PicaDependency,
    _authorized: ServiceTokenDependency,
) -> ActionResponse:
    try:
        return await pica.send_email(request)
    except httpx.HTTPError as error:
        raise HTTPException(
            status_code=502, detail="The approved email could not be sent."
        ) from error
