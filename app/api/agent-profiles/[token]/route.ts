import {
  findAgentProfile,
  revokeAgentProfile,
} from "../../../../db/agent-profiles";
import { createDeepAiContext } from "../../../../lib/deep-ai";
import { validateDeepSnapshot } from "../../../../lib/deep-profile";
import {
  hashSessionToken,
  validateRevokeToken,
  validateSessionToken,
} from "../../../../lib/deep-session";

type RouteContext = {
  params: Promise<{ token: string }>;
};

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const token = validateSessionToken((await context.params).token);
    const { env } = await import("cloudflare:workers");
    const record = await findAgentProfile(
      env.DB,
      await hashSessionToken(token),
    );
    if (!record) return unavailable(404);
    if (record.revokedAt !== null || record.expiresAt <= Date.now()) {
      return unavailable(410);
    }

    const snapshot = validateDeepSnapshot(JSON.parse(record.snapshotJson));
    const format = new URL(request.url).searchParams.get("format");
    if (format === "markdown") {
      return new Response(createDeepAiContext(snapshot), {
        headers: {
          ...privateHeaders(),
          "content-type": "text/markdown; charset=utf-8",
        },
      });
    }
    if (format !== null && format !== "json") return unavailable(400);

    return Response.json(
      {
        protocol: 2,
        accessMode: "agent-readable",
        expiresAt: record.expiresAt,
        profile: snapshot,
        instructionsUrl: new URL("/protocol/v2", request.url).toString(),
      },
      { headers: privateHeaders() },
    );
  } catch {
    return unavailable(400);
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const token = validateSessionToken((await context.params).token);
    const body = (await request.json()) as Record<string, unknown>;
    const revokeToken = validateRevokeToken(body.revokeToken);
    const [tokenHash, revokeTokenHash] = await Promise.all([
      hashSessionToken(token),
      hashSessionToken(revokeToken),
    ]);
    const { env } = await import("cloudflare:workers");
    const revoked = await revokeAgentProfile(
      env.DB,
      tokenHash,
      revokeTokenHash,
      Date.now(),
    );
    if (!revoked) return unavailable(404);
    return new Response(null, { status: 204 });
  } catch {
    return unavailable(400);
  }
}

function unavailable(status: number): Response {
  return Response.json(
    { error: "This agent-readable profile is unavailable." },
    { status, headers: privateHeaders() },
  );
}

function privateHeaders(): HeadersInit {
  return {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  };
}
