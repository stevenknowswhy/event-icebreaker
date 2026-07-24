import { insertPrivateDeepSession } from "../../../db/deep-sessions";
import {
  createSessionTokens,
  hashSessionToken,
  validatePrivateSessionCreate,
} from "../../../lib/deep-session";

const MAX_REQUEST_BYTES = 120_000;

export async function POST(request: Request): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_REQUEST_BYTES) {
    return Response.json({ error: "Session payload is too large." }, { status: 413 });
  }

  try {
    const bodyText = await request.text();
    if (bodyText.length > MAX_REQUEST_BYTES) {
      return Response.json(
        { error: "Session payload is too large." },
        { status: 413 },
      );
    }
    const now = new Date();
    const session = validatePrivateSessionCreate(JSON.parse(bodyText), now);
    const { sessionToken, revokeToken } = createSessionTokens();
    const [tokenHash, revokeTokenHash] = await Promise.all([
      hashSessionToken(sessionToken),
      hashSessionToken(revokeToken),
    ]);
    const { env } = await import("cloudflare:workers");

    await insertPrivateDeepSession(env.DB, {
      tokenHash,
      revokeTokenHash,
      ciphertext: session.envelope.ciphertext,
      iv: session.envelope.iv,
      expiresAt: session.expiresAt,
      createdAt: now.getTime(),
      revokedAt: null,
    });

    return Response.json(
      { sessionToken, revokeToken, expiresAt: session.expiresAt },
      {
        status: 201,
        headers: { "cache-control": "no-store" },
      },
    );
  } catch {
    return Response.json(
      { error: "The encrypted Deep session could not be created." },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }
}
