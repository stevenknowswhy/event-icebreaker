/**
 * Playwright flow for save-time guardrails (blueprint art_gdKW4J5q, item 5).
 * Self-contained like dossier-flow.mjs: builds the app with an unreachable
 * sidecar URL inlined, starts the production server on a scratch port, and
 * drives the advisory banner through a phone-sized browser:
 *
 *   1. sender wizard, sidecar unreachable → no banner, save never blocks
 *   2. sender wizard, sidecar flags       → contact banner on the field,
 *                                            resolves when the text is fixed,
 *                                            tone banner for professional-room
 *   3. receiver wizard, flag then finish  → advisory renders, save proceeds
 *
 * The guardrails endpoint is mocked per page (a tiny stand-in for the real
 * /v1/profile-guardrails contract), so the flow never needs the sidecar.
 *
 * Run: npx node@22 tests/guardrails-flow.mjs
 */
import assert from "node:assert/strict";
import { execSync, spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const PORT = 3520 + (process.pid % 200);
const origin = `http://127.0.0.1:${PORT}`;
// Unreachable by design (unassigned high port): where the flow does not mock
// the guardrails endpoint, the connection is refused and the app must skip
// the check silently — the degradation contract.
const SIDECAR_BASE = "http://127.0.0.1:59999";

/**
 * Mini mock of POST /v1/profile-guardrails: answers for exactly the requested
 * fields — contact flagged on anything that looks like an email or URL, tone
 * flagged on a phrase that reads wrong in a professional room.
 */
const guardrailsMock = (route) => {
  const body = route.request().postDataJSON();
  const results = {};
  for (const [field, text] of Object.entries(body?.fields ?? {})) {
    results[field] = {
      contact: /@|https?:\/\//i.test(String(text)),
      tone: /adrenaline junkie/i.test(String(text)),
    };
  }
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ results }),
  });
};

async function resolveNode22() {
  return execSync("npx --yes node@22 -p process.execPath").toString().trim();
}

async function waitForServer(url, timeoutMs = 90_000) {
  const started = Date.now();
  let lastError = "";
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`preview server did not start: ${lastError}`);
}

const node22 = await resolveNode22();
console.log(`building with ${SIDECAR_BASE} inlined as the sidecar URL…`);
execSync(`${node22} node_modules/vinext/dist/cli.js build`, {
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_PUBLIC_LAYA_URL: SIDECAR_BASE,
    WRANGLER_LOG_PATH: ".wrangler/wrangler.log",
  },
});

console.log("starting production server…");
// detached + process-group kill: same reason as dossier-flow.mjs — a zombie
// server on the port serves stale asset hashes and silently breaks hydration.
const server = spawn(
  node22,
  [
    "node_modules/vinext/dist/cli.js",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(PORT),
  ],
  { stdio: "pipe", detached: true },
);
server.on("error", (error) => {
  throw new Error(`preview server failed to start: ${error.message}`);
});
let serverLog = "";
server.stdout?.on("data", (chunk) => {
  serverLog += chunk;
});
server.stderr?.on("data", (chunk) => {
  serverLog += chunk;
});

const browser = await chromium.launch({ headless: true });
const issues = [];
const results = {};
// Known-noise signatures, same rationale as dossier-flow.mjs: font 404s are a
// pre-existing main defect (since fixed by #4, kept for safety) and the
// induced dead-sidecar network errors are the degradation contract working.
const font404s = [];
const sidecarNetworkErrors = [];
const watchPage = (page) => {
  page.on("console", (message) => {
    if (message.type() !== "error" && message.type() !== "warning") return;
    const text = message.text();
    if (/status of 404/.test(text)) {
      font404s.push(text);
      return;
    }
    if (/Failed to load resource: net::ERR_/.test(text)) {
      sidecarNetworkErrors.push(text);
      return;
    }
    issues.push(`${message.type()}: ${text}`);
  });
  page.on("pageerror", (error) => issues.push(`pageerror: ${error.message}`));
};

try {
  await waitForServer(`${origin}/receive`);
  await mkdir("artifacts", { recursive: true });
  const viewport = { width: 390, height: 844 };

  // Mint a receiver payload through the real UI (for scenario 3).
  const clean = await browser.newContext({ viewport });
  const senderMint = await clean.newPage();
  watchPage(senderMint);
  await senderMint.goto(`${origin}/`, { waitUntil: "networkidle" });
  await senderMint.getByRole("button", { name: /Refresh share QR/i }).click();
  await senderMint
    .locator(".fallback-grid details")
    .first()
    .locator("summary")
    .click();
  const shareUrl = await senderMint
    .locator(".fallback-grid details")
    .first()
    .locator("code")
    .textContent();
  const payload = shareUrl.split("#")[1];
  assert.ok(payload, "sender page must produce a share payload");
  await clean.close();
  const receiveUrl = `${origin}/receive#${payload}`;

  const openSenderWizard = async (page) => {
    await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
    // The setup doors render directly on the sender page — take the form door.
    await page
      .getByRole("button", { name: "Use the five-step form" })
      .first()
      .click();
    await page.locator(".setup-panel").waitFor();
  };

  // ---------- 1. Sender wizard with the sidecar unreachable ----------
  const offlineContext = await browser.newContext({ viewport });
  const offlinePage = await offlineContext.newPage();
  watchPage(offlinePage);
  await openSenderWizard(offlinePage);
  await offlinePage.getByLabel("Name").fill("Ping me at maya@bridge.dev");
  // Wait past the debounce and the failed fetch — the check must skip
  // silently: no banner on the flagged field, no crash, and the save stays
  // available on the final step.
  await new Promise((resolve) => setTimeout(resolve, 2_500));
  assert.equal(await offlinePage.locator(".field-advisory").count(), 0);
  for (let step = 0; step < 4; step += 1) {
    await offlinePage.getByRole("button", { name: "Next question" }).click();
  }
  assert.equal(
    await offlinePage
      .getByRole("button", { name: "Refresh my share card" })
      .isEnabled(),
    true,
  );
  await offlinePage.screenshot({
    path: "artifacts/guardrails-unreachable.png",
    fullPage: true,
  });
  await offlineContext.close();
  results.offlineSkip = "passed";

  // ---------- 2. Sender wizard with the sidecar flagging ----------
  const flaggedContext = await browser.newContext({ viewport });
  const flaggedPage = await flaggedContext.newPage();
  watchPage(flaggedPage);
  await flaggedPage.route("**/v1/profile-guardrails", guardrailsMock);
  await openSenderWizard(flaggedPage);
  await flaggedPage.getByLabel("Name").fill("Maya Chen");
  await flaggedPage.getByLabel("Role or one-line identity").fill("Roboticist");
  await flaggedPage.getByRole("button", { name: "Next question" }).click();
  await flaggedPage.getByRole("button", { name: "Next question" }).click();
  await flaggedPage.getByLabel("I can help with").fill("Reach me at maya@bridge.dev");
  const contactBanner = flaggedPage
    .locator(".field-advisory")
    .filter({ hasText: /contact details/i });
  await contactBanner.waitFor({ timeout: 8_000 });
  assert.equal(await contactBanner.count(), 1);
  await flaggedPage.screenshot({
    path: "artifacts/guardrails-contact-flag.png",
    fullPage: true,
  });

  // Fixing the text clears the banner on its own — no submit, no reload.
  await flaggedPage
    .getByLabel("I can help with")
    .fill("Rapid hardware prototyping");
  await contactBanner.waitFor({ state: "hidden", timeout: 8_000 });
  assert.equal(await flaggedPage.locator(".field-advisory").count(), 0);

  // The tone judgment renders its own banner on the same field.
  await flaggedPage
    .getByLabel("I can help with")
    .fill("Certified adrenaline junkie");
  await flaggedPage
    .locator(".field-advisory")
    .filter({ hasText: /professional room/i })
    .waitFor({ timeout: 8_000 });
  // Advisory, never blocking: the finish button on the final step stays live
  // with a live flag on the draft.
  for (let step = 0; step < 2; step += 1) {
    await flaggedPage.getByRole("button", { name: "Next question" }).click();
  }
  assert.equal(
    await flaggedPage
      .getByRole("button", { name: "Refresh my share card" })
      .isEnabled(),
    true,
  );
  await flaggedContext.close();
  results.senderAdvisories = "passed";

  // ---------- 3. Receiver wizard: flag renders, save proceeds ----------
  const receiverContext = await browser.newContext({ viewport });
  const receiverPage = await receiverContext.newPage();
  watchPage(receiverPage);
  await receiverPage.route("**/v1/profile-guardrails", guardrailsMock);
  await receiverPage.goto(receiveUrl, { waitUntil: "domcontentloaded" });
  await receiverPage.locator(".visual-card h2").waitFor();
  await receiverPage.getByRole("button", { name: "Open the wizard" }).click();
  await receiverPage.locator(".setup-panel").waitFor();
  await receiverPage.getByLabel("Name").fill("Maya Chen");
  await receiverPage.getByRole("button", { name: "Next question" }).click();
  await receiverPage.getByRole("button", { name: "Next question" }).click();
  await receiverPage
    .getByLabel("I can help with")
    .fill("Reach me at maya@bridge.dev");
  await receiverPage
    .locator(".field-advisory")
    .filter({ hasText: /contact details/i })
    .waitFor({ timeout: 8_000 });
  await receiverPage.screenshot({
    path: "artifacts/guardrails-receiver-flag.png",
    fullPage: true,
  });
  // The flag never blocks: finish through to the saved profile + match read.
  await receiverPage.getByRole("button", { name: "Next question" }).click();
  await receiverPage.getByRole("button", { name: "Next question" }).click();
  await receiverPage.getByRole("button", { name: "Show my match read" }).click();
  const consentCard = receiverPage.locator(".match-read-card");
  await consentCard.waitFor();
  await consentCard.getByText(/Local estimate/i).first().waitFor();
  const storedProfile = await receiverPage.evaluate(() =>
    localStorage.getItem("event-icebreaker.profile.v1"),
  );
  assert.ok(storedProfile, "finishing the wizard stores the profile");
  assert.match(JSON.parse(storedProfile).name, /Maya/);
  await receiverContext.close();
  results.receiverSaveProceeds = "passed";

  assert.deepEqual(issues, []);
  console.log(
    JSON.stringify(
      {
        ...results,
        consoleIssues: issues.length,
        inducedSidecarNetworkErrors: sidecarNetworkErrors.length,
        preExistingFont404s: font404s.length,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  try {
    process.kill(-server.pid, "SIGKILL");
  } catch {
    server.kill("SIGKILL");
  }
  if (issues.length > 0) {
    console.error(`console issues:\n${serverLog}\n${issues.join("\n")}`);
  }
}
