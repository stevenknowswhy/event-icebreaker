import type { SharedProfile } from "./icebreaker.ts";
import type { MatchDossier } from "./match.ts";
// Value import — the chain constants and endpoint config live with the flag
// gate. No cycle: mint-mode only reaches this module through its gated
// dynamic import.
import {
  getMintChainConfig,
  MONAD_TESTNET_CHAIN_ID,
  MONAD_TESTNET_CHAIN_ID_HEX,
} from "./mint-mode.ts";

/**
 * Optional Monad testnet attestation (blueprint art_gdKW4J5q, "The Monad
 * moment" — the droppable onchain PR). Loaded ONLY through
 * `loadAttestation()` in lib/mint-mode.ts, which refuses while the flag is
 * off; a default build never executes any of this code.
 *
 * Locked constraints, and how this module honors them:
 * - Hash-only: the onchain calldata is exactly the digest — never profile
 *   data, never the nonce, never a stable identifier.
 * - Nonce: the digest preimage is the canonical serialization of BOTH
 *   shared-profile digests plus the score band plus a fresh 32-byte random
 *   nonce. The nonce deliberately never appears onchain: someone who could
 *   brute-force guesses of the underlying profiles could otherwise confirm a
 *   guess by recomputing the digest with the public nonce. With the nonce
 *   only in the local receipt, a guessed match cannot be checked against the
 *   chain value, while the participants can still verify their own receipt
 *   offline by recomputing the digest with their nonce.
 * - Receipt: the tx hash and nonce are returned to the caller and rendered
 *   client-side; nothing is uploaded anywhere by this module beyond the two
 *   chain interactions described below.
 * - Quiet failure: every path resolves a typed outcome; this module never
 *   throws, and callers' match flows are never touched.
 *
 * Chain mechanics: the wallet injected in the browser (EIP-1193) signs and
 * broadcasts — no private key ever exists in app code, and wallet
 * provisioning/funding is the user's. The public Monad testnet RPC (verified
 * against docs.monad.xyz this session) is used for the pre-flight chain check
 * and for receipt confirmation. The transaction is a plain value-zero,
 * self-send whose calldata is the record — no contract, nothing to deploy.
 *
 * Hash note: the blueprint sketched keccak-256; this ships SHA-256 (WebCrypto
 * — native in browsers and Node) so the module needs zero cryptography
 * dependencies. The digest is an opaque commitment nothing onchain
 * re-derives, so either function satisfies the design.
 */

/** Canonical digest version — bump when the preimage layout changes. */
export const ATTESTATION_RECORD_VERSION = 1;

export type AttestationFailureReason =
  /** No EIP-1193 wallet is injected, or no account was authorized. */
  | "unavailable"
  /** The user denied the wallet prompt (account access or the transaction). */
  | "rejected"
  /** The wallet could not be switched to Monad testnet. */
  | "unsupported_chain"
  /** The public testnet RPC was unreachable or misbehaved. */
  | "rpc"
  /** The transaction landed but failed (receipt status 0x0). */
  | "reverted"
  /** No receipt within the confirmation budget; the tx may still land. */
  | "timeout"
  /** Anything else. */
  | "unknown";

export type AttestationReceipt = {
  txHash: string;
  /** The attestation digest that was recorded onchain. */
  digest: string;
  /** The random nonce carried in the calldata alongside the digest. */
  nonce: string;
  chainId: number;
  blockNumber: number | null;
  /** Explorer URL for the tx, when an explorer base is configured. */
  explorerUrl: string | null;
};

export type AttestationOutcome =
  | { ok: true; receipt: AttestationReceipt }
  | { ok: false; reason: AttestationFailureReason; message: string };

/** Minimal EIP-1193 surface — no wallet SDK dependency. */
export type Eip1193Provider = {
  request: (args: {
    method: string;
    params?: unknown[] | Record<string, unknown>;
  }) => Promise<unknown>;
};

export type AttestationParams = {
  /** The sender's shared profile, exactly as the receiver decoded it. */
  sender: SharedProfile;
  /** The receiver's shared profile, exactly as it was shared. */
  receiver: SharedProfile;
  /** The dossier's score band — the only dossier content in the preimage. */
  band: MatchDossier["score"]["band"];
  /** Wallet override for tests; defaults to the browser injection. */
  ethereum?: Eip1193Provider | null;
  /** RPC override for tests; defaults to the env-configured endpoint. */
  rpcUrl?: string | null;
  /** Explorer override for tests; defaults to the env-configured endpoint. */
  explorerUrl?: string | null;
  fetchImpl?: typeof fetch;
  /** Nonce override for tests; defaults to 32 fresh random bytes. */
  nonce?: string;
  pollIntervalMs?: number;
  confirmTimeoutMs?: number;
};

// ---------------------------------------------------------------------------
// Canonical hashing — pure, deterministic, dependency-free
// ---------------------------------------------------------------------------

/**
 * Deterministic JSON: object keys sorted recursively (Unicode code-point
 * order), insignificant whitespace dropped, `undefined` object values
 * omitted, `undefined` array members become `null` — matching
 * `JSON.stringify` semantics everywhere except key order.
 */
export function canonicalJsonString(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "undefined") return "null";
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJsonString).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, member]) => member !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
      .map(
        ([key, member]) =>
          `${JSON.stringify(key)}:${canonicalJsonString(member)}`,
      )
      .join(",")}}`;
  }
  // Functions and symbols serialize like JSON.stringify's top-level behavior.
  return "null";
}

function toHex(bytes: Uint8Array): string {
  let hex = "0x";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

/** SHA-256 of a UTF-8 string, `0x`-prefixed. Uses the platform WebCrypto. */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(new Uint8Array(digest));
}

/** 32 fresh random bytes, `0x`-prefixed — the attestation's unguessability. */
export function createAttestationNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/** Digest of one shared profile's canonical serialization. */
export async function profileDigestHex(
  profile: SharedProfile,
): Promise<string> {
  return sha256Hex(canonicalJsonString(profile));
}

export type AttestationDigest = { digest: string; nonce: string };

/**
 * The attestation digest: SHA-256 over the canonical serialization of
 * `{ v, senderDigest, receiverDigest, band, nonce }`. The nonce is required —
 * there is deliberately no nonce-free variant of this function.
 */
export async function buildAttestationDigest(input: {
  sender: SharedProfile;
  receiver: SharedProfile;
  band: MatchDossier["score"]["band"];
  nonce: string;
}): Promise<AttestationDigest> {
  const [senderDigest, receiverDigest] = await Promise.all([
    profileDigestHex(input.sender),
    profileDigestHex(input.receiver),
  ]);
  const preimage = canonicalJsonString({
    v: ATTESTATION_RECORD_VERSION,
    senderDigest,
    receiverDigest,
    band: input.band,
    nonce: input.nonce,
  });
  return { digest: await sha256Hex(preimage), nonce: input.nonce };
}

/**
 * The calldata: exactly the attestation digest — 32 opaque bytes — and
 * nothing else. Keeping the nonce off the chain is what preserves the
 * digest's unguessability (see the module header).
 */
export function buildAttestationCalldata(digest: string): string {
  return digest.toLowerCase();
}

// ---------------------------------------------------------------------------
// Submission — wallet-signed, public-RPC-confirmed, quiet on every failure
// ---------------------------------------------------------------------------

function resolveInjectedWallet(): Eip1193Provider | null {
  const candidate = (globalThis as { ethereum?: unknown }).ethereum;
  if (typeof candidate !== "object" || candidate === null) return null;
  const request = (candidate as { request?: unknown }).request;
  return typeof request === "function"
    ? (candidate as Eip1193Provider)
    : null;
}

function fail(
  reason: AttestationFailureReason,
  message: string,
): AttestationOutcome {
  return { ok: false, reason, message };
}

function walletRejection(caught: unknown): boolean {
  // 4001 is the EIP-1193 "user rejected" code.
  return (
    typeof caught === "object" &&
    caught !== null &&
    (caught as { code?: unknown }).code === 4001
  );
}

type JsonRpcResponse = { result?: unknown; error?: unknown };

async function rpcCall(
  fetchImpl: typeof fetch,
  url: string,
  method: string,
  params: unknown[],
): Promise<unknown> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) {
    throw new Error(`${method} answered HTTP ${response.status}`);
  }
  const body = (await response.json()) as JsonRpcResponse;
  if (body.error !== undefined && body.error !== null) {
    throw new Error(`${method} answered a JSON-RPC error`);
  }
  return body.result;
}

function normalizeChainId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^0x[0-9a-fA-F]+$/.test(value)) {
    return Number.parseInt(value, 16);
  }
  return null;
}

type ParsedReceipt = { status: "0x1" | "0x0"; blockNumber: number | null };

function parseReceipt(result: unknown): ParsedReceipt | null {
  if (typeof result !== "object" || result === null) return null;
  const record = result as Record<string, unknown>;
  if (record.status !== "0x1" && record.status !== "0x0") return null;
  const rawBlock = record.blockNumber;
  const blockNumber =
    typeof rawBlock === "string" && /^0x[0-9a-fA-F]+$/.test(rawBlock)
      ? Number.parseInt(rawBlock, 16)
      : null;
  return { status: record.status, blockNumber };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One attestation, end to end. Resolves a typed outcome for every state —
 * wallet absent, user rejection, wrong chain, unreachable RPC, revert,
 * timeout — and never throws. The wallet signs and broadcasts; the public
 * testnet RPC pre-flights the chain and confirms the receipt.
 */
export async function attestMatch(
  params: AttestationParams,
): Promise<AttestationOutcome> {
  try {
    const wallet =
      params.ethereum !== undefined ? params.ethereum : resolveInjectedWallet();
    if (!wallet) {
      return fail(
        "unavailable",
        "No Ethereum wallet is connected to this browser.",
      );
    }

    const config = getMintChainConfig();
    const rpcUrl = params.rpcUrl !== undefined ? params.rpcUrl : config.rpcUrl;
    const explorerUrl =
      params.explorerUrl !== undefined ? params.explorerUrl : config.explorerUrl;
    if (!rpcUrl) {
      return fail("rpc", "No Monad testnet RPC endpoint is configured.");
    }
    const fetchImpl = params.fetchImpl ?? fetch;

    // Pre-flight the public RPC before any wallet prompt — an unreachable
    // endpoint fails quietly here, before the user is asked for anything.
    try {
      const rpcChainId = normalizeChainId(
        await rpcCall(fetchImpl, rpcUrl, "eth_chainId", []),
      );
      if (rpcChainId !== MONAD_TESTNET_CHAIN_ID) {
        return fail(
          "rpc",
          "The configured RPC did not report the Monad testnet chain.",
        );
      }
    } catch {
      return fail(
        "rpc",
        "The Monad testnet RPC could not be reached, so nothing was sent.",
      );
    }

    let from: string;
    try {
      const accounts = await wallet.request({
        method: "eth_requestAccounts",
      });
      if (
        !Array.isArray(accounts) ||
        accounts.length === 0 ||
        typeof accounts[0] !== "string" ||
        !accounts[0]
      ) {
        return fail("unavailable", "No account was authorized by the wallet.");
      }
      from = accounts[0];
    } catch (caught) {
      return walletRejection(caught)
        ? fail("rejected", "The wallet request was declined.")
        : fail("unavailable", "The wallet could not authorize an account.");
    }

    // The wallet must sign on Monad testnet — ask it to switch, or stop here.
    const walletChainId = normalizeChainId(
      await wallet.request({ method: "eth_chainId" }),
    );
    if (walletChainId !== MONAD_TESTNET_CHAIN_ID) {
      try {
        await wallet.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: MONAD_TESTNET_CHAIN_ID_HEX }],
        });
      } catch {
        return fail(
          "unsupported_chain",
          "The wallet could not switch to Monad testnet.",
        );
      }
    }

    const nonce = params.nonce ?? createAttestationNonce();
    const { digest } = await buildAttestationDigest({
      sender: params.sender,
      receiver: params.receiver,
      band: params.band,
      nonce,
    });
    const data = buildAttestationCalldata(digest);

    let txHash: string;
    try {
      const sent = await wallet.request({
        method: "eth_sendTransaction",
        // Value-zero self-send: the calldata IS the record — no contract.
        params: [{ from, to: from, value: "0x0", data }],
      });
      if (typeof sent !== "string" || !/^0x[0-9a-fA-F]+$/.test(sent)) {
        return fail("unknown", "The wallet did not return a transaction hash.");
      }
      txHash = sent;
    } catch (caught) {
      return walletRejection(caught)
        ? fail("rejected", "The transaction was declined in the wallet.")
        : fail("unknown", "The wallet could not send the transaction.");
    }

    const pollIntervalMs = params.pollIntervalMs ?? 1_000;
    const deadline = Date.now() + (params.confirmTimeoutMs ?? 30_000);
    let sawAnyResponse = false;
    while (Date.now() < deadline) {
      await sleep(pollIntervalMs);
      let receipt: ParsedReceipt | null = null;
      try {
        receipt = parseReceipt(
          await rpcCall(
            fetchImpl,
            rpcUrl,
            "eth_getTransactionReceipt",
            [txHash],
          ),
        );
        // Any successful response — including "still pending" — proves the
        // RPC is alive; only a budget exhausted with live answers is a
        // timeout, while a budget exhausted with dead polls is an rpc fault.
        sawAnyResponse = true;
      } catch {
        // A single failed poll is retried within the budget — the pre-flight
        // already proved the endpoint reachable, so hiccups get patience.
        continue;
      }
      if (receipt === null) continue; // still pending
      if (receipt.status === "0x0") {
        return fail(
          "reverted",
          "The attestation transaction landed but did not succeed.",
        );
      }
      return {
        ok: true,
        receipt: {
          txHash,
          digest,
          nonce,
          chainId: MONAD_TESTNET_CHAIN_ID,
          blockNumber: receipt.blockNumber,
          explorerUrl: explorerUrl ? `${explorerUrl}/tx/${txHash}` : null,
        },
      };
    }
    return sawAnyResponse
      ? fail(
          "timeout",
          `The attestation transaction ${txHash} has not confirmed yet — it may still land, and this app does not track it further.`,
        )
      : fail(
          "rpc",
          "The Monad testnet RPC stopped answering while confirming the attestation.",
        );
  } catch {
    return fail("unknown", "The attestation could not be completed.");
  }
}
