# Event Icebreaker

Event Icebreaker is a privacy-first, mobile-first connection optimizer for
in-person events. Quick Connect shares a compact conversation card immediately.
Optional Deep Connect adds a separately edited Personal Wiki, a hybrid QR
fallback, and receiver-controlled Mutual Connect.

## Privacy architecture

- The sender's complete Quick and Deep profiles remain in browser
  `localStorage`.
- Openness, intent, section, social-link, and contact-link filters run before
  anything is shared.
- Every hybrid QR retains a compact Base64URL Quick Connect fallback.
- Private Deep snapshots are encrypted in the browser with AES-GCM. The
  temporary database stores only ciphertext, IV, token hashes, and expiry
  metadata; the key remains in the URL fragment.
- AI-readable Deep is a separate, explicit privacy exception that temporarily
  stores only the exact filtered preview.
- Mutual Connect uses three receiver-approved fields locally and saves or
  uploads nothing.
- There is no login, analytics, exposed API key, contact harvesting, or
  persistent connection history.

## Routes

- `/` — Sender Mode
- `/receive#<payload>` — Receiver Mode
- `/deep/setup` — separate Personal Wiki editor and preview
- `/c/<token>#...` — hybrid Quick + Deep receiver
- `/protocol/v2` — human and agent protocol instructions
- `/api/deep-sessions/*` — encrypted temporary sessions
- `/api/agent-profiles/*` — explicitly readable temporary sessions

## Local development

```bash
npm install
npm run dev
```

## Verification

```bash
npm run lint
npm test
node tests/session-api-flow.mjs
node tests/preview-flow.mjs
```

The browser flow exercises Quick Connect, manual recovery, Personal Wiki
editing, Private Deep decryption, AI context copy, Mutual Connect consent,
AI-readable output, and revocation in a phone-sized viewport. The session API
test requires the worker-compatible local preview and migrated D1 database.

Production publishing remains a deliberate manual step after real-device QR
checks.
