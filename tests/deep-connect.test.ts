import assert from "node:assert/strict";
import test from "node:test";

import {
  createDeepSnapshot,
  validateDeepSnapshot,
  type DeepProfile,
} from "../lib/deep-profile.ts";
import {
  createHybridShareUrl,
  parseHybridShareUrl,
} from "../lib/hybrid-url.ts";
import {
  SAMPLE_PROFILE,
  createSharedProfile,
  decodePayload,
  encodePayload,
} from "../lib/icebreaker.ts";

const deepProfile: DeepProfile = {
  v: 1,
  ownerName: "Stefano",
  sections: [
    {
      id: "overview",
      body: "I work where emergency management and trustworthy AI meet.",
      highlights: ["Public safety", "Civic technology"],
      approved: true,
      minOpenness: "low",
      intents: ["networking", "general"],
    },
    {
      id: "background",
      body: "My work is shaped by high-stakes public-sector operations.",
      highlights: ["Emergency planning"],
      approved: true,
      minOpenness: "high",
      intents: ["networking"],
    },
    {
      id: "current-work",
      body: "I am prototyping accountable disaster-information agents.",
      highlights: ["Human oversight"],
      approved: false,
      minOpenness: "medium",
      intents: ["networking"],
    },
    {
      id: "values",
      body: "Preparedness, service, and clarity guide my work.",
      highlights: [],
      approved: true,
      minOpenness: "high",
      intents: ["friendship"],
    },
  ],
  links: [
    {
      kind: "social",
      label: "LinkedIn",
      url: "https://www.linkedin.com/in/stefano",
      approved: true,
      minOpenness: "low",
      intents: ["networking"],
    },
    {
      kind: "contact",
      label: "Email",
      url: "mailto:stefano@example.com",
      approved: true,
      minOpenness: "low",
      intents: ["networking"],
    },
  ],
};

test("filters Deep sections by approval, openness, intent, and explicit selection", () => {
  const snapshot = createDeepSnapshot(deepProfile, {
    openness: "high",
    intent: "networking",
    includedSectionIds: [
      "overview",
      "background",
      "current-work",
      "values",
    ],
    includeSocialLinks: false,
    includeContactLinks: false,
  });

  assert.deepEqual(
    snapshot.sections.map((section) => section.id),
    ["overview", "background"],
  );
  assert.equal("links" in snapshot, false);
});

test("keeps social and contact links behind independent explicit switches", () => {
  const socialOnly = createDeepSnapshot(deepProfile, {
    openness: "max",
    intent: "networking",
    includedSectionIds: ["overview"],
    includeSocialLinks: true,
    includeContactLinks: false,
  });
  const allLinks = createDeepSnapshot(deepProfile, {
    openness: "max",
    intent: "networking",
    includedSectionIds: ["overview"],
    includeSocialLinks: true,
    includeContactLinks: true,
  });

  assert.deepEqual(socialOnly.links?.map((link) => link.kind), ["social"]);
  assert.deepEqual(allLinks.links?.map((link) => link.kind), [
    "social",
    "contact",
  ]);
});

test("Max openness still excludes approved sections not selected for this share", () => {
  const snapshot = createDeepSnapshot(deepProfile, {
    openness: "max",
    intent: "networking",
    includedSectionIds: ["overview"],
    includeSocialLinks: false,
    includeContactLinks: false,
  });

  assert.deepEqual(
    snapshot.sections.map((section) => section.id),
    ["overview"],
  );
});

test("validates a filtered Deep snapshot and rejects unbounded content", () => {
  const snapshot = createDeepSnapshot(deepProfile, {
    openness: "high",
    intent: "networking",
    includedSectionIds: ["overview", "background"],
    includeSocialLinks: false,
    includeContactLinks: false,
  });

  assert.deepEqual(validateDeepSnapshot(snapshot), snapshot);
  assert.throws(
    () =>
      validateDeepSnapshot({
        ...snapshot,
        sections: [
          {
            id: "overview",
            body: "x".repeat(2_001),
            highlights: [],
          },
        ],
      }),
    /section/i,
  );
});

test("round-trips a private hybrid URL without placing Deep content in it", () => {
  const quick = createSharedProfile(SAMPLE_PROFILE, {
    openness: "low",
    intent: "networking",
    includeSpark: true,
  });
  const quickPayload = encodePayload(quick);
  const url = createHybridShareUrl({
    origin: "https://geticebreaker.app",
    sessionToken: "A1b2C3d4E5f6G7h8I9j0KQ",
    quickPayload,
    accessMode: "private",
    decryptionKey: "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde",
  });

  assert.equal(url.includes(deepProfile.sections[0].body), false);
  assert.deepEqual(parseHybridShareUrl(url), {
    version: 2,
    origin: "https://geticebreaker.app",
    sessionToken: "A1b2C3d4E5f6G7h8I9j0KQ",
    quickPayload,
    accessMode: "private",
    decryptionKey: "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde",
  });
  assert.deepEqual(decodePayload(parseHybridShareUrl(url).quickPayload), quick);
});

test("supports an explicit agent-readable hybrid URL without a decryption key", () => {
  const quickPayload = encodePayload(
    createSharedProfile(SAMPLE_PROFILE, {
      openness: "medium",
      intent: "general",
      includeSpark: true,
    }),
  );
  const url = createHybridShareUrl({
    origin: "https://geticebreaker.app/",
    sessionToken: "Z9y8X7w6V5u4T3s2R1q0PA",
    quickPayload,
    accessMode: "agent-readable",
  });

  assert.deepEqual(parseHybridShareUrl(url), {
    version: 2,
    origin: "https://geticebreaker.app",
    sessionToken: "Z9y8X7w6V5u4T3s2R1q0PA",
    quickPayload,
    accessMode: "agent-readable",
  });
});

test("rejects a private hybrid URL without a decryption key", () => {
  const quickPayload = encodePayload(
    createSharedProfile(SAMPLE_PROFILE, {
      openness: "low",
      intent: "general",
      includeSpark: true,
    }),
  );

  assert.throws(
    () =>
      createHybridShareUrl({
        origin: "https://geticebreaker.app",
        sessionToken: "A1b2C3d4E5f6G7h8I9j0KQ",
        quickPayload,
        accessMode: "private",
      }),
    /decryption key/i,
  );
});

test("rejects hybrid URLs containing embedded credentials", () => {
  const quickPayload = encodePayload(
    createSharedProfile(SAMPLE_PROFILE, {
      openness: "low",
      intent: "general",
      includeSpark: true,
    }),
  );
  const url = createHybridShareUrl({
    origin: "https://geticebreaker.app",
    sessionToken: "A1b2C3d4E5f6G7h8I9j0KQ",
    quickPayload,
    accessMode: "agent-readable",
  }).replace("https://", "https://attacker:secret@");

  assert.throws(() => parseHybridShareUrl(url), /origin/i);
});
