import { decodePayload } from "./icebreaker.ts";

export type DeepAccessMode = "private" | "agent-readable";

export type HybridShareUrlInput = {
  origin: string;
  sessionToken: string;
  quickPayload: string;
  accessMode: DeepAccessMode;
  decryptionKey?: string;
};

export type ParsedHybridShareUrl = {
  version: 2;
  origin: string;
  sessionToken: string;
  quickPayload: string;
  accessMode: DeepAccessMode;
  decryptionKey?: string;
};

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const PAYLOAD_PATTERN = /^[A-Za-z0-9_-]{1,6000}$/;
const KEY_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export function createHybridShareUrl(input: HybridShareUrlInput): string {
  const origin = requireWebOrigin(input.origin);
  const sessionToken = requireSessionToken(input.sessionToken);
  const quickPayload = requireQuickPayload(input.quickPayload);
  const accessMode = requireAccessMode(input.accessMode);
  const decryptionKey = requireKeyForMode(
    accessMode,
    input.decryptionKey,
  );

  const fragment = new URLSearchParams({
    v: "2",
    p: quickPayload,
    m: accessMode === "private" ? "p" : "a",
  });
  if (decryptionKey) fragment.set("k", decryptionKey);

  return `${origin}/c/${sessionToken}#${fragment.toString()}`;
}

export function parseHybridShareUrl(value: string): ParsedHybridShareUrl {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Hybrid share URL is invalid.");
  }
  if (url.username || url.password) {
    throw new Error("Share origin is invalid.");
  }
  const origin = requireWebOrigin(url.origin);
  const pathMatch = url.pathname.match(/^\/c\/([A-Za-z0-9_-]+)\/?$/);
  if (!pathMatch) throw new Error("Hybrid share session token is invalid.");
  const sessionToken = requireSessionToken(pathMatch[1]);

  const fragment = new URLSearchParams(url.hash.slice(1));
  requireSingleValue(fragment, "v");
  requireSingleValue(fragment, "p");
  requireSingleValue(fragment, "m");
  if (fragment.getAll("k").length > 1) {
    throw new Error("Hybrid share decryption key is invalid.");
  }
  if (fragment.get("v") !== "2") {
    throw new Error("Hybrid share version is unsupported.");
  }

  const quickPayload = requireQuickPayload(fragment.get("p"));
  const modeValue = fragment.get("m");
  const accessMode =
    modeValue === "p"
      ? "private"
      : modeValue === "a"
        ? "agent-readable"
        : undefined;
  const validatedMode = requireAccessMode(accessMode);
  const decryptionKey = requireKeyForMode(
    validatedMode,
    fragment.get("k") ?? undefined,
  );

  return {
    version: 2,
    origin,
    sessionToken,
    quickPayload,
    accessMode: validatedMode,
    ...(decryptionKey ? { decryptionKey } : {}),
  };
}

function requireWebOrigin(value: unknown): string {
  if (typeof value !== "string") throw new Error("Share origin is invalid.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Share origin is invalid.");
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password
  ) {
    throw new Error("Share origin is invalid.");
  }
  return url.origin;
}

function requireSessionToken(value: unknown): string {
  if (typeof value !== "string" || !TOKEN_PATTERN.test(value)) {
    throw new Error("Hybrid share session token is invalid.");
  }
  return value;
}

function requireQuickPayload(value: unknown): string {
  if (typeof value !== "string" || !PAYLOAD_PATTERN.test(value)) {
    throw new Error("Hybrid share Quick fallback is invalid.");
  }
  decodePayload(value);
  return value;
}

function requireAccessMode(value: unknown): DeepAccessMode {
  if (value !== "private" && value !== "agent-readable") {
    throw new Error("Hybrid share access mode is invalid.");
  }
  return value;
}

function requireKeyForMode(
  mode: DeepAccessMode,
  value: unknown,
): string | undefined {
  if (mode === "private") {
    if (typeof value !== "string" || !KEY_PATTERN.test(value)) {
      throw new Error("Private Deep Connect requires a valid decryption key.");
    }
    return value;
  }
  if (value !== undefined) {
    throw new Error("Agent-readable Deep Connect cannot include a decryption key.");
  }
  return undefined;
}

function requireSingleValue(fragment: URLSearchParams, key: string): void {
  if (fragment.getAll(key).length !== 1) {
    throw new Error(`Hybrid share ${key} value is invalid.`);
  }
}
