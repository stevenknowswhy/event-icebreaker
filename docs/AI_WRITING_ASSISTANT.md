# Spec: Privacy-Gated AI Writing Assistant

## Objective

Help a user turn a rough Personal Wiki section into a stronger draft without
silently changing their profile or searching for them online.

The agreed flow has two independent actions:

1. **Rewrite draft** sends only the selected section text to Parasail.
2. **Verify & enrich** sends the selected text plus user-approved public source
   URLs to You.com Research.

Both actions return proposals. The original remains unchanged until the user
explicitly accepts a proposal.

## Tech Stack

- Existing Next.js/Vinext/TypeScript site
- Parasail OpenAI-compatible Chat Completions API for rewriting
- You.com Research API for citation-backed research
- Existing ChatGPT Sites/Cloudflare Worker runtime for the secure endpoints
- Render-compatible environment variable names so the same endpoints can be
  hosted there later without changing the browser contract

## Commands

- Develop: `npm run dev`
- Unit, build, and rendered-route tests: `npm test`
- Lint: `npm run lint`
- Browser flow: `node tests/preview-flow.mjs`

## Project Structure

- `components/deep-profile-setup.tsx` — Personal Wiki editing flow
- `components/ai-writing-assistant.tsx` — field-level proposal and consent UI
- `lib/ai-writing.ts` — request validation and provider response normalization
- `app/api/ai/rewrite/route.ts` — Parasail server boundary
- `app/api/ai/research/route.ts` — You.com server boundary
- `tests/ai-writing.test.ts` — request and response contract tests

## Code Style

Use small typed functions with explicit inputs and safe defaults:

```ts
const request = validateRewriteRequest({
  text,
  style: "wikipedia",
  section: "background",
});
```

Provider credentials remain server-side. Client components call only the
application's same-origin API routes.

## Testing Strategy

- Unit tests validate text limits, styles, URL consent, prompt construction,
  and provider response normalization.
- Rendered HTML verifies the assistant is available on `/deep/setup`.
- Browser testing verifies original text is preserved until acceptance and
  research cannot start without explicit consent and an approved URL.
- External provider calls are not made by automated tests.

## Boundaries

- Always:
  - Send only the active section to Rewrite.
  - Require a separate checkbox before Verify & Enrich.
  - Show the exact information that will leave the device.
  - Keep the original visible and unchanged until **Use this version**.
  - Return no-store responses and bounded, user-safe errors.
- Ask first:
  - Adding automatic searches by a person's name.
  - Importing account data.
  - Persisting drafts or research results on a server.
- Never:
  - Expose provider API keys in browser code.
  - Search automatically while the user types.
  - Treat researched claims as verified facts without citations and review.
  - Add AI output directly to a QR, saved profile, or public page.

## Success Criteria

- A user can request concise, professional, conversational, or
  Wikipedia-style rewrites.
- Only one section's draft is sent for rewriting.
- The original remains intact until the user accepts the proposal.
- Research requires explicit consent and one to five valid HTTPS source URLs.
- You.com results include readable source links when the provider returns them.
- Missing credentials produce a helpful configuration state without breaking
  profile editing.
- Existing sender, receiver, Deep Connect, and privacy tests still pass.

## Open Questions

- `PARASAIL_API_KEY`, `PARASAIL_MODEL`, and `YDC_API_KEY` must be added to the
  hosted runtime before live provider calls work.
- Render can host the same routes later, but the existing connected Sites
  deployment remains the first publishing target.
