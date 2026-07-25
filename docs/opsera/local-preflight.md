# Local Preflight — Not Opsera Evidence

Date: 2026-07-24
Deployed repository commit: `c92e846b7c3d53d40a246f56bce88707b5bf93bc`

This record is a local engineering preflight. It does not replace the Opsera
execution IDs and exported reports required in `docs/opsera/README.md`.

| Check | Result |
| --- | --- |
| TypeScript `tsc --noEmit` | pass |
| ESLint | pass |
| Web unit tests | 29 pass |
| vinext production build | pass; 4 pages and 2 API routes |
| Server-render tests | 4 pass |
| Python Ruff | pass |
| Python pytest | 26 pass |
| Sender/receiver mobile flow | pass; 0 console issues |
| Warm Path + approved action mobile flow | pass; 0 console issues |
| Python locked dependency graph | resolves successfully |
| Gitleaks full-history scan | pass; 23 locally reachable commits, no secrets |
| Whitespace/diff check | pass |
| Sites production deployment | version 9; pass |
| Public page routes | 4 of 4 return HTTP 200 |
| Public sender/receiver regression | pass; 0 console issues |
| Public live Warm Path run | pass; 1 cited result, 5 workflow roles, 0 console issues |
| Production visual review | mobile and desktop pass; no launch blocker |

Registry-backed vulnerability audits were not rerun during this session.
Opsera must still perform and record the independent architecture and security
work orders before special-award or production governance sign-off.
