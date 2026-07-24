import assert from "node:assert/strict";
import test from "node:test";

import {
  proxyApprovedEmail,
  proxyWarmPathRequest,
} from "../lib/warm-path-api.ts";
import { DEMO_WARM_PATH_RESPONSE } from "../lib/warm-path.ts";

const requestPayload = {
  targetUrl: "https://fund.example/elena",
  contacts: [
    {
      name: "Maya",
      publicProfileUrl: "https://people.example/maya",
      askConfirmed: true,
    },
  ],
};

function post(body: unknown) {
  return new Request("https://app.example/api/warm-paths", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("server boundary validates, authenticates, and normalizes research", async () => {
  let upstream: Request | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    upstream = new Request(input, init);
    return Response.json(DEMO_WARM_PATH_RESPONSE);
  };
  const response = await proxyWarmPathRequest(post(requestPayload), {
    serviceUrl: "https://agents.example",
    serviceToken: "server-only-token",
    fetcher,
  });

  assert.equal(response.status, 200);
  assert.equal(upstream?.url, "https://agents.example/v1/warm-paths");
  assert.equal(
    upstream?.headers.get("authorization"),
    "Bearer server-only-token",
  );
  const body = (await response.json()) as { paths: unknown[] };
  assert.equal(body.paths.length, 2);
});

test("server boundary never returns raw upstream errors", async () => {
  const response = await proxyWarmPathRequest(post(requestPayload), {
    serviceUrl: "https://agents.example",
    fetcher: async () =>
      new Response("YOU_API_KEY=secret provider traceback", { status: 500 }),
  });
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /secret|traceback|YOU_API_KEY/);
});

test("server boundary reports configuration and validation states", async () => {
  const unconfigured = await proxyWarmPathRequest(post(requestPayload), {
    serviceUrl: "",
  });
  assert.equal(unconfigured.status, 503);

  const invalid = await proxyWarmPathRequest(
    post({ ...requestPayload, targetUrl: "http://unsafe.example" }),
    { serviceUrl: "https://agents.example" },
  );
  assert.equal(invalid.status, 400);
});

test("approved email boundary refuses actions without confirmation", async () => {
  const response = await proxyApprovedEmail(
    post({
      recipient: "maya@example.com",
      subject: "Introduction",
      message: "Would you be comfortable helping?",
      approved: false,
    }),
    { serviceUrl: "https://agents.example" },
  );
  assert.equal(response.status, 400);
});

test("approved email boundary returns only a safe receipt", async () => {
  const response = await proxyApprovedEmail(
    post({
      recipient: "maya@example.com",
      subject: "Introduction",
      message: "Would you be comfortable helping?",
      approved: true,
    }),
    {
      serviceUrl: "https://agents.example",
      fetcher: async () =>
        Response.json({ status: "sent", providerId: "provider-secret-id" }),
    },
  );
  assert.deepEqual(await response.json(), { status: "sent" });
});
