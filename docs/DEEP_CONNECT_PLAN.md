# Event Icebreaker: Hybrid Handshake and Deep Connect Plan

## Status

Approved on July 24, 2026. Phase 1 is implemented on the
`codex/deep-connect-phase-1` branch. Later phases remain gated by their
checkpoints and do not authorize deployment until reviewed.

## Objective

Expand Event Icebreaker from a one-way conversation card into a
privacy-focused connection optimizer without weakening the current instant
Quick Connect experience.

The updated product will provide:

1. **Quick Connect** — the existing local, compact, self-contained profile
   experience.
2. **Deep Connect** — an optional, separately created Personal Wiki that the
   sender filters for each share.
3. **Hybrid handshake** — a QR containing a short temporary session token,
   a decryption key in the URL fragment, and a compact Quick Connect fallback.
4. **Receiver control** — no receiver information is shared unless the
   receiver selects and previews it.
5. **AI interoperability** — private profiles can be copied as approved AI
   context; temporary agent-readable links are a separate explicit opt-in.

## Assumptions for Review

1. Quick Connect remains the default and must work without the Deep service.
2. Existing version 1 QR links and Connection Strings remain valid.
3. The Personal Wiki is created in a separate builder introduced at the end
   of Quick Connect onboarding; it is never required.
4. Personal Wiki sections are stored locally and rendered dynamically from
   structured, user-approved content.
5. The first Personal Wiki generator is deterministic and editable. Any
   third-party AI drafting integration requires a separate privacy decision.
6. Private Deep Connect uses client-side AES-GCM encryption. The server stores
   ciphertext, expiry metadata, and an opaque token, but no readable profile.
7. The decryption key remains in the URL fragment and is not stored with the
   encrypted capsule.
8. Agent-readable Deep Connect is a separate mode because an AI browsing a
   URL must be able to retrieve readable content.
9. No login, analytics, contact harvesting, or receiver profiling is added.
10. "Max" means all fields approved for that share, not all locally stored
    fields.

## Recommended Defaults

- Default connection mode: **Quick Connect**
- Default Deep privacy mode: **Private encrypted**
- Default Deep expiry: **End of the current day**
- Default social/contact links: **Off**
- Deep sessions: **Reusable until expiry** for the first release
- Agent-readable access: **Off** and shown with a clear privacy warning
- Expired or unavailable session: **Render Quick fallback**
- Personal Wiki presentation: **One dynamic page with anchored sections**

## Product Model

### Connection Mode

| Mode | Purpose | Network dependency |
| --- | --- | --- |
| Quick Connect | Immediate card, conversation starters, and AI prompt | None after the receiver page is loaded |
| Private Deep Connect | Encrypted, expiring Personal Wiki | Required for Deep content only |
| Agent-Readable Deep Connect | Temporary readable profile for browsing agents | Required |
| Mutual Connect | Receiver-selected share-back and connection brief | Required only when the receiver opts in |

### Disclosure Controls

Connection mode and disclosure depth remain separate controls.

| Openness | Default Personal Wiki content |
| --- | --- |
| Low | Short biography, selected interests, ask-me-about topics |
| Medium | Low plus current projects, offers, asks, selected milestones |
| High | Medium plus personal story, values, and communication preferences |
| Max | Every section explicitly approved for this share |

Social links, contact methods, location, and personal story are independent
switches. They are never included merely because the openness level increased.

## Personal Wiki Data Model

The locally stored Deep profile should contain structured sections rather than
pre-rendered HTML:

- Overview and short biography
- Background and formative experiences
- Current work and projects
- Selected timeline milestones
- Values and worldview
- Interests outside work
- What I can help with
- What I am looking for
- Ask me about
- Preferred ways to connect
- Selected social links
- Selected contact methods

Every section records:

- Content
- User approval status
- Default minimum openness
- Allowed connection intents
- Included/excluded status for the current share
- Last edited timestamp

Raw HTML is never accepted or stored. The application renders validated text,
lists, dates, and links through controlled components.

## Hybrid URL Protocol

Conceptual version 2 URL:

```text
https://geticebreaker.app/c/<session-token>#v=2&p=<quick-fallback>&k=<deep-key>
```

- `<session-token>` is a cryptographically random, opaque identifier.
- `p` is a compact versioned Quick Connect payload.
- `k` is the client-side decryption key for a private Deep capsule.
- The Deep profile content is not stored in the QR.
- The QR never contains prose protocol instructions.
- The receiver page uses `v=2` and a stable `/protocol/v2` page to explain
  the protocol to people and compatible agents.

If the session is missing, expired, unavailable, or cannot be decrypted, the
receiver still sees the Quick Connect card from `p`.

## Sender Workflow

1. Complete or edit the existing Quick Connect profile.
2. At onboarding completion, see an optional **Create my Connection Story**
   action.
3. Enter the separate Personal Wiki builder.
4. Complete, preview, edit, and approve individual sections.
5. Return to the share screen and choose:
   - Quick only
   - Quick plus Private Deep
   - Quick plus Agent-Readable Deep
6. Choose openness, intent, individual categories, and expiry.
7. Review an exact "What this person will receive" preview.
8. Generate the filtered snapshot and hybrid QR.
9. Revoke the Deep session when desired. Quick fallback remains readable to
   anyone retaining the original link.

## Receiver Workflow

1. Scan the QR with a standard camera.
2. Render Quick Connect immediately from the local fallback.
3. If Deep content exists, show its privacy mode and expiry before opening it.
4. For Private Deep:
   - Fetch ciphertext.
   - Decrypt locally.
   - Validate the decrypted profile.
   - Render the approved Personal Wiki.
5. Offer **Copy approved context for AI** after local decryption.
6. For Agent-Readable Deep:
   - Explain that the temporary page is readable by anyone with the link.
   - Provide human HTML and clean machine-readable output.
7. Offer **Find our connection** without requiring it.
8. Before receiver share-back, show the exact selected fields and require
   confirmation.
9. Generate a connection brief only from mutually disclosed information.

## AI Interoperability

### Private mode

Browsing agents cannot be expected to read a client-side encrypted page.
The reliable action is **Copy approved context for AI**, which copies:

- The approved Deep profile fields
- The protocol version
- Respectful-use instructions
- A request for conversation or connection analysis

### Agent-readable mode

When the sender explicitly enables it, provide temporary representations:

- Human-readable page
- Markdown representation
- Versioned JSON representation

The agent instructions must say:

- Use only the supplied profile.
- Do not infer sensitive traits.
- Do not search for additional personal information unless explicitly asked.
- Distinguish user-supplied facts from generated suggestions.
- Produce respectful, specific connection ideas.

## Privacy and Security Boundaries

### Always

- Filter before encryption or upload.
- Preview every field before sharing.
- Validate size, type, URL protocol, and section limits.
- Encrypt Private Deep capsules in the browser.
- Store only ciphertext and minimal expiry metadata for Private Deep.
- Preserve the Quick fallback when Deep fails.
- Use cryptographically random tokens and keys.
- Sanitize rendered links and use safe external-link attributes.
- Keep existing localStorage data migrations backward compatible.
- Test on mobile Safari and Android Chrome.

### Ask First

- Enabling the D1 database and applying its first migration
- Adding any AI provider or transmitting Personal Wiki content to it
- Adding plaintext Agent-Readable storage
- Changing the public URL structure
- Adding rate-limiting infrastructure or a new dependency
- Adding authentication, analytics, or persistent connection history

### Never

- Put secrets in client JavaScript.
- Store Private Deep plaintext on the server.
- Send the canonical full profile and hide sections only in the UI.
- Include social or contact links based solely on openness.
- Automatically share receiver information.
- Treat Base64URL encoding as encryption.
- Promise that expiry prevents screenshots, copies, or forwarded links.
- Render user-supplied HTML.

## Technical Stack

- Next.js/Vinext, React, and TypeScript
- Browser `localStorage` for Quick and canonical Deep profiles
- Web Crypto AES-GCM for Private Deep capsules
- Cloudflare D1 through the existing Drizzle setup for encrypted temporary
  session records
- Existing Base64URL version 1 codec retained for backward compatibility
- Version 2 hybrid URL codec added alongside version 1
- Existing `react-qr-code` renderer
- Node test runner for protocol and filtering tests
- Playwright for mobile sender-to-receiver verification

## Commands

```bash
npm run dev
npm run lint
npm test
node tests/preview-flow.mjs
npm run build
```

Database migration commands will be added to the checklist only after D1 use
is explicitly approved and the final session schema is reviewed.

## Expected Project Structure

```text
app/
  c/[token]/page.tsx          Hybrid receiver route
  deep/setup/page.tsx         Separate Personal Wiki builder
  protocol/v2/page.tsx        Human and agent protocol instructions
  api/deep-sessions/          Temporary session endpoints
components/
  deep-profile-setup.tsx      Section editor and approval flow
  deep-profile-page.tsx       Controlled dynamic renderer
  deep-share-controls.tsx     Mode, openness, category, and expiry controls
lib/
  deep-profile.ts             Schema, validation, filtering, migration
  deep-crypto.ts              AES-GCM helpers
  hybrid-url.ts               Version 2 URL creation and parsing
db/
  schema.ts                   Encrypted temporary session records
tests/
  deep-profile.test.ts
  deep-crypto.test.ts
  hybrid-flow.mjs
docs/
  DEEP_CONNECT_PLAN.md
```

Exact file names may be adjusted to match framework routing constraints, but
tasks should remain limited to five files or fewer.

## Code Style

Use small, typed functions with validation at trust boundaries:

```ts
export function createDeepSnapshot(
  profile: DeepProfile,
  settings: DeepShareSettings,
): DeepSnapshot {
  const approved = profile.sections.filter((section) => section.approved);
  return filterSectionsForShare(approved, settings);
}
```

- Prefer pure functions for filtering, serialization, and validation.
- Keep browser crypto separate from storage and UI code.
- Use explicit names such as `ciphertext`, `decryptionKey`, and
  `quickFallback`; never call encoded content encrypted.
- Do not add a state-management framework for this feature.

## Testing Strategy

### Unit tests

- Version 1 payloads remain valid.
- Version 2 URLs round-trip Unicode safely.
- Every openness and category combination filters correctly.
- Social and contact links stay excluded unless selected.
- AES-GCM encrypt/decrypt round-trips and rejects tampering.
- Decrypted and agent-readable content passes the same validation.
- Expiry and invalid tokens fail closed.

### Integration tests

- Create encrypted session, retrieve ciphertext, and delete/revoke it.
- Confirm database records contain no Private Deep plaintext.
- Confirm expired Deep sessions fall back to Quick Connect.
- Confirm an invalid key never reveals partial content.

### Browser tests

- Complete Quick onboarding and follow the optional Deep builder link.
- Create, preview, and edit a Personal Wiki.
- Generate and scan a hybrid QR in a phone-sized viewport.
- Render Quick before Deep finishes loading.
- Open, decrypt, and render Private Deep.
- Copy approved AI context.
- Verify receiver share-back requires field preview and confirmation.
- Verify manual Connection String recovery still works.

### Real-device checks

- iPhone Camera to Safari
- Android Camera to Chrome
- Low-light QR scanning at normal conversational distance
- Clipboard and Web Share fallbacks
- Expired, revoked, offline, and server-error behavior

## Implementation Checklist

### Phase 0: Confirm the specification

- [x] Approve or change the assumptions and recommended defaults.
- [x] Confirm the Personal Wiki section list.
- [x] Confirm default Deep expiry.
- [x] Confirm whether Agent-Readable mode belongs in the first release.
- [x] Confirm whether receiver share-back belongs in the first release.

**Checkpoint:** No implementation begins until this phase is approved.

### Phase 1: Version 2 foundations

- [x] Define the Deep profile, section, share-setting, and snapshot schemas.
  - Acceptance: Invalid or unapproved sections cannot enter a snapshot.
  - Verify: Unit tests cover every openness and category combination.
  - Likely files: `lib/deep-profile.ts`, `tests/deep-profile.test.ts`.
- [x] Define the hybrid URL builder and parser.
  - Acceptance: URL carries a token, Quick fallback, key, and version without
    containing Deep plaintext.
  - Verify: Unicode round-trip and malformed URL tests pass.
  - Likely files: `lib/hybrid-url.ts`, `tests/deep-profile.test.ts`.
- [x] Preserve version 1 receiver behavior.
  - Acceptance: Existing QR links and Connection Strings still render.
  - Verify: Existing test suite remains green.
  - Likely files: `lib/icebreaker.ts`, `tests/icebreaker.test.ts`.

**Checkpoint: Protocol**

- [x] `npm run lint`
- [x] `npm test`
- [x] Review representative version 1 and version 2 URLs.

### Phase 2: Separate Personal Wiki creation

- [ ] Add an optional Deep Connect invitation after Quick onboarding.
  - Acceptance: Users can skip it without changing their current profile or
    share flow.
  - Verify: Browser test covers "create now" and "later."
  - Likely files: `components/profile-setup.tsx`,
    `components/icebreaker-app.tsx`.
- [ ] Build the separate structured Personal Wiki editor.
  - Acceptance: Users can edit, approve, and exclude individual sections.
  - Verify: Reloading preserves the locally stored draft and approvals.
  - Likely files: `app/deep/setup/page.tsx`,
    `components/deep-profile-setup.tsx`, `lib/deep-profile.ts`.
- [ ] Build the dynamic Personal Wiki preview.
  - Acceptance: It renders controlled components only and never raw HTML.
  - Verify: Every supported section and empty-state renders correctly.
  - Likely files: `components/deep-profile-page.tsx`,
    `app/deep/setup/page.tsx`, `app/globals.css`.

**Checkpoint: Personal Wiki**

- [ ] Quick onboarding remains optional and fast.
- [ ] Personal Wiki can be created, reviewed, edited, and reopened.
- [ ] No Personal Wiki data has left the device.

### Phase 3: Share-specific filtering

- [ ] Add Deep mode, openness, category, and expiry controls.
  - Acceptance: Links, contact methods, location, and personal story remain
    separate explicit switches.
  - Verify: The selected settings match the generated snapshot.
  - Likely files: `components/deep-share-controls.tsx`,
    `components/icebreaker-app.tsx`, `lib/deep-profile.ts`.
- [ ] Add an exact disclosure preview before generation.
  - Acceptance: The preview and encrypted snapshot contain identical fields.
  - Verify: Snapshot comparison test and manual UI check pass.
  - Likely files: `components/deep-share-controls.tsx`,
    `components/deep-profile-page.tsx`.

**Checkpoint: Consent**

- [ ] No canonical full Deep profile is uploaded.
- [ ] Max contains only approved, selected fields.
- [ ] Links remain off by default.

### Phase 4: Private encrypted sessions

- [ ] Add and test browser AES-GCM helpers.
  - Acceptance: Plaintext encrypts and decrypts locally; modified ciphertext,
    IV, or key is rejected.
  - Verify: `tests/deep-crypto.test.ts`.
  - Likely files: `lib/deep-crypto.ts`, `tests/deep-crypto.test.ts`.
- [ ] Review and enable the encrypted-session D1 schema.
  - Acceptance: Records contain only token hash, ciphertext, IV, timestamps,
    expiry, and revocation state.
  - Verify: Migration review and database integration test.
  - Likely files: `db/schema.ts`, `drizzle.config.ts`, generated migration.
- [ ] Add bounded create, retrieve, and revoke endpoints.
  - Acceptance: Size limits, expiry, token validation, and safe errors are
    enforced; no profile content is logged.
  - Verify: API integration tests cover valid, expired, revoked, oversized,
    and missing sessions.
  - Likely files: `app/api/deep-sessions/route.ts`,
    `app/api/deep-sessions/[token]/route.ts`, `db/index.ts`.
- [ ] Generate the hybrid QR only after session creation succeeds.
  - Acceptance: Failure produces a working Quick-only QR and a clear notice.
  - Verify: Browser tests cover success and server failure.
  - Likely files: `components/icebreaker-app.tsx`,
    `lib/hybrid-url.ts`, `lib/deep-crypto.ts`.

**Checkpoint: Encrypted transport**

- [ ] Inspect stored records and confirm no Personal Wiki phrase is present.
- [ ] Tampered keys and ciphertext fail safely.
- [ ] Deep service failure leaves Quick Connect usable.

### Phase 5: Hybrid receiver

- [ ] Add the short `/c/[token]` receiver route.
  - Acceptance: Quick fallback renders before the session fetch completes.
  - Verify: Throttled browser test demonstrates immediate Quick rendering.
  - Likely files: `app/c/[token]/page.tsx`,
    `components/icebreaker-app.tsx`, `lib/hybrid-url.ts`.
- [ ] Fetch, decrypt, validate, and render Private Deep.
  - Acceptance: Only validated approved sections appear.
  - Verify: Valid, expired, revoked, invalid-key, and offline cases pass.
  - Likely files: `app/c/[token]/page.tsx`,
    `components/deep-profile-page.tsx`, `lib/deep-crypto.ts`.
- [ ] Add privacy and expiry disclosure.
  - Acceptance: Receiver sees the privacy mode, expiry, and copying limitation
    before opening Deep content.
  - Verify: Accessibility and mobile UI review pass.
  - Likely files: `app/c/[token]/page.tsx`, `app/globals.css`.

**Checkpoint: End-to-end private handshake**

- [ ] Sender creates Personal Wiki and filtered snapshot.
- [ ] QR opens Quick immediately.
- [ ] Private Deep decrypts locally.
- [ ] Expired or unavailable Deep falls back cleanly.
- [ ] Existing `/receive#<v1-payload>` remains functional.

### Phase 6: AI instructions

- [ ] Publish the version 2 protocol instructions.
  - Acceptance: Human and AI instructions explain Quick, Private Deep,
    disclosure limits, and prohibited sensitive inference.
  - Verify: Page is readable without JavaScript and has stable headings.
  - Likely files: `app/protocol/v2/page.tsx`, `app/globals.css`.
- [ ] Add Copy approved context for AI.
  - Acceptance: Copied text contains only the decrypted filtered snapshot and
    protocol instructions.
  - Verify: Clipboard output snapshot test and mobile browser check.
  - Likely files: `components/deep-profile-page.tsx`,
    `lib/deep-profile.ts`.

**Checkpoint: Private AI workflow**

- [ ] An AI can use copied context without accessing the private link.
- [ ] Copied context contains no excluded fields.

### Phase 7: Optional Agent-Readable mode

- [ ] Add a separate consent screen and warning.
  - Acceptance: The sender must explicitly acknowledge that anyone with the
    temporary link can read it.
  - Verify: Agent-Readable generation is impossible without acknowledgement.
- [ ] Add temporary HTML, Markdown, and JSON representations.
  - Acceptance: All formats expose the same filtered fields and expire
    together.
  - Verify: Format comparison and expiry tests pass.
- [ ] Add revocation and visible expiry.
  - Acceptance: Revoked URLs stop returning profile content.
  - Verify: Browser and API tests cover revocation.

**Checkpoint: Agent-readable privacy exception**

- [ ] Private mode remains the default.
- [ ] Plaintext storage/transmission is clearly labeled.
- [ ] Excluded fields are absent from every representation.

### Phase 8: Receiver-controlled Mutual Connect

- [ ] Add receiver profile source selection.
  - Acceptance: Receiver can stay anonymous, answer three questions, or load a
    local profile.
- [ ] Add exact receiver disclosure preview.
  - Acceptance: Nothing is sent before confirmation.
- [ ] Generate the connection brief from mutually shared fields only.
  - Acceptance: The brief identifies common ground, complementary value,
    questions, and one next step without sensitive inference.

**Checkpoint: Mutual consent**

- [ ] Receiver decline leaves no shared profile.
- [ ] Connection brief source fields are inspectable.
- [ ] No contact exchange happens automatically.

### Phase 9: Hardening and release

- [ ] Run unit, integration, browser, accessibility, and build checks.
- [ ] Test QR scanning and expiry on real iPhone and Android devices.
- [ ] Review storage, logging, secret, link, and content-injection boundaries.
- [ ] Document the new privacy model and limitations.
- [ ] Deploy a private preview and test the entire sender-to-receiver flow.
- [ ] Publish only after explicit approval.
- [ ] Preserve the previous production version as the rollback target.

## Success Criteria

The update is ready only when:

- Existing Quick Connect URLs continue to work.
- Quick Connect remains usable when the Deep service is offline.
- Personal Wiki creation is optional and separate from Quick onboarding.
- Users can approve and filter Personal Wiki sections per share.
- The hybrid QR contains no Deep profile plaintext.
- Private Deep content is encrypted before upload and decrypted locally.
- D1 stores no readable Private Deep profile content.
- Expired, revoked, malformed, and tampered sessions fail safely.
- Social/contact links require explicit selection.
- Receiver information is never shared without preview and confirmation.
- AI context contains only approved filtered content.
- Agent-Readable mode, if included, requires explicit acknowledgement.
- The complete flow passes preview and real-device QR tests before publishing.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Deep service complexity harms Quick reliability | High | Quick fallback renders independently and first |
| Link forwarded or screenshot | High | Clear warning, short expiry, revocation; never promise DRM |
| Server learns Private Deep profile | High | Filter and encrypt in browser; store ciphertext only |
| Agent-readable link weakens privacy | High | Separate mode, explicit acknowledgement, short TTL |
| QR becomes too dense | Medium | Keep Deep content out of QR; compact fallback and measure length |
| Old QR links break | High | Retain and test version 1 decoding |
| Public session endpoint is abused | Medium | Strict payload limits, short TTL, rate limiting before public release |
| AI invents biography | Medium | User-approved structured content; deterministic first release |
| Social links expose more than expected | Medium | Separate switches, off by default, exact preview |
| One-time links fail during mobile tab switching | Medium | Reusable-until-expiry first; add one-time mode later |

## Approved Implementation Decisions

1. Deep sessions expire at the end of the current day by default.
2. Private Deep ships before Agent-Readable mode.
3. Mutual Connect follows the hybrid receiver.
4. D1 may be enabled for encrypted ephemeral session records.
5. Deterministic, user-edited Personal Wiki generation ships before any
   third-party AI drafting integration.
