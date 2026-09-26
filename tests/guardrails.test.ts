import assert from "node:assert/strict";
import test from "node:test";

import type { FullProfile } from "../lib/icebreaker.ts";
import {
  checkProfileText,
  profileGuardrailFields,
  validateGuardrailTextVerdicts,
  verdictsToAdvisories,
} from "../lib/guardrails.ts";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const SIDECAR_BASE = "https://scorer.example.test";

/** The sidecar's real whole-text response shape (app/schemas.py GuardrailsOut). */
const textVerdict = (
  contact: boolean,
  tone: boolean,
  matched: string[] = [],
): Record<string, unknown> => ({
  contact: {
    present: contact,
    confidence: contact ? 1 : 0.1,
    matched,
  },
  tone: { present: tone, confidence: tone ? 0.9 : 0.05 },
});

const hangingFetch = (
  _url: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () =>
      reject(init.signal?.reason ?? new Error("aborted")),
    );
  });

function draftProfile(overrides: Partial<FullProfile> = {}): FullProfile {
  return {
    name: "Maya Chen",
    role: "Robotics engineer",
    interests: ["emergency planning", "hardware"],
    spark: "Built a warehouse robot that folds tarps",
    sparkDetails: "It took three motors and far too much patience.",
    canHelp: "Rapid hardware prototyping",
    lookingFor: "Manufacturing partners for a consumer pilot",
    values: ["diligence", "curiosity"],
    communicationStyle: "Direct, warm, and curious",
    funFact: "Once test-piloted a friend's cargo bike uphill",
    personality: [0.6, 0.4, 0.7, 0.5, 0.5],
    ...overrides,
  };
}

test("checkProfileText sends one {text} request per non-empty field", async () => {
  const captured: Array<{ url: string; body: unknown }> = [];
  const result = await checkProfileText(
    { canHelp: "Prototyping", spark: "   ", funFact: "Ask me about tarps" },
    {
      sidecarUrl: SIDECAR_BASE,
      fetchImpl: async (url, init) => {
        const body = JSON.parse(String(init?.body ?? "{}"));
        captured.push({ url: String(url), body });
        return jsonResponse(textVerdict(false, false));
      },
    },
  );

  assert.equal(result.status, "ok");
  assert.deepEqual(result, {
    status: "ok",
    verdicts: {
      canHelp: { contact: false, tone: false },
      funFact: { contact: false, tone: false },
    },
  });
  assert.deepEqual(
    captured.map((request) => request.body),
    [{ text: "Prototyping" }, { text: "Ask me about tarps" }],
  );
  assert.ok(
    captured.every(
      (request) => request.url === `${SIDECAR_BASE}/v1/profile-guardrails`,
    ),
  );
});

test("checkProfileText maps each whole-text verdict back to its field", async () => {
  const result = await checkProfileText(
    { canHelp: "Reach me at maya@bridge.dev", lookingFor: "Partners" },
    {
      sidecarUrl: SIDECAR_BASE,
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? "{}"));
        return jsonResponse(
          body.text.includes("@")
            ? textVerdict(true, false, ["email"])
            : textVerdict(false, false),
        );
      },
    },
  );
  assert.deepEqual(result, {
    status: "ok",
    verdicts: {
      canHelp: { contact: true, tone: false },
      lookingFor: { contact: false, tone: false },
    },
  });
});

test("checkProfileText truncates fields to the sidecar's 2000-char cap", async () => {
  const captured: string[] = [];
  await checkProfileText(
    { canHelp: "   ", spark: "x".repeat(4_100) },
    {
      sidecarUrl: SIDECAR_BASE,
      fetchImpl: async (_url, init) => {
        captured.push((JSON.parse(String(init?.body ?? "{}")) as { text: string }).text);
        return jsonResponse(textVerdict(false, false));
      },
    },
  );

  // The sidecar 422s text beyond 2000 chars — the truncation keeps one
  // oversized field from turning the whole check unavailable.
  assert.deepEqual(captured.length, 1);
  assert.equal(captured[0].length, 2_000);
});

test("checkProfileText resolves ok with no verdicts when every field is empty", async () => {
  const result = await checkProfileText(
    { canHelp: "   ", spark: "" },
    {
      sidecarUrl: SIDECAR_BASE,
      fetchImpl: async () => {
        throw new Error("must not be called");
      },
    },
  );
  assert.deepEqual(result, { status: "ok", verdicts: {} });
});

test("checkProfileText fails closed on a malformed sidecar response", async () => {
  const cases: Array<[string, unknown]> = [
    ["missing contact verdict", { tone: { present: false, confidence: 0.1 } }],
    [
      "missing tone verdict",
      { contact: { present: false, confidence: 0.1, matched: [] } },
    ],
    ["contact is not a record", { contact: "no", tone: { present: false, confidence: 0.1 } }],
    [
      "non-boolean present",
      {
        contact: { present: "no", confidence: 0.1, matched: [] },
        tone: { present: false, confidence: 0.1 },
      },
    ],
    [
      "extra top-level field",
      { ...textVerdict(false, false), source: "drifted" },
    ],
    [
      "extra verdict key",
      {
        contact: { present: false, confidence: 0.1, matched: [], note: "x" },
        tone: { present: false, confidence: 0.1 },
      },
    ],
    [
      "missing verdict key",
      { contact: { present: false, matched: [] }, tone: { present: false, confidence: 0.1 } },
    ],
    [
      "confidence out of range",
      {
        contact: { present: false, confidence: 1.5, matched: [] },
        tone: { present: false, confidence: 0.1 },
      },
    ],
    [
      "matched is not an array",
      {
        contact: { present: false, confidence: 0.1, matched: "email" },
        tone: { present: false, confidence: 0.1 },
      },
    ],
    [
      "matched item is not a string",
      {
        contact: { present: false, confidence: 0.1, matched: [3] },
        tone: { present: false, confidence: 0.1 },
      },
    ],
    ["missing everything", { verdicts: {} }],
  ];

  for (const [label, body] of cases) {
    const result = await checkProfileText({ canHelp: "Prototyping" }, {
      sidecarUrl: SIDECAR_BASE,
      fetchImpl: async () => jsonResponse(body),
    });
    assert.deepEqual(result, { status: "unavailable" }, label);
  }
});

test("one drifting field degrades the whole check — no half-warnings", async () => {
  const result = await checkProfileText(
    { canHelp: "Prototyping", lookingFor: "Partners" },
    {
      sidecarUrl: SIDECAR_BASE,
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? "{}"));
        if (body.text === "Partners") {
          return jsonResponse({ contact: { present: false, confidence: 0.1 } });
        }
        return jsonResponse(textVerdict(false, false));
      },
    },
  );
  assert.deepEqual(result, { status: "unavailable" });
});

test("validateGuardrailTextVerdicts accepts the exact contract shape", () => {
  const verdict = validateGuardrailTextVerdicts(
    textVerdict(true, false, ["email", "url"]),
  );
  assert.deepEqual(verdict, { contact: true, tone: false });
});

test("checkProfileText resolves unavailable on every sidecar failure mode", async () => {
  const cases: Array<
    [string, { sidecarUrl: string | null; fetchImpl?: typeof fetch; timeoutMs?: number }]
  > = [
    ["sidecar URL unset", { sidecarUrl: null, fetchImpl: async () => { throw new Error("must not be called"); } }],
    ["fetch rejection", { sidecarUrl: SIDECAR_BASE, fetchImpl: async () => { throw new Error("offline"); } }],
    ["timeout", { sidecarUrl: SIDECAR_BASE, timeoutMs: 25, fetchImpl: hangingFetch }],
    ["non-2xx", { sidecarUrl: SIDECAR_BASE, fetchImpl: async () => jsonResponse({}, 503) }],
    ["non-JSON body", { sidecarUrl: SIDECAR_BASE, fetchImpl: async () => new Response("<html>", { status: 200 }) }],
  ];

  for (const [label, options] of cases) {
    const result = await checkProfileText({ canHelp: "Prototyping" }, options);
    assert.deepEqual(result, { status: "unavailable" }, `expected silent skip for ${label}`);
  }
});

test("verdictsToAdvisories maps flagged fields to advisory messages", () => {
  const advisories = verdictsToAdvisories({
    canHelp: { contact: true, tone: false },
    lookingFor: { contact: false, tone: true },
    funFact: { contact: true, tone: true },
    name: { contact: false, tone: false },
  });

  assert.deepEqual(advisories.canHelp?.length, 1);
  assert.match(advisories.canHelp?.[0] ?? "", /contact details/i);
  assert.deepEqual(advisories.lookingFor?.length, 1);
  assert.match(advisories.lookingFor?.[0] ?? "", /professional room/i);
  assert.deepEqual(advisories.funFact?.length, 2);
  assert.equal(advisories.name, undefined);
  assert.deepEqual(Object.keys(advisories).length, 3);
});

test("verdictsToAdvisories ignores verdicts for unknown fields", () => {
  assert.deepEqual(verdictsToAdvisories({ nope: { contact: true, tone: true } }), {});
});

test("profileGuardrailFields collects non-empty text and joins lists", () => {
  const fields = profileGuardrailFields(
    draftProfile({ role: "   ", interests: [] }),
  );

  assert.deepEqual(Object.keys(fields).sort(), [
    "canHelp",
    "communicationStyle",
    "funFact",
    "lookingFor",
    "name",
    "spark",
    "sparkDetails",
    "values",
  ]);
  assert.equal(fields.values, "diligence, curiosity");
  assert.equal(fields.name, "Maya Chen");
});
