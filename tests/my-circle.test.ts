import assert from "node:assert/strict";
import test from "node:test";

import {
  parseCircleContacts,
  removeCircleContact,
  saveCircleContact,
} from "../lib/my-circle.ts";
import {
  SAMPLE_PROFILE,
  createSharedProfile,
  encodePayload,
} from "../lib/icebreaker.ts";

const shared = createSharedProfile(
  {
    ...SAMPLE_PROFILE,
    name: "Maya",
    publicProfileUrl: "https://example.com/maya",
  },
  {
    openness: "high",
    intent: "networking",
    includeSpark: true,
    includePublicProfile: true,
  },
);
const encoded = encodePayload(shared);

test("saves an opt-in profile with a stable identity", () => {
  const saved = saveCircleContact([], shared, encoded, "2026-07-24T17:00:00.000Z");

  assert.equal(saved.length, 1);
  assert.equal(saved[0].profile.n, "Maya");
  assert.equal(saved[0].profile.u, "https://example.com/maya");
  assert.match(saved[0].id, /^circle-/);
});

test("updates an existing contact instead of creating a duplicate", () => {
  const first = saveCircleContact(
    [],
    shared,
    encoded,
    "2026-07-24T17:00:00.000Z",
  );
  const second = saveCircleContact(
    first,
    shared,
    encoded,
    "2026-07-24T18:00:00.000Z",
  );

  assert.equal(second.length, 1);
  assert.equal(second[0].id, first[0].id);
  assert.equal(second[0].savedAt, "2026-07-24T18:00:00.000Z");
});

test("parses valid stored contacts and drops malformed entries", () => {
  const saved = saveCircleContact([], shared, encoded, "2026-07-24T17:00:00.000Z");
  const parsed = parseCircleContacts([
    ...saved,
    { id: "bad", profile: { v: 2 }, savedAt: "not-a-date" },
  ]);

  assert.deepEqual(parsed, saved);
  assert.deepEqual(parseCircleContacts("not-an-array"), []);
});

test("removes only the selected Circle contact", () => {
  const maya = saveCircleContact([], shared, encoded, "2026-07-24T17:00:00.000Z");
  const secondProfile = { ...shared, n: "Amir" };
  const both = saveCircleContact(
    maya,
    secondProfile,
    encodePayload(secondProfile),
    "2026-07-24T18:00:00.000Z",
  );

  const remaining = removeCircleContact(both, maya[0].id);

  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].profile.n, "Amir");
});
