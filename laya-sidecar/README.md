# Laya sidecar — stateless match engine for Event Icebreaker

A small FastAPI service that profiles the relationship between two people and returns
an explainable match dossier in milliseconds. One forward pass classifies the
relationship shape; a second batched pass reads the dimensions that survived
evaluation; pure Python composes the score, evidence, and conversation ladder. There
is **no LLM anywhere in this service** — the model is
[`convaiinnovations/laya`](https://huggingface.co/convaiinnovations/laya)
(non-generative, one forward pass per question set), the English checkpoint, the
launch default per the approved spec.

## Privacy invariants (the service exists to keep these)

- **Stateless.** No database, no files, no cache of profile data. Each request is
  scored and forgotten.
- **No logging of profile content.** Nothing a request contains is ever written
  anywhere. Logs carry only lifecycle messages (load, warm-up, ready).
- **Sees only what a receiver already sees.** Requests carry the same shared,
  openness-filtered profiles a scanned QR link already exposes.
- **CORS-allowlisted.** Browser calls are accepted only from the app origins listed
  in `LAYA_ALLOWED_ORIGINS`.

When this service is unreachable, the app degrades to its local estimator — marked
"local estimate" — and every existing flow still completes. The app never depends on
the sidecar being up.

## Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /health` | `200 {"status": "ok"}` only after the checkpoint is loaded and warmed; `503` before. |
| `POST /v1/match/deep` | Both shared profiles → full `MatchDossier` (score band, shape, four dimension chips with quoted evidence, bridge, curiosity gap, best first move, conversation ladder). |
| `POST /v1/profile-guardrails` | Free text → two yes/no judgments: pasted contact info; tone that would read wrong in a professional room. Advisory — the client saves regardless. |

Request bodies are size-capped (`LAYA_MAX_BODY_BYTES`, default 32 KiB) and strictly
shape-validated (unknown keys rejected; field limits mirror the app's own
validation). The wire contract is `contract/match-dossier.schema.json` — the same
file the TypeScript client is built against; a contract test asserts zero drift.

## The pipeline

1. **Shape pass** — one Laya forward pass classifies the relationship (peer / collab
   / mentor / investor / customer / unclear) with a calibrated confidence.
2. **Dimension pass** — one batched pass answers the two eval-validated questions:
   the offer→search fit from person 1 to person 2, and person 1's curiosity-gap pick.
   Everything else is deterministic Python (`app/textmatch.py`): the bridge comes
   from an exact interest-set intersection, the reverse fit from a shared-word rule,
   complementarity from a skills-overlap rule.
3. **Composition** — shape-specific weights (each row sums to 1.0) combine the
   subscores into a 0–100 score, banded `low` / `some` / `strong`. Evidence strings
   quote the actual profile lines. The three-rung conversation ladder is selected
   deterministically from the same dimension outputs — no extra model pass.

Escalation is honest by construction: two or more dimensions under threshold, or an
unclear shape, and the dossier ships flagged `escalated: true` — the client offers a
sharper read through the user's own AI prompt instead of asserting.

Thresholds are set from measured precision curves on the checkpoint's **calibrated**
confidence (`answer_confidence`, max-probability) — never the entropy-based
`confidence` the library also returns, which its own docs mark uncalibrated. The
measurements, the demotion journey (why goal fit, stage gap, and the shared-interest
pick no longer ship as model reads), and the honest costs are in [EVAL.md](EVAL.md).

## Running locally

Python 3.13, a virtual environment, and the pinned deps:

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
uvicorn app.main:app --port 8080   # warm-up runs on a startup thread
```

The checkpoint (~800 MB) loads from the Hugging Face cache. For offline runs, prefetch
it once, then set `HF_HUB_OFFLINE=1`. First load takes ~30 s; `/health` stays 503
until warm-up completes, and the warm-up itself primes the first request's path.

### Environment

| Variable | Default | Meaning |
|---|---|---|
| `LAYA_ALLOWED_ORIGINS` | empty (same-origin only) | Comma-separated app origins allowed by CORS. |
| `LAYA_MAX_BODY_BYTES` | `32768` | Request-body cap. |
| `LAYA_MODEL_ID` | `convaiinnovations/laya` | Checkpoint override (tests only — keep the English model). |
| `LAYA_DEVICE` | auto | Force `cpu` when CUDA/MPS auto-pick misbehaves. |
| `HF_HUB_OFFLINE` | unset | `1` in containers with baked weights. |

The app points at this service with `NEXT_PUBLIC_LAYA_URL`.

## Tests and evaluation

```bash
pytest -q                       # 106 tests: unit, API, contract, ladder safety, guardrails
ruff check .                    # lint
HF_HUB_OFFLINE=1 python eval.py # measured report + eval_results.json (per-pair detail)
```

The eval corpus is 45 hand-labeled event profile pairs covering every shape plus
deliberately ambiguous and mixed cases. Headline results (this machine, CPU): the
shipped model read is 31/31 correct; the shape pass asserts only at calibrated
confidence ≥ 0.60, where it measured 100% precise; deterministic code rules measured
89% (bridge), 69% (reverse fit), 67% (complementarity). Full numbers, thresholds, and
the latency caveat: [EVAL.md](EVAL.md).

## Deployment

`DEPLOY.md` is the checklist. In short: one small always-on container with the
checkpoint weights baked in (`HF_HUB_OFFLINE=1`), Fly.io-class, public HTTPS, health
probe on `/health`. Nothing is persisted, so there is nothing to back up and nothing
to leak.
