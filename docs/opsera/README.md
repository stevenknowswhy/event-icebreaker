# Opsera Governance Evidence

Opsera is the governed delivery layer for Warm Path Map. It is not part of the
runtime research chain. This directory distinguishes prepared scan inputs from
evidence actually returned by Opsera.

## Current status

| Gate | Status | Required completion evidence |
| --- | --- | --- |
| Architecture Analyzer | **Prepared — not yet executed** | execution ID, UTC timestamp, commit SHA, exported report |
| Security Scanner | **Prepared — not yet executed** | execution ID, UTC timestamp, commit SHA, high/critical finding count |
| Human review | **Pending external reports** | reviewer name/initials and disposition |

Do not change a status to passed without an Opsera execution record. Locally
generated diagrams and test output are useful inputs, but they are not Opsera
evidence.

## Connection

Use the official Opsera MCP endpoint shown by the connected account. As of this
implementation, Opsera documents the streamable HTTP endpoint as
`https://agent.opsera.ai/mcp` and an OAuth/API-token setup through its dashboard.
Store authentication in the IDE or secret manager, never this repository.

## Work order A — Architecture Analyzer

Run against the repository root:

> Analyze this repository’s architecture for the Warm Path Map feature. Map the
> Next.js/vinext browser and server boundary, local-only My Circle storage,
> FastAPI/CrewAI service, You.com Research and Search calls, Parasail evidence
> auditor, Pica approved-action endpoint, and Render deployment. Verify the
> trust boundaries in docs/architecture.md, identify missing authentication,
> privacy, rate-limit, timeout, logging, and disaster-recovery controls, and
> produce Markdown and HTML reports. Do not modify source code.

Acceptance:

- browser, web proxy, agent service, model, research, and action boundaries
  appear in the report;
- both API routes and both FastAPI POST endpoints are inventoried;
- no critical/high issue is silently omitted;
- an execution ID and commit SHA are captured.

## Work order B — Security Scanner

Run after architecture findings are addressed:

> Run a full pre-commit security scan on this repository. Include secrets,
> SAST, direct and transitive dependency vulnerabilities, and deployment/IaC.
> Report all findings, highlighting critical and high severity. Do not
> auto-remediate or install unapproved packages. Produce Markdown and HTML
> reports and include the execution ID and scanned commit SHA.

Release gate:

- zero committed credentials;
- zero unresolved critical or high findings introduced by Warm Path Map;
- no raw upstream errors or tokens exposed through browser responses;
- external actions remain impossible without explicit approval.

## Evidence placement

After execution, place exports under `docs/opsera/evidence/` using:

```text
architecture-<execution-id>.md
architecture-<execution-id>.html
security-<execution-id>.md
security-<execution-id>.html
review.md
```

`review.md` should list the commit SHA, report execution IDs, unresolved
findings, remediation decisions, and final pass/fail. Reports must not contain
tokens or private Circle/contact content.

## Why this is prize-relevant

The visible multi-agent product creates new failure modes: correlated model
errors, evidence overclaiming, secret-bearing provider boundaries, and
autonomous action risk. Opsera’s Architecture Analyzer and Security Scanner
govern those exact boundaries before deployment. The judge artifact is the
execution record tied to the code version—not a logo on the architecture slide.
