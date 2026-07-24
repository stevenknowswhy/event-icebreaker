import {
  findPrivateDeepSession,
  revokePrivateDeepSession,
} from "../../../../db/deep-sessions";
import {
  hashSessionToken,
  validateRevokeToken,
  validateSessionToken,
} from "../../../../lib/deep-session";

type RouteContext = {
  params: Promise<{ token: string }>;
};

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const token = validateSessionToken((await context.params).token);
    const { env } = await import("cloudflare:workers");
    const record = await findPrivateDeepSession(
      env.DB,
      await hashSessionToken(token),
    );
    if (!record) return sessionUnavailable(404);
    if (record.revokedAt !== null || record.expiresAt <= Date.now()) {
      return sessionUnavailable(410);
    }

    return Response.json(
      {
        envelope: {
          v: 1,
          algorithm: "A256GCM",
          iv: record.iv,
          ciphertext: record.ciphertext,
        },
        expiresAt: record.expiresAt,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return sessionUnavailable(400);
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const token = validateSessionToken((await context.params).token);
    const { env } = await import("cloudflare:workers");
    const body = (await request.json()) as Record<string, unknown>;
    const revokeToken = validateRevokeToken(body.revokeToken);
    const [tokenHash, revokeTokenHash] = await Promise.all([
      hashSessionToken(token),
      hashSessionToken(revokeToken),
    ]);
    const revoked = await revokePrivateDeepSession(
      env.DB,
      tokenHash,
      revokeTokenHash,
      Date.now(),
    );
    if (!revoked) return sessionUnavailable(404);
    return new Response(null, { status: 204 });
  } catch {
    return sessionUnavailable(400);
  }
}

function sessionUnavailable(status: number): Response {
  return Response.json(
    { error: "This Deep Connect session is unavailable." },
    { status, headers: { "cache-control": "no-store" } },
  );
}
