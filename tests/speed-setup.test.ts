import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_PASTE_LENGTH,
  checkSpeedSetupGuardrails,
  createSpeedSetupPrompt,
  findContactInfo,
  parseSpeedSetupPaste,
  validateGuardrailVerdicts,
} from "../lib/speed-setup.ts";
import type { FullProfile } from "../lib/icebreaker.ts";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const SIDECAR_BASE = "https://scorer.example.test";

function canonicalBlock(): string {
  return [
    "NAME: Ada Lovelace",
    "ROLE: Analytical engine product engineer",
    "SPARK: Teaching machines to reason about proofs",
    "SPARK_DETAILS: I am exploring how symbolic math and computation meet.",
    "CAN_HELP: Algorithm design and debugging stubborn math bugs",
    "LOOKING_FOR: Collaborators on analytical tooling",
    "INTERESTS: Analytical Engines, Combinatorics, Vintage Computing",
    "VALUES: Rigor, Curiosity",
    "COMMUNICATION_STYLE: Direct and example-driven",
    "FUN_FACT: Ask me about the first published algorithm.",
  ].join("\n");
}

test("parses a canonical KEY: value block into the FullProfile schema", () => {
  const result = parseSpeedSetupPaste(canonicalBlock());

  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.via, "lines");
  assert.deepEqual(result.profile, {
    name: "Ada Lovelace",
    role: "Analytical engine product engineer",
    interests: ["Analytical Engines", "Combinatorics", "Vintage Computing"],
    spark: "Teaching machines to reason about proofs",
    sparkDetails: "I am exploring how symbolic math and computation meet.",
    canHelp: "Algorithm design and debugging stubborn math bugs",
    lookingFor: "Collaborators on analytical tooling",
    values: ["Rigor", "Curiosity"],
    communicationStyle: "Direct and example-driven",
    funFact: "Ask me about the first published algorithm.",
    personality: [0.5, 0.5, 0.5, 0.5, 0.5],
  });
  assert.equal(result.recognizedKeys.length, 10);
  assert.deepEqual(result.droppedKeys, []);
  assert.deepEqual(result.warnings, []);
});

test("forgives bullets, quotes, whitespace, case, and fullwidth colons", () => {
  const result = parseSpeedSetupPaste(
    [
      "```",
      "- name: 'Ada Lovelace'",
      '  ROLE :  "Analytical engine product engineer"',
      "• INTERESTS:  Engines ,  Combinatorics ",
      "Fun Fact：Ask me about the first published algorithm.",
      "```",
    ].join("\n"),
  );

  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.profile.name, "Ada Lovelace");
  assert.equal(result.profile.role, "Analytical engine product engineer");
  assert.deepEqual(result.profile.interests, ["Engines", "Combinatorics"]);
  assert.equal(
    result.profile.funFact,
    "Ask me about the first published algorithm.",
  );
});

test("maps the blueprint's original keys and friendly label variants", () => {
  const fieldFrom = (block: string): FullProfile | null => {
    const result = parseSpeedSetupPaste(block);
    return result.ok ? result.profile : null;
  };

  assert.equal(fieldFrom("Full Name: Grace Hopper")?.name, "Grace Hopper");
  assert.equal(
    fieldFrom("What I'm building: Compiler tooling")?.spark,
    "Compiler tooling",
  );
  assert.equal(
    fieldFrom("Rabbit Hole: Error messages as teaching tools")?.spark,
    "Error messages as teaching tools",
  );
  assert.equal(fieldFrom("Expertise: Language design")?.canHelp, "Language design");
  assert.equal(fieldFrom("Can_Help_With: Mentoring new engineers")?.canHelp, "Mentoring new engineers");
  assert.equal(fieldFrom("Seeking: Design partners")?.lookingFor, "Design partners");
});

test("a repeated field takes the last value", () => {
  const result = parseSpeedSetupPaste(
    "SPARK: First read\nRABBIT_HOLE: Better read",
  );

  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.profile.spark, "Better read");
});

test("wraps continuation lines into the previous field", () => {
  const result = parseSpeedSetupPaste(
    [
      "NAME: Alan Turing",
      "SPARK: Machine intelligence and the question of whether machines can think without falling into mysticism",
      "and what a mechanical proof of mind would even mean",
      "FUN_FACT: Ran marathons.",
    ].join("\n"),
  );

  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(
    result.profile.spark,
    "Machine intelligence and the question of whether machines can think without falling into mysticism and what a mechanical proof of mind would even mean",
  );
  assert.equal(result.profile.funFact, "Ran marathons.");
});

test("ignores preamble prose and trailing questions around the block", () => {
  const result = parseSpeedSetupPaste(
    [
      "Here is your profile draft:",
      ...canonicalBlock().split("\n"),
      "Want me to tweak anything?",
    ].join("\n"),
  );

  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.profile.name, "Ada Lovelace");
  assert.equal(
    result.profile.funFact,
    "Ask me about the first published algorithm.",
  );
});

test("falls back to a JSON block with case-insensitive keys", () => {
  const result = parseSpeedSetupPaste(
    [
      "```json",
      JSON.stringify({
        Name: "Edsger Dijkstra",
        role: "Computer scientist",
        interests: ["Graph theory", "Concise prose"],
        canHelp: "Shortest paths",
      }),
      "```",
    ].join("\n"),
  );

  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.via, "json");
  assert.equal(result.profile.name, "Edsger Dijkstra");
  assert.deepEqual(result.profile.interests, ["Graph theory", "Concise prose"]);
  assert.equal(result.profile.canHelp, "Shortest paths");
});

test("rejects malformed, empty, and oversized pastes with friendly floors", () => {
  const malformed = parseSpeedSetupPaste(
    "I asked my AI but all it said was: good luck at the hackathon!",
  );
  assert.ok(!malformed.ok);
  if (malformed.ok) return;
  assert.equal(malformed.reason, "unrecognized");
  assert.match(malformed.message, /couldn’t find any profile fields/i);

  const empty = parseSpeedSetupPaste("   \n  ");
  assert.ok(!empty.ok);
  if (empty.ok) return;
  assert.equal(empty.reason, "empty");

  const oversized = parseSpeedSetupPaste(`NAME: ${"x".repeat(MAX_PASTE_LENGTH)}`);
  assert.ok(!oversized.ok);
  if (oversized.ok) return;
  assert.equal(oversized.reason, "oversized");
});

test("drops unknown keys and never maps their values", () => {
  const result = parseSpeedSetupPaste(
    [
      "NAME: Ada Lovelace",
      "EMAIL: ada@example.com",
      "PHONE: +1 415 555 0132",
      "LINKEDIN: https://linkedin.com/in/ada",
      "ROLE: Analytical engine product engineer",
      "P.S.: Let me know if you want more",
    ].join("\n"),
  );

  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.profile.name, "Ada Lovelace");
  assert.equal(result.profile.role, "Analytical engine product engineer");
  assert.equal(result.profile.sparkDetails, "");
  assert.deepEqual(result.droppedKeys, ["EMAIL", "PHONE", "LINKEDIN", "P.S."]);
  const serialized = JSON.stringify(result.profile);
  assert.ok(!serialized.includes("example.com"));
  assert.ok(!serialized.includes("415"));
});

test("flags contact info by pattern: email, link, phone, and handle", () => {
  const email = findContactInfo("Ping me at stefano@example.com anytime");
  assert.equal(email[0]?.kind, "email");

  const link = findContactInfo("My deck: https://notes.example.org/deck");
  assert.equal(link[0]?.kind, "url");

  const bare = findContactInfo("Find me at linkedin.com/in/stefano");
  assert.equal(bare[0]?.kind, "url");

  const phone = findContactInfo("Call or text +1 415 555 0132");
  assert.equal(phone[0]?.kind, "phone");

  const handle = findContactInfo("Same person as @stefano elsewhere");
  assert.equal(handle[0]?.kind, "handle");

  // Years, fractions, and version numbers are not phone numbers.
  assert.deepEqual(findContactInfo("Building since 2015 with 0.8 uptake"), []);
  assert.deepEqual(findContactInfo("Around 10 years in civic tech"), []);
});

test("contact info in pasted fields surfaces as review warnings", () => {
  const result = parseSpeedSetupPaste(
    [
      "NAME: Ada Lovelace",
      "CAN_HELP: email stefano@example.com and I will help",
      "LOOKING_FOR: DM me @ada_l",
    ].join("\n"),
  );

  assert.ok(result.ok);
  if (!result.ok) return;
  const contactFields = result.warnings
    .filter((warning) => warning.kind === "contact")
    .map((warning) => warning.fieldId);
  assert.ok(contactFields.includes("canHelp"));
  assert.ok(contactFields.includes("lookingFor"));
});

test("clamps fields to schema caps and reports what changed", () => {
  const result = parseSpeedSetupPaste(
    [
      `ROLE: ${"r".repeat(180)}`,
      `NAME: ${"n".repeat(90)}`,
      `INTERESTS: ${Array.from({ length: 12 }, (_, i) => `Topic ${i + 1} ${"y".repeat(50)}`).join(", ")}`,
      `VALUES: ${Array.from({ length: 9 }, (_, i) => `Value ${i + 1}`).join(", ")}`,
    ].join("\n"),
  );

  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.profile.role.length, 120);
  assert.equal(result.profile.name.length, 80);
  assert.equal(result.profile.interests.length, 8);
  assert.equal(result.profile.values.length, 6);
  assert.ok(result.profile.interests.every((item) => item.length === 50));

  const kinds = result.warnings.map((warning) => warning.kind);
  assert.ok(kinds.includes("length"));
  assert.ok(kinds.includes("list"));
});

test("missing fields stay empty so the wizard catches the rest", () => {
  const result = parseSpeedSetupPaste("NAME: Ada Lovelace\nROLE: Engineer");

  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.profile.name, "Ada Lovelace");
  assert.equal(result.profile.spark, "");
  assert.deepEqual(result.profile.interests, []);
  assert.deepEqual(result.profile.personality, [0.5, 0.5, 0.5, 0.5, 0.5]);
});

test("the copy-prompt carries the game and the strict return contract", () => {
  const prompt = createSpeedSetupPrompt();

  assert.match(prompt, /test yourself/i);
  assert.match(prompt, /everything you already know about me/i);
  assert.match(
    prompt,
    /what I’m building, what I can help with, what I’m looking for/i,
  );
  for (const key of [
    "NAME:",
    "ROLE:",
    "SPARK:",
    "SPARK_DETAILS:",
    "CAN_HELP:",
    "LOOKING_FOR:",
    "INTERESTS:",
    "VALUES:",
    "COMMUNICATION_STYLE:",
    "FUN_FACT:",
  ]) {
    assert.ok(prompt.includes(key), `prompt is missing ${key}`);
  }
  assert.match(
    prompt,
    /no email address, phone number, website link, or social handle/i,
  );
  assert.match(prompt, /ONLY the block/i);
});

test("guardrail verdict validation keeps only well-shaped entries", () => {
  assert.deepEqual(
    validateGuardrailVerdicts({
      results: {
        canHelp: { contact: true, tone: false },
        lookingFor: { contact: false, tone: true },
        bad: { contact: "yes" },
        worse: "nope",
      },
    }),
    {
      canHelp: { contact: true, tone: false },
      lookingFor: { contact: false, tone: true },
    },
  );
  assert.equal(validateGuardrailVerdicts({ nope: 1 }), null);
  assert.equal(validateGuardrailVerdicts("nope"), null);
  assert.deepEqual(validateGuardrailVerdicts({ results: {} }), {});
});

test("guardrails resolve verdicts from a healthy sidecar", async () => {
  let capturedUrl = "";
  let capturedBody: unknown;
  const verdicts = await checkSpeedSetupGuardrails(
    { canHelp: "Prototyping", spark: "" },
    {
      sidecarUrl: SIDECAR_BASE,
      fetchImpl: async (url, init) => {
        capturedUrl = String(url);
        capturedBody = JSON.parse(String(init?.body ?? "{}"));
        return jsonResponse({
          results: { canHelp: { contact: false, tone: false } },
        });
      },
    },
  );

  assert.deepEqual(verdicts, { canHelp: { contact: false, tone: false } });
  assert.equal(capturedUrl, `${SIDECAR_BASE}/v1/profile-guardrails`);
  assert.deepEqual(
    (capturedBody as { fields: Record<string, string> }).fields,
    { canHelp: "Prototyping" },
  );
});

test("guardrails skip silently when the sidecar is unreachable", async () => {
  const hangingFetch = (
    _url: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(init.signal?.reason ?? new Error("aborted")),
      );
    });

  const cases: Array<
    [string, { sidecarUrl: string | null; fetchImpl?: typeof fetch; timeoutMs?: number }]
  > = [
    ["sidecar URL unset", { sidecarUrl: null, fetchImpl: async () => { throw new Error("must not be called"); } }],
    ["fetch rejection", { sidecarUrl: SIDECAR_BASE, fetchImpl: async () => { throw new Error("offline"); } }],
    ["timeout", { sidecarUrl: SIDECAR_BASE, timeoutMs: 25, fetchImpl: hangingFetch }],
    ["non-2xx", { sidecarUrl: SIDECAR_BASE, fetchImpl: async () => jsonResponse({ results: {} }, 503) }],
    ["malformed body", { sidecarUrl: SIDECAR_BASE, fetchImpl: async () => jsonResponse({ nope: true }) }],
  ];

  for (const [label, options] of cases) {
    const verdicts = await checkSpeedSetupGuardrails(
      { canHelp: "Prototyping" },
      options,
    );
    assert.equal(verdicts, null, `expected silent skip for ${label}`);
  }
});

test("guardrails send nothing when every field is empty", async () => {
  const verdicts = await checkSpeedSetupGuardrails(
    { canHelp: "   ", spark: "" },
    {
      sidecarUrl: SIDECAR_BASE,
      fetchImpl: async () => {
        throw new Error("must not be called");
      },
    },
  );
  assert.deepEqual(verdicts, {});
});
