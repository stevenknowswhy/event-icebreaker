import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const origin = process.env.PREVIEW_ORIGIN ?? "http://localhost:3000";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
});
await context.grantPermissions(["clipboard-read", "clipboard-write"], {
  origin,
});

await context.addInitScript(() => {
  localStorage.setItem(
    "event-icebreaker.circle.v1",
    JSON.stringify([
      {
        id: "circle-maya",
        savedAt: "2026-07-24T17:00:00.000Z",
        profile: {
          v: 1,
          n: "Maya Chen",
          o: 3,
          i: "networking",
          r: "Founder at Resilient Cities Lab",
          x: ["Civic Technology", "Urban Resilience"],
          u: "https://example.com/maya",
        },
      },
    ]),
  );
});

const issues = [];
const page = await context.newPage();
page.on("console", (message) => {
  if (message.type() === "error" || message.type() === "warning") {
    issues.push(`${message.type()}: ${message.text()}`);
  }
});
page.on("pageerror", (error) => issues.push(`pageerror: ${error.message}`));

try {
  let approvedAction;
  await page.route("**/api/warm-paths", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        target: {
          name: "Elena Park",
          organization: "Aster Ventures",
          url: "https://example.com/aster-ventures",
        },
        paths: [
          {
            contactName: "Maya Chen",
            strength: "possible",
            explanation: "A public accelerator overlap is worth asking about.",
            uncertainty: "The public overlap does not prove a relationship.",
            edges: [
              {
                from: "Maya Chen",
                relationship: "program mentor",
                to: "Civic Futures",
                citations: [
                  {
                    title: "Civic Futures mentor directory",
                    url: "https://example.com/civic-futures",
                  },
                ],
              },
            ],
            introRequest:
              "Maya — would you be comfortable helping me understand whether an introduction would be appropriate?",
          },
        ],
        workflow: [
          {
            role: "Circle Librarian",
            artifactType: "WarmPathRequest",
            itemCount: 1,
            status: "completed",
          },
          {
            role: "Investor Researcher",
            artifactType: "TargetArtifact",
            itemCount: 2,
            status: "completed",
          },
          {
            role: "Path Scout",
            artifactType: "ScoutArtifact",
            itemCount: 1,
            status: "completed",
          },
          {
            role: "Evidence Auditor",
            artifactType: "AuditArtifact",
            itemCount: 1,
            status: "completed",
          },
          {
            role: "Intro Strategist",
            artifactType: "IntroDraft",
            itemCount: 1,
            status: "completed",
          },
        ],
      }),
    });
  });
  await page.route("**/api/warm-path-actions/email", async (route) => {
    approvedAction = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "sent" }),
    });
  });

  await page.goto(`${origin}/warm-path`, { waitUntil: "networkidle" });

  assert.equal(await page.locator("h1").textContent(), "Find the human path.");
  await page.getByText("Maya Chen", { exact: true }).waitFor();

  await page
    .locator(".warm-path-contact__select input")
    .check();
  await page
    .locator(".warm-path-contact__confirm input")
    .check();
  await page
    .getByLabel("Target investor or fund URL")
    .fill("https://example.com/aster-ventures");

  assert.equal(
    await page.getByRole("button", { name: "Research Warm Paths" }).isEnabled(),
    true,
  );
  assert.match(
    (await page.locator(".warm-path-disclosure").textContent()) ?? "",
    /Maya Chen: name, role, URL/,
  );

  await page.getByRole("button", { name: "Research Warm Paths" }).click();
  const progress = page.getByRole("status", {
    name: "Live research progress",
  });
  await progress.waitFor();
  assert.match((await progress.textContent()) ?? "", /Researching target/);
  assert.match((await progress.textContent()) ?? "", /Estimated stage/);
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/warm-path-progress-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("heading", { name: "1 human path to Elena Park." })
    .waitFor();
  await page
    .getByRole("button", { name: "Preview optional Pica email" })
    .click();
  const send = page.getByRole("button", { name: "Send approved email" });
  await page.getByLabel("Maya Chen email address").fill("maya@example.com");
  assert.equal(
    await page.getByLabel("Email subject").inputValue(),
    "Warm introduction request for Maya Chen",
  );
  assert.equal(await send.isDisabled(), true);
  await page
    .getByLabel(/I reviewed the recipient, subject, and exact message above/)
    .check();
  assert.equal(await send.isEnabled(), true);
  await page.screenshot({
    path: "artifacts/warm-path-action-mobile.png",
    fullPage: true,
  });
  await send.click();
  await page.getByRole("button", { name: "Email sent ✓" }).waitFor();
  assert.deepEqual(approvedAction, {
    recipient: "maya@example.com",
    subject: "Warm introduction request for Maya Chen",
    message:
      "Maya — would you be comfortable helping me understand whether an introduction would be appropriate?",
    approved: true,
  });
  assert.equal(await page.locator(".workflow-receipt li").count(), 5);
  const liveMetrics = page.locator(".workflow-receipt__metrics dd");
  assert.equal(await liveMetrics.nth(0).textContent(), "1s");
  assert.equal(await liveMetrics.nth(1).textContent(), "1");

  await page.getByRole("button", { name: "Load a cited demo" }).click();
  await page.getByRole("heading", { name: "2 human paths to Elena Park." }).waitFor();

  assert.equal(await page.locator(".warm-path-result").count(), 2);
  assert.equal(await page.locator(".path-edge__sources a").count(), 4);
  assert.match(
    (await page.locator(".path-uncertainty").first().textContent()) ?? "",
    /cannot claim/i,
  );
  assert.match(
    (await page.locator(".warm-path-results .step-label").first().textContent()) ??
      "",
    /CITED DEMO · SIMULATED PEOPLE/,
  );
  const demoMetrics = page.locator(".workflow-receipt__metrics dd");
  assert.equal(await demoMetrics.nth(0).textContent(), "Demo fixture");
  assert.equal(await demoMetrics.nth(1).textContent(), "4");

  await page
    .getByRole("button", { name: "Copy introduction request" })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Request copied ✓" })
    .waitFor();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(copied, /Would you be comfortable/i);

  await page.screenshot({
    path: "artifacts/warm-path-mobile.png",
    fullPage: true,
  });

  const emptyContext = await browser.newContext({
    viewport: { width: 320, height: 844 },
  });
  const emptyPage = await emptyContext.newPage();
  emptyPage.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      issues.push(`empty ${message.type()}: ${message.text()}`);
    }
  });
  emptyPage.on("pageerror", (error) =>
    issues.push(`empty pageerror: ${error.message}`),
  );
  await emptyPage.goto(`${origin}/warm-path`, { waitUntil: "networkidle" });
  await emptyPage
    .getByRole("heading", { name: "Your research-ready Circle is empty." })
    .waitFor();
  await emptyPage
    .getByRole("button", { name: "Explore the cited demo" })
    .click();
  await emptyPage
    .getByRole("heading", { name: "2 human paths to Elena Park." })
    .waitFor();
  const emptyDemoMetrics = emptyPage.locator(".workflow-receipt__metrics dd");
  assert.equal(await emptyDemoMetrics.nth(0).textContent(), "Demo fixture");
  assert.equal(await emptyDemoMetrics.nth(1).textContent(), "4");

  for (const width of [320, 768, 1024, 1440]) {
    await emptyPage.setViewportSize({ width, height: width < 768 ? 844 : 1100 });
    assert.equal(
      await emptyPage.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
      `Warm Path should not overflow at ${width}px`,
    );
  }
  await emptyPage.screenshot({
    path: "artifacts/warm-path-demo-desktop.png",
    fullPage: true,
  });
  await emptyContext.close();

  assert.deepEqual(issues, []);
  console.log(
    JSON.stringify(
      {
        warmPath: "passed",
        paths: 2,
        citations: 4,
        approvedAction: "passed",
        consoleIssues: issues.length,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
