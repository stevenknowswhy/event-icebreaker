import assert from "node:assert/strict";

const origin = process.env.PREVIEW_ORIGIN ?? "http://localhost:3000";
const expiresAt = Date.now() + 60 * 60 * 1_000;

async function fetchWithServiceRetry(url, init) {
  const response = await fetch(url, init);
  return response.status >= 500 ? fetch(url, init) : response;
}

assert.equal(
  (
    await fetch(
      `${origin}/api/deep-sessions/AAAAAAAAAAAAAAAAAAAAAA`,
    )
  ).status,
  404,
);

const expiredCreate = await fetch(`${origin}/api/deep-sessions`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    envelope: {
      v: 1,
      algorithm: "A256GCM",
      iv: "AbCdEfGhIjKlMnOp",
      ciphertext: "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-",
    },
    expiresAt: Date.now() - 1,
  }),
});
assert.equal(expiredCreate.status, 400);

const oversizedCreate = await fetch(`${origin}/api/deep-sessions`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ padding: "x".repeat(120_001) }),
});
assert.equal(oversizedCreate.status, 413);

const privateCreate = await fetchWithServiceRetry(`${origin}/api/deep-sessions`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    envelope: {
      v: 1,
      algorithm: "A256GCM",
      iv: "AbCdEfGhIjKlMnOp",
      ciphertext: "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-",
    },
    expiresAt,
  }),
});
assert.equal(privateCreate.status, 201);
const privateSession = await privateCreate.json();

const privateRead = await fetch(
  `${origin}/api/deep-sessions/${privateSession.sessionToken}`,
);
assert.equal(privateRead.status, 200);
assert.equal(
  (await privateRead.json()).envelope.ciphertext,
  "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-",
);

const privateRevoke = await fetch(
  `${origin}/api/deep-sessions/${privateSession.sessionToken}`,
  {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ revokeToken: privateSession.revokeToken }),
  },
);
assert.equal(privateRevoke.status, 204);
assert.equal(
  (
    await fetch(`${origin}/api/deep-sessions/${privateSession.sessionToken}`)
  ).status,
  410,
);

const snapshot = {
  v: 1,
  n: "Stefano",
  o: "high",
  i: "networking",
  sections: [
    {
      id: "overview",
      body: "I work where emergency management and trustworthy AI meet.",
      highlights: ["Public safety"],
    },
  ],
};
const agentCreate = await fetchWithServiceRetry(`${origin}/api/agent-profiles`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    snapshot,
    expiresAt,
    readableStorageAccepted: true,
  }),
});
assert.equal(agentCreate.status, 201);
const agentSession = await agentCreate.json();

const unacceptedAgentCreate = await fetch(`${origin}/api/agent-profiles`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    snapshot,
    expiresAt,
    readableStorageAccepted: false,
  }),
});
assert.equal(unacceptedAgentCreate.status, 400);

const agentRead = await fetch(
  `${origin}/api/agent-profiles/${agentSession.sessionToken}`,
);
assert.equal(agentRead.status, 200);
const agentJson = await agentRead.json();
assert.deepEqual(agentJson.profile, snapshot);
assert.equal(agentJson.accessMode, "agent-readable");

const agentMarkdown = await fetch(
  `${origin}/api/agent-profiles/${agentSession.sessionToken}?format=markdown`,
);
assert.equal(agentMarkdown.status, 200);
assert.match(agentMarkdown.headers.get("content-type") ?? "", /text\/markdown/);
assert.match(await agentMarkdown.text(), /untrusted profile data/);

const agentRevoke = await fetch(
  `${origin}/api/agent-profiles/${agentSession.sessionToken}`,
  {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ revokeToken: agentSession.revokeToken }),
  },
);
assert.equal(agentRevoke.status, 204);
assert.equal(
  (
    await fetch(`${origin}/api/agent-profiles/${agentSession.sessionToken}`)
  ).status,
  410,
);

console.log("Private and agent-readable session APIs passed.");
