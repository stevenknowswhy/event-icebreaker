import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateDeepExpiry,
  createSessionTokens,
  hashSessionToken,
  validateAgentSessionCreate,
  validatePrivateSessionCreate,
} from "../lib/deep-session.ts";

const envelope = {
  v: 1 as const,
  algorithm: "A256GCM" as const,
  iv: "AbCdEfGhIjKlMnOp",
  ciphertext: "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-",
};

test("calculates bounded Deep session expirations", () => {
  const now = new Date(2026, 6, 24, 10, 0, 0, 0);

  assert.equal(
    calculateDeepExpiry("one-hour", now).getTime(),
    new Date(2026, 6, 24, 11, 0, 0, 0).getTime(),
  );
  assert.equal(
    calculateDeepExpiry("tonight", now).getTime(),
    new Date(2026, 6, 24, 23, 59, 59, 999).getTime(),
  );
  assert.equal(
    calculateDeepExpiry("seven-days", now).getTime(),
    new Date(2026, 6, 31, 10, 0, 0, 0).getTime(),
  );
});

test("creates independent opaque session and revocation tokens", async () => {
  const tokens = createSessionTokens();
  const sessionHash = await hashSessionToken(tokens.sessionToken);
  const revokeHash = await hashSessionToken(tokens.revokeToken);

  assert.match(tokens.sessionToken, /^[A-Za-z0-9_-]{22}$/);
  assert.match(tokens.revokeToken, /^[A-Za-z0-9_-]{43}$/);
  assert.match(sessionHash, /^[a-f0-9]{64}$/);
  assert.match(revokeHash, /^[a-f0-9]{64}$/);
  assert.notEqual(tokens.sessionToken, tokens.revokeToken);
  assert.notEqual(sessionHash, revokeHash);
});

test("validates a bounded ciphertext-only private session request", () => {
  const now = new Date("2026-07-24T17:00:00.000Z");
  const valid = validatePrivateSessionCreate(
    {
      envelope,
      expiresAt: now.getTime() + 60 * 60 * 1_000,
    },
    now,
  );

  assert.deepEqual(valid.envelope, envelope);
  assert.equal(valid.expiresAt, now.getTime() + 60 * 60 * 1_000);
  assert.equal(JSON.stringify(valid).includes("preparedness"), false);

  assert.throws(
    () =>
      validatePrivateSessionCreate(
        { envelope, expiresAt: now.getTime() - 1 },
        now,
      ),
    /expiry/i,
  );
  assert.throws(
    () =>
      validatePrivateSessionCreate(
        { envelope, expiresAt: now.getTime() + 8 * 24 * 60 * 60 * 1_000 },
        now,
      ),
    /expiry/i,
  );
});

test("requires explicit consent for a bounded agent-readable snapshot", () => {
  const now = new Date("2026-07-24T17:00:00.000Z");
  const snapshot = {
    v: 1 as const,
    n: "Stefano",
    o: "high" as const,
    i: "networking" as const,
    sections: [
      {
        id: "overview" as const,
        body: "I work where emergency management and trustworthy AI meet.",
        highlights: ["Public safety"],
      },
    ],
  };

  const valid = validateAgentSessionCreate(
    {
      snapshot,
      expiresAt: now.getTime() + 60 * 60 * 1_000,
      readableStorageAccepted: true,
    },
    now,
  );

  assert.deepEqual(valid.snapshot, snapshot);
  assert.equal(valid.expiresAt, now.getTime() + 60 * 60 * 1_000);
  assert.throws(
    () =>
      validateAgentSessionCreate(
        {
          snapshot,
          expiresAt: now.getTime() + 60 * 60 * 1_000,
          readableStorageAccepted: false,
        },
        now,
      ),
    /consent/i,
  );
  assert.throws(
    () =>
      validateAgentSessionCreate(
        {
          snapshot: { ...snapshot, sections: [] },
          expiresAt: now.getTime() + 60 * 60 * 1_000,
          readableStorageAccepted: true,
        },
        now,
      ),
    /section/i,
  );
});
