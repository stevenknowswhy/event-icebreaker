import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const origin = "http://localhost:3000";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
});
await context.grantPermissions(["clipboard-read", "clipboard-write"], {
  origin,
});

const issues = [];
const watchPage = (page) => {
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      issues.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => issues.push(`pageerror: ${error.message}`));
};

try {
  const sender = await context.newPage();
  watchPage(sender);
  await sender.goto(`${origin}/`, { waitUntil: "networkidle" });

  assert.equal(
    await sender.locator("h1").first().textContent(),
    "Skip the small talk.",
  );
  assert.equal(await sender.locator(".qr-frame svg").count(), 1);

  await sender
    .getByRole("button", { name: /Generate my QR code/i })
    .click();
  await sender.locator("#share-output").scrollIntoViewIfNeeded();
  await sender.locator(".fallback-grid details").first().locator("summary").click();
  await sender
    .locator(".fallback-grid details")
    .nth(1)
    .locator("summary")
    .click();

  const shareUrl = await sender
    .locator(".fallback-grid details")
    .first()
    .locator("code")
    .textContent();
  const connectionString = await sender
    .locator(".fallback-grid details")
    .nth(1)
    .locator("pre")
    .textContent();

  assert.ok(shareUrl?.startsWith(`${origin}/receive#`));
  assert.ok(shareUrl.length < 1200);
  assert.match(
    connectionString ?? "",
    /BEGIN EVENT ICEBREAKER PROFILE[\s\S]+END EVENT ICEBREAKER PROFILE/,
  );

  const copyLink = sender.getByRole("button", { name: "Copy link" });
  await copyLink.click();
  await sender
    .getByRole("button", { name: "Copied ✓" })
    .waitFor({ timeout: 2_000 });

  const receiver = await context.newPage();
  watchPage(receiver);
  await receiver.goto(shareUrl, { waitUntil: "networkidle" });

  assert.equal(await receiver.locator("h1").first().textContent(), "Here’s the signal.");
  assert.equal(
    await receiver.locator(".visual-card h2").textContent(),
    "Stefano",
  );
  assert.match(
    (await receiver.locator(".visual-card blockquote").textContent()) ?? "",
    /How ESOPs could end the wealth gap/,
  );
  assert.match(
    (await receiver.locator(".decoded-locally").textContent()) ?? "",
    /nothing was uploaded/i,
  );

  const copyPrompt = receiver.getByRole("button", { name: "Copy AI prompt" });
  await copyPrompt.click();
  await receiver
    .getByRole("button", { name: "Copied ✓" })
    .waitFor({ timeout: 2_000 });

  const invalid = await context.newPage();
  watchPage(invalid);
  await invalid.goto(`${origin}/receive#bad`, { waitUntil: "networkidle" });
  assert.equal(
    await invalid.locator("h1").textContent(),
    "Let’s recover the signal.",
  );
  await invalid.locator("textarea").first().fill(connectionString);
  await invalid.getByRole("button", { name: "Decode profile" }).click();
  await invalid.locator(".visual-card h2").waitFor();
  assert.equal(
    await invalid.locator(".visual-card h2").textContent(),
    "Stefano",
  );

  await mkdir("artifacts", { recursive: true });
  await receiver.screenshot({
    path: "artifacts/receiver-mobile.png",
    fullPage: true,
  });

  assert.deepEqual(issues, []);
  console.log(
    JSON.stringify(
      {
        sender: "passed",
        receiver: "passed",
        invalidLinkRecovery: "passed",
        shareUrlLength: shareUrl.length,
        consoleIssues: issues.length,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
