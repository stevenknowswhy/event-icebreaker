import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { SharedProfile } from "../lib/icebreaker.ts";
import {
  attestMatch,
  buildAttestationCalldata,
  buildAttestationDigest,
  canonicalJsonString,
  createAttestationNonce,
  profileDigestHex,
  sha256Hex,
  type AttestationOutcome,
  type Eip1193Provider,
} from "../lib/attestation.ts";
import { isMintModeEnabled, loadAttestation } from "../lib/mint-mode.ts";

const MINT_MODE_ENV_VAR = "NEXT_PUBLIC_MINT_MODE";

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

const NONCE_A = `0x${"11".repeat(32)}`;
const NONCE_B = `0x${"22".repeat(32)}`;

function setFlag(value: string | undefined): void {
  if (value === undefined) delete process.env[MINT_MODE_ENV_VAR];
  else process.env[MINT_MODE_ENV_VAR] = value;
}

type WalletCall = { method: string; params?: unknown };

function fakeWallet(config: {
  accounts?: string[] | Error;
  chainId?: string;
  sendResult?: string | Error;
}): { wallet: Eip1193Provider; calls: WalletCall[] } {
  const calls: WalletCall[] = [];
  const wallet: Eip1193Provider = {
    request: (args) => {
      calls.push({ method: args.method, params: args.params });
      if (args.method === "eth_requestAccounts") {
        if (config.accounts instanceof Error) {
          return Promise.reject(config.accounts);
        }
        return Promise.resolve(
          config.accounts ?? ["0xabc0000000000000000000000000000000000001"],
        );
      }
      if (args.method === "eth_chainId") {
        return Promise.resolve(config.chainId ?? "0x279f");
      }
      if (args.method === "eth_sendTransaction") {
        if (config.sendResult instanceof Error) {
          return Promise.reject(config.sendResult);
        }
        return Promise.resolve(config.sendResult ?? "0xabc123");
      }
      return Promise.reject(new Error(`unexpected method ${args.method}`));
    },
  };
  return { wallet, calls };
}

function fakeRpc(handlers: {
  chainId?: unknown;
  chainIdError?: boolean;
  receipt?: unknown;
  receiptError?: boolean;
}): { fetchImpl: typeof fetch; bodies: Array<Record<string, unknown>> } {
  const bodies: Array<Record<string, unknown>> = [];
  const jsonResult = (result: unknown): Response =>
    new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  const fetchImpl: typeof fetch = (_url, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    bodies.push(body);
    if (body.method === "eth_chainId") {
      if (handlers.chainIdError) return Promise.reject(new Error("rpc down"));
      return Promise.resolve(jsonResult(handlers.chainId ?? "0x279f"));
    }
    if (body.method === "eth_getTransactionReceipt") {
      if (handlers.receiptError) return Promise.reject(new Error("rpc down"));
      return Promise.resolve(jsonResult(handlers.receipt ?? null));
    }
    return Promise.reject(new Error(`unexpected rpc ${String(body.method)}`));
  };
  return { fetchImpl, bodies };
}

// ---------------------------------------------------------------------------
// Canonical JSON
// ---------------------------------------------------------------------------

test("canonicalJsonString is independent of key insertion order", () => {
  const a = canonicalJsonString({ b: 2, a: 1, c: { z: 3, y: 4 } });
  const b = canonicalJsonString({ c: { y: 4, z: 3 }, a: 1, b: 2 });
  assert.equal(a, b);
  assert.equal(a, `{"a":1,"b":2,"c":{"y":4,"z":3}}`);
});

test("canonicalJsonString keeps JSON.stringify value semantics", () => {
  assert.equal(canonicalJsonString([1, "x", null, true]), `[1,"x",null,true]`);
  assert.equal(canonicalJsonString({ dropped: undefined, kept: 0 }), `{"kept":0}`);
  assert.equal(canonicalJsonString([undefined]), `[null]`);
  assert.equal(canonicalJsonString(null), `null`);
  assert.equal(canonicalJsonString("quote\"escape"), `"quote\\"escape"`);
});

// ---------------------------------------------------------------------------
// Hashing: determinism, nonce inclusion, sensitivity
// ---------------------------------------------------------------------------

test("sha256Hex matches the standard empty-string vector", async () => {
  assert.equal(
    await sha256Hex(""),
    "0xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});

test("profileDigestHex is deterministic across key order", async () => {
  const first = await profileDigestHex(sharedProfile());
  const reordered = sharedProfile();
  const shuffled = {
    q: reordered.q,
    h: reordered.h,
    r: reordered.r,
    x: [...reordered.x],
    i: reordered.i,
    o: reordered.o,
    n: reordered.n,
    v: reordered.v,
  } as SharedProfile;
  assert.equal(await profileDigestHex(shuffled), first);
});

test("attestation digest is deterministic with a fixed nonce", async () => {
  const a = await buildAttestationDigest({
    sender: sharedProfile(),
    receiver: sharedProfile({ n: "Grace" }),
    band: "strong",
    nonce: NONCE_A,
  });
  const b = await buildAttestationDigest({
    sender: sharedProfile(),
    receiver: sharedProfile({ n: "Grace" }),
    band: "strong",
    nonce: NONCE_A,
  });
  assert.equal(a.digest, b.digest);
  assert.match(a.digest, /^0x[0-9a-f]{64}$/);
});

test("the nonce is load-bearing: a different nonce changes the digest", async () => {
  const params = {
    sender: sharedProfile(),
    receiver: sharedProfile({ n: "Grace" }),
    band: "strong" as const,
  };
  const withA = await buildAttestationDigest({ ...params, nonce: NONCE_A });
  const withB = await buildAttestationDigest({ ...params, nonce: NONCE_B });
  assert.notEqual(withA.digest, withB.digest);
});

test("digest changes when the band or either profile changes", async () => {
  const base = await buildAttestationDigest({
    sender: sharedProfile(),
    receiver: sharedProfile({ n: "Grace" }),
    band: "strong",
    nonce: NONCE_A,
  });
  const otherBand = await buildAttestationDigest({
    sender: sharedProfile(),
    receiver: sharedProfile({ n: "Grace" }),
    band: "low",
    nonce: NONCE_A,
  });
  const otherSender = await buildAttestationDigest({
    sender: sharedProfile({ h: "Something else entirely" }),
    receiver: sharedProfile({ n: "Grace" }),
    band: "strong",
    nonce: NONCE_A,
  });
  const otherReceiver = await buildAttestationDigest({
    sender: sharedProfile(),
    receiver: sharedProfile({ n: "Grace", q: "New search" }),
    band: "strong",
    nonce: NONCE_A,
  });
  for (const variant of [otherBand, otherSender, otherReceiver]) {
    assert.notEqual(variant.digest, base.digest);
  }
});

test("createAttestationNonce yields unique 32-byte hex values", () => {
  const nonces = new Set<string>();
  for (let i = 0; i < 25; i += 1) {
    const nonce = createAttestationNonce();
    assert.match(nonce, /^0x[0-9a-f]{64}$/);
    nonces.add(nonce);
  }
  assert.equal(nonces.size, 25);
});

test("calldata is exactly the digest — the nonce never goes onchain", () => {
  const digest = `0x${"ab".repeat(32)}`;
  assert.equal(buildAttestationCalldata(digest), digest);
});

// ---------------------------------------------------------------------------
// Flag gate: default off, module loads only through loadAttestation
// ---------------------------------------------------------------------------

test("the mint flag is off unless explicitly enabled", () => {
  const cases: Array<[string | undefined, boolean]> = [
    [undefined, false],
    ["", false],
    ["off", false],
    ["false", false],
    ["0", false],
    ["enabled", false],
    ["on", true],
    ["ON", true],
    ["true", true],
    ["1", true],
  ];
  try {
    for (const [value, expected] of cases) {
      setFlag(value);
      assert.equal(
        isMintModeEnabled(),
        expected,
        `flag value ${String(value)} should be ${expected}`,
      );
    }
  } finally {
    setFlag(undefined);
  }
});

test("loadAttestation resolves null while the flag is off", async () => {
  setFlag(undefined);
  try {
    assert.equal(await loadAttestation(), null);
  } finally {
    setFlag(undefined);
  }
});

test("loadAttestation loads the module cleanly while the flag is on", async () => {
  setFlag("on");
  try {
    const mod = await loadAttestation();
    assert.ok(mod);
    assert.equal(typeof mod.attestMatch, "function");
  } finally {
    setFlag(undefined);
  }
});

test("attestation code is only reachable through the dynamic import gate", () => {
  // Encodes the locked constraint "the flag-off path never even loads
  // network code": no component may value-import lib/attestation, and the
  // dynamic import lives only in the flag gate.
  const component = readFileSync(
    new URL("../components/match-attestation.tsx", import.meta.url),
    "utf8",
  );
  const app = readFileSync(
    new URL("../components/icebreaker-app.tsx", import.meta.url),
    "utf8",
  );
  const gate = readFileSync(
    new URL("../lib/mint-mode.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    component,
    /^import\s+(?!type\b)[^;]*lib\/attestation/m,
    "match-attestation.tsx must not value-import lib/attestation",
  );
  assert.ok(!app.includes("lib/attestation"));
  assert.ok(gate.includes(`import("./attestation.ts")`));
});

// ---------------------------------------------------------------------------
// attestMatch: typed quiet outcomes, hash-only submission
// ---------------------------------------------------------------------------

test("attestMatch fails quietly with no wallet and makes zero requests", async () => {
  let fetchCalls = 0;
  const outcome = await attestMatch({
    sender: sharedProfile(),
    receiver: sharedProfile({ n: "Grace" }),
    band: "strong",
    ethereum: null,
    fetchImpl: (() => {
      fetchCalls += 1;
      return Promise.reject(new Error("network"));
    }) as unknown as typeof fetch,
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.ok ? null : outcome.reason, "unavailable");
  assert.equal(fetchCalls, 0);
});

test("an unreachable RPC fails quietly before any wallet prompt", async () => {
  const { wallet, calls } = fakeWallet({});
  const { fetchImpl } = fakeRpc({ chainIdError: true });
  const outcome = await attestMatch({
    sender: sharedProfile(),
    receiver: sharedProfile({ n: "Grace" }),
    band: "strong",
    ethereum: wallet,
    fetchImpl,
    rpcUrl: "https://rpc.invalid",
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.ok ? null : outcome.reason, "rpc");
  assert.equal(calls.length, 0, "the wallet must not be prompted");
});

test("attestation submits only the digest — never profile data, never the nonce", async () => {
  const sender = sharedProfile();
  const receiver = sharedProfile({ n: "Grace" });
  const { wallet, calls } = fakeWallet({});
  const { fetchImpl, bodies } = fakeRpc({
    receipt: { status: "0x1", blockNumber: "0x10" },
  });
  const outcome: AttestationOutcome = await attestMatch({
    sender,
    receiver,
    band: "strong",
    ethereum: wallet,
    fetchImpl,
    rpcUrl: "https://rpc.testnet.example",
    explorerUrl: "https://explorer.testnet.example",
    nonce: NONCE_A,
    pollIntervalMs: 1,
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;

  const send = calls.find((call) => call.method === "eth_sendTransaction");
  assert.ok(send);
  const tx = (send.params as Array<Record<string, unknown>>)[0];
  assert.equal(tx.to, tx.from, "the record is a self-send");
  assert.equal(tx.value, "0x0", "no value moves");

  // The calldata is exactly the digest: recompute it from the same inputs
  // and compare byte for byte — and the nonce never travels onchain.
  const recomputed = await buildAttestationDigest({
    sender,
    receiver,
    band: "strong",
    nonce: NONCE_A,
  });
  assert.equal(tx.data, recomputed.digest);
  assert.equal(tx.data, outcome.receipt.digest);
  assert.ok(!String(tx.data).includes(NONCE_A.slice(2, 10)));
  assert.equal(outcome.receipt.nonce, NONCE_A);

  const onchainText = JSON.stringify(bodies) + String(tx.data);
  for (const leak of ["Ada", "Grace", "Prototyping", "civic", "strong"]) {
    assert.ok(
      !onchainText.includes(leak),
      `no profile or band text may travel ("${leak}")`,
    );
  }

  assert.equal(outcome.receipt.txHash, "0xabc123");
  assert.equal(outcome.receipt.chainId, 10143);
  assert.equal(outcome.receipt.blockNumber, 16);
  assert.equal(
    outcome.receipt.explorerUrl,
    "https://explorer.testnet.example/tx/0xabc123",
  );
});

test("a random nonce is used when none is provided", async () => {
  const sender = sharedProfile();
  const receiver = sharedProfile({ n: "Grace" });
  const { wallet, calls } = fakeWallet({});
  const { fetchImpl } = fakeRpc({
    receipt: { status: "0x1", blockNumber: "0x10" },
  });
  const outcome = await attestMatch({
    sender,
    receiver,
    band: "strong",
    ethereum: wallet,
    fetchImpl,
    rpcUrl: "https://rpc.testnet.example",
    pollIntervalMs: 1,
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  const send = calls.find((call) => call.method === "eth_sendTransaction");
  assert.ok(send);
  const tx = (send.params as Array<Record<string, unknown>>)[0];
  assert.match(outcome.receipt.nonce, /^0x[0-9a-f]{64}$/);
  const recomputed = await buildAttestationDigest({
    sender,
    receiver,
    band: "strong",
    nonce: outcome.receipt.nonce,
  });
  assert.equal(tx.data, recomputed.digest);
  assert.equal(tx.data, outcome.receipt.digest);
});

test("declining the wallet request is a typed quiet failure", async () => {
  const reject = Object.assign(new Error("user rejected"), { code: 4001 });
  for (const failing of ["accounts", "send"] as const) {
    const { wallet } = fakeWallet({
      accounts: failing === "accounts" ? reject : undefined,
      sendResult: failing === "send" ? reject : undefined,
    });
    const { fetchImpl } = fakeRpc({
      receipt: { status: "0x1", blockNumber: "0x10" },
    });
    const outcome = await attestMatch({
      sender: sharedProfile(),
      receiver: sharedProfile({ n: "Grace" }),
      band: "strong",
      ethereum: wallet,
      fetchImpl,
      rpcUrl: "https://rpc.testnet.example",
      pollIntervalMs: 1,
    });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.ok ? null : outcome.reason, "rejected");
  }
});

test("a wallet that cannot reach Monad testnet fails quietly", async () => {
  const { wallet, calls } = fakeWallet({ chainId: "0x1" });
  const { fetchImpl } = fakeRpc({});
  const outcome = await attestMatch({
    sender: sharedProfile(),
    receiver: sharedProfile({ n: "Grace" }),
    band: "strong",
    ethereum: wallet,
    fetchImpl,
    rpcUrl: "https://rpc.testnet.example",
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.ok ? null : outcome.reason, "unsupported_chain");
  assert.ok(
    !calls.some((call) => call.method === "eth_sendTransaction"),
    "nothing may be sent off-chain",
  );
});

test("a reverted transaction is a typed quiet failure", async () => {
  const { wallet } = fakeWallet({});
  const { fetchImpl } = fakeRpc({
    receipt: { status: "0x0", blockNumber: "0x11" },
  });
  const outcome = await attestMatch({
    sender: sharedProfile(),
    receiver: sharedProfile({ n: "Grace" }),
    band: "strong",
    ethereum: wallet,
    fetchImpl,
    rpcUrl: "https://rpc.testnet.example",
    pollIntervalMs: 1,
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.ok ? null : outcome.reason, "reverted");
});

test("a transaction that never confirms reports its hash and stops", async () => {
  const { wallet } = fakeWallet({});
  const { fetchImpl } = fakeRpc({ receipt: null });
  const outcome = await attestMatch({
    sender: sharedProfile(),
    receiver: sharedProfile({ n: "Grace" }),
    band: "strong",
    ethereum: wallet,
    fetchImpl,
    rpcUrl: "https://rpc.testnet.example",
    pollIntervalMs: 1,
    confirmTimeoutMs: 40,
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.ok ? null : outcome.reason, "timeout");
  assert.ok(
    (outcome.ok ? "" : outcome.message).includes("0xabc123"),
    "the timeout message should surface the tx hash",
  );
});

test("an RPC that dies after the pre-flight is a typed quiet failure", async () => {
  const { wallet } = fakeWallet({});
  const { fetchImpl } = fakeRpc({ receiptError: true });
  const outcome = await attestMatch({
    sender: sharedProfile(),
    receiver: sharedProfile({ n: "Grace" }),
    band: "strong",
    ethereum: wallet,
    fetchImpl,
    rpcUrl: "https://rpc.testnet.example",
    pollIntervalMs: 1,
    confirmTimeoutMs: 40,
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.ok ? null : outcome.reason, "rpc");
});
