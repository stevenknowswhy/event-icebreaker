import assert from "node:assert/strict";
import test from "node:test";

import {
  SAMPLE_PROFILE,
  createAiPrompt,
  createConnectionString,
  createSharedProfile,
  decodePayload,
  encodePayload,
  extractEncodedPayload,
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

  assert.deepEqual(shared.x, ["Private Equity", "AI Agents"]);
  assert.equal(shared.s, "How ESOPs could end the wealth gap");
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
  assert.match(prompt, /How ESOPs could end the wealth gap/);
  assert.match(prompt, /After giving me the questions/i);
  assert.match(prompt, /five brief questions/i);
});
