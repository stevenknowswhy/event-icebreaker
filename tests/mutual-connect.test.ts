import assert from "node:assert/strict";
import test from "node:test";

import {
  createMutualConnectionBrief,
  createMutualDisclosure,
  validateReceiverSignal,
} from "../lib/mutual-connect.ts";

const sender = {
  v: 1 as const,
  n: "Stefano",
  o: "high" as const,
  i: "networking" as const,
  sections: [
    {
      id: "current-work" as const,
      body: "I am prototyping trustworthy emergency-information agents.",
      highlights: ["Human oversight"],
    },
    {
      id: "offers" as const,
      body: "I can help with emergency planning and product strategy.",
      highlights: [],
    },
    {
      id: "asks" as const,
      body: "I am looking for agent engineers and evaluation expertise.",
      highlights: [],
    },
  ],
};

test("validates only the three consented Mutual Connect fields", () => {
  const signal = validateReceiverSignal({
    name: "Mary",
    currentFocus: "AI support workflows",
    canHelp: "Agent evaluation and production integrations",
    lookingFor: "High-stakes use cases",
    email: "mary@example.com",
  });

  assert.deepEqual(signal, {
    name: "Mary",
    currentFocus: "AI support workflows",
    canHelp: "Agent evaluation and production integrations",
    lookingFor: "High-stakes use cases",
  });
  assert.equal(JSON.stringify(signal).includes("mary@example.com"), false);
});

test("requires all three connection signals before confirmation", () => {
  assert.throws(
    () =>
      validateReceiverSignal({
        currentFocus: "AI support workflows",
        canHelp: "",
        lookingFor: "High-stakes use cases",
      }),
    /can help/i,
  );
});

test("creates an exact disclosure preview and local connection brief", () => {
  const signal = validateReceiverSignal({
    name: "Mary",
    currentFocus: "AI support workflows",
    canHelp: "Agent evaluation and production integrations",
    lookingFor: "High-stakes use cases",
  });
  const disclosure = createMutualDisclosure(signal);
  const brief = createMutualConnectionBrief(sender, signal);

  assert.match(disclosure, /Current focus: AI support workflows/);
  assert.match(disclosure, /Can help with: Agent evaluation/);
  assert.match(brief.mutualValue, /evaluation/i);
  assert.match(brief.mutualValue, /emergency planning/i);
  assert.equal(brief.questions.length, 3);
  assert.match(brief.nextStep, /smallest useful follow-up/i);
  assert.equal(JSON.stringify(brief).includes("mary@example.com"), false);
});
