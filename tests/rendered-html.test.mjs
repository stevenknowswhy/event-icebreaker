import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Event Icebreaker sender experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Event Icebreaker — Skip the small talk<\/title>/i);
  assert.match(html, /Skip the small talk\./);
  assert.match(html, /Generate my QR code/);
  assert.match(html, /Connection String fallback/);
  assert.match(html, /Stefano/);
  assert.doesNotMatch(html, /\bJames\b/);
  assert.match(html, /How ESOPs could end the wealth gap/);
  assert.match(html, /og:image/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("server-renders receiver recovery without requiring profile data", async () => {
  const response = await render("/receive");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /Receiver mode/);
  assert.match(html, /Let’s recover the signal\./);
  assert.match(html, /Icebreaker link or Connection String/);
  assert.match(html, /Build my own profile instead/);
  assert.match(html, /No accounts\. No database\. No analytics\./);
  assert.doesNotMatch(html, /login|sign in/i);
});
