"""Real Laya agent: loaded once, warmed up, lock-guarded. No state, no logging.

`laya` is imported lazily so the test suite (which injects fake agents) never needs
torch or the checkpoint. Loading takes 25–35 s; a warm predict takes milliseconds.
"""

from __future__ import annotations

import threading

from app.config import MODEL_ID, Settings

# A representative throwaway call per batch shape (brief: warm up every shape you serve).
_WARM_STATE = (
    "Two people at a professional event.\n"
    "Person 1 (sender): Role: systems engineer | Interests: robotics\n"
    "Person 2 (receiver): Role: product manager | Interests: robotics, hiking\n"
)


class LayaAgent:
    """Wraps one `laya.load` checkpoint behind a lock. Ready-gated, stateless."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._lock = threading.Lock()
        self._agent = None
        self._ready = threading.Event()
        self.load_error: str | None = None  # exception type name when load fails

    @property
    def model_id(self) -> str:
        return self._settings.model_id or MODEL_ID

    def ready(self) -> bool:
        return self._ready.is_set()

    def load_and_warm(self) -> None:
        """Runs on a startup thread — /health stays 503 until this completes."""
        import laya  # deferred: torch + transformers are heavy

        kwargs = {}
        if self._settings.device:
            kwargs["device"] = self._settings.device
        self._agent = laya.load(self.model_id, **kwargs)
        with self._lock:
            self._agent.predict(_WARM_STATE, _warmup_questions())
        self._ready.set()

    def predict(self, state, questions) -> dict:
        if not self.ready() or self._agent is None:
            raise RuntimeError("model not ready")
        with self._lock:
            return self._agent.predict(state, questions)


def _warmup_questions() -> dict:
    from app.questions import _ALL_CANDIDATES, dimension_questions, shape_questions

    questions = shape_questions()
    questions.update(dimension_questions(_ALL_CANDIDATES))
    return questions
