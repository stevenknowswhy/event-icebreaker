import assert from "node:assert/strict";
import { chromium } from "playwright";

const origin = process.env.PREVIEW_ORIGIN ?? "http://localhost:3000";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
});

await context.addInitScript(() => {
  localStorage.setItem(
    "event-icebreaker.circle.v1",
    JSON.stringify([
      {
        id: "circle-drew-houston",
        savedAt: "2026-07-24T17:00:00.000Z",
        profile: {
          v: 1,
          n: "Drew Houston",
          o: 3,
          i: "networking",
          r: "Founder and CEO at Dropbox",
          x: ["Technology", "Entrepreneurship"],
          u: "https://www.dropbox.com/about/leadership",
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
  await page.goto(`${origin}/warm-path`, { waitUntil: "networkidle" });
  await page.locator(".warm-path-contact__select input").check();
  await page.locator(".warm-path-contact__confirm input").check();
  await page
    .getByLabel("Target investor or fund URL")
    .fill("https://www.sequoiacap.com/people/alfred-lin/");

  await page.getByRole("button", { name: "Research Warm Paths" }).click();
  await Promise.race([
    page
      .getByRole("heading", { name: /human paths? to Alfred Lin\./ })
      .waitFor({ timeout: 390_000 }),
    page
      .getByRole("alert")
      .waitFor({ timeout: 390_000 })
      .then(async () => {
        throw new Error(
          `Warm Path returned an error: ${await page.getByRole("alert").textContent()}`,
        );
      }),
  ]);

  const resultCount = await page.locator(".warm-path-result").count();
  const citationCount = await page.locator(".path-edge__sources a").count();
  const workflowCount = await page.locator(".workflow-receipt li").count();

  assert.ok(resultCount >= 1 && resultCount <= 3);
  assert.ok(citationCount >= 1);
  assert.equal(workflowCount, 5);
  assert.deepEqual(issues, []);

  console.log(
    JSON.stringify(
      {
        warmPath: "passed",
        results: resultCount,
        citations: citationCount,
        workflowRoles: workflowCount,
        consoleIssues: issues.length,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
