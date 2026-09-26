/**
 * Playwright flow for the two-way match dossier (blueprint art_gdKW4J5q,
 * "Flow and states"). Self-contained: builds the app with a sidecar URL
 * inlined, starts the production server on a scratch port, and drives every
 * dossier state in a phone-sized browser:
 *
 *   1. no-profile receiver  → setup doors + consent-gated wizard → local estimate
 *   2. sidecar dossier      → full confident read, ladder slot reserved
 *   3. escalated dossier    → honest uncertainty, handoff to the AI prompt
 *   4. sidecar down         → clearly marked local estimate, no ladder
 *   5. sidecar slow         → loading card while the request is in flight
 *
 * Run: npx node@22 tests/dossier-flow.mjs   (after `npm test` or standalone)
 */
import assert from "node:assert/strict";
import { execSync, spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const PORT = 3320 + (process.pid % 200);
const origin = `http://127.0.0.1:${PORT}`;
// Unreachable by design — route mocks intercept it; where they do not (the
// consent flow), the connection is refused and the app must degrade to the
// local estimate. Unassigned high port: refused uniformly across browsers.
const SIDECAR_BASE = "http://127.0.0.1:59999";

// The receiver the seeded contexts carry in localStorage.
const RECEIVER_PROFILE = {
  name: "Maya Chen",
  role: "Robotics engineer",
  interests: ["emergency planning", "hardware", "climbing"],
  spark: "Built a warehouse robot that folds tarps",
  sparkDetails: "It took three motors and far too much patience.",
  canHelp: "Rapid hardware prototyping",
  lookingFor: "Manufacturing partners for a consumer pilot",
  values: ["diligence", "curiosity"],
  communicationStyle: "Direct, warm, and curious",
  funFact: "Once test-piloted a friend's cargo bike uphill",
  personality: [0.6, 0.4, 0.7, 0.5, 0.5],
};

// Valid per laya-client's strict contract (requireKeys everywhere).
const SIDECAR_READY = {
  shape: { kind: "peer", confidence: 0.82 },
  dimensions: [
    {
      id: "goal-fit",
      label: "Goal fit",
      verdict: "Both want a consumer pilot in the market within two quarters.",
      confidence: 0.78,
      evidence: [
        "looking for manufacturing partners for a consumer pilot",
        "hoping to ship a consumer pilot by Q1",
      ],
    },
    {
      id: "complementarity",
      label: "Complementary skills",
      verdict: "One builds hardware, the other sells it.",
      confidence: 0.71,
      evidence: [
        "rapid hardware prototyping",
        "turning pilots into paying customers",
      ],
    },
  ],
  bridge: {
    interest: "community resilience",
    why: "Both profiles name resilience work as a current focus.",
  },
  curiosityGap: {
    interest: "desert ultramarathons",
    why: "The farthest thing from anything in your own profile.",
  },
  score: {
    value: 74,
    band: "some",
    byShape: "As peers, goal fit and shared skills land above chance.",
  },
  bestFirstMove:
    "Ask how the community-resilience pilot is going — you both named one.",
  ladder: [
    {
      level: 1,
      question: "What pulled you into community resilience work?",
      why: "Shared interest",
    },
    {
      level: 2,
      question: "What would make the next six months a win for you?",
      why: "Goal fit",
    },
    {
      level: 3,
      question: "What is the strangest thing you have ever prototyped?",
      why: "Curiosity gap",
    },
  ],
  escalated: false,
};

// Same contract, but the model could not call enough of it — the honest
// escalation state.
const SIDECAR_ESCALATED = {
  ...SIDECAR_READY,
  shape: { kind: "unclear", confidence: 0.4 },
  dimensions: [
    {
      id: "goal-fit",
      label: "Goal fit",
      verdict: "Goals are plausible but the profiles give too little signal.",
      confidence: 0.42,
      evidence: ["consumer pilot", "some kind of launch"],
    },
  ],
  score: {
    value: 41,
    band: "low",
    byShape: "Too little signal to score this pairing responsibly.",
  },
  bestFirstMove:
    "Ask what each of you is actually building right now — the cards are thin.",
  ladder: [],
  escalated: true,
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
// detached + process-group kill: vinext start outlives a plain SIGTERM, and
// a zombie server on the port serves stale asset hashes (its startup
// manifest no longer matches dist), which silently breaks hydration.
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
// Two known-noise signatures this flow deliberately induces or inherits, so
// the console gate still catches real problems from the dossier work:
//
// 1. Font 404s — pre-existing production-build defect on main (outside this
//    PR): vinext's Geist font pipeline rewrites @font-face URLs to the
//    authoring machine's absolute `.vinext/fonts` path, so every production
//    page 404s the woff2 files and text falls back to system fonts.
// 2. Network-layer failures of the deliberately dead sidecar URL — the
//    browser logs the failed fetch the degradation contract expects; the
//    app's silent degrade is verified by the rendered local estimate.
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

  // ---------- 0. Mint a sender payload through the real UI ----------
  const clean = await browser.newContext({ viewport });
  const senderPage = await clean.newPage();
  watchPage(senderPage);
  await senderPage.goto(`${origin}/`, { waitUntil: "networkidle" });
  await senderPage.getByRole("button", { name: /Refresh share QR/i }).click();
  await senderPage
    .locator(".fallback-grid details")
    .first()
    .locator("summary")
    .click();
  const shareUrl = await senderPage
    .locator(".fallback-grid details")
    .first()
    .locator("code")
    .textContent();
  const payload = shareUrl.split("#")[1];
  assert.ok(payload, "sender page must produce a share payload");
  await clean.close();
  const receiveUrl = `${origin}/receive#${payload}`;

  // ---------- 1. No profile: doors, wizard consent, local estimate ----------
  const doorsContext = await browser.newContext({
    viewport,
  });
  await doorsContext.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin,
  });
  const doorsPage = await doorsContext.newPage();
  watchPage(doorsPage);
  await doorsPage.goto(receiveUrl, { waitUntil: "domcontentloaded" });
  await doorsPage.locator(".visual-card h2").waitFor();
  assert.equal(
    await doorsPage.locator(".visual-card h2").textContent(),
    "Stefano",
  );
  assert.equal(await doorsPage.locator(".setup-doors").count(), 1);
  assert.equal(
    await doorsPage.locator("[data-speed-setup-slot=reserved]").count(),
    1,
  );
  assert.equal(
    await doorsPage
      .getByRole("button", { name: /Speed setup — opening soon/i })
      .isDisabled(),
    true,
  );
  await doorsPage.screenshot({
    path: "artifacts/dossier-doors.png",
    fullPage: true,
  });

  // The wizard works now — and nothing is stored before consent.
  await doorsPage.getByRole("button", { name: "Open the wizard" }).click();
  await doorsPage.locator(".setup-panel").waitFor();
  assert.equal(
    await doorsPage.evaluate(() =>
      localStorage.getItem("event-icebreaker.profile.v1"),
    ),
    null,
  );
  await doorsPage.getByLabel("Name").fill("Maya Chen");
  for (let step = 0; step < 4; step += 1) {
    await doorsPage.getByRole("button", { name: "Next question" }).click();
  }
  await doorsPage.getByRole("button", { name: "Show my match read" }).click();

  const consentCard = doorsPage.locator(".match-read-card");
  await consentCard.waitFor();
  // The dossier request resolves asynchronously — wait for the terminal state
  // (loading card → local estimate when the sidecar is unreachable).
  await consentCard.getByText(/Local estimate/i).first().waitFor();
  const storedProfile = await doorsPage.evaluate(() =>
    localStorage.getItem("event-icebreaker.profile.v1"),
  );
  assert.ok(storedProfile, "finishing the wizard stores the profile");
  assert.match(JSON.parse(storedProfile).name, /Maya/);
  assert.match(await consentCard.textContent(), /Local estimate/i);
  await doorsContext.close();
  results.consentFlow = "passed";

  // ---------- 2–5. Seeded receiver across the four dossier states ----------
  const seeded = await browser.newContext({ viewport });
  await seeded.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin,
  });
  await seeded.addInitScript((profile) => {
    window.localStorage.setItem(
      "event-icebreaker.profile.v1",
      JSON.stringify(profile),
    );
  }, RECEIVER_PROFILE);

  // 2. Confident sidecar dossier.
  const readyPage = await seeded.newPage();
  watchPage(readyPage);
  await readyPage.route("**/v1/match/deep", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(SIDECAR_READY),
    }),
  );
  await readyPage.goto(receiveUrl, { waitUntil: "domcontentloaded" });
  const readyCard = readyPage.locator(".match-read-card");
  await readyCard.waitFor();
  await readyCard.getByText(/Stateless model read/i).first().waitFor();
  const readyText = await readyCard.textContent();
  assert.match(readyText, /Stateless model read/i);
  assert.match(readyText, /Reads like two peers/i);
  assert.match(readyText, /Some common ground/);
  assert.match(readyText, /Ask how the community-resilience pilot is going/);
  assert.match(readyText, /looking for manufacturing partners/);
  assert.match(readyText, /community resilience/);
  // Band plus reasons — never the raw number (locked spec decision).
  assert.doesNotMatch(readyText, /\b74\b/);
  assert.equal(
    await readyCard.locator("[data-ladder-slot=reserved]").count(),
    1,
  );
  assert.match(
    await readyPage.locator(".match-read-card__footnote").textContent(),
    /stateless model/i,
  );
  await readyPage.screenshot({
    path: "artifacts/dossier-ready.png",
    fullPage: true,
  });
  results.sidecarDossier = "passed";

  // 3. Escalated sidecar dossier — honest uncertainty, AI-prompt handoff.
  const escalatedPage = await seeded.newPage();
  watchPage(escalatedPage);
  await escalatedPage.route("**/v1/match/deep", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(SIDECAR_ESCALATED),
    }),
  );
  await escalatedPage.goto(receiveUrl, { waitUntil: "domcontentloaded" });
  const escalatedCard = escalatedPage.locator(".match-read-card");
  await escalatedCard.waitFor();
  await escalatedCard.getByText(/Want a sharper read\?/i).first().waitFor();
  assert.match(
    await escalatedCard.locator("h3").first().textContent(),
    /Want a sharper read\?/i,
  );
  assert.equal(
    await escalatedCard.locator("[data-ladder-slot=reserved]").count(),
    0,
  );
  await escalatedCard.getByRole("button", { name: "Copy AI prompt" }).click();
  await escalatedCard
    .getByRole("button", { name: "Copied ✓" })
    .waitFor({ timeout: 2_000 });
  const copiedPrompt = await escalatedPage.evaluate(() =>
    navigator.clipboard.readText(),
  );
  assert.match(copiedPrompt, /untrusted profile data/i);
  await escalatedPage.screenshot({
    path: "artifacts/dossier-escalated.png",
    fullPage: true,
  });
  results.escalatedDossier = "passed";

  // 4. Sidecar down — fetch rejection degrades to the local estimate.
  const downPage = await seeded.newPage();
  watchPage(downPage);
  await downPage.route("**/v1/match/deep", (route) => route.abort());
  await downPage.goto(receiveUrl, { waitUntil: "domcontentloaded" });
  const downCard = downPage.locator(".match-read-card");
  await downCard.waitFor();
  await downCard.getByText(/Local estimate/i).first().waitFor();
  const downText = await downCard.textContent();
  assert.match(downText, /Local estimate/i);
  assert.match(downText, /unreachable/i);
  // The estimator's reasoning lines render — this pairing produces the
  // offer↔search dimension with evidence quoted from both profiles.
  assert.match(downText, /Offer ↔ search fit/);
  assert.match(downText, /No clear offer-to-search overlap/);
  assert.match(downText, /They can help with: Emergency planning/);
  assert.equal(
    await downCard.locator("[data-ladder-slot=reserved]").count(),
    0,
  );
  assert.equal(
    await downCard.locator(".match-read-card__escalation").count(),
    0,
  );
  await downPage.screenshot({
    path: "artifacts/dossier-local.png",
    fullPage: true,
  });
  results.degradedDossier = "passed";

  // 5. Sidecar slow — the loading card holds while the request is pending.
  const loadingPage = await seeded.newPage();
  watchPage(loadingPage);
  await loadingPage.route("**/v1/match/deep", () => {
    // Never fulfill — the request stays pending.
  });
  await loadingPage.goto(receiveUrl, { waitUntil: "domcontentloaded" });
  await loadingPage.locator(".match-read-card--loading").waitFor();
  assert.match(
    await loadingPage.locator(".match-read-card").textContent(),
    /Reading the two profiles/i,
  );
  await loadingPage.screenshot({
    path: "artifacts/dossier-loading.png",
  });
  results.loadingState = "passed";

  await seeded.close();

  assert.deepEqual(issues, []);
  console.log(
    JSON.stringify(
      {
        ...results,
        consoleIssues: issues.length,
        preExistingFont404s: font404s.length,
        inducedSidecarNetworkErrors: sidecarNetworkErrors.length,
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
