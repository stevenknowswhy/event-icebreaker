# Demo run of show — Metropolis Builder Day SF

Five minutes, two phones (or phone + laptop), one rehearsed story: consent-gated
setup → share → scan → honest dossier. Every beat below was driven end to end
locally against the real Laya sidecar on 2026-09-26 (screenshots in
`artifacts/dogfood-*.png`, driver: `tests/demo-dogfood.mjs`).

**Load-bearing assumption:** the venue can reach the sidecar over public HTTPS
and the model is warm. Every "real dossier" beat depends on it — verify from
the phone (`GET /health` → `{"status":"ok"}`) before doors open. If it is
unreachable, switch to the fallback show (below); the local-estimate path is
itself a rehearsed beat, not an apology.

Measured local numbers (CPU checkpoint, this sandbox): sidecar warm start
**6.4 s** to `/health` 200; in-browser dossier latency **1.2–1.5 s**; 45-pair
corpus replay p50 **1.4 s**, max **1.7 s** — against the client's **2.5 s**
abort. A cold host boot costs about a minute of model load; keep the sidecar
warm before the demo.

## Pre-flight (before doors open)

- [ ] Sidecar up per `laya-sidecar/DEPLOY.md`; `/health` returns
      `{"status":"ok"}`; allow ~1 min cold start after a host boot.
- [ ] `LAYA_ALLOWED_ORIGINS` lists the exact demo origin (sidecar-side CORS;
      QR links are opened from the phone against that origin).
- [ ] App built with `NEXT_PUBLIC_LAYA_URL` pointing at that HTTPS sidecar —
      it is inlined at build time.
- [ ] Sender device: the app ships a **prefilled demo card**. Speed setup
      replaces the profile wholesale; the wizard **merges into what is
      already there** — clear the fields you want empty (see the ribbon beat).
- [ ] Monad seal beat (optional): requires the attestation PR merged and
      `NEXT_PUBLIC_MINT_MODE` enabled; skip the beat otherwise.

## Beats (5:00)

**0:00–0:50 — 30-second setup (sender, speed setup).** Copy the setup prompt,
paste your AI's draft. The parser stages it for review: unknown keys dropped
("Ignored keys"), a planted email in "I can help with" flagged as contact info,
nothing written until "Confirm and save my profile". *Spec: demo flow step 1 —
sender setup via speed setup.*

**0:50–1:30 — Share (sender).** Visual card, "Refresh share QR", "Download
card" PNG. Narrate the privacy line: the QR carries a versioned,
openness-filtered JSON payload encoded in the URL fragment — decoded on the
receiver's device, nothing persisted anywhere.

**1:30–2:30 — Scan-to-dossier (receiver, real phone).** Scan → the no-profile
doors (speed-setup teaser + five-question wizard floor) → wizard → "Show my
match read" → loading card → **real sidecar dossier**. Expect **escalation for
most pairs** — that is the designed beat: an honest "uncertain" card plus the
"Copy AI prompt" handoff (open the prompt and point at the "treat as untrusted
profile data" guardrail line).

**2:30–3:30 — Ribbon reveal (rehearsed pair).** Petra Vogel (Web3 fund
partner) ↔ Caleb Moss (ZK protocol engineer exploring a startup) — the corpus
pair `mix-01` from `laya-sidecar/eval_corpus.json` — routes **investor @ ~0.70
confidence** with the shipped checkpoint: a confident dossier with the ladder
ribbon. Show rung 1 ("START HERE: ask each other where Web3 shows up…"), tap
"Keep going" for rung 2, then "Not now" — the skip is part of the pitch.
*Staging: both sides via the five-step form. Sender: clear the prefilled
Spark/Context, Values, Communication style, and Fun fact first, then fill
name, role, "I can help with", "I'd like to meet", interests
(Venture Capital, Web3). Receiver: fill name, role, "I can help with", "I'd
like to meet", interests (Web3, Zero Knowledge, Rust). Empty fields are
omitted from the payload, which is what keeps the shape confident.*

**3:30–4:10 — Guardrails and the stateless story.** While editing, local
pattern checks and (when reachable) sidecar advisory checks judge free-text
fields for pasted contact info and off-key tone. Advisory only — nothing ever
blocks saving. The sidecar sees only the text the receiver would already see,
and persists nothing.

**4:10–4:40 — (Optional) show one local estimate.** With the sidecar live you
can skip this; if you want the resilience beat, stop the sidecar and request a
read: the card is clearly labeled "Local estimate" with no ladder.

**4:40–5:00 — (Optional) Monad seal.** Only if the attestation flag is on;
otherwise close on the privacy line.

## Fallback show if the sidecar is unreachable at the venue

The local estimate **is** the show: beats 0:00–1:30 run fully local (setup +
share), the receiver scan renders the clearly-labeled local estimate with no
ladder, and the AI-prompt handoff still works (it is generated client-side).
Say the honest line: "the deep read needs the model host — here is exactly
what you get without it, and exactly what you get with it." Rehearsed with a
real refused connection locally; screenshot `artifacts/dogfood-10-local-estimate.png`.

## Phone-rehearsal checklist (real phone, real scan, no dev tools)

- [ ] Camera app opens the HTTPS URL — page loads on **cellular**, not venue
      Wi-Fi.
- [ ] `GET /health` from the phone browser returns `{"status":"ok"}` before
      doors open.
- [ ] QR scans from the back-row distance (projector brightness/contrast).
- [ ] Clipboard plan B: the sender page's "Connection String fallback" panel —
      paste it into the phone browser if the camera fails.
- [ ] Laptop browser plan C: rehearse once at 390 px emulation.
- [ ] Full dry run of the beats within the hour (a sidecar restart re-warms).
- [ ] Expect ~1.2–1.5 s dossiers; if venue latency approaches the client's
      2.5 s abort, the loading card stretches and a slow request degrades to
      the local estimate — decide in the moment whether that reads as honesty
      (it does).

## Known issues that touch the demo (local dogfood, 2026-09-26)

- **Guardrails contract drift (high):** the app's per-field advisory requests
  are rejected with 422 by the bundled sidecar, so sidecar-side advisories
  never render; local pattern advisories do (the beat-0:00 email flag is a
  local check). Degrades silently by contract — no user-visible failure.
  Fix tracked in the findings report.
- **Receiver speed door is a "coming soon" teaser** — the wizard is the
  receiver's working floor (spec deviation, noted in the findings report).
