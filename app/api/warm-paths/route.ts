import { proxyWarmPathRequest } from "../../../lib/warm-path-api.ts";

export const runtime = "edge";

export async function POST(request: Request): Promise<Response> {
  return proxyWarmPathRequest(request);
}
