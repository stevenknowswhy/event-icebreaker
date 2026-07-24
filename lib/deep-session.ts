import {
  validateEncryptedEnvelope,
  type EncryptedDeepEnvelope,
} from "./deep-crypto.ts";
import {
  validateDeepSnapshot,
  type DeepExpiry,
  type DeepSnapshot,
} from "./deep-profile.ts";

export type PrivateSessionCreate = {
  envelope: EncryptedDeepEnvelope;
  expiresAt: number;
};

export type AgentSessionCreate = {
  snapshot: DeepSnapshot;
  expiresAt: number;
};

const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const REVOKE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000 + 60_000;

export function calculateDeepExpiry(
  expiry: DeepExpiry,
  now = new Date(),
): Date {
  if (expiry === "one-hour") {
    return new Date(now.getTime() + 60 * 60 * 1_000);
  }
  if (expiry === "tonight") {
    const tonight = new Date(now);
    tonight.setHours(23, 59, 59, 999);
    return tonight;
  }
  if (expiry === "seven-days") {
    return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000);
  }
  throw new Error("Deep session expiry is invalid.");
}

export function createSessionTokens(): {
  sessionToken: string;
  revokeToken: string;
} {
  return {
    sessionToken: randomBase64Url(16),
    revokeToken: randomBase64Url(32),
  };
}

export async function hashSessionToken(token: string): Promise<string> {
  if (
    !SESSION_TOKEN_PATTERN.test(token) &&
    !REVOKE_TOKEN_PATTERN.test(token)
  ) {
    throw new Error("Deep session token is invalid.");
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function validatePrivateSessionCreate(
  value: unknown,
  now = new Date(),
): PrivateSessionCreate {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Private Deep session request is invalid.");
  }
  const record = value as Record<string, unknown>;
  const envelope = validateEncryptedEnvelope(record.envelope);
  if (
    typeof record.expiresAt !== "number" ||
    !Number.isInteger(record.expiresAt) ||
    record.expiresAt <= now.getTime() ||
    record.expiresAt > now.getTime() + MAX_LIFETIME_MS
  ) {
    throw new Error("Private Deep session expiry is invalid.");
  }
  return { envelope, expiresAt: record.expiresAt };
}

export function validateAgentSessionCreate(
  value: unknown,
  now = new Date(),
): AgentSessionCreate {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Agent-readable Deep session request is invalid.");
  }
  const record = value as Record<string, unknown>;
  if (record.readableStorageAccepted !== true) {
    throw new Error("Agent-readable storage requires explicit consent.");
  }
  const snapshot = validateDeepSnapshot(record.snapshot);
  if (snapshot.sections.length === 0) {
    throw new Error("Agent-readable Deep session requires a shared section.");
  }
  validateExpiresAt(record.expiresAt, now, "Agent-readable");
  return { snapshot, expiresAt: record.expiresAt as number };
}

export function validateSessionToken(token: unknown): string {
  if (typeof token !== "string" || !SESSION_TOKEN_PATTERN.test(token)) {
    throw new Error("Deep session token is invalid.");
  }
  return token;
}

export function validateRevokeToken(token: unknown): string {
  if (typeof token !== "string" || !REVOKE_TOKEN_PATTERN.test(token)) {
    throw new Error("Deep session revocation token is invalid.");
  }
  return token;
}

function randomBase64Url(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function validateExpiresAt(
  value: unknown,
  now: Date,
  label: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value <= now.getTime() ||
    value > now.getTime() + MAX_LIFETIME_MS
  ) {
    throw new Error(`${label} Deep session expiry is invalid.`);
  }
}
