import {
  createParasailRequest,
  normalizeParasailResponse,
  validateRewriteRequest,
} from "../../../../lib/ai-writing.ts";
import {
  optionsHeaders,
  readProviderSetting,
  requestAccessHeaders,
} from "../../../../lib/provider-runtime.ts";
import {
  createRequestRateLimiter,
  requestClientKey,
} from "../../../../lib/provider-rate-limit.ts";

const MAX_REQUEST_BYTES = 8_000;
const rateLimiter = createRequestRateLimiter({
  limit: 20,
  windowMs: 10 * 60 * 1_000,
});

export async function OPTIONS(request: Request): Promise<Response> {
  const access = await requestAccessHeaders(request);
  if (!access.allowed) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: optionsHeaders(request.headers.get("origin")),
  });
}

export async function POST(request: Request): Promise<Response> {
  const access = await requestAccessHeaders(request);
  if (!access.allowed) {
    return Response.json(
      { error: "This AI endpoint only accepts requests from the app." },
      { status: 403, headers: access.headers },
    );
  }
  const rate = rateLimiter.take(requestClientKey(request));
  if (!rate.allowed) {
    return Response.json(
      { error: "Too many rewrite requests. Please try again shortly." },
      {
        status: 429,
        headers: {
          ...access.headers,
          "retry-after": String(rate.retryAfterSeconds),
        },
      },
    );
  }

  let input;
  try {
    input = validateRewriteRequest(await readJson(request));
  } catch (caught) {
    return Response.json(
      {
        error:
          caught instanceof Error
            ? caught.message
            : "The rewrite request is invalid.",
      },
      { status: 400, headers: access.headers },
    );
  }

  const [apiKey, model, configuredBaseUrl] = await Promise.all([
    readProviderSetting("PARASAIL_API_KEY"),
    readProviderSetting("PARASAIL_MODEL"),
    readProviderSetting("PARASAIL_BASE_URL"),
  ]);
  if (!apiKey || !model) {
    return Response.json(
      {
        error: "AI rewriting is not configured yet.",
        code: "provider_unavailable",
      },
      { status: 503, headers: access.headers },
    );
  }

  const baseUrl = configuredBaseUrl || "https://api.parasail.io/v1";
  try {
    const providerResponse = await fetch(
      `${baseUrl.replace(/\/+$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(createParasailRequest(input, model)),
        signal: AbortSignal.timeout(45_000),
      },
    );
    if (!providerResponse.ok) {
      return Response.json(
        {
          error:
            providerResponse.status === 429
              ? "The rewriting service is busy. Please try again shortly."
              : "The rewriting service could not complete this request.",
        },
        {
          status: providerResponse.status === 429 ? 429 : 502,
          headers: access.headers,
        },
      );
    }

    return Response.json(
      {
        draft: normalizeParasailResponse(await providerResponse.json()),
        provider: "parasail",
      },
      { headers: access.headers },
    );
  } catch {
    return Response.json(
      { error: "The rewriting service could not complete this request." },
      { status: 502, headers: access.headers },
    );
  }
}

async function readJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_REQUEST_BYTES) {
    throw new Error("The rewrite request is too large.");
  }
  const text = await request.text();
  if (text.length > MAX_REQUEST_BYTES) {
    throw new Error("The rewrite request is too large.");
  }
  return JSON.parse(text);
}
