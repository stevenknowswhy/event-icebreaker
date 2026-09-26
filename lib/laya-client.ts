import type { SharedProfile } from "./icebreaker.ts";
import type { MatchDossier } from "./match.ts";

/**
 * Client for the stateless Laya sidecar (blueprint art_gdKW4J5q). All scoring
 * and ladder selection live server-side; this module only carries the
 * request, validates the response shape, and degrades to `null` on any
 * failure so the caller can fall back to the local estimate.
 */

/** Env var holding the sidecar base URL, e.g. "https://laya-sidecar.fly.dev". */
export const SIDECAR_URL_ENV_VAR = "NEXT_PUBLIC_LAYA_URL";

const SIDECAR_TIMEOUT_MS = 2_500;
const MATCH_ENDPOINT_PATH = "/v1/match/deep";

const MATCH_SHAPE_KINDS = [
  "peer",
  "collab",
  "mentor",
  "investor",
  "customer",
  "unclear",
] as const;

const SCORE_BANDS = ["low", "some", "strong"] as const;

// Length caps for an untrusted sidecar response, mirroring the TEXT_LIMITS
// posture of validateSharedProfile: bounded strings, bounded lists.
const DOSSIER_LIMITS = {
  dimensions: 12,
  dimensionId: 64,
  dimensionLabel: 80,
  dimensionVerdict: 400,
  evidenceItems: 8,
  evidenceItem: 340,
  interest: 120,
  why: 400,
  byShape: 300,
  bestFirstMove: 600,
  ladderRungs: 3,
  question: 400,
} as const;

export type DeepMatchOptions = {
  /** Overrides the env-configured sidecar base URL. `null` disables the call. */
  sidecarUrl?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export function getSidecarUrl(): string | null {
  let raw: unknown;
  try {
    // vinext inlines `process.env.NEXT_PUBLIC_*` into client bundles when the
    // variable is set at build time. When it is unset the expression is left
    // intact and browsers have no `process` global — degrade to unset.
    raw = process.env.NEXT_PUBLIC_LAYA_URL;
  } catch {
    raw = undefined;
  }
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed ? trimmed.replace(/\/+$/, "") : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  for (const key of Object.keys(record)) {
    if (!keys.includes(key)) {
      throw new Error(
        `The match dossier has an unexpected ${label} field “${key}”.`,
      );
    }
  }
  for (const key of keys) {
    if (!(key in record)) {
      throw new Error(
        `The match dossier is missing the ${label} field “${key}”.`,
      );
    }
  }
}

function readConfidence(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new Error(`The match dossier ${label} confidence is invalid.`);
  }
  return value;
}

function readText(value: unknown, label: string, maxLength: number): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maxLength
  ) {
    throw new Error(`The match dossier ${label} is invalid.`);
  }
  return value;
}

function readBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`The match dossier ${label} is invalid.`);
  }
  return value;
}

function validateShape(value: unknown): MatchDossier["shape"] {
  if (!isRecord(value)) {
    throw new Error("The match dossier shape is invalid.");
  }
  requireKeys(value, ["kind", "confidence"], "shape");
  if (
    typeof value.kind !== "string" ||
    !(MATCH_SHAPE_KINDS as readonly string[]).includes(value.kind)
  ) {
    throw new Error("The match dossier shape kind is invalid.");
  }
  return {
    kind: value.kind as MatchDossier["shape"]["kind"],
    confidence: readConfidence(value.confidence, "shape"),
  };
}

function validateInsight(
  value: unknown,
  label: string,
): { interest: string; why: string } | null {
  if (value === null) return null;
  if (!isRecord(value)) {
    throw new Error(`The match dossier ${label} is invalid.`);
  }
  requireKeys(value, ["interest", "why"], label);
  return {
    interest: readText(
      value.interest,
      `${label} interest`,
      DOSSIER_LIMITS.interest,
    ),
    why: readText(value.why, `${label} reason`, DOSSIER_LIMITS.why),
  };
}

function validateDimensions(value: unknown): MatchDossier["dimensions"] {
  if (!Array.isArray(value) || value.length > DOSSIER_LIMITS.dimensions) {
    throw new Error("The match dossier dimensions are invalid.");
  }
  return value.map((item) => {
    if (!isRecord(item)) {
      throw new Error("A match dossier dimension is invalid.");
    }
    requireKeys(
      item,
      ["id", "label", "verdict", "confidence", "evidence"],
      "dimension",
    );
    if (
      !Array.isArray(item.evidence) ||
      item.evidence.length > DOSSIER_LIMITS.evidenceItems ||
      item.evidence.some(
        (line) =>
          typeof line !== "string" ||
          line.length > DOSSIER_LIMITS.evidenceItem,
      )
    ) {
      throw new Error("The match dossier dimension evidence is invalid.");
    }
    return {
      id: readText(item.id, "dimension id", DOSSIER_LIMITS.dimensionId),
      label: readText(item.label, "dimension label", DOSSIER_LIMITS.dimensionLabel),
      verdict: readText(item.verdict, "dimension verdict", DOSSIER_LIMITS.dimensionVerdict),
      confidence: readConfidence(item.confidence, "dimension"),
      evidence: item.evidence as string[],
    };
  });
}

function validateScore(value: unknown): MatchDossier["score"] {
  if (!isRecord(value)) {
    throw new Error("The match dossier score is invalid.");
  }
  requireKeys(value, ["value", "band", "byShape"], "score");
  if (
    typeof value.value !== "number" ||
    !Number.isFinite(value.value) ||
    value.value < 0 ||
    value.value > 100
  ) {
    throw new Error("The match dossier score value is invalid.");
  }
  if (
    typeof value.band !== "string" ||
    !(SCORE_BANDS as readonly string[]).includes(value.band)
  ) {
    throw new Error("The match dossier score band is invalid.");
  }
  return {
    value: value.value,
    band: value.band as MatchDossier["score"]["band"],
    byShape: readText(value.byShape, "score explanation", DOSSIER_LIMITS.byShape),
  };
}

function validateLadder(value: unknown): MatchDossier["ladder"] {
  if (!Array.isArray(value) || value.length > DOSSIER_LIMITS.ladderRungs) {
    throw new Error("The match dossier ladder is invalid.");
  }
  return value.map((item) => {
    if (!isRecord(item)) {
      throw new Error("A match dossier ladder rung is invalid.");
    }
    requireKeys(item, ["level", "question", "why"], "ladder rung");
    if (
      typeof item.level !== "number" ||
      !Number.isInteger(item.level) ||
      item.level < 1 ||
      item.level > 3
    ) {
      throw new Error("The match dossier ladder rung level is invalid.");
    }
    return {
      level: item.level as MatchDossier["ladder"][number]["level"],
      question: readText(item.question, "ladder question", DOSSIER_LIMITS.question),
      why: readText(item.why, "ladder rung reason", DOSSIER_LIMITS.why),
    };
  });
}

/**
 * Strictly validates an untrusted `/v1/match/deep` response — same posture
 * as `validateSharedProfile`: exact field sets (extra fields are rejected, so
 * a drifted sidecar fails closed into the local estimate), type checks, and
 * length caps throughout. Throws on any violation.
 */
export function validateMatchDossier(value: unknown): MatchDossier {
  if (!isRecord(value)) {
    throw new Error("The match dossier is invalid.");
  }
  requireKeys(
    value,
    [
      "shape",
      "dimensions",
      "bridge",
      "curiosityGap",
      "score",
      "bestFirstMove",
      "ladder",
      "escalated",
    ],
    "dossier",
  );
  return {
    shape: validateShape(value.shape),
    dimensions: validateDimensions(value.dimensions),
    bridge: validateInsight(value.bridge, "bridge"),
    curiosityGap: validateInsight(value.curiosityGap, "curiosity gap"),
    score: validateScore(value.score),
    bestFirstMove: readText(
      value.bestFirstMove,
      "best first move",
      DOSSIER_LIMITS.bestFirstMove,
    ),
    ladder: validateLadder(value.ladder),
    escalated: readBoolean(value.escalated, "escalated flag"),
  };
}

/**
 * Posts both openness-filtered shared profiles to the sidecar's deep-match
 * endpoint. The sidecar is stateless and never sees more than a receiver
 * would. Resolves the validated dossier, or `null` on any failure — URL
 * unset, fetch rejection, timeout, non-2xx, or a malformed body — so the
 * caller can render the local estimate instead. Never throws.
 */
export async function deepMatch(
  sender: SharedProfile,
  receiver: SharedProfile,
  options: DeepMatchOptions = {},
): Promise<MatchDossier | null> {
  const baseUrl =
    options.sidecarUrl !== undefined ? options.sidecarUrl : getSidecarUrl();
  if (!baseUrl) return null;

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? SIDECAR_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${baseUrl}${MATCH_ENDPOINT_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sender, receiver }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return validateMatchDossier(await response.json());
  } catch {
    // Degradation contract: the sidecar being down, slow, or misbehaving is
    // an expected state, not an error — the caller falls back.
    return null;
  } finally {
    clearTimeout(timer);
  }
}
