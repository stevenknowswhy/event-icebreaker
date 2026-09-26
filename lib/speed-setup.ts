import { TEXT_LIMITS, type FullProfile } from "./icebreaker.ts";
import {
  checkProfileText,
  type GuardrailFieldVerdict,
  type GuardrailFieldVerdicts,
} from "./guardrails.ts";

/**
 * AI speed setup (blueprint art_gdKW4J5q, item 4): the primary setup door.
 *
 * The app never calls an LLM — the user pastes one static, app-authored prompt
 * into their own AI (ChatGPT, Claude, Gemini, …), iterates there, and brings
 * back a `KEY: value` block. Everything pasted is untrusted input: parsed
 * leniently, validated with the same rigor as `validateSharedProfile`, and
 * never written to storage before the user confirms inside the wizard.
 */

/** Paste size cap — a full ten-field block is well under this. */
export const MAX_PASTE_LENGTH = 6_000;

/** Neutral OCEAN defaults for a fresh draft; the user adjusts in review. */
const NEUTRAL_PERSONALITY: FullProfile["personality"] = [0.5, 0.5, 0.5, 0.5, 0.5];

export type SpeedSetupFieldId =
  | "name"
  | "role"
  | "spark"
  | "sparkDetails"
  | "canHelp"
  | "lookingFor"
  | "interests"
  | "values"
  | "communicationStyle"
  | "funFact";

export type ListFieldId = "interests" | "values";

export type SpeedSetupWarningKind = "contact" | "tone" | "length" | "list";

export type SpeedSetupWarning = {
  fieldId: SpeedSetupFieldId;
  kind: SpeedSetupWarningKind;
  message: string;
};

export type SpeedSetupParseSuccess = {
  ok: true;
  via: "lines" | "json";
  profile: FullProfile;
  recognizedKeys: SpeedSetupFieldId[];
  droppedKeys: string[];
  warnings: SpeedSetupWarning[];
};

export type SpeedSetupParseFailure = {
  ok: false;
  reason: "empty" | "oversized" | "unrecognized";
  message: string;
};

export type SpeedSetupParseResult =
  | SpeedSetupParseSuccess
  | SpeedSetupParseFailure;

/** Human labels for wizard fields, reused by review advisories. */
export const SPEED_SETUP_FIELD_LABELS: Record<SpeedSetupFieldId, string> = {
  name: "Name",
  role: "Role",
  spark: "Current Spark",
  sparkDetails: "Spark details",
  canHelp: "I can help with",
  lookingFor: "I’d like to meet",
  interests: "Interests",
  values: "Values",
  communicationStyle: "Communication style",
  funFact: "Fun fact",
};

const TEXT_FIELDS: readonly Exclude<SpeedSetupFieldId, ListFieldId>[] = [
  "name",
  "role",
  "spark",
  "sparkDetails",
  "canHelp",
  "lookingFor",
  "communicationStyle",
  "funFact",
];
const LIST_FIELDS: readonly ListFieldId[] = ["interests", "values"];

// Per-field caps come straight from the shared-profile source of truth in
// lib/icebreaker.ts, exactly as validateSharedProfile enforces them.
const TEXT_FIELD_LIMITS: Record<Exclude<SpeedSetupFieldId, ListFieldId>, number> =
  {
    name: TEXT_LIMITS.name,
    role: TEXT_LIMITS.role,
    spark: TEXT_LIMITS.spark,
    sparkDetails: TEXT_LIMITS.sparkDetails,
    canHelp: TEXT_LIMITS.canHelp,
    lookingFor: TEXT_LIMITS.lookingFor,
    communicationStyle: TEXT_LIMITS.communication,
    funFact: TEXT_LIMITS.funFact,
  };

const LIST_FIELD_LIMITS: Record<
  ListFieldId,
  { maxItems: number; itemLimit: number }
> = {
  interests: { maxItems: 8, itemLimit: TEXT_LIMITS.interest },
  values: { maxItems: 6, itemLimit: TEXT_LIMITS.value },
};

/**
 * The return contract: every key maps 1:1 onto a FullProfile field — the
 * profile schema in lib/icebreaker.ts is the single source of truth. The
 * blueprint's original seven keys (EXPERTISE, CAN_HELP_WITH, RABBIT_HOLE, …)
 * remain accepted aliases below.
 */
const CANONICAL_KEYS: Record<string, SpeedSetupFieldId> = {
  NAME: "name",
  ROLE: "role",
  SPARK: "spark",
  SPARK_DETAILS: "sparkDetails",
  CAN_HELP: "canHelp",
  LOOKING_FOR: "lookingFor",
  INTERESTS: "interests",
  VALUES: "values",
  COMMUNICATION_STYLE: "communicationStyle",
  FUN_FACT: "funFact",
};

const KEY_ALIASES: Record<string, SpeedSetupFieldId> = {
  FULL_NAME: "name",
  TITLE: "role",
  JOB_TITLE: "role",
  CURRENT_SPARK: "spark",
  RABBIT_HOLE: "spark",
  BUILDING: "spark",
  WHAT_IM_BUILDING: "spark",
  WHAT_I_AM_BUILDING: "spark",
  WHAT_I_M_BUILDING: "spark",
  SPARK_DETAIL: "sparkDetails",
  CONTEXT: "sparkDetails",
  DETAILS: "sparkDetails",
  EXPERTISE: "canHelp",
  CAN_HELP_WITH: "canHelp",
  WHAT_I_CAN_HELP_WITH: "canHelp",
  I_CAN_HELP_WITH: "canHelp",
  SKILLS: "canHelp",
  SEEKING: "lookingFor",
  ASK: "lookingFor",
  I_D_LIKE_TO_MEET: "lookingFor",
  INTEREST: "interests",
  TOPICS: "interests",
  VALUE: "values",
  PRINCIPLES: "values",
  COMMUNICATION: "communicationStyle",
  STYLE: "communicationStyle",
  TONE: "communicationStyle",
  FUN: "funFact",
};

const KEY_LOOKUP: Record<string, SpeedSetupFieldId> = {
  ...CANONICAL_KEYS,
  ...KEY_ALIASES,
};

// camelCase JSON keys ("canHelp") normalize to CANHELP — match those too.
const COMPACT_KEY_LOOKUP: Record<string, SpeedSetupFieldId> =
  Object.fromEntries(
    Object.entries(KEY_LOOKUP).map(([key, field]) => [
      key.replace(/_/g, ""),
      field,
    ]),
  );

/**
 * The one prompt the speed door hands over. Static text with no profile data
 * in it — the user's own AI knows the user; the app never calls any LLM.
 */
export function createSpeedSetupPrompt(): string {
  return [
    "You are helping me build a profile for Event Icebreaker, an app for meeting people at in-person events.",
    "",
    "Step 1 — test yourself:",
    "Based on everything you already know about me, tell me who I am professionally: what I’m building, what I can help with, what I’m looking for, and the rabbit hole I’m currently deep in. Take your best guess in a few sentences.",
    "",
    "Step 2 — let me correct you:",
    "I’ll reply with fixes. Revise your read of me each time and keep the draft tight. Push back gently if I’m underselling myself, but never invent credentials, employers, or achievements I didn’t state.",
    "",
    "Step 3 — the return contract:",
    "When I say some version of “that’s me”, reply with ONLY the block below — no preamble, no explanations, no code fences. One line per key, exactly these keys, in this order:",
    "",
    "NAME: my name as it should appear on a card",
    "ROLE: one-line professional identity",
    "SPARK: what has my attention right now",
    "SPARK_DETAILS: one sentence of context for the Spark",
    "CAN_HELP: what I can help other people with",
    "LOOKING_FOR: who or what I would like to meet",
    "INTERESTS: comma-separated list, at most 8, each at most 50 characters",
    "VALUES: comma-separated list, at most 6, each at most 40 characters",
    "COMMUNICATION_STYLE: how I come across when I communicate",
    "FUN_FACT: a memorable, professional-safe detail or invitation",
    "",
    "Hard rules for the block:",
    "- No contact details anywhere: no email address, phone number, website link, or social handle.",
    "- Skip any field you genuinely cannot infer; never guess contact details.",
    "- Keep every line under its stated length cap.",
    "",
    "Start with Step 1 now.",
  ].join("\n");
}

export type ContactKind = "email" | "phone" | "url" | "handle";

export type ContactHit = { kind: ContactKind; match: string };

// Guardrail standard from the spec: email, phone, handle, or URL. The domain
// list catches bare professional-network links that carry no scheme.
const CONTACT_PATTERNS: ReadonlyArray<{ kind: ContactKind; pattern: RegExp }> = [
  { kind: "email", pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  { kind: "url", pattern: /\b(?:https?:\/\/|www\.)\S+/i },
  {
    kind: "url",
    pattern:
      /\b(?:linkedin\.com|github\.com|x\.com|twitter\.com|instagram\.com|facebook\.com|t\.me|wa\.me|calendly\.com)\/\S+/i,
  },
  { kind: "handle", pattern: /(?:^|\s)@[A-Za-z0-9_]{3,30}\b/ },
  { kind: "phone", pattern: /(?:^|\D)(?:\+?\d[\d\s().-]{8,}\d)(?!\D)/ },
];

function countDigits(text: string): number {
  return (text.match(/\d/g) ?? []).length;
}

/** Flags contact details by pattern — advisory only, never a removal. */
export function findContactInfo(text: string): ContactHit[] {
  const hits: ContactHit[] = [];
  for (const { kind, pattern } of CONTACT_PATTERNS) {
    const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    const found = text.match(global);
    if (!found) continue;
    for (const match of found) {
      if (kind === "phone" && countDigits(match) < 9) continue;
      hits.push({ kind, match: match.trim() });
      break;
    }
  }
  return hits;
}

const CONTACT_NOUNS: Record<ContactKind, string> = {
  email: "an email address",
  phone: "a phone number",
  url: "a link",
  handle: "a social handle",
};

type DraftValues = Partial<Record<SpeedSetupFieldId, string | string[]>>;

type Draft = {
  values: DraftValues;
  droppedKeys: string[];
  recognized: SpeedSetupFieldId[];
};

function canonicalKey(raw: string): SpeedSetupFieldId | null {
  const normalized = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (
    KEY_LOOKUP[normalized] ??
    COMPACT_KEY_LOOKUP[normalized.replace(/_/g, "")] ??
    null
  );
}

function cleanScalar(raw: string): string {
  let value = raw.trim();
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    const quoted =
      (first === '"' && last === '"') ||
      (first === "“" && last === "”") ||
      (first === "'" && last === "'");
    if (quoted) value = value.slice(1, -1).trim();
  }
  return value.replace(/\s+/g, " ");
}

function cleanListItem(raw: string): string {
  return cleanScalar(raw).replace(/^["'“”]+|["'“”]+$/g, "").trim();
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map(cleanListItem)
    .filter(Boolean);
}

/** A value that reads as mid-thought (no closing punctuation) may continue. */
function endsOpen(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && !/[.!?…:;)"'’”]$/.test(trimmed);
}

const KEY_LINE = /^([A-Za-z][A-Za-z0-9 _&'./-]*?)\s*[:：]\s*(.*)$/;

/**
 * Forgiving KEY: value pass — tolerates bullets, quotes, friendly label
 * variants, fullwidth colons, wrapped continuation lines, and prose around
 * the block (unknown keys are dropped and reported, never mapped).
 */
function parseKeyValueBlock(raw: string): Draft {
  const values: DraftValues = {};
  const droppedKeys: string[] = [];
  const recognized: SpeedSetupFieldId[] = [];

  let lastField: SpeedSetupFieldId | null = null;
  let lastEndedOpen = false;

  for (const rawLine of raw.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (
      !line ||
      line.startsWith("```") ||
      /^-{3,}$/.test(line) ||
      /^={3,}$/.test(line)
    ) {
      continue;
    }

    const stripped = line.replace(/^[\s>•*·\-–—]+/, "").trim();
    const keyMatch = stripped.match(KEY_LINE);
    if (keyMatch) {
      const field = canonicalKey(keyMatch[1]);
      if (!field) {
        const key = keyMatch[1].trim();
        if (droppedKeys.length < 20 && !droppedKeys.includes(key)) {
          droppedKeys.push(key);
        }
        lastField = null;
        lastEndedOpen = false;
        continue;
      }
      values[field] = cleanScalar(keyMatch[2]);
      if (!recognized.includes(field)) recognized.push(field);
      lastField = field;
      lastEndedOpen = endsOpen(keyMatch[2]);
      continue;
    }

    if (
      lastField &&
      lastEndedOpen &&
      typeof values[lastField] === "string"
    ) {
      values[lastField] = `${values[lastField] as string} ${stripped}`
        .replace(/\s+/g, " ")
        .trim();
      lastEndedOpen = endsOpen(stripped);
    }
  }

  return { values, droppedKeys, recognized };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** JSON-block fallback: `{"name": …}` with case-insensitive, aliased keys. */
function parseJsonBlock(raw: string): Draft | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  const values: DraftValues = {};
  const droppedKeys: string[] = [];
  const recognized: SpeedSetupFieldId[] = [];

  for (const [key, rawValue] of Object.entries(parsed)) {
    const field = canonicalKey(key);
    if (!field) {
      if (droppedKeys.length < 20 && !droppedKeys.includes(key)) {
        droppedKeys.push(key);
      }
      continue;
    }

    if (field === "interests" || field === "values") {
      const items = Array.isArray(rawValue)
        ? rawValue.map((item) => (typeof item === "string" ? item : String(item)))
        : typeof rawValue === "string"
          ? splitList(rawValue)
          : null;
      if (!items) continue;
      values[field] = items.map(cleanListItem).filter(Boolean);
    } else if (typeof rawValue === "string") {
      values[field] = cleanScalar(rawValue);
    } else if (typeof rawValue === "number" || typeof rawValue === "boolean") {
      values[field] = String(rawValue);
    } else {
      continue;
    }

    if (!recognized.includes(field)) recognized.push(field);
  }

  return { values, droppedKeys, recognized };
}

const EMPTY_MESSAGE =
  "Nothing to read yet — paste the block your AI wrote, then try again.";
const OVERSIZED_MESSAGE =
  "That paste is too large for a profile block. Trim it to the ten profile keys and try again.";
const UNRECOGNIZED_MESSAGE =
  "I couldn’t find any profile fields in that paste. It should be a block of KEY: value lines from your AI.";

function dedupeWarnings(warnings: SpeedSetupWarning[]): SpeedSetupWarning[] {
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    const key = `${warning.fieldId}|${warning.kind}|${warning.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Validates a mapped draft with the same rigor as `validateSharedProfile`:
 * size caps enforced, list shapes bounded, unknown keys dropped. Cap
 * violations clamp and surface as review warnings — the wizard review is the
 * consent moment, so nothing is silently discarded.
 */
function buildSuccess(draft: Draft, via: "lines" | "json"): SpeedSetupParseSuccess {
  const profile: FullProfile = {
    name: "",
    role: "",
    interests: [],
    spark: "",
    sparkDetails: "",
    canHelp: "",
    lookingFor: "",
    values: [],
    communicationStyle: "",
    funFact: "",
    personality: NEUTRAL_PERSONALITY,
  };
  const warnings: SpeedSetupWarning[] = [];
  const recognizedKeys: SpeedSetupFieldId[] = [];

  for (const field of TEXT_FIELDS) {
    const raw = draft.values[field];
    if (raw === undefined) continue;
    recognizedKeys.push(field);

    const cap = TEXT_FIELD_LIMITS[field];
    let text = raw;
    if (text.length > cap) {
      text = text.slice(0, cap);
      warnings.push({
        fieldId: field,
        kind: "length",
        message: `was longer than the card allows and got trimmed to ${cap} characters — check it still reads well.`,
      });
    }
    profile[field] = text;

    for (const hit of findContactInfo(text)) {
      warnings.push({
        fieldId: field,
        kind: "contact",
        message: `looks like it contains ${CONTACT_NOUNS[hit.kind]} (“${hit.match}”). Contact details never travel on a card — edit it out before confirming.`,
      });
    }
  }

  for (const field of LIST_FIELDS) {
    const raw = draft.values[field];
    if (raw === undefined) continue;
    recognizedKeys.push(field);

    const { maxItems, itemLimit } = LIST_FIELD_LIMITS[field];
    // Line-form pastes arrive as one comma-joined string; split them here.
    let items = typeof raw === "string" ? splitList(raw) : raw;
    if (items.length > maxItems) {
      items = items.slice(0, maxItems);
      warnings.push({
        fieldId: field,
        kind: "list",
        message: `keeps only the first ${maxItems} entries.`,
      });
    }
    const oversized = items.filter((item) => item.length > itemLimit).length;
    items = items.map((item) => item.slice(0, itemLimit));
    if (oversized > 0) {
      warnings.push({
        fieldId: field,
        kind: "length",
        message: `${oversized} ${oversized === 1 ? "entry was" : "entries were"} longer than ${itemLimit} characters and got trimmed.`,
      });
    }
    profile[field] = items;

    for (const item of items) {
      for (const hit of findContactInfo(item)) {
        warnings.push({
          fieldId: field,
          kind: "contact",
          message: `entry “${item}” looks like it contains ${CONTACT_NOUNS[hit.kind]} — edit it out before confirming.`,
        });
      }
    }
  }

  return {
    ok: true,
    via,
    profile,
    recognizedKeys,
    droppedKeys: draft.droppedKeys,
    warnings: dedupeWarnings(warnings),
  };
}

/**
 * Parses an untrusted speed-setup paste into a staged draft. Lenient about
 * formatting, strict about schema: every field that reaches the result
 * satisfies the profile schema's caps, unknown keys are dropped, and
 * contact-looking content is flagged for the review step.
 */
export function parseSpeedSetupPaste(raw: string): SpeedSetupParseResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, reason: "empty", message: EMPTY_MESSAGE };
  }
  if (trimmed.length > MAX_PASTE_LENGTH) {
    return { ok: false, reason: "oversized", message: OVERSIZED_MESSAGE };
  }

  const unfenced = trimmed.replace(/^```[A-Za-z]*[ \t]*\n?/gm, "").trim();

  const jsonStart = unfenced.indexOf("{");
  const jsonEnd = unfenced.lastIndexOf("}");
  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    const jsonDraft = parseJsonBlock(unfenced.slice(jsonStart, jsonEnd + 1));
    if (jsonDraft && jsonDraft.recognized.length) {
      return buildSuccess(jsonDraft, "json");
    }
    // A JSON block that maps nothing falls through to line parsing.
  }

  const lineDraft = parseKeyValueBlock(unfenced);
  if (lineDraft.recognized.length) {
    return buildSuccess(lineDraft, "lines");
  }

  return { ok: false, reason: "unrecognized", message: UNRECOGNIZED_MESSAGE };
}

export type GuardrailVerdict = GuardrailFieldVerdict;
export type GuardrailVerdicts = GuardrailFieldVerdicts;

export type GuardrailOptions = {
  /** Overrides the env-configured sidecar base URL. `null` disables the call. */
  sidecarUrl?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/**
 * Asks the sidecar's `/v1/profile-guardrails` for two yes/no judgments per
 * free-text field (pasted contact info, tone that reads wrong in a
 * professional room), delegating to the same strict client the save-time
 * hook uses — one `{ text }` request per field, the sidecar's whole-text
 * contract, so the ingest path can never drift from the wire again.
 * Stateless, advisory, and per the degradation contract: resolves `null`
 * on any failure — URL unset, fetch rejection, timeout, non-2xx, malformed
 * body — so callers skip advisories silently.
 */
export async function checkSpeedSetupGuardrails(
  fields: Record<string, string>,
  options: GuardrailOptions = {},
): Promise<GuardrailVerdicts | null> {
  const result = await checkProfileText(fields, {
    sidecarUrl: options.sidecarUrl,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
  });
  return result.status === "ok" ? result.verdicts : null;
}
