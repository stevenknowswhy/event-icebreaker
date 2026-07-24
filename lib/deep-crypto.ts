import {
  validateDeepSnapshot,
  type DeepSnapshot,
} from "./deep-profile.ts";

export type EncryptedDeepEnvelope = {
  v: 1;
  algorithm: "A256GCM";
  iv: string;
  ciphertext: string;
};

const ADDITIONAL_DATA = new TextEncoder().encode(
  "event-icebreaker-deep-profile-v1",
);
const KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const IV_PATTERN = /^[A-Za-z0-9_-]{16}$/;
const CIPHERTEXT_PATTERN = /^[A-Za-z0-9_-]+$/;
const CIPHERTEXT_LIMIT = 100_000;

export async function encryptDeepSnapshot(snapshot: DeepSnapshot): Promise<{
  envelope: EncryptedDeepEnvelope;
  decryptionKey: string;
}> {
  const validated = validateDeepSnapshot(snapshot);
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importAesKey(keyBytes);
  const plaintext = new TextEncoder().encode(JSON.stringify(validated));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: ADDITIONAL_DATA,
      tagLength: 128,
    },
    key,
    plaintext,
  );

  return {
    envelope: {
      v: 1,
      algorithm: "A256GCM",
      iv: toBase64Url(iv),
      ciphertext: toBase64Url(new Uint8Array(ciphertext)),
    },
    decryptionKey: toBase64Url(keyBytes),
  };
}

export async function decryptDeepSnapshot(
  value: unknown,
  decryptionKey: string,
): Promise<DeepSnapshot> {
  const envelope = validateEnvelope(value);
  if (!KEY_PATTERN.test(decryptionKey)) {
    throw new Error("Deep profile decryption key is invalid.");
  }

  try {
    const key = await importAesKey(fromBase64Url(decryptionKey));
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64Url(envelope.iv),
        additionalData: ADDITIONAL_DATA,
        tagLength: 128,
      },
      key,
      fromBase64Url(envelope.ciphertext),
    );
    return validateDeepSnapshot(
      JSON.parse(new TextDecoder().decode(plaintext)),
    );
  } catch {
    throw new Error("Deep profile could not be decrypted.");
  }
}

export function validateEncryptedEnvelope(
  value: unknown,
): EncryptedDeepEnvelope {
  return validateEnvelope(value);
}

function validateEnvelope(value: unknown): EncryptedDeepEnvelope {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Encrypted Deep profile is invalid.");
  }
  const record = value as Record<string, unknown>;
  if (record.v !== 1 || record.algorithm !== "A256GCM") {
    throw new Error("Encrypted Deep profile version is unsupported.");
  }
  if (typeof record.iv !== "string" || !IV_PATTERN.test(record.iv)) {
    throw new Error("Encrypted Deep profile IV is invalid.");
  }
  if (
    typeof record.ciphertext !== "string" ||
    !record.ciphertext.length ||
    record.ciphertext.length > CIPHERTEXT_LIMIT ||
    !CIPHERTEXT_PATTERN.test(record.ciphertext)
  ) {
    throw new Error("Encrypted Deep profile ciphertext is invalid.");
  }
  return {
    v: 1,
    algorithm: "A256GCM",
    iv: record.iv,
    ciphertext: record.ciphertext,
  };
}

async function importAesKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  if (keyBytes.byteLength !== 32) {
    throw new Error("Deep profile decryption key is invalid.");
  }
  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) =>
    character.charCodeAt(0),
  );
}

