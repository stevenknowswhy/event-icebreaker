# Implementation Plan: Warm Path Map / My Circle

## Overview

Build the feature in vertical slices: first make opt-in Circle profiles useful
locally, then prove one citation-backed path through a mocked agent contract,
then replace the mock with a real CrewAI workflow, and finally add governed
delivery and an optional approved action.

## Architecture Decisions

- Extend the existing shared-profile protocol backward-compatibly.
- Keep My Circle entirely in browser storage.
- Upload only user-selected contact fields after a field-level disclosure.
- Use a Python CrewAI service because distinct research, scouting, auditing, and
  drafting roles materially improve the outcome.
- Use deterministic code for validation, citation enforcement, and ranking.
- Use AWS Bedrock for the generative research, scouting, and drafting roles.
- Use an independent Parasail-hosted model only for evidence auditing.
- Treat Pica as an optional action layer, not a research dependency.
- Use Opsera for architecture, security, and delivery governance.

## Phase 1: Consent-Based Circle

### Task 1: Add optional public-profile sharing

**Acceptance criteria**

- A profile owner can add a public HTTPS professional URL.
- The URL is excluded by default and included only after an explicit toggle.
- Existing version-1 links remain valid.

**Verification**

- A new failing unit test proves the URL is excluded by default.
- Unit tests cover inclusion, validation, and old-link decoding.
- `npm test` passes.

**Files**

- `lib/icebreaker.ts`
- `components/profile-setup.tsx`
- `components/icebreaker-app.tsx`
- `tests/icebreaker.test.ts`

### Task 2: Save received profiles to My Circle

**Acceptance criteria**

- Receiver mode offers "Save to My Circle."
- Saved contacts remain local and duplicates are updated.
- The user can view and remove saved contacts.

**Verification**

- Unit tests cover save, deduplication, migration, and removal.
- Browser test proves a received profile can be saved and later listed.

**Files**

- `lib/my-circle.ts`
- `components/icebreaker-app.tsx`
- `app/circle/page.tsx`
- `components/my-circle.tsx`
- `tests/my-circle.test.ts`

### Checkpoint: Circle

- Existing sender and receiver flows still pass.
- No selected profile data has a server destination yet.

## Phase 2: One Complete Warm Path

### Task 3: Define the cross-service contract

**Acceptance criteria**

- TypeScript and Pydantic fixtures represent the same request and response.
- URL, selection-count, and ask-confirmation rules are enforced.
- Uncited edges cannot be normalized into a renderable result.

**Verification**

- Contract fixtures pass in Node and pytest.
- Invalid fixtures fail for the same reasons in both services.

**Files**

- `lib/warm-path.ts`
- `tests/warm-path.test.ts`
- `services/warm-path/app/models.py`
- `services/warm-path/tests/test_contract.py`
- `services/warm-path/pyproject.toml`

### Task 4: Build the Warm Path UI against a mock

**Acceptance criteria**

- The founder selects up to five Circle contacts.
- Every selected contact requires ask confirmation and a public URL.
- The disclosure enumerates exactly what leaves the device.
- One mocked path renders as an edge map with citations and an intro request.

**Verification**

- Server-rendered route test passes.
- Phone-sized browser flow covers selection, disclosure, results, citations,
  empty state, and copy.

**Files**

- `app/warm-path/page.tsx`
- `components/warm-path.tsx`
- `app/globals.css`
- `tests/rendered-html.test.mjs`
- `tests/warm-path-flow.mjs`

### Checkpoint: Vertical Slice

- A complete user flow works with deterministic mock data.
- The existing app remains buildable and deployable.

## Phase 3: Credible Multi-Agent Research

### Task 5: Implement target research and path scouting

**Acceptance criteria**

- Investor Researcher uses You.com Research.
- Path Scout uses focused You.com Search for selected contacts.
- CrewAI Flow executes target research before contact scouting and scouts
  contacts in parallel.
- Tool outputs are validated typed artifacts.

**Verification**

- Failing tests are written against deterministic mocked You.com responses.
- Tests prove tool permissions and flow order.
- No test spends API credits.

**Files**

- `services/warm-path/app/crew.py`
- `services/warm-path/app/tools/you_search.py`
- `services/warm-path/app/tools/you_research.py`
- `services/warm-path/app/main.py`
- `services/warm-path/tests/test_research_flow.py`

### Task 6: Add independent evidence auditing and ranking

**Acceptance criteria**

- The Parasail auditor can approve, downgrade, or reject, but cannot add claims.
- Deterministic code removes uncited edges and enforces path limits.
- Ranking follows the weights in the approved specification.
- Zero supported paths returns a successful empty result.

**Verification**

- Tests cover identity collisions, missing sources, stale claims, invented
  relationships, and no-result behavior.
- All service tests and lint pass.

**Files**

- `services/warm-path/app/auditor.py`
- `services/warm-path/app/ranking.py`
- `services/warm-path/app/crew.py`
- `services/warm-path/tests/test_auditor.py`
- `services/warm-path/tests/test_ranking.py`

### Task 7: Integrate the real service

**Acceptance criteria**

- The web app calls the configured agent-service URL through a server boundary.
- Credentials and raw upstream errors never reach the browser.
- Loading, retry, rate-limit, timeout, and configuration states are clear.

**Verification**

- Integration tests mock the service boundary.
- One manual live-credit test returns cited paths.
- `npm test` and service tests pass.

**Files**

- `app/api/warm-paths/route.ts`
- `lib/warm-path.ts`
- `components/warm-path.tsx`
- `tests/warm-path.test.ts`
- `README.md`

### Checkpoint: Multi-Agent

- Agent contributions are inspectable as a safe per-run receipt of typed
  intermediate artifacts and item counts.
- One live run produces only citation-backed public edges.
- Failure never falls back to fabricated results.

## Phase 4: Action and Governed Delivery

### Task 8: Add optional approved Pica action

**Acceptance criteria**

- Sending is unavailable until the user previews the exact message and confirms.
- Pica receives only the approved recipient and message fields.
- Copy-to-clipboard remains available when Pica is not configured.

**Verification**

- Tests prove that research completion alone cannot trigger an action.
- Mocked Pica success and failure states are covered.

**Files**

- `services/warm-path/app/tools/pica.py`
- `services/warm-path/app/main.py`
- `components/warm-path.tsx`
- `services/warm-path/tests/test_pica_action.py`
- `tests/warm-path-flow.mjs`

### Task 9: Run Opsera governance gates

**Acceptance criteria**

- Architecture Analyzer documents the web, agent, model, and action trust
  boundaries.
- Security Agent reports no committed secrets or unresolved high-severity
  findings.
- The demo includes an auditable Opsera work order or scan record.

**Verification**

- `npm run lint`
- `npm test`
- `node tests/preview-flow.mjs`
- `node tests/warm-path-flow.mjs`
- `uv run pytest`
- `uv run ruff check .`
- Opsera evidence is captured in `docs/opsera/` without credentials.

**Files**

- `README.md`
- `docs/architecture.md`
- `docs/demo-runbook.md`
- `docs/opsera/README.md`

### Checkpoint: Complete

- All approved success criteria pass.
- External actions remain human-approved.
- Deployment configuration and credentials are outside version control.
- The feature is ready for a two-minute hackathon demo.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| A saved contact lacks a public URL | High | Require or let the founder add one before selection |
| A public affiliation is mistaken for a relationship | High | Use precise labels and an evidence auditor |
| Common names cause identity collisions | High | Require a disambiguating public URL and reject uncertainty |
| Research latency exceeds the demo window | High | Cap contacts at five, scout in parallel, cache only a clearly labeled demo fixture |
| External APIs are unavailable | Medium | Preserve a deterministic demo mode and never disguise it as live |
| The multi-agent system looks theatrical | High | Expose typed artifacts and distinct tool permissions per agent |
| Private Circle data leaks | High | Field-level disclosure, selected contacts only, no request logging |
| Opsera is perceived as decorative | High | Make architecture and security scans deployment gates and show the evidence |

## Implementation Decisions

1. Render is the first agent-service host.
2. Copy remains universal; Pica email is optional and separately approved.
3. Opsera Architecture Analyzer and Security Scanner are the required external
   governance gates. Their execution records are still pending account access.
