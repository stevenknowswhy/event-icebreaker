import assert from "node:assert/strict";
import test from "node:test";

import {
  decryptDeepSnapshot,
  encryptDeepSnapshot,
} from "../lib/deep-crypto.ts";
import type { DeepSnapshot } from "../lib/deep-profile.ts";

const snapshot: DeepSnapshot = {
  v: 1,
  n: "Stéfano 🚀",
  o: "high",
  i: "networking",
  sections: [
    {
      id: "overview",
      body: "I work where preparedness and trustworthy AI meet.",
      highlights: ["Civic technology"],
    },
  ],
};

test("encrypts and decrypts a validated Deep snapshot with Unicode", async () => {
  const encrypted = await encryptDeepSnapshot(snapshot);
  const decrypted = await decryptDeepSnapshot(
    encrypted.envelope,
    encrypted.decryptionKey,
  );

  assert.deepEqual(decrypted, snapshot);
  assert.match(encrypted.decryptionKey, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(encrypted.envelope.ciphertext.includes("preparedness"), false);
});

test("rejects a tampered encrypted Deep snapshot", async () => {
  const encrypted = await encryptDeepSnapshot(snapshot);
  const changeAt = Math.floor(encrypted.envelope.ciphertext.length / 2);
  const originalCharacter = encrypted.envelope.ciphertext[changeAt];
  const tampered = {
    ...encrypted.envelope,
    ciphertext: `${encrypted.envelope.ciphertext.slice(0, changeAt)}${
      originalCharacter === "A" ? "B" : "A"
    }${encrypted.envelope.ciphertext.slice(changeAt + 1)}`,
  };

  await assert.rejects(
    () => decryptDeepSnapshot(tampered, encrypted.decryptionKey),
    /decrypt/i,
  );
});

test("rejects malformed keys and oversized ciphertext before decryption", async () => {
  const encrypted = await encryptDeepSnapshot(snapshot);

  await assert.rejects(
    () => decryptDeepSnapshot(encrypted.envelope, "not-a-key"),
    /key/i,
  );
  await assert.rejects(
    () =>
      decryptDeepSnapshot(
        {
          ...encrypted.envelope,
          ciphertext: "A".repeat(100_001),
        },
        encrypted.decryptionKey,
      ),
    /ciphertext/i,
  );
});
