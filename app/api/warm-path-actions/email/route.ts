import { proxyApprovedEmail } from "../../../../lib/warm-path-api.ts";

export const runtime = "edge";

export async function POST(request: Request): Promise<Response> {
  return proxyApprovedEmail(request);
}
