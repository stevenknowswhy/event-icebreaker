import {
  createYouResearchRequest,
  normalizeYouResearchResponse,
  validateResearchRequest,
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

const MAX_REQUEST_BYTES = 14_000;
const rateLimiter = createRequestRateLimiter({
  limit: 8,
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
      { error: "This research endpoint only accepts requests from the app." },
      { status: 403, headers: access.headers },
    );
  }
  const rate = rateLimiter.take(requestClientKey(request));
  if (!rate.allowed) {
    return Response.json(
      { error: "Too many research requests. Please try again shortly." },
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
    input = validateResearchRequest(await readJson(request));
  } catch (caught) {
    return Response.json(
      {
        error:
          caught instanceof Error
            ? caught.message
            : "The research request is invalid.",
      },
      { status: 400, headers: access.headers },
    );
  }

  const [apiKey, configuredBaseUrl] = await Promise.all([
    readProviderSetting("YDC_API_KEY"),
    readProviderSetting("YDC_BASE_URL"),
  ]);
  if (!apiKey) {
    return Response.json(
      {
        error: "Public-source research is not configured yet.",
        code: "provider_unavailable",
      },
      { status: 503, headers: access.headers },
    );
  }

  const baseUrl = configuredBaseUrl || "https://api.you.com";
  try {
    const providerResponse = await fetch(
      `${baseUrl.replace(/\/+$/, "")}/v1/research`,
      {
        method: "POST",
        headers: {
          "X-API-Key": apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify(createYouResearchRequest(input)),
        signal: AbortSignal.timeout(90_000),
      },
    );
    if (!providerResponse.ok) {
      return Response.json(
        {
          error:
            providerResponse.status === 429
              ? "The research service is busy. Please try again shortly."
              : "The research service could not complete this request.",
        },
        {
          status: providerResponse.status === 429 ? 429 : 502,
          headers: access.headers,
        },
      );
    }

    const allowedDomains = input.sourceUrls.map(
      (sourceUrl) => new URL(sourceUrl).hostname,
    );
    return Response.json(
      {
        ...normalizeYouResearchResponse(
          await providerResponse.json(),
          allowedDomains,
        ),
        provider: "you.com",
      },
      { headers: access.headers },
    );
  } catch {
    return Response.json(
      { error: "The research service could not complete this request." },
      { status: 502, headers: access.headers },
    );
  }
}

async function readJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_REQUEST_BYTES) {
    throw new Error("The research request is too large.");
  }
  const text = await request.text();
  if (text.length > MAX_REQUEST_BYTES) {
    throw new Error("The research request is too large.");
  }
  return JSON.parse(text);
}
