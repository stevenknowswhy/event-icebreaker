import type { SharedProfile } from "./icebreaker.ts";
import { deepMatch, type DeepMatchOptions } from "./laya-client.ts";

/**
 * The MatchDossier contract shared with the Laya sidecar (blueprint
 * art_gdKW4J5q). All scoring and ladder selection live server-side; this
 * module only declares the wire shape, requests a dossier, and degrades to a
 * local estimate when the sidecar is off or down. Keep this type identical to
 * the Python sidecar's `MatchDossier` — the spec is the single source of
 * truth, and `validateMatchDossier` fails closed on drift.
 */
export type MatchShapeKind =
  | "peer"
  | "collab"
  | "mentor"
  | "investor"
  | "customer"
  | "unclear";

export type MatchInsight = { interest: string; why: string };

export type Rung = { level: 1 | 2 | 3; question: string; why: string };

export type MatchDossier = {
  shape: { kind: MatchShapeKind; confidence: number };
  dimensions: Array<{
    id: string;
    label: string;
    verdict: string;
    confidence: number;
    evidence: string[];
  }>;
  bridge: MatchInsight | null;
  curiosityGap: MatchInsight | null;
  score: { value: number; band: "low" | "some" | "strong"; byShape: string };
  bestFirstMove: string;
  ladder: Rung[];
  escalated: boolean;
};

// ---------------------------------------------------------------------------
// Local fallback estimate
//
// Pure, deterministic, and deliberately shallow: word-overlap set logic over
// the openness-filtered shared profiles. This is NOT the sidecar's weighted,
// shape-aware composition (which lives only in Python) — it is the honest
// "sidecar unavailable" estimate, always flagged `escalated: true` with no
// conversation ladder.
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from",
  "how", "in", "into", "is", "it", "me", "my", "of", "on", "or", "our",
  "so", "that", "the", "their", "them", "they", "this", "to", "was", "we",
  "with", "what", "who", "you", "your",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)),
  );
}

function sharedTokens(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((token) => b.has(token));
}

// Rough local bands — the sidecar owns the calibrated composition.
const LOCAL_STRONG_BAND = 70;
const LOCAL_SOME_BAND = 40;

function findSharedInterests(
  sender: SharedProfile,
  receiver: SharedProfile,
): Array<{ sender: string; receiver: string }> {
  const pairs: Array<{ sender: string; receiver: string }> = [];
  for (const receiverInterest of receiver.x) {
    if (pairs.some((pair) => pair.receiver === receiverInterest)) continue;
    const receiverTokens = tokenize(receiverInterest);
    const senderInterest = sender.x.find(
      (candidate) =>
        sharedTokens(tokenize(candidate), receiverTokens).length > 0,
    );
    if (senderInterest) {
      pairs.push({ sender: senderInterest, receiver: receiverInterest });
    }
  }
  return pairs;
}

function describeTokens(tokens: string[]): string {
  return tokens
    .slice(0, 3)
    .map((token) => (token.length > 40 ? `${token.slice(0, 40)}…` : token))
    .join(", ");
}

export function estimateLocalMatch(
  sender: SharedProfile,
  receiver: SharedProfile,
): MatchDossier {
  // sender.h ↔ receiver.q, and receiver.h ↔ sender.q — both directions.
  const forward = sharedTokens(
    tokenize(sender.h ?? ""),
    tokenize(receiver.q ?? ""),
  );
  const backward = sharedTokens(
    tokenize(receiver.h ?? ""),
    tokenize(sender.q ?? ""),
  );
  const sharedInterests = findSharedInterests(sender, receiver);

  const bridgeScore = Math.min(1, sharedInterests.length / 2);
  const offerSearchScore =
    ((forward.length ? 1 : 0) + (backward.length ? 1 : 0)) / 2;
  const value = Math.round(100 * (0.5 * bridgeScore + 0.5 * offerSearchScore));
  const band =
    value >= LOCAL_STRONG_BAND
      ? "strong"
      : value >= LOCAL_SOME_BAND
        ? "some"
        : "low";

  const evidence: string[] = [];
  if (sender.h) evidence.push(`They can help with: ${sender.h}`);
  if (receiver.q) evidence.push(`You are looking for: ${receiver.q}`);
  if (receiver.h) evidence.push(`You can help with: ${receiver.h}`);
  if (sender.q) evidence.push(`They are looking for: ${sender.q}`);

  const verdict =
    forward.length && backward.length
      ? `Both directions fit: they offer ${describeTokens(forward)} that you are looking for, and you offer ${describeTokens(backward)} that they are looking for.`
      : forward.length
        ? `They offer something you are looking for (${describeTokens(forward)}).`
        : backward.length
          ? `You offer something they are looking for (${describeTokens(backward)}).`
          : "No clear offer-to-search overlap in the shared data.";

  const bestFirstMove = receiver.q
    ? `Open with what you are looking for — “${receiver.q}” — and ask the same of them.`
    : receiver.x.length
      ? `Start from your own interest in ${receiver.x[0]} and ask where it overlaps with their work.`
      : "Introduce yourself in one sentence and ask what brought them to this event.";

  return {
    // The fallback runs no shape pass — it makes no shape claim.
    shape: { kind: "unclear", confidence: 0 },
    dimensions: [
      {
        id: "offer_search",
        label: "Offer ↔ search fit",
        verdict,
        // Deterministic word overlap, not a model judgment — the verdict is
        // exactly what the evidence shows.
        confidence: 1,
        evidence,
      },
    ],
    bridge: sharedInterests.length
      ? {
          interest: sharedInterests[0].receiver,
          why: `Both profiles list an interest like “${sharedInterests[0].sender}”.`,
        }
      : null,
    curiosityGap: null,
    score: {
      value,
      band,
      byShape:
        "Local estimate — computed on-device from word overlap; the shape-aware scorer was unavailable.",
    },
    bestFirstMove,
    // Degradation contract: no conversation ladder without the sidecar.
    ladder: [],
    escalated: true,
  };
}

export type MatchDossierSource = "sidecar" | "local";

export type MatchDossierResult = {
  dossier: MatchDossier;
  source: MatchDossierSource;
};

/**
 * Tagged variant of `requestMatchDossier` for UIs that must distinguish the
 * sidecar's read from the on-device fallback — the blueprint's receiver
 * states need the difference (a sidecar-produced escalated dossier leads to
 * the sharper-read handoff, a local estimate renders marked as an estimate).
 * Same never-throw contract.
 */
export async function requestMatchDossierResult(
  sender: SharedProfile,
  receiver: SharedProfile,
  options: DeepMatchOptions = {},
): Promise<MatchDossierResult> {
  const dossier = await deepMatch(sender, receiver, options);
  return dossier
    ? { dossier, source: "sidecar" }
    : { dossier: estimateLocalMatch(sender, receiver), source: "local" };
}

/**
 * One-call entry for the UI: the sidecar dossier when healthy, otherwise the
 * honest local estimate. Resolves for every sidecar state — unset URL, fetch
 * rejection, timeout, or a malformed response all degrade to the local
 * estimate; this never throws (blueprint degradation contract).
 */
export async function requestMatchDossier(
  sender: SharedProfile,
  receiver: SharedProfile,
  options: DeepMatchOptions = {},
): Promise<MatchDossier> {
  return (await requestMatchDossierResult(sender, receiver, options)).dossier;
}
