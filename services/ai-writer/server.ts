import { createServer } from "node:http";

import {
  OPTIONS as rewriteOptions,
  POST as rewritePost,
} from "../../app/api/ai/rewrite/route.ts";
import {
  OPTIONS as researchOptions,
  POST as researchPost,
} from "../../app/api/ai/research/route.ts";

const port = Number(process.env.PORT ?? "10000");
const MAX_BODY_BYTES = 16_000;

const server = createServer(async (incoming, outgoing) => {
  try {
    if (incoming.method === "GET" && incoming.url === "/health") {
      return send(
        outgoing,
        Response.json(
          { status: "ok" },
          { headers: { "cache-control": "no-store" } },
        ),
      );
    }

    const method = incoming.method ?? "GET";
    const pathname = new URL(
      incoming.url ?? "/",
      `http://${incoming.headers.host ?? "localhost"}`,
    ).pathname;
    const handler =
      pathname === "/api/ai/rewrite"
        ? method === "OPTIONS"
          ? rewriteOptions
          : method === "POST"
            ? rewritePost
            : null
        : pathname === "/api/ai/research"
          ? method === "OPTIONS"
            ? researchOptions
            : method === "POST"
              ? researchPost
              : null
          : null;

    if (!handler) {
      return send(
        outgoing,
        Response.json({ error: "Not found." }, { status: 404 }),
      );
    }

    const body = method === "POST" ? await readBody(incoming) : undefined;
    const protocol = incoming.headers["x-forwarded-proto"] ?? "http";
    const request = new Request(
      `${protocol}://${incoming.headers.host ?? "localhost"}${incoming.url ?? "/"}`,
      {
        method,
        headers: incoming.headers as HeadersInit,
        body,
      },
    );
    return send(outgoing, await handler(request));
  } catch {
    return send(
      outgoing,
      Response.json(
        { error: "The AI writing service could not process this request." },
        { status: 500, headers: { "cache-control": "no-store" } },
      ),
    );
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`AI writing service listening on port ${port}`);
});

async function readBody(
  incoming: AsyncIterable<unknown>,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of incoming) {
    const bytes =
      chunk instanceof Uint8Array ? chunk : Buffer.from(String(chunk));
    size += bytes.byteLength;
    if (size > MAX_BODY_BYTES) throw new Error("Request is too large.");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

async function send(
  outgoing: import("node:http").ServerResponse,
  response: Response,
): Promise<void> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  outgoing.writeHead(response.status, headers);
  outgoing.end(Buffer.from(await response.arrayBuffer()));
}
