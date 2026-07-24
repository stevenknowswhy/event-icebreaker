# Coffee or Disco — Event Icebreaker

Coffee or Disco turns an in-person conversation card into a consent-based
founder tool. People share only what they choose. A founder can save received
cards locally in **My Circle**, select people they would genuinely ask for
help, and run **Warm Path Map** to discover public, citation-backed candidate
routes to an investor.

Warm Path Map is intentionally not a private social graph. It searches public
portfolio, accelerator, conference, board, and advisor evidence, labels
uncertainty, and never presents a candidate route as a guaranteed introduction.

## Judge moments

1. **Consent is visible:** the complete Circle stays in browser storage and the
   UI enumerates the selected fields before research.
2. **The multi-agent system is inspectable:** a CrewAI Flow runs five bounded
   roles with typed artifacts and least-privilege data access.
3. **Evidence wins over eloquence:** claim fingerprints prevent the auditor
   from adding claims; deterministic code drops uncited edges and ranks the
   remaining paths.
4. **Actions remain human:** research cannot send anything. An optional Pica
   email requires the exact recipient, a visible message preview, and a second
   literal approval.
5. **Opsera is a delivery gate:** architecture and security reports are
   required evidence before production, not a runtime logo.

## Architecture

- Next.js 16, React 19, TypeScript, vinext, and Cloudflare for the web app
- browser `localStorage` for the full profile and My Circle
- FastAPI, Pydantic, CrewAI Crew/Flow for the agent boundary
- You.com Research for target research and You.com Search for contact scouting
- Parasail-hosted Qwen3-32B for target, path, and draft artifacts
- a model-separated Parasail Llama 3.3 70B Evidence Auditor
- optional Pica email action after explicit approval
- Render blueprint for the Python service
- Opsera Architecture Analyzer and Security Scanner as pre-deployment gates

See [architecture.md](docs/architecture.md) for trust boundaries and
[warm-path-map-spec.md](docs/warm-path-map-spec.md) for the approved contract.

## Routes

- `/` — create and share an opt-in conversation card
- `/receive#<payload>` — decode a card locally and save it to My Circle
- `/circle` — view or remove local Circle contacts
- `/warm-path` — select contacts, disclose fields, research, and review paths
- `/api/warm-paths` — credential-safe proxy to the agent service
- `/api/warm-path-actions/email` — credential-safe approved-action proxy

## Run the web app

```bash
npm install
npm run dev
```

The deterministic cited demo works without external credentials. Live research
requires `WARM_PATH_SERVICE_URL` and `WARM_PATH_SERVICE_TOKEN`; use
`.env.example` as the field list and never commit actual values.

## Run the agent service

```bash
cd services/warm-path
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

Configure `SERVICE_TOKEN`, `YOU_API_KEY`, and `PARASAIL_API_KEY`. Parasail
Qwen3-32B powers target normalization, path construction, and intro drafting;
a separate Parasail Llama 3.3 70B model performs the evidence audit. Pica
remains optional and needs `PICA_SECRET`, `PICA_CONNECTION_KEY`, the Gmail send
action ID from the account’s Pica Actions directory, and `PICA_FROM_EMAIL`.

The service exposes:

- `GET /health`
- `GET /v1/capabilities`
- `POST /v1/warm-paths`
- `POST /v1/actions/email`

## Verification

```bash
npm run lint
npm test
node tests/preview-flow.mjs
node tests/warm-path-flow.mjs
cd services/warm-path
uv run ruff check .
uv run pytest
```

External APIs are mocked in automated tests, so verification never spends
credits. See [demo-runbook.md](docs/demo-runbook.md) for the live-credit check
and the two-minute presentation.

## Deployment

`render.yaml` deploys only the agent service. The existing vinext web app can
remain on Cloudflare. Copy the generated Render `SERVICE_TOKEN` into the web
runtime as `WARM_PATH_SERVICE_TOKEN`; set the Render URL as
`WARM_PATH_SERVICE_URL`. All provider credentials remain server-side.

Before production, complete the evidence checklist in
[docs/opsera/README.md](docs/opsera/README.md). No unexecuted scan is represented
as completed evidence. The requirement-by-requirement status is recorded in
[docs/completion-audit.md](docs/completion-audit.md).
