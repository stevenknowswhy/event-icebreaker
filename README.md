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
```

The preview flow exercises sender generation, QR/share URL creation, receiver
decoding, AI-prompt copy, and manual Connection String recovery in a
phone-sized browser.
