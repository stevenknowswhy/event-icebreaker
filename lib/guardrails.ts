import type { FullProfile } from "./icebreaker.ts";
import { getSidecarUrl } from "./laya-client.ts";

/**
 * Client for the sidecar's `/v1/profile-guardrails` endpoint (blueprint
 * art_gdKW4J5q, item 5): two yes/no judgments per free-text field — pasted
 * contact info and tone that would read wrong in a professional room.
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
const GUARDRAILS_FIELD_LENGTH = 4_000;

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

/**
 * Strictly validates an untrusted guardrails response: exactly `results`,
 * every requested field present, no extra fields, and boolean
 * `contact`/`tone` throughout. Throws on any violation so the caller's
 * catch turns a drifted sidecar into a clean "unavailable".
 */
export function validateGuardrailFieldVerdicts(
  value: unknown,
  requestedFields: readonly string[],
): GuardrailFieldVerdicts {
  if (!isRecord(value)) {
    throw new Error("The guardrail response is invalid.");
  }
  requireKeys(value, ["results"], "guardrail response");
  if (!isRecord(value.results)) {
    throw new Error("The guardrail results are invalid.");
  }

  const requested = new Set(requestedFields);
  for (const key of Object.keys(value.results)) {
    if (!requested.has(key)) {
      throw new Error(
        `The guardrail response has an unexpected result field “${key}”.`,
      );
    }
  }

  const verdicts: GuardrailFieldVerdicts = {};
  for (const field of requestedFields) {
    const raw = value.results[field];
    if (!isRecord(raw)) {
      throw new Error(`The guardrail verdict for “${field}” is invalid.`);
    }
    requireKeys(raw, ["contact", "tone"], `verdict for “${field}”`);
    if (typeof raw.contact !== "boolean" || typeof raw.tone !== "boolean") {
      throw new Error(`The guardrail verdict for “${field}” is invalid.`);
    }
    verdicts[field] = { contact: raw.contact, tone: raw.tone };
  }
  return verdicts;
}

/**
 * Posts free-text fields to `/v1/profile-guardrails` and resolves the
 * validated per-field verdicts. The sidecar is stateless — nothing about
 * the request is persisted — and the result is advisory either way:
 * `unavailable` on any failure, so a save never waits on or fails from
 * this call. Never throws.
 */
export async function checkProfileText(
  fields: Partial<Record<GuardrailFieldId, string>>,
  options: GuardrailCheckOptions = {},
): Promise<GuardrailCheckResult> {
  const baseUrl =
    options.sidecarUrl !== undefined ? options.sidecarUrl : getSidecarUrl();
  if (!baseUrl) return { status: "unavailable" };

  const entries = Object.entries(fields)
    .filter(([, value]) => typeof value === "string" && value.trim().length > 0)
    .slice(0, GUARDRAILS_MAX_FIELDS)
    .map(
      ([field, value]) => [field, value.slice(0, GUARDRAILS_FIELD_LENGTH)] as const,
    );
  if (!entries.length) return { status: "ok", verdicts: {} };

  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? GUARDRAILS_TIMEOUT_MS,
  );

  try {
    const response = await fetchImpl(`${baseUrl}${GUARDRAILS_ENDPOINT_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fields: Object.fromEntries(entries) }),
      signal: controller.signal,
    });
    if (!response.ok) return { status: "unavailable" };
    const verdicts = validateGuardrailFieldVerdicts(
      await response.json(),
      entries.map(([field]) => field),
    );
    return { status: "ok", verdicts };
  } catch {
    // Degradation contract: the sidecar being down, slow, or misbehaving is
    // an expected state — the save proceeds without advisories.
    return { status: "unavailable" };
  } finally {
    clearTimeout(timer);
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
