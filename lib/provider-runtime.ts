export async function readProviderSetting(name: string): Promise<string> {
  try {
    const { env } = await import("cloudflare:workers");
    const value = (env as unknown as Record<string, unknown>)[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // Render and Node development use process.env instead.
  }
  return process.env[name]?.trim() ?? "";
}

export async function requestAccessHeaders(
  request: Request,
): Promise<{ allowed: boolean; headers: HeadersInit }> {
  const requestOrigin = new URL(request.url).origin;
  const callerOrigin = request.headers.get("origin");
  const configuredOrigin = await readProviderSetting("AI_ALLOWED_ORIGIN");
  const allowedOrigins = new Set(
    [requestOrigin, configuredOrigin].filter(Boolean),
  );
  const allowed = !callerOrigin || allowedOrigins.has(callerOrigin);

  return {
    allowed,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...(callerOrigin && allowed
        ? {
            "access-control-allow-origin": callerOrigin,
            vary: "Origin",
          }
        : {}),
    },
  };
}

export function optionsHeaders(origin: string | null): HeadersInit {
  return {
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-max-age": "600",
    ...(origin ? { "access-control-allow-origin": origin, vary: "Origin" } : {}),
  };
}
