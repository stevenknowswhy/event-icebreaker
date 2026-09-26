import assert from "node:assert/strict";
import test from "node:test";

import type { SharedProfile } from "../lib/icebreaker.ts";
import {
  estimateLocalMatch,
  requestMatchDossier,
  type MatchDossier,
} from "../lib/match.ts";
import {
  deepMatch,
  getSidecarUrl,
  SIDECAR_URL_ENV_VAR,
  validateMatchDossier,
  type DeepMatchOptions,
} from "../lib/laya-client.ts";

const SIDECAR_BASE = "https://scorer.example.test";

function sharedProfile(overrides: Partial<SharedProfile> = {}): SharedProfile {
  return {
    v: 1,
    n: "Ada",
    o: 3,
    i: "networking",
    x: ["Civic Technology", "Urban Resilience"],
    r: "Product engineer",
    h: "Prototyping and data pipelines",
    q: "Design partners for civic tools",
    ...overrides,
  };
}

function validDossier(): MatchDossier {
  return {
    shape: { kind: "peer", confidence: 0.82 },
    dimensions: [
      {
        id: "bridge",
        label: "Shared ground",
        verdict: "Both care about civic technology.",
        confidence: 0.9,
        evidence: [
          "Interests: Civic Technology",
          "Interests: civic tech",
        ],
      },
    ],
    bridge: { interest: "Civic technology", why: "Both profiles mention it." },
    curiosityGap: {
      interest: "Disaster preparedness",
      why: "Furthest from your world.",
    },
    score: {
      value: 72,
      band: "strong",
      byShape: "Peer overlap drives the score.",
    },
    bestFirstMove: "Ask each other how you each got into civic technology.",
    ladder: [
      {
        level: 2,
        question: "What are you each trying to unlock this quarter?",
        why: "Goal fit is strong.",
      },
      {
        level: 3,
        question: "What rabbit hole are you deep in right now?",
        why: "The curiosity gap points there.",
      },
    ],
    escalated: false,
  };
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
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

test("validateMatchDossier parses a well-formed sidecar dossier", () => {
  assert.deepEqual(validateMatchDossier(validDossier()), validDossier());

  const withoutInsights = {
    ...validDossier(),
    bridge: null,
    curiosityGap: null,
  };
  assert.deepEqual(validateMatchDossier(withoutInsights), withoutInsights);
});

test("validateMatchDossier rejects missing fields", () => {
  const keys = [
    "shape",
    "dimensions",
    "bridge",
    "curiosityGap",
    "score",
    "bestFirstMove",
    "ladder",
    "escalated",
  ] as const;

  for (const key of keys) {
    const payload = { ...validDossier() } as Record<string, unknown>;
    delete payload[key];
    assert.throws(
      () => validateMatchDossier(payload),
      /match dossier/,
      `missing ${key}`,
    );
  }
});

test("validateMatchDossier rejects extra fields at every level", () => {
  const dossier = validDossier();

  assert.throws(
    () => validateMatchDossier({ ...dossier, surprise: true }),
    /unexpected/,
  );
  assert.throws(
    () =>
      validateMatchDossier({
        ...dossier,
        shape: { ...dossier.shape, extra: 1 },
      }),
    /unexpected/,
  );
  assert.throws(
    () =>
      validateMatchDossier({
        ...dossier,
        score: { ...dossier.score, extra: 1 },
      }),
    /unexpected/,
  );
  assert.throws(
    () =>
      validateMatchDossier({
        ...dossier,
        dimensions: [
          ...dossier.dimensions,
          { ...dossier.dimensions[0], extra: 1 },
        ],
      }),
    /unexpected/,
  );
  assert.throws(
    () =>
      validateMatchDossier({
        ...dossier,
        bridge: { ...dossier.bridge, extra: 1 },
      }),
    /unexpected/,
  );
  assert.throws(
    () =>
      validateMatchDossier({
        ...dossier,
        ladder: [...dossier.ladder, { ...dossier.ladder[0], extra: 1 }],
      }),
    /unexpected/,
  );
});

test("validateMatchDossier rejects mistrusted values", () => {
  const dossier = validDossier();
  const oversized = "x".repeat(341);
  const manyDimensions = Array.from({ length: 13 }, () => ({
    ...dossier.dimensions[0],
    id: `dim-${Math.random()}`,
  }));

  const cases: Array<[string, unknown]> = [
    ["unknown shape kind", { ...dossier, shape: { kind: "rival", confidence: 0.9 } }],
    ["over-unity confidence", { ...dossier, shape: { kind: "peer", confidence: 1.5 } }],
    ["NaN confidence", { ...dossier, shape: { kind: "peer", confidence: Number.NaN } }],
    ["out-of-range score", { ...dossier, score: { value: 140, band: "low", byShape: "x" } }],
    ["unknown band", { ...dossier, score: { value: 50, band: "huge", byShape: "x" } }],
    ["bad rung level", { ...dossier, ladder: [{ level: 4, question: "q", why: "w" }] }],
    ["non-integer rung level", { ...dossier, ladder: [{ level: 2.5, question: "q", why: "w" }] }],
    ["string escalated", { ...dossier, escalated: "yes" }],
    ["non-array dimensions", { ...dossier, dimensions: "nope" }],
    ["empty best first move", { ...dossier, bestFirstMove: "   " }],
    ["oversized best first move", { ...dossier, bestFirstMove: "y".repeat(601) }],
    ["oversized evidence", { ...dossier, dimensions: [{ ...dossier.dimensions[0], evidence: [oversized] }] }],
    ["too many dimensions", { ...dossier, dimensions: manyDimensions }],
    [
      "too many rungs",
      {
        ...dossier,
        ladder: Array.from({ length: 4 }, () => ({
          level: 2,
          question: "q",
          why: "w",
        })),
      },
    ],
  ];

  for (const [name, payload] of cases) {
    assert.throws(() => validateMatchDossier(payload), Error, name);
  }

  for (const bad of [null, "dossier", 42, [], true]) {
    assert.throws(() => validateMatchDossier(bad), /invalid/, String(bad));
  }
});

test("deepMatch posts both shared profiles to the deep-match endpoint", async () => {
  const sender = sharedProfile();
  const receiver = sharedProfile({ n: "Grace", x: ["Civic Technology"] });
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;

  const dossier = await deepMatch(sender, receiver, {
    sidecarUrl: SIDECAR_BASE,
    fetchImpl: async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return jsonResponse(validDossier());
    },
  });

  assert.equal(capturedUrl, `${SIDECAR_BASE}/v1/match/deep`);
  assert.equal(capturedInit?.method, "POST");
  assert.equal(
    new Headers(capturedInit?.headers).get("content-type"),
    "application/json",
  );
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), { sender, receiver });
  assert.deepEqual(dossier, validDossier());
});

test("deepMatch skips the call and resolves null when no sidecar URL is set", async () => {
  let called = false;
  const dossier = await deepMatch(sharedProfile(), sharedProfile(), {
    sidecarUrl: null,
    fetchImpl: async () => {
      called = true;
      return jsonResponse(validDossier());
    },
  });

  assert.equal(dossier, null);
  assert.equal(called, false);
});

test("deepMatch resolves null when the request fails", async () => {
  const dossier = await deepMatch(sharedProfile(), sharedProfile(), {
    sidecarUrl: SIDECAR_BASE,
    fetchImpl: async () => {
      throw new Error("network down");
    },
  });

  assert.equal(dossier, null);
});

test("deepMatch aborts a slow sidecar at the timeout and resolves null", async () => {
  const startedAt = Date.now();
  const dossier = await deepMatch(sharedProfile(), sharedProfile(), {
    sidecarUrl: SIDECAR_BASE,
    timeoutMs: 25,
    fetchImpl: hangingFetch,
  });

  assert.equal(dossier, null);
  assert.ok(Date.now() - startedAt < 2_000);
});

test("deepMatch resolves null on non-2xx and malformed responses", async () => {
  const base = { sidecarUrl: SIDECAR_BASE };

  assert.equal(
    await deepMatch(sharedProfile(), sharedProfile(), {
      ...base,
      fetchImpl: async () => jsonResponse(validDossier(), 503),
    }),
    null,
  );
  assert.equal(
    await deepMatch(sharedProfile(), sharedProfile(), {
      ...base,
      fetchImpl: async () => new Response("not json"),
    }),
    null,
  );
  assert.equal(
    await deepMatch(sharedProfile(), sharedProfile(), {
      ...base,
      fetchImpl: async () => jsonResponse({ nope: 1 }),
    }),
    null,
  );
});

test("getSidecarUrl reads, trims, and clears the configured sidecar URL", () => {
  const previous = process.env[SIDECAR_URL_ENV_VAR];
  try {
    delete process.env[SIDECAR_URL_ENV_VAR];
    assert.equal(getSidecarUrl(), null);

    process.env[SIDECAR_URL_ENV_VAR] = " https://laya.example.test/ ";
    assert.equal(getSidecarUrl(), "https://laya.example.test");

    process.env[SIDECAR_URL_ENV_VAR] = "   ";
    assert.equal(getSidecarUrl(), null);
  } finally {
    if (previous === undefined) delete process.env[SIDECAR_URL_ENV_VAR];
    else process.env[SIDECAR_URL_ENV_VAR] = previous;
  }
});

test("estimateLocalMatch finds shared ground and two-way offer-search fit", () => {
  const sender = sharedProfile();
  const receiver = sharedProfile({
    n: "Grace",
    x: ["Civic Technology", "Open Data"],
    h: "Design systems and data pipelines",
    q: "Someone strong in prototyping",
  });
  const estimate = estimateLocalMatch(sender, receiver);

  assert.equal(estimate.escalated, true);
  assert.deepEqual(estimate.ladder, []);
  assert.equal(estimate.shape.kind, "unclear");
  assert.match(estimate.score.byShape, /local estimate/i);
  assert.ok(estimate.bridge);
  assert.match(estimate.bridge.interest, /civic technology/i);
  assert.equal(estimate.dimensions[0].id, "offer_search");
  assert.match(estimate.dimensions[0].verdict, /both directions/i);
  assert.equal(estimate.score.value, 75);
  assert.equal(estimate.score.band, "strong");
  // The estimate must satisfy the same wire contract the sidecar response uses.
  assert.deepEqual(validateMatchDossier(estimate), estimate);
  // Pure and deterministic.
  assert.deepEqual(estimateLocalMatch(sender, receiver), estimate);
});

test("estimateLocalMatch stays honest when profiles share nothing", () => {
  const sender = sharedProfile({
    x: ["Marathon Running"],
    h: "Sourdough baking",
    q: "Investors for a bakery",
  });
  const receiver = sharedProfile({
    x: ["Quantum Computing"],
    h: "Chip design",
    q: "Lab space",
  });
  const estimate = estimateLocalMatch(sender, receiver);

  assert.equal(estimate.bridge, null);
  assert.equal(estimate.score.value, 0);
  assert.equal(estimate.score.band, "low");
  assert.match(
    estimate.dimensions[0].verdict,
    /no clear offer-to-search overlap/i,
  );
  assert.ok(estimate.bestFirstMove.length > 0);
  assert.equal(estimate.curiosityGap, null);
  assert.deepEqual(validateMatchDossier(estimate), estimate);
});

test("the fallback first move is built from the receiver's shared fields", () => {
  const fromLookingFor = estimateLocalMatch(
    sharedProfile(),
    sharedProfile({ q: "Design partners for civic tools" }),
  );
  assert.match(fromLookingFor.bestFirstMove, /Design partners for civic tools/);

  const fromInterests = estimateLocalMatch(
    sharedProfile(),
    sharedProfile({ q: undefined, x: ["Urban Resilience"] }),
  );
  assert.match(fromInterests.bestFirstMove, /Urban Resilience/);

  const bare = estimateLocalMatch(
    sharedProfile(),
    sharedProfile({ q: undefined, x: [] }),
  );
  assert.ok(bare.bestFirstMove.length > 0);
});

test("requestMatchDossier returns the sidecar dossier when healthy", async () => {
  const dossier = await requestMatchDossier(sharedProfile(), sharedProfile(), {
    sidecarUrl: SIDECAR_BASE,
    fetchImpl: async () => jsonResponse(validDossier()),
  });

  assert.equal(dossier.escalated, false);
  assert.equal(dossier.ladder.length, 2);
});

test("requestMatchDossier degrades to the local estimate on every sidecar failure path", async () => {
  const sender = sharedProfile();
  const receiver = sharedProfile({ n: "Grace" });
  const fallback = estimateLocalMatch(sender, receiver);

  const paths: Array<[string, DeepMatchOptions]> = [
    ["sidecar URL unset", { sidecarUrl: null, fetchImpl: async () => { throw new Error("must not be called"); } }],
    ["fetch rejection", { sidecarUrl: SIDECAR_BASE, fetchImpl: async () => { throw new Error("offline"); } }],
    ["timeout", { sidecarUrl: SIDECAR_BASE, timeoutMs: 25, fetchImpl: hangingFetch }],
    ["malformed response", { sidecarUrl: SIDECAR_BASE, fetchImpl: async () => jsonResponse({ nope: true }) }],
  ];

  for (const [name, options] of paths) {
    const dossier = await requestMatchDossier(sender, receiver, options);
    assert.match(dossier.score.byShape, /local estimate/i, name);
    assert.deepEqual(dossier.ladder, [], name);
    assert.equal(dossier.escalated, true, name);
    assert.deepEqual(dossier, fallback, name);
  }
});
