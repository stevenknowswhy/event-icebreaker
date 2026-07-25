# Warm Path Map Completion Audit

Updated July 24, 2026. “Verified” means the check was executed against this
branch. “External” means the implementation is ready but the proof requires a
connected account, deployed environment, or provider credits.

## Product and privacy

| Requirement | Status | Evidence |
| --- | --- | --- |
| Optional public URL sharing with backward compatibility | Verified | shared-card unit tests |
| Local My Circle save, update, list, and remove | Verified | storage unit tests and sender/receiver browser flow |
| One-to-five selected contacts with per-contact ask confirmation | Verified | TypeScript and Pydantic contract tests |
| Exact disclosure; complete Circle never uploaded | Verified | mobile browser flow and request serializer |
| Duplicate identities, target/contact collisions, credentials, control characters, and oversized bodies rejected | Verified | cross-boundary contract and service tests |
| No server-side research history | Verified | architecture/code review; no database or persistence layer |

## Multi-agent credibility

| Requirement | Status | Evidence |
| --- | --- | --- |
| Target research precedes concurrent contact scouting | Verified | mocked flow-order test |
| Circle Librarian is a deterministic privacy gate | Verified | request contract and exact permission test |
| You.com output is typed before later stages | Verified | `TargetArtifact` and `ScoutArtifact` contracts |
| Parasail Qwen powers research normalization, path construction, and drafting | Verified live | cited Render run completed with Qwen 3.5 35B A3B in no-thinking mode |
| Parasail Llama is reserved for model-separated auditing | Verified live | cited Render run completed with the distinct auditor configuration; no other role receives it |
| Auditor cannot add or substitute claims | Verified | SHA-256 claim-fingerprint tests |
| Per-run agent contribution receipt is visible | Verified | mobile browser flow renders five typed artifacts and item counts |
| Tool permissions are least-privilege | Verified | exact permission-map test |

## Evidence reliability

| Requirement | Status | Evidence |
| --- | --- | --- |
| Every rendered edge has at least one HTTPS citation | Verified | Pydantic, ranking, TypeScript, and browser tests |
| Uncited candidates produce an honest omission, not a service failure | Verified | candidate-to-ranked sanitization test |
| Paths have at most three edges and results at most three | Verified | schema and ranking tests |
| Disconnected, circular, or wrong-terminal routes are removed | Verified | deterministic ranking tests |
| Ambiguous identities cannot receive a strong label | Verified | confidence-threshold test and auditor downgrade test |
| Retrieved text cannot replace instructions | Verified | all dynamic identity/research data is enclosed in untrusted JSON; agents have no code execution or delegation |
| A real run returns only working public citations | Verified live | Render deployment `dep-d9hvb1m7r5hc73e9hfr0`; one selected simulated-public contact, one two-edge path, two HTTPS citations, five completed roles |

## Action and delivery

| Requirement | Status | Evidence |
| --- | --- | --- |
| Research completion cannot send an email | Verified | separate action endpoint and literal approval contract |
| Recipient, subject, and message are visible before approval | Verified | mobile browser flow |
| Pica success/failure is safely mapped; copy remains available | Verified with mock | service/proxy tests; live Pica send is optional |
| Production service authentication is mandatory | Verified | production-mode service test and Render blueprint |
| Research requests are rate- and size-limited | Verified | proxy and FastAPI boundary tests |
| Framework telemetry is disabled | Verified | service bootstrap and deployment environment |
| Public web deployment serves the complete Warm Path experience | Verified live | Sites version 9, deployment `appgdep_6a63fd8c815881918b355b5d596b63e0`; all four page routes returned 200 |
| Architecture and security scans have Opsera execution IDs | External | connect Opsera and run the prepared work orders in `docs/opsera/` |

## Executed local gates

- 29 Node contract/unit tests passed.
- Production web build passed.
- Four server-rendered route tests passed.
- ESLint passed.
- TypeScript `tsc --noEmit` passed.
- 26 Python tests passed; Ruff formatting and lint passed.
- Sender/receiver and Warm Path mobile browser flows passed at 390 × 844.
- Browser console warnings/errors: zero.
- The locked Python dependency graph resolved successfully. Registry-backed
  vulnerability audits were not rerun during this session.
- Gitleaks scanned all 23 locally reachable commits with the repository policy and found no
  secrets. The policy narrowly identifies synthetic Deep Connect URL tokens
  used only in contract tests.

## Executed production gates

- Sites version 9 deployed commit
  `c92e846b7c3d53d40a246f56bce88707b5bf93bc` to
  `https://event-icebreaker.stefano94103.chatgpt.site`.
- `/`, `/receive`, `/circle`, and `/warm-path` returned HTTP 200.
- The public sender, receiver, and invalid-link recovery flows passed with zero
  browser console issues.
- A public Warm Path run returned one cited result, displayed all five workflow
  roles, and produced zero browser console issues.
- Mobile and desktop production reviews found no launch-blocking presentation
  defect.

The deployed service and public You.com + Parasail experience are proven.
Production governance sign-off still requires the two Opsera execution records.
