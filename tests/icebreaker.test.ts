import assert from "node:assert/strict";
import test from "node:test";

import {
  SAMPLE_PROFILE,
  createAiPrompt,
  createConnectionString,
  createConversationStarters,
  createSharedProfile,
  decodePayload,
  encodePayload,
  extractEncodedPayload,
  migrateStoredProfile,
  validateSharedProfile,
} from "../lib/icebreaker.ts";

test("round-trips UTF-8 profile data through Base64URL", () => {
  const shared = createSharedProfile(
    { ...SAMPLE_PROFILE, name: "José 🚀" },
    { openness: "high", intent: "networking", includeSpark: true },
  );

  const encoded = encodePayload(shared);
  const decoded = decodePayload(encoded);

  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decoded, shared);
});

test("low openness serializes only the minimum conversation card", () => {
  const shared = createSharedProfile(SAMPLE_PROFILE, {
    openness: "low",
    intent: "networking",
    includeSpark: true,
  });

  assert.deepEqual(shared.x, ["AI Agents", "Disaster Preparedness"]);
  assert.equal(
    shared.s,
    "How AI agents can strengthen disaster readiness without eroding public trust",
  );
  assert.equal("h" in shared, false);
  assert.equal("q" in shared, false);
  assert.equal("sd" in shared, false);
  assert.equal("va" in shared, false);
  assert.equal("c" in shared, false);
  assert.equal("f" in shared, false);
  assert.equal("p" in shared, false);
});

test("high openness includes rich details but honors the Spark toggle", () => {
  const withSpark = createSharedProfile(SAMPLE_PROFILE, {
    openness: "high",
    intent: "networking",
    includeSpark: true,
  });
  const withoutSpark = createSharedProfile(SAMPLE_PROFILE, {
    openness: "high",
    intent: "networking",
    includeSpark: false,
  });

  assert.equal(withSpark.sd, SAMPLE_PROFILE.sparkDetails);
  assert.deepEqual(withSpark.va, SAMPLE_PROFILE.values);
  assert.deepEqual(withSpark.p, SAMPLE_PROFILE.personality);
  assert.equal("s" in withoutSpark, false);
  assert.equal("sd" in withoutSpark, false);
});

test("medium openness shares what Stefano offers and is looking for", () => {
  const shared = createSharedProfile(SAMPLE_PROFILE, {
    openness: "medium",
    intent: "networking",
    includeSpark: true,
  });

  assert.equal(shared.h, SAMPLE_PROFILE.canHelp);
  assert.equal(shared.q, SAMPLE_PROFILE.lookingFor);
});

test("validates supported payloads and rejects malformed profiles", () => {
  const valid = createSharedProfile(SAMPLE_PROFILE, {
    openness: "medium",
    intent: "friendship",
    includeSpark: true,
  });

  assert.deepEqual(validateSharedProfile(valid), valid);
  assert.throws(
    () => validateSharedProfile({ ...valid, v: 2 }),
    /unsupported format/i,
  );
  assert.throws(
    () => validateSharedProfile({ ...valid, n: "" }),
    /name/i,
  );
});

test("extracts the same payload from a URL or Connection String", () => {
  const shared = createSharedProfile(SAMPLE_PROFILE, {
    openness: "max",
    intent: "general",
    includeSpark: true,
  });
  const encoded = encodePayload(shared);
  const url = `https://example.com/receive#${encoded}`;
  const connectionString = createConnectionString(encoded);

  assert.equal(extractEncodedPayload(url), encoded);
  assert.equal(extractEncodedPayload(connectionString), encoded);
  assert.equal(extractEncodedPayload(encoded), encoded);
});

test("creates an AI prompt that gives immediate value before onboarding", () => {
  const shared = createSharedProfile(SAMPLE_PROFILE, {
    openness: "high",
    intent: "networking",
    includeSpark: true,
  });
  const prompt = createAiPrompt(shared);

  assert.match(prompt, /three natural, specific conversation questions/i);
  assert.match(prompt, /strengthen disaster readiness/);
  assert.match(prompt, /Technical collaborators/);
  assert.match(prompt, /After giving me the questions/i);
  assert.match(prompt, /five brief questions/i);
});

test("creates three useful questions locally without an AI call", () => {
  const shared = createSharedProfile(SAMPLE_PROFILE, {
    openness: "high",
    intent: "networking",
    includeSpark: true,
  });
  const starters = createConversationStarters(shared);

  assert.equal(starters.length, 3);
  assert.match(starters[0], /disaster readiness/i);
  assert.match(starters.join(" "), /emergency planning/i);
  assert.match(starters.join(" "), /AI Agents/i);
});

test("ships a real Stefano profile and migrates only the old placeholder", () => {
  assert.equal(SAMPLE_PROFILE.name, "Stefano");
  assert.match(SAMPLE_PROFILE.role, /emergency management/i);
  assert.doesNotMatch(SAMPLE_PROFILE.role, /private equity/i);

  const oldPlaceholder = {
    ...SAMPLE_PROFILE,
    role: "Private equity operator and AI builder",
    spark: "How ESOPs could end the wealth gap",
  };
  assert.deepEqual(migrateStoredProfile(oldPlaceholder), SAMPLE_PROFILE);

  const customProfile = {
    ...SAMPLE_PROFILE,
    name: "Mary",
    spark: "A genuinely custom idea",
  };
  assert.deepEqual(migrateStoredProfile(customProfile), customProfile);
});
