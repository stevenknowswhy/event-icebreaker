# Warm Path Map / My Circle

## Problem Statement

How might we help a founder find a legitimate, evidence-backed route to a
target investor without scraping private social graphs or pretending that a
public affiliation is a real relationship?

## Recommended Direction

Turn profiles exchanged through Event Icebreaker into an opt-in, local
"My Circle." A founder can save a received card, later select up to five people
they would genuinely feel comfortable asking for help, and research public
paths from those people to a target investor.

The first edge is user-confirmed: the founder received the contact's consented
card and confirms that asking them is appropriate. Every later edge must be
supported by public citations. The product returns a small number of
explainable candidate paths and a respectful request to the intermediary. It
does not claim that an introduction is available until the intermediary agrees.

This direction is native to the existing product: each real-world card exchange
makes the founder's private, consent-based Circle more useful over time.

## Key Assumptions to Validate

- [ ] Founders will save a few high-value event contacts when the action is
      quick and the storage remains local.
- [ ] At least some saved contacts will share a public URL that disambiguates
      their identity.
- [ ] Public evidence can produce useful paths through portfolio companies,
      accelerators, conferences, advisors, and professional organizations.
- [ ] Founders prefer two or three well-supported paths over a large,
      speculative network graph.
- [ ] A transparent "no supported path found" result increases trust.

## MVP Scope

- Save a received, opt-in Icebreaker card to local My Circle storage.
- Let the card owner optionally share one public professional URL.
- Let the founder select up to five Circle contacts and confirm that each is
  appropriate to ask.
- Research one target investor or fund URL.
- Return up to three candidate paths with a citation for every public edge.
- Label uncertainty and identity ambiguity.
- Draft one intermediary introduction request.
- Require explicit human approval before any Pica-powered external action.

## Not Doing (and Why)

- Scraping LinkedIn connections or followers — prohibited, unreliable, and not
  consent-based.
- Importing an entire address book — unnecessary for testing the core value and
  creates a larger privacy burden.
- Calling a public affiliation a friendship — evidence of shared context is not
  evidence of a relationship.
- Ranking hundreds of contacts — costly, slow, and likely to amplify weak
  evidence.
- Automatic outreach — the intermediary must remain in control.
- Pitch-deck ingestion — useful later, but not required to validate warm-path
  discovery.
- A database or shared network graph — My Circle remains local in the MVP.

## Open Questions

- Does the first demo use an optional Pica Gmail action, or stop at a copyable
  request?
- Is the agent service deployed to Render or CrewAI AMP?
- Which Opsera Agent and Forge capabilities are available to the team during
  the hackathon?
