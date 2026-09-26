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
  nothing.

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

