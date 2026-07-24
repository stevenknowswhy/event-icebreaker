import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DEMO_WARM_PATH_RESPONSE,
  createWarmPathRequest,
  parseWarmPathResponse,
} from "../lib/warm-path.ts";

const contact = {
  name: "Maya Chen",
  role: "Founder at Resilient Cities Lab",
  publicProfileUrl: "https://example.com/maya",
  askConfirmed: true as const,
};
const contractFixture = JSON.parse(
  readFileSync(
    new URL("../fixtures/warm-path-contract.json", import.meta.url),
    "utf8",
  ),
) as {
  request: Parameters<typeof createWarmPathRequest>;
  response: unknown;
  invalidResponse: unknown;
};

test("creates a bounded request from confirmed contacts", () => {
  const request = createWarmPathRequest("https://example.com/investor", [
    contact,
  ]);

  assert.equal(request.targetUrl, "https://example.com/investor");
  assert.deepEqual(request.contacts, [contact]);
});

test("rejects unsafe URLs, unconfirmed contacts, and oversized selections", () => {
  assert.throws(
    () => createWarmPathRequest("http://example.com/investor", [contact]),
    /https/i,
  );
  assert.throws(
    () =>
      createWarmPathRequest("https://example.com/investor", [
        { ...contact, publicProfileUrl: "https://user:secret@example.com/maya" },
      ]),
    /credentials/i,
  );
  assert.throws(
    () =>
      createWarmPathRequest("https://example.com/investor", [
        { ...contact, askConfirmed: false },
      ]),
    /confirm/i,
  );
  assert.throws(
    () =>
      createWarmPathRequest(
        "https://example.com/investor",
        Array.from({ length: 6 }, (_, index) => ({
          ...contact,
          name: `Contact ${index}`,
          publicProfileUrl: `https://example.com/contact-${index}`,
        })),
      ),
    /five/i,
  );
});

test("parses the demo response into citation-backed paths", () => {
  const parsed = parseWarmPathResponse(DEMO_WARM_PATH_RESPONSE);

  assert.equal(parsed.paths.length, 2);
  assert.equal(parsed.paths[0].strength, "strong");
  assert.ok(
    parsed.paths.every((path) =>
      path.edges.every((edge) => edge.citations.length > 0),
    ),
  );
});

test("drops complete paths when any public edge is uncited", () => {
  const response = structuredClone(DEMO_WARM_PATH_RESPONSE);
  response.paths[0].edges[0].citations = [];

  const parsed = parseWarmPathResponse(response);

  assert.equal(parsed.paths.length, 1);
  assert.equal(parsed.paths[0].contactName, response.paths[1].contactName);
});

test("rejects malformed targets and unsafe citation URLs", () => {
  assert.throws(
    () =>
      parseWarmPathResponse({
        ...DEMO_WARM_PATH_RESPONSE,
        target: { name: "", url: "https://example.com" },
      }),
    /target/i,
  );

  const response = structuredClone(DEMO_WARM_PATH_RESPONSE);
  response.paths[0].edges[0].citations[0].url = "javascript:alert(1)";
  const parsed = parseWarmPathResponse(response);
  assert.equal(parsed.paths.length, 1);
});

test("shares one cross-service contract fixture with Pydantic", () => {
  const request = contractFixture.request as unknown as {
    targetUrl: string;
    contacts: Parameters<typeof createWarmPathRequest>[1];
  };
  assert.deepEqual(
    createWarmPathRequest(request.targetUrl, request.contacts),
    request,
  );
  assert.equal(parseWarmPathResponse(contractFixture.response).paths.length, 1);
  assert.equal(
    parseWarmPathResponse(contractFixture.invalidResponse).paths.length,
    0,
  );
});
