/**
 * Flag gate for the optional Monad testnet attestation (blueprint
 * art_gdKW4J5q, "The Monad moment" — the droppable onchain PR).
 *
 * Deliberately tiny and network-free: this is the ONLY attestation module the
 * app imports statically. Everything else in the attestation path
 * (`lib/attestation.ts`) is loaded exclusively through `loadAttestation()`,
 * which resolves `null` while the flag is off — so a default build never
 * loads attestation code, never executes any of it, and never issues a chain
 * request. Default is OFF.
 */

/** Env var enabling the attestation entry point. Accepts on / true / 1. */
export const MINT_MODE_ENV_VAR = "NEXT_PUBLIC_MINT_MODE";
/** Optional override for the Monad testnet RPC endpoint. */
export const MINT_RPC_URL_ENV_VAR = "NEXT_PUBLIC_MINT_RPC_URL";
/** Optional override for the block-explorer base URL used in receipt links. */
export const MINT_EXPLORER_URL_ENV_VAR = "NEXT_PUBLIC_MINT_EXPLORER_URL";

/**
 * Monad testnet identity, verified against the official docs this session
 * (docs.monad.xyz → "Network Information - Testnet"): chain id 10143
 * (0x279f), currency MON. This is a constant of the network, not
 * configuration — the RPC and explorer endpoints below are the rotatable
 * infrastructure and are the only overridable parts.
 */
export const MONAD_TESTNET_CHAIN_ID = 10143;
export const MONAD_TESTNET_CHAIN_ID_HEX = "0x279f";

/** Official public testnet RPC from the Monad docs (QuickNode-hosted). */
export const MONAD_TESTNET_RPC_URL = "https://testnet-rpc.monad.xyz";
/** First block explorer listed in the Monad docs' testnet table. */
export const MONAD_TESTNET_EXPLORER_URL = "https://testnet.monadvision.com";

const ENABLED_VALUES = new Set(["on", "true", "1"]);
const HTTPS_URL_PATTERN = /^https:\/\/[^\s"'<>]{1,200}$/;

function readMintModeEnv(): string | null {
  try {
    // vinext inlines `process.env.NEXT_PUBLIC_*` into client bundles when the
    // variable is set at build time. When it is unset the expression is left
    // intact and browsers have no `process` global — degrade to unset. The
    // access must stay a literal expression for the build to match it.
    const raw: unknown = process.env.NEXT_PUBLIC_MINT_MODE;
    return typeof raw === "string" ? raw : null;
  } catch {
    return null;
  }
}

function readRpcUrlEnv(): string | null {
  try {
    const raw: unknown = process.env.NEXT_PUBLIC_MINT_RPC_URL;
    return typeof raw === "string" ? raw : null;
  } catch {
    return null;
  }
}

function readExplorerUrlEnv(): string | null {
  try {
    const raw: unknown = process.env.NEXT_PUBLIC_MINT_EXPLORER_URL;
    return typeof raw === "string" ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Whether the attestation entry point may render at all. Unset, empty, and
 * unrecognized values are all OFF — the flag is a deliberate gesture, never
 * a default.
 */
export function isMintModeEnabled(): boolean {
  const raw = readMintModeEnv();
  return raw !== null && ENABLED_VALUES.has(raw.trim().toLowerCase());
}

export type MintChainConfig = {
  /** JSON-RPC endpoint used for the chain pre-flight and receipt polling. */
  rpcUrl: string;
  /** Block-explorer base URL, or `null` when the override is not usable. */
  explorerUrl: string | null;
};

export function getMintChainConfig(): MintChainConfig {
  // Overrides are infrastructure mirrors of the same testnet; anything that
  // is not a plausible https endpoint falls back to the official default.
  const rpcRaw = readRpcUrlEnv()?.trim() ?? "";
  const explorerRaw = readExplorerUrlEnv()?.trim() ?? "";
  return {
    rpcUrl: HTTPS_URL_PATTERN.test(rpcRaw) ? rpcRaw : MONAD_TESTNET_RPC_URL,
    explorerUrl: HTTPS_URL_PATTERN.test(explorerRaw) ? explorerRaw : null,
  };
}

export type AttestationModule = typeof import("./attestation.ts");

/**
 * The only way attestation code enters the running app. Resolves `null`
 * while the flag is off — the dynamic `import()` below is unreachable in
 * that state, so the network module is never even fetched by the browser.
 */
export async function loadAttestation(): Promise<AttestationModule | null> {
  if (!isMintModeEnabled()) return null;
  return import("./attestation.ts");
}
