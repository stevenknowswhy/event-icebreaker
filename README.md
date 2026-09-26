# Event Icebreaker

Event Icebreaker is a privacy-first, mobile-first conversation card for
in-person events. A sender creates a profile, chooses an openness level, and
shares a normal HTTPS URL by QR. The receiver opens that URL, sees a readable
Visual Card immediately, and can optionally copy an AI-ready prompt.

## Privacy architecture

- The sender's complete profile is stored only in browser `localStorage`.
- The openness filter creates a smaller, versioned JSON payload.
- The payload is encoded as UTF-8-safe Base64URL in the URL fragment.
- The receiver decodes and validates the fragment locally.
- There is no database, login, analytics, API key, or profile upload.
- Save-time guardrails are advisory only: with the optional stateless scorer
  configured, free-text profile fields are checked for pasted contact details
  and professional-room tone while you edit — flagged fields show a small
  advisory, nothing ever blocks saving, and an unreachable scorer is skipped
  silently. It sees only text the receiver would already see, and persists
  nothing. Local pattern checks cover the same fields; the sidecar-side
  checks are skipped silently whenever they cannot run, including when the
  request contract fails — advisories never depend on the network to be safe.
- The optional deep read posts the receiver's openness-filtered shared
  profile to the sidecar, which is stateless: it renders a dossier and
  forgets the request — nothing is persisted or logged. The dossier says
  what it is confident about and what it is not (escalation), and when the
  sidecar is unreachable the card is clearly labeled as a local estimate
  with the ladder hidden.
- Nothing from a session survives the browser tab: the profile lives in
  `localStorage` on the sender's device until the user clears it, the shared
  payload lives only in the URL, and the sidecar keeps no state.

## Routes

- `/` — Sender Mode
- `/receive#<payload>` — Receiver Mode

## Local development

```bash
npm install
npm run dev
```

## Verification

```bash
npm run lint
npm test
node tests/preview-flow.mjs
npx node@22 tests/dossier-flow.mjs
npx node@22 tests/guardrails-flow.mjs
```

The preview flow exercises sender generation, QR/share URL creation, receiver
decoding, AI-prompt copy, and manual Connection String recovery in a
phone-sized browser.

The dossier flow builds the app with a sidecar URL inlined, starts the
production server, and drives the two-way match states: setup doors with
consent-gated wizard completion, the confident sidecar dossier, the escalated
uncertainty state with the AI-prompt handoff, the sidecar-down local estimate,
and the loading card. It writes screenshots to `artifacts/`.

The guardrails flow runs the same way (sidecar URL inlined, endpoint mocked
per page) and drives the advisory banners: silent skip when the scorer is
unreachable, contact and tone flags on the affected wizard fields in both the
sender and receiver flows, banners clearing when the text is fixed, and saves
that proceed under a live flag.

## Runbook (deploying)

Two paths, rehearsed locally end to end. Every credential below is
user-provided — none are stored in this repo.

**Local rehearsal (what the demo dogfood ran).**

1. Sidecar per `laya-sidecar/`: install the Python environment (CPU
   PyTorch), fetch the Laya checkpoint into its cache, then
   `uvicorn app.main:app --host 127.0.0.1 --port 8080` with
   `LAYA_ALLOWED_ORIGINS` set to the app origin. Health at `/health`.
2. App: `NEXT_PUBLIC_LAYA_URL=http://127.0.0.1:8080 npm run build`, then
   `vinext start` — the sidecar URL is inlined at build time, so it is baked
   into the bundle you deploy.

**Sidecar host (public HTTPS for the demo).** `laya-sidecar/DEPLOY.md`:
Docker image, target an always-on ~2 GB host (Fly.io sizing), set
`LAYA_ALLOWED_ORIGINS` to the exact app origin(s) QR links are opened from.
Needs: the sidecar host + its HTTPS domain, and the model checkpoint cache
volume. No other secrets.

**App host (Cloudflare Workers).** The runtime is Cloudflare-targeted
(vinext), but the repo does not ship a wrangler config yet — wiring the
deploy is not done. Required at deploy: a wrangler config for this project
and the build-time `NEXT_PUBLIC_LAYA_URL` pointed at the sidecar's public
HTTPS URL. Needs: Cloudflare account access (user-provided) and the sidecar
public URL. Optional bindings (D1/R2) are not required by the current code.

**Flags.** The optional Monad testnet seal ships behind a default-off flag
(separate PR); enable it only after that PR is merged and the wallet is
provisioned. See `DEMO.md` for the run of show, fallback beats, and the
phone-rehearsal checklist.

