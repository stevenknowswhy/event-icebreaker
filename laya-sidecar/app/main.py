"""FastAPI entrypoint. Stateless by contract: no persistence, no body logging, no LLM.

The app degrades client-side at 2.5 s (the client owns the timeout); here we simply
serve warm, validated, capped, and quiet. /health returns 503 until the model has
loaded and completed its warm-up predict.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.agent import LayaAgent
from app.config import Settings
from app.guardrails import evaluate_guardrails, guardrail_questions
from app.pipeline import AgentLike, MatchPipeline
from app.schemas import GuardrailsOut, HealthOut, MatchDossierOut
from app.validation import GuardrailsRequest, MatchRequest

logger = logging.getLogger("laya-sidecar")


class ReadyGate:
    """Startup loader + readiness flag, shared by /health and the scoring endpoints."""

    def __init__(self, agent: LayaAgent) -> None:
        self.agent = agent

    def start(self) -> None:
        import threading

        thread = threading.Thread(target=self._load, daemon=True, name="laya-load")
        thread.start()

    def _load(self) -> None:
        try:
            self.agent.load_and_warm()
        except Exception as exc:  # noqa: BLE001 — surfaced as a 503, never a body echo
            self.agent.load_error = type(exc).__name__
            logger.error("model load failed: %s", type(exc).__name__)


def create_app(agent: AgentLike | None = None, settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    real_agent = agent if agent is not None else LayaAgent(settings)
    gate = ReadyGate(real_agent) if isinstance(real_agent, LayaAgent) else None
    pipeline = MatchPipeline(real_agent)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        if gate is not None:
            gate.start()
        yield

    app = FastAPI(
        title="Event Icebreaker Laya sidecar",
        version="0.1.0",
        lifespan=lifespan,
        docs_url=None,  # public demo surface: keep the API surface minimal
        redoc_url=None,
    )

    if settings.allowed_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.allowed_origins,
            allow_methods=["GET", "POST"],
            allow_headers=["content-type"],
        )

    @app.middleware("http")
    async def cap_body(request: Request, call_next) -> Response:
        length = request.headers.get("content-length")
        if length and length.isdigit() and int(length) > settings.max_body_bytes:
            return JSONResponse(status_code=413, content={"detail": "body too large"})
        return await call_next(request)

    def _not_ready() -> JSONResponse:
        return JSONResponse(status_code=503, content={"detail": "model warming"})

    @app.get("/")
    def root() -> dict:
        return {"service": "event-icebreaker-laya-sidecar", "stateless": True}

    @app.get("/health", response_model=HealthOut)
    def health() -> Response:
        if gate is None:
            body = HealthOut(status="ok", model="injected")
            return JSONResponse(content=body.model_dump())
        if gate.agent.load_error is not None:
            return JSONResponse(
                status_code=503,
                content={"detail": "model failed to load", "error": gate.agent.load_error},
            )
        if not gate.agent.ready():
            body = HealthOut(status="warming", model=gate.agent.model_id)
            return JSONResponse(status_code=503, content=body.model_dump())
        body = HealthOut(status="ok", model=gate.agent.model_id)
        return JSONResponse(content=body.model_dump())

    @app.post("/v1/match/deep", response_model=MatchDossierOut)
    def match_deep(request: MatchRequest) -> Response:
        if gate is not None and not gate.agent.ready():
            return _not_ready()
        dossier = pipeline.run(request)
        return JSONResponse(content=dossier.model_dump(by_alias=True))

    @app.post("/v1/profile-guardrails", response_model=GuardrailsOut)
    def profile_guardrails(request: GuardrailsRequest) -> Response:
        if gate is not None and not gate.agent.ready():
            return _not_ready()
        text = request.text  # capped by the request model (422 beyond 2000 chars)
        answers = real_agent.predict(text, guardrail_questions())["answers"]
        result = evaluate_guardrails(text, answers)
        return JSONResponse(content=result.model_dump())

    return app

# Module-level instance for `uvicorn app.main:app` (the Docker CMD). Tests build their
# own app via create_app() with injected fakes; this one builds the real agent from env.
app = create_app()


def main() -> None:
    import os

    import uvicorn

    app = create_app()
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))


if __name__ == "__main__":
    main()
