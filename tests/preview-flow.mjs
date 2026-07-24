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

  const deepBuilder = await context.newPage();
  watchPage(deepBuilder);
  await deepBuilder.goto(`${origin}/deep/setup`, { waitUntil: "networkidle" });
  assert.equal(
    await deepBuilder.locator("h1").first().textContent(),
    "Build your Connection Story.",
  );
  const overviewStory = deepBuilder
    .locator(".deep-section-list details")
    .first()
    .locator("textarea")
    .first();
  await overviewStory.fill(
    "I connect emergency management, trustworthy AI, and practical collaboration.",
  );
  await deepBuilder.getByText("Saved on this device").first().waitFor();
  assert.match(
    (await deepBuilder.locator(".personal-wiki").textContent()) ?? "",
    /trustworthy AI/i,
  );

  await sender.goto(`${origin}/`, { waitUntil: "networkidle" });
  await sender.getByRole("heading", {
    name: "Choose what this QR can unlock.",
  }).waitFor();
  await sender.getByRole("button", { name: /Private Deep/i }).click();
  await sender
    .getByRole("button", { name: /Refresh share QR/i })
    .click();
  await sender
    .locator(".payload-meter")
    .filter({ hasText: "Private Deep ready" })
    .waitFor({ timeout: 10_000 });

  const privateShareUrl = await sender
    .locator(".fallback-grid details")
    .first()
    .locator("code")
    .textContent();
  assert.ok(privateShareUrl?.startsWith(`${origin}/c/`));
  assert.match(privateShareUrl ?? "", /#v=2&/);
  assert.match(privateShareUrl ?? "", /&m=p&k=/);
  assert.equal(
    (privateShareUrl ?? "").includes("trustworthy"),
    false,
  );

  const privateReceiver = await context.newPage();
  watchPage(privateReceiver);
  await privateReceiver.goto(privateShareUrl, { waitUntil: "networkidle" });
  await privateReceiver
    .locator(".personal-wiki")
    .filter({ hasText: "trustworthy AI" })
    .waitFor({ timeout: 10_000 });
  assert.match(
    (await privateReceiver.locator(".deep-receiver-status").textContent()) ??
      "",
    /Decrypted privately on this device/i,
  );
  await privateReceiver
    .getByRole("button", { name: "Copy approved context for AI" })
    .click();
  const deepPrompt = await privateReceiver.evaluate(() =>
    navigator.clipboard.readText(),
  );
  assert.match(deepPrompt, /<deep_profile protocol="2">/);
  assert.match(deepPrompt, /untrusted profile data/i);
  assert.match(deepPrompt, /Do not infer sensitive traits/i);

  await privateReceiver.getByPlaceholder("Mary").fill("Mary");
  await privateReceiver
    .getByPlaceholder(/problem, project, or question/i)
    .fill("Reliable AI support workflows");
  await privateReceiver
    .getByPlaceholder(/Experience, access, skills/i)
    .fill("Agent evaluation and production integrations");
  await privateReceiver
    .getByPlaceholder(/People, knowledge, feedback/i)
    .fill("High-stakes public-interest use cases");
  await privateReceiver
    .getByText(/Current focus: Reliable AI support workflows/i)
    .waitFor();
  const mutualConfirm = privateReceiver.locator(".mutual-confirm input");
  await mutualConfirm.check();
  await privateReceiver
    .getByRole("button", { name: "Find our connection" })
    .click();
  await privateReceiver
    .getByText("YOUR CONNECTION BRIEF")
    .waitFor();
  assert.match(
    (await privateReceiver.locator(".connection-brief").textContent()) ?? "",
    /Agent evaluation/i,
  );
  assert.equal(
    await privateReceiver.evaluate(() =>
      Object.keys(localStorage).some((key) => key.includes("mutual")),
    ),
    false,
  );

  await sender.getByRole("button", { name: /AI-readable/i }).click();
  await sender
    .getByText(/I understand that anyone or any AI/i)
    .locator("..")
    .locator("input")
    .check();
  await sender
    .getByRole("button", { name: /Refresh share QR/i })
    .click();
  await sender
    .locator(".payload-meter")
    .filter({ hasText: "AI-readable Deep ready" })
    .waitFor({ timeout: 10_000 });
  const agentShareUrl = await sender
    .locator(".fallback-grid details")
    .first()
    .locator("code")
    .textContent();
  assert.ok(agentShareUrl?.startsWith(`${origin}/c/`));
  assert.match(agentShareUrl ?? "", /&m=a/);
  assert.equal((agentShareUrl ?? "").includes("&k="), false);

  const agentReceiver = await context.newPage();
  watchPage(agentReceiver);
  await agentReceiver.goto(agentShareUrl, { waitUntil: "networkidle" });
  await agentReceiver
    .locator(".deep-receiver-status")
    .filter({ hasText: "Readable temporary profile loaded" })
    .waitFor({ timeout: 10_000 });
  assert.match(
    (await agentReceiver.locator(".deep-receiver-notice").textContent()) ?? "",
    /privacy exception/i,
  );
  const agentTextUrl = await agentReceiver
    .getByRole("link", { name: "Open AI-readable text" })
    .getAttribute("href");
  const agentText = await (
    await context.request.get(`${origin}${agentTextUrl}`)
  ).text();
  assert.match(agentText, /untrusted profile data/i);
  assert.match(agentText, /trustworthy AI/i);

  const agentToken = new URL(agentShareUrl).pathname.split("/").pop();
  await sender.getByRole("button", { name: "Revoke Deep access" }).click();
  await sender
    .locator(".payload-meter")
    .filter({ hasText: "Deep access revoked" })
    .waitFor({ timeout: 10_000 });
  assert.equal(
    (
      await context.request.get(
        `${origin}/api/agent-profiles/${agentToken}`,
      )
    ).status(),
    410,
  );
  const revokedReceiver = await context.newPage();
  watchPage(revokedReceiver);
  await revokedReceiver.goto(agentShareUrl, {
    waitUntil: "domcontentloaded",
  });
  assert.equal(
    await revokedReceiver.locator(".visual-card h2").textContent(),
    "Stefano",
  );
  await revokedReceiver
    .locator(".deep-fallback-message")
    .filter({ hasText: /expired or was revoked/i })
    .waitFor({ timeout: 10_000 });

  await privateReceiver.screenshot({
    path: "artifacts/deep-connect-mobile.png",
    fullPage: true,
  });

  const unexpectedIssues = issues.filter(
    (issue) => !issue.includes("status of 410 (Gone)"),
  );
  assert.deepEqual(unexpectedIssues, []);
  console.log(
    JSON.stringify(
      {
        sender: "passed",
        receiver: "passed",
        invalidLinkRecovery: "passed",
        privateDeep: "passed",
        mutualConnect: "passed",
        agentReadable: "passed",
        shareUrlLength: shareUrl.length,
        consoleIssues: unexpectedIssues.length,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
