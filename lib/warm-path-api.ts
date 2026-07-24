import {
  createWarmPathRequest,
  parseWarmPathResponse,
  type WarmPathContactInput,
  type WarmPathRequest,
} from "./warm-path.ts";

const MAX_REQUEST_BYTES = 24_000;
// One live run can make four sequential model calls, each bounded to 90 seconds.
// Keep the browser proxy finite while allowing the backend's own limits to win.
const REQUEST_TIMEOUT_MS = 360_000;
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;
const rateWindows = new Map<string, { count: number; resetAt: number }>();

type ProxyOptions = {
  serviceUrl?: string;
  serviceToken?: string;
  fetcher?: typeof fetch;
  rateLimiter?: (request: Request) => number | null;
};

function jsonResponse(
  body: unknown,
  status: number,
  extraHeaders: HeadersInit = {},
) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", ...extraHeaders },
  });
}

function errorResponse(
  code: string,
  message: string,
  status: number,
  extraHeaders: HeadersInit = {},
) {
  return jsonResponse({ error: { code, message } }, status, extraHeaders);
}

function requestIdentity(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "anonymous"
  );
}

export function rateLimitWarmPathRequest(request: Request): number | null {
  const now = Date.now();
  const identity = requestIdentity(request);
  const current = rateWindows.get(identity);
  if (!current || current.resetAt <= now) {
    rateWindows.set(identity, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return null;
  }
  if (current.count >= RATE_LIMIT) {
    return Math.max(1, Math.ceil((current.resetAt - now) / 1_000));
  }
  current.count += 1;
  return null;
}

function serviceEndpoint(serviceUrl: string, path: string): string {
  let url: URL;
  try {
    url = new URL(serviceUrl);
  } catch {
    throw new Error("Warm Path research is not configured.");
  }
  const isLocal =
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !isLocal) {
    throw new Error("Warm Path research is not configured.");
  }
  if (url.username || url.password) {
    throw new Error("Warm Path research is not configured.");
  }
  return new URL(path, `${url.href.replace(/\/+$/, "")}/`).href;
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_REQUEST_BYTES) {
    throw new Error("The request is too large.");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_REQUEST_BYTES) {
    throw new Error("The request is too large.");
  }
  return JSON.parse(text);
}

function parseWebRequest(value: unknown): WarmPathRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("The Warm Path request is invalid.");
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.contacts)) {
    throw new Error("The Warm Path request is invalid.");
  }
  return createWarmPathRequest(
    record.targetUrl as string,
    record.contacts as WarmPathContactInput[],
  );
}

function upstreamHeaders(token?: string): HeadersInit {
  return {
    "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

export async function proxyWarmPathRequest(
  request: Request,
  options: ProxyOptions = {},
): Promise<Response> {
  const retryAfter = (options.rateLimiter ?? rateLimitWarmPathRequest)(request);
  if (retryAfter !== null) {
    return errorResponse(
      "RATE_LIMITED",
      "Research is busy right now. Wait a moment and try again.",
      429,
      { "retry-after": String(retryAfter) },
    );
  }
  const serviceUrl = options.serviceUrl ?? process.env.WARM_PATH_SERVICE_URL;
  if (!serviceUrl) {
    return errorResponse(
      "NOT_CONFIGURED",
      "Live research is not configured yet. The cited demo is still available.",
      503,
    );
  }

  let payload: WarmPathRequest;
  try {
    payload = parseWebRequest(await readBoundedJson(request));
  } catch (error) {
    return errorResponse(
      "INVALID_REQUEST",
      error instanceof Error ? error.message : "The request is invalid.",
      400,
    );
  }

  try {
    const response = await (options.fetcher ?? fetch)(
      serviceEndpoint(serviceUrl, "/v1/warm-paths"),
      {
        method: "POST",
        headers: upstreamHeaders(
          options.serviceToken ?? process.env.WARM_PATH_SERVICE_TOKEN,
        ),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      if (response.status === 429) {
        return errorResponse(
          "RATE_LIMITED",
          "Research is busy right now. Wait a moment and try again.",
          429,
        );
      }
      if (response.status === 504) {
        return errorResponse(
          "TIMEOUT",
          "Public research took too long. Try fewer Circle contacts.",
          504,
        );
      }
      return errorResponse(
        "PROVIDER_UNAVAILABLE",
        "The research crew could not complete this run. No result was fabricated.",
        response.status === 503 ? 503 : 502,
      );
    }

    return jsonResponse(parseWarmPathResponse(await response.json()), 200);
  } catch (error) {
    const timedOut =
      error instanceof DOMException && error.name === "TimeoutError";
    return errorResponse(
      timedOut ? "TIMEOUT" : "SERVICE_UNAVAILABLE",
      timedOut
        ? "Public research took too long. Try fewer Circle contacts."
        : "The research service is temporarily unavailable.",
      timedOut ? 504 : 502,
    );
  }
}
export async function proxyApprovedEmail(
  request: Request,
  options: ProxyOptions = {},
): Promise<Response> {
  const serviceUrl = options.serviceUrl ?? process.env.WARM_PATH_SERVICE_URL;
  if (!serviceUrl) {
    return errorResponse(
      "NOT_CONFIGURED",
      "Approved email actions are not configured. You can still copy the request.",
      503,
    );
  }

  let payload: Record<string, unknown>;
  try {
    const value = await readBoundedJson(request);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("The approved email is invalid.");
    }
    payload = value as Record<string, unknown>;
    if (
      typeof payload.recipient !== "string" ||
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.recipient) ||
      typeof payload.subject !== "string" ||
      !payload.subject.trim() ||
      payload.subject.length > 160 ||
      typeof payload.message !== "string" ||
      !payload.message.trim() ||
      payload.message.length > 4000 ||
      payload.approved !== true
    ) {
      throw new Error("Review the recipient and message, then confirm approval.");
    }
  } catch (error) {
    return errorResponse(
      "INVALID_ACTION",
      error instanceof Error ? error.message : "The approved email is invalid.",
      400,
    );
  }

  try {
    const response = await (options.fetcher ?? fetch)(
      serviceEndpoint(serviceUrl, "/v1/actions/email"),
      {
        method: "POST",
        headers: upstreamHeaders(
          options.serviceToken ?? process.env.WARM_PATH_SERVICE_TOKEN,
        ),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      },
    );
    if (!response.ok) {
      return errorResponse(
        "ACTION_FAILED",
        "The email was not sent. Copy the request and send it yourself instead.",
        response.status === 503 ? 503 : 502,
      );
    }
    const receipt = (await response.json()) as Record<string, unknown>;
    if (receipt.status !== "sent") {
      throw new Error("The action receipt is invalid.");
    }
    return jsonResponse({ status: "sent" }, 200);
  } catch {
    return errorResponse(
      "ACTION_FAILED",
      "The email was not sent. Copy the request and send it yourself instead.",
      502,
    );
  }
}
