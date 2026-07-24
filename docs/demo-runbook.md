# Warm Path Map — Two-Minute Demo

## Before judges arrive

1. Open `/receive` with a prepared opt-in card and `/warm-path` in separate
   mobile-sized tabs.
2. Confirm the prepared card uses simulated/demo-safe data or a participant who
   explicitly agreed.
3. Verify `/health` on the Render service.
4. Run one live-credit request and inspect every citation.
5. Keep “Load a cited demo” available as the clearly labeled outage fallback.
6. Open the latest Opsera architecture and security reports from
   `docs/opsera/evidence/`.

## Script

### 0:00–0:20 — The problem

“Founders meet useful people at events, then lose the context. Existing
relationship products either depend on private graphs or overclaim who knows
whom. Coffee or Disco keeps the first edge human and consent-based.”

Save the received card to My Circle. Point out that the card’s public URL was
shared explicitly and the Circle remains on this device.

### 0:20–0:45 — Visible consent

Open Warm Path. Select one or two Circle contacts and check “I’d be comfortable
asking.” Enter the target fund URL. Read the disclosure: only the selected
name, role, and public URL leave the device.

### 0:45–1:20 — Credible multi-agent work

Start research. Point to the five roles:

- You.com Research builds the target footprint.
- scouts search selected contacts concurrently.
- a separate Parasail-hosted auditor can only approve, downgrade, or reject.
- deterministic code—not an LLM—requires citations and chooses the top three.
- the Intro Strategist sees only audited paths.

Open one citation and read “What we cannot claim.” Say: “This is a candidate
path worth asking about, not a guaranteed introduction.”

### 1:20–1:40 — Human-approved action

Copy the permission-first request. If Pica is configured, expand the email
preview, enter the prepared test recipient, and show that Send stays disabled
until the explicit approval checkbox is checked. Do not send to a real person
in a judge demo without their agreement.

### 1:40–2:00 — Opsera special-award close

Show the Opsera execution IDs and reports. “Opsera is not another runtime logo.
Its Architecture Analyzer maps the browser, agent, model, and action trust
boundaries. Its Security Scanner is a release gate for secrets, SAST, and
dependencies. The same governance that protects this demo can travel with the
product.”

## Live-credit acceptance check

Record only non-secret evidence:

- UTC timestamp
- deployed service version or Git commit
- count of contacts selected
- target domain, if safe to disclose
- path count
- citation count per path
- result: pass only if every rendered edge has a working public citation

Never save provider tokens, raw private contact data, or email recipients in
the runbook.

## Failure handling

- **No supported path:** celebrate the honest empty result.
- **Rate limit or timeout:** reduce the selection, retry once, then use the
  labeled demo.
- **Broken citation:** do not present the path; treat the live check as failed.
- **Pica unavailable:** use Copy. Research success never depends on sending.
