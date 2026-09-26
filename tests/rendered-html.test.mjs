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
  assert.match(html, /Refresh share QR/);
  assert.match(html, /SET UP YOUR CARD/);
  assert.match(html, /60-sec demo/);
  assert.match(html, /Download card/);
  assert.match(html, /Connection String fallback/);
  assert.match(html, /Stefano/);
  assert.doesNotMatch(html, /\bJames\b/);
  assert.match(html, /strengthen disaster readiness/);
  assert.match(html, /Emergency management strategist/);
  assert.doesNotMatch(html, /Private equity operator/);
  assert.match(html, /og:image/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("server-renders the setup doors with speed setup as the primary door", async () => {
  const response = await render();
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /SET UP YOUR CARD/);
  // Primary door: speed setup — the AI prompt comes first.
  assert.match(html, /FASTEST · ABOUT A MINUTE/);
  assert.match(html, /Let your AI introduce you\./);
  assert.match(html, /Start with your AI →/);
  // Consent framing lives on the door itself.
  assert.match(html, /nothing is saved until you confirm/);
  // Fallback door: the five-question wizard.
  assert.match(html, /FIVE QUESTIONS · NO AI/);
  assert.match(html, /Build it with the form\./);
  assert.match(html, /Use the five-step form/);
});

test("server-renders receiver recovery without requiring profile data", async () => {
  const response = await render("/receive");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, />Receiver</);
  assert.match(html, /Let’s recover the signal\./);
  assert.match(html, /Icebreaker link or Connection String/);
  assert.match(html, /Build my own profile instead/);
  assert.match(html, /No accounts\. No database\. No analytics\./);
  assert.doesNotMatch(html, /login|sign in/i);
});
