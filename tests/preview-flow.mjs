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
    // Resource-load failures are reported with URLs by the response listener
    // below — the console text alone can't distinguish known noise.
    if (message.type() === "error" && /Failed to load resource/.test(message.text())) {
      return;
    }
    if (message.type() === "error" || message.type() === "warning") {
      issues.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => issues.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() < 400) return;
    // The committed build preloads vinext fonts by absolute path from the
    // original build machine; those 404s are known noise elsewhere.
    if (/\/\.vinext\/fonts\//.test(response.url())) return;
    issues.push(`http ${response.status()}: ${response.url()}`);
  });
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
  assert.match(
    (await sender.locator(".visual-card__role").first().textContent()) ?? "",
    /Emergency management strategist/i,
  );

  await sender
    .getByRole("button", { name: /Refresh share QR/i })
    .click();
  await sender.locator(".fallback-grid").scrollIntoViewIfNeeded();
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
  assert.ok(shareUrl.length < 1800);
  assert.match(
    connectionString ?? "",
    /BEGIN EVENT ICEBREAKER PROFILE[\s\S]+END EVENT ICEBREAKER PROFILE/,
  );

  const copyLink = sender.getByRole("button", { name: "Copy link" });
  await copyLink.click();
  await sender
    .getByRole("button", { name: "Copied ✓" })
    .waitFor({ timeout: 2_000 });

  const downloadPromise = sender.waitForEvent("download");
  await sender.getByRole("button", { name: "Download card" }).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), "stefano-icebreaker-card.png");

  await sender.getByRole("button", { name: /60-sec demo/i }).click();
  assert.equal(
    await sender.getByRole("dialog").getByRole("heading").textContent(),
    "A private profile, already on his phone.",
  );
  await sender.getByRole("button", { name: "Close demo" }).click();

  // --- Speed setup: the primary door (blueprint item 4) ---
  await sender.getByRole("button", { name: /Start with your AI/i }).click();
  assert.equal(
    await sender.locator(".setup-panel h2").textContent(),
    "Let your AI introduce you.",
  );
  assert.match(
    (await sender.locator(".speed-paste small").textContent()) ?? "",
    /Untrusted input, read locally/,
  );

  // The copy-prompt carries the test-yourself game and the return contract.
  await sender.getByRole("button", { name: "Copy the prompt" }).click();
  const speedPanel = sender
    .locator(".setup-panel")
    .filter({ has: sender.locator(".speed-paste") });
  await speedPanel
    .getByRole("button", { name: "Copied ✓" })
    .waitFor({ timeout: 2_000 });
  const setupPrompt = await sender.evaluate(() => navigator.clipboard.readText());
  assert.match(setupPrompt, /Test yourself/i);
  assert.match(setupPrompt, /NAME: /);
  assert.match(setupPrompt, /ONLY the block/i);

  // Parse-fail floor: a paste that reads as nothing lands somewhere useful.
  await sender
    .locator(".speed-paste textarea")
    .fill("My AI just said: good luck at the hackathon!");
  await sender.getByRole("button", { name: "Read my profile block" }).click();
  await sender.locator(".setup-advisories--error").waitFor();
  assert.match(
    (await sender.locator(".setup-advisories--error").textContent()) ?? "",
    /didn’t read as a profile/,
  );
  await sender
    .getByRole("button", { name: "Use the five-step form instead" })
    .click();
  await sender.locator(".setup-question h3").waitFor();
  assert.equal(
    await sender.locator(".setup-question h3").textContent(),
    "Who are you?",
  );
  await sender.getByRole("button", { name: "Back to setup options" }).click();
  await sender.getByRole("button", { name: /Start with your AI/i }).waitFor();

  // Happy path: paste a drafted block, review the pre-filled wizard, confirm.
  await sender.getByRole("button", { name: /Start with your AI/i }).click();
  await sender.locator(".speed-paste textarea").waitFor();
  await sender.locator(".speed-paste textarea").fill(
    [
      "NAME: Ada Lovelace",
      "ROLE: Analytical engine product engineer",
      "SPARK: Teaching machines to reason",
      "CAN_HELP: Algorithm design — email ada@example.com",
      "LOOKING_FOR: Collaborators on analytical tooling",
      "INTERESTS: Analytical Engines, Combinatorics",
      "LINKEDIN: https://linkedin.com/in/ada",
      "FUN_FACT: Ask me about the first published algorithm.",
    ].join("\n"),
  );
  await sender.getByRole("button", { name: "Read my profile block" }).click();
  await sender.locator(".setup-advisories").waitFor();
  const advisory = (await sender.locator(".setup-advisories").textContent()) ?? "";
  assert.match(advisory, /I can help with/);
  assert.match(advisory, /ada@example\.com/);
  assert.match(advisory, /Ignored keys/);
  assert.match(advisory, /Contact-looking keys were dropped/);
  assert.equal(
    await sender.locator(".setup-fields input").first().inputValue(),
    "Ada Lovelace",
  );
  assert.match(
    (await sender.locator(".save-status").first().textContent()) ?? "",
    /nothing saved yet/i,
  );

  // Consent moment: walking the pre-filled steps is the review; confirming
  // is the only thing that writes — and the guardrail advisory warned but
  // did not block, so the saved draft keeps what the reviewer confirmed
  // while the dropped key never mapped.
  async function confirmVisible() {
    try {
      await sender
        .getByRole("button", { name: "Confirm and save my profile" })
        .waitFor({ timeout: 1_500 });
      return true;
    } catch {
      return false;
    }
  }
  for (let step = 0; step < 7; step += 1) {
    if (await confirmVisible()) break;
    await sender.getByRole("button", { name: "Next question" }).click();
  }
  await sender
    .getByRole("button", { name: "Confirm and save my profile" })
    .click();
  await sender.locator(".setup-question h3").waitFor();
  const stored = await sender.evaluate(() =>
    localStorage.getItem("event-icebreaker.profile.v1"),
  );
  assert.match(stored ?? "", /Ada Lovelace/);
  assert.match(stored ?? "", /example\.com/);
  assert.doesNotMatch(stored ?? "", /linkedin/i);
  await sender
    .locator(".visual-card h2")
    .first()
    .filter({ hasText: "Ada Lovelace" })
    .waitFor();

  await mkdir("artifacts", { recursive: true });
  await sender.screenshot({
    path: "artifacts/sender-mobile.png",
    fullPage: true,
  });

  await sender.getByRole("button", { name: "Next question" }).click();
  assert.equal(
    await sender.locator(".setup-question h3").textContent(),
    "What has your attention?",
  );

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
    /strengthen disaster readiness/,
  );
  assert.match(
    (await receiver.locator(".decoded-locally").textContent()) ?? "",
    /nothing was uploaded/i,
  );
  assert.equal(await receiver.locator(".starter-grid li").count(), 3);
  assert.match(
    (await receiver.locator(".starter-grid").textContent()) ?? "",
    /emergency planning/i,
  );

  const copyPrompt = receiver.getByRole("button", { name: "Copy AI prompt" });
  await copyPrompt.click();
  await receiver
    .getByRole("button", { name: "Copied ✓" })
    .waitFor({ timeout: 2_000 });
  const copiedPrompt = await receiver.evaluate(() =>
    navigator.clipboard.readText(),
  );
  assert.match(copiedPrompt, /## Quick read/);
  assert.match(copiedPrompt, /## Ask Stefano/);
  assert.match(copiedPrompt, /## Best first move/);
  assert.match(copiedPrompt, /untrusted profile data/i);
  assert.match(copiedPrompt, /five brief questions, one at a time/i);

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

  await receiver.screenshot({
    path: "artifacts/receiver-mobile.png",
    fullPage: true,
  });

  assert.deepEqual(issues, []);
  console.log(
    JSON.stringify(
      {
        sender: "passed",
        speedSetup: "passed",
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
