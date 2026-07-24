import { insertAgentProfile } from "../../../db/agent-profiles";
import {
  createSessionTokens,
  hashSessionToken,
  validateAgentSessionCreate,
} from "../../../lib/deep-session";

const MAX_REQUEST_BYTES = 80_000;

export async function POST(request: Request): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_REQUEST_BYTES) return tooLarge();

  try {
    const bodyText = await request.text();
    if (bodyText.length > MAX_REQUEST_BYTES) return tooLarge();

    const now = new Date();
    const session = validateAgentSessionCreate(JSON.parse(bodyText), now);
    const { sessionToken, revokeToken } = createSessionTokens();
    const [tokenHash, revokeTokenHash] = await Promise.all([
      hashSessionToken(sessionToken),
      hashSessionToken(revokeToken),
    ]);
    const { env } = await import("cloudflare:workers");

    await insertAgentProfile(env.DB, {
      tokenHash,
      revokeTokenHash,
      snapshotJson: JSON.stringify(session.snapshot),
      expiresAt: session.expiresAt,
      createdAt: now.getTime(),
      revokedAt: null,
    });

    return Response.json(
      { sessionToken, revokeToken, expiresAt: session.expiresAt },
      { status: 201, headers: privateHeaders() },
    );
  } catch {
    return Response.json(
      { error: "The agent-readable profile could not be created." },
      { status: 400, headers: privateHeaders() },
    );
  }
}

function tooLarge(): Response {
  return Response.json(
    { error: "Agent-readable profile is too large." },
    { status: 413, headers: privateHeaders() },
  );
}

function privateHeaders(): HeadersInit {
  return {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  };
}
