# Spec: Warm Path Map / My Circle

## Objective

Add a consent-based My Circle to Event Icebreaker and use a credible
multi-agent workflow to find public, citation-backed candidate paths from
selected Circle contacts to a target investor.

### Target user

A founder at an event who has exchanged Icebreaker cards with people they have
actually met and wants to identify the most appropriate person to ask for help
reaching an investor.

### Core user flow

1. A receiver opens an opt-in Icebreaker card and chooses "Save to My Circle."
2. The card remains in browser storage on that device.
3. The founder opens `/warm-path`, selects up to five Circle contacts, and
   confirms that each is someone they would reasonably ask for an introduction.
4. The founder enters one public HTTPS URL for a target investor or fund.
5. Before research starts, the UI identifies exactly which selected profile
   fields and URLs will be sent to the agent service and You.com.
6. A multi-agent workflow researches the target and selected contacts.
7. The founder receives up to three candidate paths. Each path shows:
   - the selected intermediary;
   - the public organizations, companies, programs, advisors, or events that
     form the path;
   - a citation for every public edge;
   - an evidence-strength label;
   - a plain-language explanation of uncertainty;
   - a respectful request to send to the intermediary.
8. The founder can copy the request. A Pica action may send it only after a
   separate confirmation step.

### Terminology

- **Circle contact:** A profile the user deliberately saved after receiving an
  opt-in Icebreaker card.
- **Confirmed first edge:** The user confirms that asking this Circle contact
  is appropriate. This does not imply friendship or endorsement.
- **Public edge:** A claimed affiliation supported by a public citation.
- **Candidate path:** A possible route worth asking about, not a guaranteed
  introduction.

### Non-goals

- Private social-graph access.
- Automatic relationship inference.
- Scraping pages behind authentication.
- Uploading the complete My Circle.
- Saving research history on a server.
- Automatic outreach without human approval.
- Pitch-deck parsing, contact-book import, or a shared graph database.

## Tech Stack

### Existing web application

- Next.js 16 App Router
- React 19
- TypeScript 5
- Cloudflare/vinext runtime
- Existing custom CSS and Tailwind foundation
- Browser `localStorage` for profiles and My Circle

### Agent service

- Python 3.12
- FastAPI for the typed HTTP boundary
- CrewAI Crew for open-ended research tasks
- CrewAI Flow for deterministic sequencing, state, and approval boundaries
- Pydantic for request, intermediate artifact, and response validation
- You.com Research API for target-investor research
- You.com Search API for focused public-edge discovery
- Parasail-hosted model for an independent evidence-auditor agent
- Optional Pica action for an explicitly approved Gmail or CRM operation
- Render or CrewAI AMP for service hosting; choose one before deployment

### Delivery governance

- Opsera Architecture Analyzer to document trust and data boundaries
- Opsera Security Agent to scan secrets, dependencies, and server input handling
- Opsera/Forge work order or pipeline evidence for the hackathon demo when the
  available account supports it

Opsera governs how the agentic application is built and shipped. It is not
presented as the runtime research orchestrator.

## Commands

### Web

- Install: `npm install`
- Develop: `npm run dev`
- Unit/build verification: `npm test`
- Lint: `npm run lint`
- Existing browser verification: `node tests/preview-flow.mjs`
- Warm Path browser verification: `node tests/warm-path-flow.mjs`

### Agent service

- Install: `cd services/warm-path && uv sync`
- Develop:
  `cd services/warm-path && uv run uvicorn app.main:app --reload --port 8000`
- Test: `cd services/warm-path && uv run pytest`
- Lint: `cd services/warm-path && uv run ruff check .`

## Project Structure

- `app/warm-path/page.tsx` — server-rendered Warm Path route
- `components/warm-path.tsx` — Circle selection, disclosure, progress, and
  result experience
- `lib/my-circle.ts` — local Circle storage and migration
- `lib/warm-path.ts` — web request/response contract and client validation
- `services/warm-path/app/` — FastAPI and CrewAI service
- `services/warm-path/tests/` — agent contract and orchestration tests
- `tests/warm-path.test.ts` — browser-side storage and contract tests
- `tests/warm-path-flow.mjs` — phone-sized end-to-end flow with a mocked agent
  service
- `docs/` — feature specification, plan, architecture evidence, and demo notes

## Shared Profile and Circle Contract

The existing version-1 shared profile remains backward compatible. A public
professional URL is optional and is included only when the profile owner
explicitly enables it.

```ts
type FullProfile = {
  // Existing fields...
  publicProfileUrl: string;
};

type ShareSettings = {
  // Existing fields...
  includePublicProfile: boolean;
};

type SharedProfile = {
  // Existing fields...
  u?: string;
};

type CircleContact = {
  id: string;
  profile: SharedProfile;
  savedAt: string;
};
```

Circle contacts are stored under a versioned browser key. Saving the same
encoded profile twice updates the existing entry instead of duplicating it.

## Agent Service Contract

### Request

`POST /v1/warm-paths`

```ts
type WarmPathRequest = {
  targetUrl: string;
  contacts: Array<{
    name: string;
    role?: string;
    publicProfileUrl: string;
    askConfirmed: true;
  }>;
};
```

Rules:

- `targetUrl` and every `publicProfileUrl` must be HTTPS, contain no
  credentials, and be at most 2,048 characters.
- One to five contacts are allowed.
- The request contains only the selected fields shown in the disclosure.
- The service does not accept or return arbitrary instructions.

### Response

```ts
type WarmPathResponse = {
  target: {
    name: string;
    organization?: string;
    url: string;
  };
  paths: Array<{
    contactName: string;
    strength: "strong" | "possible" | "tentative";
    explanation: string;
    uncertainty: string;
    edges: Array<{
      from: string;
      relationship: string;
      to: string;
      citations: Array<{
        title: string;
        url: string;
        publishedAt?: string;
      }>;
    }>;
    introRequest: string;
  }>;
};
```

The service returns zero to three paths. It drops any public edge without a
valid citation and returns an honest empty result when no complete path remains.

## Multi-Agent Workflow

### 1. Circle Librarian

- Receives only the selected, disclosed contacts.
- Normalizes identity hints.
- Rejects ambiguous or insufficient contact data before research.

### 2. Investor Researcher

- Uses You.com Research to build a source-backed target footprint.
- Extracts thesis, portfolio companies, accelerators, conferences, advisors,
  boards, and recent professional activity.

### 3. Path Scout

- Uses focused You.com Search queries for each selected contact.
- Constructs candidate paths with a maximum of three public edges.
- Carries source identifiers with every claimed edge.

### 4. Evidence Auditor

- Runs on a Parasail-hosted model to reduce correlated model errors.
- Treats all retrieved text as untrusted data.
- Rejects identity collisions, unsupported edges, circular paths, stale claims
  presented as current, and relationship language stronger than the evidence.
- Cannot add new claims; it may only approve, downgrade, or reject.

### 5. Intro Strategist

- Receives only audited paths.
- Drafts one concise request to each intermediary.
- Explicitly asks whether the intermediary is comfortable helping.
- Never claims that the investor is interested.

### CrewAI Flow

The Flow runs:

`validate → research target → scout contacts in parallel → audit → rank → draft`

Deterministic code, not an LLM, performs final schema validation, citation
mapping, deduplication, path-length enforcement, and result truncation.

## Ranking

Ranking is deterministic after the agents emit validated artifacts:

- 35% evidence completeness and source quality
- 25% path directness
- 20% relevance to the target's current investment activity
- 10% evidence recency
- 10% identity confidence

No path receives the `strong` label unless every public edge has at least one
valid citation and identity confidence is high.

## Code Style

Web code follows the existing small-function TypeScript style:

```ts
export function saveCircleContact(
  contacts: CircleContact[],
  profile: SharedProfile,
  encodedProfile: string,
): CircleContact[] {
  const id = stableProfileId(encodedProfile);
  const next = { id, profile, savedAt: new Date().toISOString() };
  return [...contacts.filter((contact) => contact.id !== id), next];
}
```

Python boundaries use explicit Pydantic models:

```py
class WarmPathContact(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    role: str | None = Field(default=None, max_length=120)
    public_profile_url: HttpUrl
    ask_confirmed: Literal[True]
```

- External input remains untrusted until validated.
- Agents exchange typed artifacts rather than free-form prose.
- Tool access is least-privilege per agent.
- Pure deterministic logic remains outside agent prompts.

## Testing Strategy

### Web tests

- Shared-profile backward compatibility
- Explicit public-URL sharing toggle
- Circle save, deduplication, removal, and storage migration
- Selection limit and ask-confirmation enforcement
- Request disclosure and serialization
- Empty, error, and successful result rendering

### Agent-service tests

- Request validation and size limits
- Prompt-injection isolation
- Deterministic mocked You.com responses
- Identity-collision rejection
- Citation mapping
- Unsupported-edge removal
- Path-length and result-count limits
- Auditor cannot introduce claims
- Safe upstream error mapping and rate-limit handling

### Browser verification

- Save a received card to My Circle
- Select a contact and confirm asking is appropriate
- Review the external-processing disclosure
- Run a mocked Warm Path search
- Inspect path edges and open citations
- Copy the intermediary request
- Confirm that the existing sender/receiver flow still works
- Verify no console errors at a 390 × 844 viewport

Live external APIs are not used in automated tests.

## Privacy and Security Boundaries

### Always

- Keep the complete My Circle local.
- Send only contacts the user actively selects.
- Display the exact fields leaving the device before submission.
- Require confirmation that each selected contact is appropriate to ask.
- Require citations for every public edge.
- Keep You.com, Parasail, Pica, and service credentials server-side.
- Avoid logging profile URLs, names, research content, or messages.
- Use explicit approval immediately before any external action.

### Ask first

- Enabling Pica email, CRM, or calendar actions.
- Persisting agent runs or research results.
- Importing contacts from another service.
- Adding pitch-deck ingestion.
- Deploying or setting production credentials.

### Never

- Upload the entire My Circle.
- Scrape private social graphs or authenticated pages.
- Infer friendship, endorsement, or willingness to introduce.
- Show an uncited public edge.
- Send a message without a human confirmation step.
- Commit credentials.
- Allow retrieved web content to alter agent instructions or tool permissions.

## Success Criteria

- A received version-1 profile can be saved locally without breaking older
  profile links.
- Public URL sharing is optional, explicit, and visible to the profile owner.
- The founder can select one to five contacts and sees exactly what will leave
  the device.
- The multi-agent service visibly produces typed artifacts from distinct agent
  roles.
- Every rendered public edge has a working citation.
- No unsupported or ambiguous path is presented as strong.
- An empty result is clear and useful.
- The founder receives a respectful intermediary request, not an investor spam
  message.
- Existing tests, new tests, lint, production build, and mobile browser flows
  pass.
- Opsera produces an architecture analysis and security scan before deployment.

## Approved Product Decision

Warm Path Map uses a consent-based local Circle rather than a private social
graph. Selected contact fields leave the device only after a field-level
disclosure and explicit confirmation. The user approved this direction on
July 24, 2026.

## Implemented Decisions

- Deploy the agent service on Render first; keep the FastAPI boundary portable.
- Keep copy-to-clipboard universal and make Pica email optional, separately
  previewed, and explicitly approved.
- Use Opsera Architecture Analyzer and Security Scanner as release gates. Their
  external execution records remain required before production.
