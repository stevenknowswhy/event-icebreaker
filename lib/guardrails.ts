import type { FullProfile } from "./icebreaker.ts";
import { getSidecarUrl } from "./laya-client.ts";

/**
 * Client for the sidecar's `/v1/profile-guardrails` endpoint (blueprint
 * art_gdKW4J5q, item 5): two yes/no judgments per free-text field — pasted
 * contact info and tone that would read wrong in a professional room.
 *
 * The sidecar's contract is whole-text: one `{ text }` request in, one
 * `{ contact, tone }` verdict pair out (contact naming the deterministic
 * detectors that fired). There is no per-field map on the wire — this
 * client sends one request per field and maps each whole-text verdict back
 * to its field's banner.
 *
 * Advisory, never blocking: every failure mode (URL unset, fetch rejection,
 * timeout, non-2xx, malformed body) resolves to `{ status: "unavailable" }`
 * so callers skip the advisories silently, per the degradation contract.
 * Unlike the lenient ingest-time reader in lib/speed-setup.ts, this client
 * validates with the same rigor as `validateMatchDossier`: a drifted
 * sidecar fails closed into "no advisories" rather than half-warnings.
 */

const GUARDRAILS_ENDPOINT_PATH = "/v1/profile-guardrails";
const GUARDRAILS_TIMEOUT_MS = 2_500;
const GUARDRAILS_MAX_FIELDS = 10;
// The sidecar rejects text beyond 2000 chars with a 422 (app/validation.py
// GuardrailsRequest) — truncate to its cap so one oversized field cannot
// turn the whole check unavailable.
const GUARDRAILS_MAX_TEXT_LENGTH = 2_000;
const GUARDRAILS_MAX_MATCHED = 8;
const GUARDRAILS_MATCHED_ITEM_LENGTH = 64;

/** The ten free-text profile fields a guardrail check can judge. */
export const GUARDRAIL_FIELD_IDS = [
  "name",
  "role",
  "spark",
  "sparkDetails",
  "canHelp",
  "lookingFor",
  "interests",
  "values",
  "communicationStyle",
  "funFact",
] as const;

export type GuardrailFieldId = (typeof GUARDRAIL_FIELD_IDS)[number];

const GUARDRAIL_TEXT_FIELD_IDS: readonly GuardrailFieldId[] = [
  "name",
  "role",
  "spark",
  "sparkDetails",
  "canHelp",
  "lookingFor",
  "communicationStyle",
  "funFact",
];

const GUARDRAIL_LIST_FIELD_IDS: readonly GuardrailFieldId[] = [
  "interests",
  "values",
];

export type GuardrailFieldVerdict = { contact: boolean; tone: boolean };

export type GuardrailFieldVerdicts = Record<string, GuardrailFieldVerdict>;

/**
 * The one result shape callers branch on: `ok` carries the per-field
 * verdicts; `unavailable` means the sidecar is unset, down, slow, or
 * misbehaving — advisories are skipped, nothing is logged or retried.
 */
export type GuardrailCheckResult =
  | { status: "ok"; verdicts: GuardrailFieldVerdicts }
  | { status: "unavailable" };

export type GuardrailCheckOptions = {
  /** Overrides the env-configured sidecar base URL. `null` disables the call. */
  sidecarUrl?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

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
        `The guardrail response has an unexpected ${label} field “${key}”.`,
      );
    }
  }
  for (const key of keys) {
    if (!(key in record)) {
      throw new Error(
        `The guardrail response is missing the ${label} field “${key}”.`,
      );
    }
  }
}

function requireConfidence(value: unknown, label: string): void {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new Error(`The guardrail ${label} confidence is invalid.`);
  }
}

/**
 * Strictly validates an untrusted `/v1/profile-guardrails` response for one
 * text: exactly `contact` and `tone`, each verdict carrying only its
 * contract fields — `matched` names the deterministic contact detectors
 * that fired. Throws on any violation so the caller's catch turns a
 * drifted sidecar into a clean "unavailable".
 */
export function validateGuardrailTextVerdicts(
  value: unknown,
): GuardrailFieldVerdict {
  if (!isRecord(value)) {
    throw new Error("The guardrail response is invalid.");
  }
  requireKeys(value, ["contact", "tone"], "guardrail response");
  const contact = value.contact;
  const tone = value.tone;
  if (!isRecord(contact) || !isRecord(tone)) {
    throw new Error("The guardrail verdicts are invalid.");
  }
  requireKeys(contact, ["present", "confidence", "matched"], "contact verdict");
  requireKeys(tone, ["present", "confidence"], "tone verdict");
  if (
    typeof contact.present !== "boolean" ||
    typeof tone.present !== "boolean"
  ) {
    throw new Error("The guardrail verdicts are invalid.");
  }
  requireConfidence(contact.confidence, "contact");
  requireConfidence(tone.confidence, "tone");
  if (
    !Array.isArray(contact.matched) ||
    contact.matched.length > GUARDRAILS_MAX_MATCHED ||
    contact.matched.some(
      (kind) =>
        typeof kind !== "string" ||
        kind.length > GUARDRAILS_MATCHED_ITEM_LENGTH,
    )
  ) {
    throw new Error("The guardrail contact matched list is invalid.");
  }
  return { contact: contact.present, tone: tone.present };
}

/**
 * One `{ text }` request — the sidecar's whole contract for this endpoint.
 * Throws on any failure so the fan-out's catch degrades the whole check;
 * the 2.5 s abort and strict validation stay per request.
 */
async function checkFieldText(
  baseUrl: string,
  text: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<GuardrailFieldVerdict> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${baseUrl}${GUARDRAILS_ENDPOINT_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`The guardrail check failed with status ${response.status}.`);
    }
    return validateGuardrailTextVerdicts(await response.json());
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Checks free-text fields against `/v1/profile-guardrails` and resolves the
 * validated per-field verdicts. The sidecar judges whole text, so each
 * field travels as its own `{ text }` request and the whole-text verdict
 * pair maps back to that field. All fields must pass: a partial answer is
 * a half-warning, and the degradation contract skips advisories entirely.
 * The sidecar is stateless — nothing about the request is persisted — and
 * the result is advisory either way: `unavailable` on any failure, so a
 * save never waits on or fails from this call. Never throws.
 */
export async function checkProfileText(
  fields: Record<string, string>,
  options: GuardrailCheckOptions = {},
): Promise<GuardrailCheckResult> {
  const baseUrl =
    options.sidecarUrl !== undefined ? options.sidecarUrl : getSidecarUrl();
  if (!baseUrl) return { status: "unavailable" };

  const entries = Object.entries(fields)
    .filter(([, value]) => typeof value === "string" && value.trim().length > 0)
    .slice(0, GUARDRAILS_MAX_FIELDS)
    .map(
      ([field, value]) =>
        [field, value.slice(0, GUARDRAILS_MAX_TEXT_LENGTH)] as const,
    );
  if (!entries.length) return { status: "ok", verdicts: {} };

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? GUARDRAILS_TIMEOUT_MS;

  try {
    // Sequential by design: the sidecar serves one request at a time (a
    // single CPU-bound model worker), so a concurrent wave only queues in
    // the browser while each request's own 2.5 s abort burns down — tail
    // requests then abort mid-preflight and the whole check degrades. Sent
    // in order, every request starts fresh with its full abort budget
    // against the server's actual service time.
    const verdicts: GuardrailFieldVerdicts = {};
    for (const [field, text] of entries) {
      verdicts[field] = await checkFieldText(
        baseUrl,
        text,
        fetchImpl,
        timeoutMs,
      );
    }
    return { status: "ok", verdicts };
  } catch {
    // Degradation contract: the sidecar being down, slow, or misbehaving is
    // an expected state — the save proceeds without advisories.
    return { status: "unavailable" };
  }
}

/**
 * Collects the draft's non-empty free-text fields for a guardrail check,
 * joining list fields the way the card renders them. Empty and whitespace
 * fields are omitted — the sidecar only judges real text.
 */
export function profileGuardrailFields(
  profile: FullProfile,
): Partial<Record<GuardrailFieldId, string>> {
  const fields: Partial<Record<GuardrailFieldId, string>> = {};
  for (const field of GUARDRAIL_TEXT_FIELD_IDS) {
    const text = profile[field];
    if (typeof text === "string" && text.trim().length > 0) {
      fields[field] = text;
    }
  }
  for (const field of GUARDRAIL_LIST_FIELD_IDS) {
    const items = profile[field];
    if (Array.isArray(items) && items.length > 0) {
      fields[field] = items.join(", ");
    }
  }
  return fields;
}

const CONTACT_MESSAGE =
  "Looks like it contains contact details — contact info never travels on a card, so edit it out before sharing.";
const TONE_MESSAGE =
  "May read wrong in a professional room — consider softening it before you share.";

/**
 * Maps sidecar verdicts to per-field advisory messages. Only flagged fields
 * appear in the result; a clean or missing verdict produces no entry.
 */
export function verdictsToAdvisories(
  verdicts: GuardrailFieldVerdicts,
): Partial<Record<GuardrailFieldId, string[]>> {
  const advisories: Partial<Record<GuardrailFieldId, string[]>> = {};
  for (const field of GUARDRAIL_FIELD_IDS) {
    const verdict = verdicts[field];
    if (!verdict) continue;
    const messages: string[] = [];
    if (verdict.contact) messages.push(CONTACT_MESSAGE);
    if (verdict.tone) messages.push(TONE_MESSAGE);
    if (messages.length > 0) advisories[field] = messages;
  }
  return advisories;
}
