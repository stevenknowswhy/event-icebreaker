import assert from "node:assert/strict";
import test from "node:test";

import type { FullProfile } from "../lib/icebreaker.ts";
import {
  checkProfileText,
  profileGuardrailFields,
  validateGuardrailFieldVerdicts,
  verdictsToAdvisories,
} from "../lib/guardrails.ts";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const SIDECAR_BASE = "https://scorer.example.test";

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

test("checkProfileText posts the fields and returns validated verdicts", async () => {
  let capturedUrl = "";
  let capturedBody: unknown;
  const result = await checkProfileText(
    { canHelp: "Prototyping", spark: "" },
    {
      sidecarUrl: SIDECAR_BASE,
      fetchImpl: async (url, init) => {
        capturedUrl = String(url);
        capturedBody = JSON.parse(String(init?.body ?? "{}"));
        return jsonResponse({
          results: { canHelp: { contact: false, tone: true } },
        });
      },
    },
  );

  assert.deepEqual(result, {
    status: "ok",
    verdicts: { canHelp: { contact: false, tone: true } },
  });
  assert.equal(capturedUrl, `${SIDECAR_BASE}/v1/profile-guardrails`);
  assert.deepEqual(
    (capturedBody as { fields: Record<string, string> }).fields,
    { canHelp: "Prototyping" },
  );
});

test("checkProfileText trims empty fields and caps oversized values", async () => {
  let capturedBody: unknown;
  await checkProfileText(
    { canHelp: "   ", spark: "x".repeat(4_100) },
    {
      sidecarUrl: SIDECAR_BASE,
      fetchImpl: async (_url, init) => {
        capturedBody = JSON.parse(String(init?.body ?? "{}"));
        return jsonResponse({ results: { spark: { contact: false, tone: false } } });
      },
    },
  );

  const fields = (capturedBody as { fields: Record<string, string> }).fields;
  assert.deepEqual(Object.keys(fields), ["spark"]);
  assert.equal(fields.spark.length, 4_000);
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
    ["missing requested field", { results: {} }],
    ["unexpected result field", { results: { extra: { contact: false, tone: false } } }],
    ["non-boolean verdict", { results: { canHelp: { contact: "yes", tone: false } } }],
    ["extra verdict key", { results: { canHelp: { contact: false, tone: false, note: "x" } } }],
    ["missing verdict key", { results: { canHelp: { contact: false } } }],
    ["results is not a record", { results: "nope" }],
    ["missing results", { verdicts: {} }],
    ["extra top-level field", { results: {}, source: "drifted" }],
  ];

  for (const [label, body] of cases) {
    const result = await checkProfileText({ canHelp: "Prototyping" }, {
      sidecarUrl: SIDECAR_BASE,
      fetchImpl: async () => jsonResponse(body),
    });
    assert.deepEqual(result, { status: "unavailable" }, label);
  }
});

test("validateGuardrailFieldVerdicts accepts the exact contract shape", () => {
  const verdicts = validateGuardrailFieldVerdicts(
    {
      results: {
        canHelp: { contact: true, tone: false },
        lookingFor: { contact: false, tone: true },
      },
    },
    ["canHelp", "lookingFor"],
  );
  assert.deepEqual(verdicts, {
    canHelp: { contact: true, tone: false },
    lookingFor: { contact: false, tone: true },
  });
});

test("checkProfileText resolves unavailable on every sidecar failure mode", async () => {
  const cases: Array<
    [string, { sidecarUrl: string | null; fetchImpl?: typeof fetch; timeoutMs?: number }]
  > = [
    ["sidecar URL unset", { sidecarUrl: null, fetchImpl: async () => { throw new Error("must not be called"); } }],
    ["fetch rejection", { sidecarUrl: SIDECAR_BASE, fetchImpl: async () => { throw new Error("offline"); } }],
    ["timeout", { sidecarUrl: SIDECAR_BASE, timeoutMs: 25, fetchImpl: hangingFetch }],
    ["non-2xx", { sidecarUrl: SIDECAR_BASE, fetchImpl: async () => jsonResponse({ results: {} }, 503) }],
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
