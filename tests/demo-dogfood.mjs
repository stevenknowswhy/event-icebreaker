/**
 * Demo dogfood flow — the full two-way path against the REAL Laya sidecar
 * (blueprint art_gdKW4J5q, "Demo readiness" verification row). Unlike
 * dossier-flow.mjs / guardrails-flow.mjs, which mock the sidecar per route,
 * this script wants the real service running:
 *
 *   # terminal 1 — per laya-sidecar/README.md
 *   cd laya-sidecar && source .venv/bin/activate
 *   LAYA_ALLOWED_ORIGINS=http://127.0.0.1:3390,http://localhost:3390 \
 *     HF_HUB_OFFLINE=1 uvicorn app.main:app --host 127.0.0.1 --port 8080
 *   # terminal 2
 *   npx node@22 tests/demo-dogfood.mjs
 *
 * Beats driven at 390 px (the demo run-of-show, docs/demo-beats.md):
 *   1. sender speed setup — copy prompt, paste a KEY: value block, parser
 *      advisories + real /v1/profile-guardrails verdicts, consent-gated save
 *   2. sender share — QR, share URL, Connection String, PNG card download
 *   3. receiver no-profile doors — speed door teaser (reserved), wizard
 *      fallback keeps the sender card visible
 *   4. receiver wizard → consent → real dossier request (loading card,
 *      then confident + ladder OR escalated + AI-prompt handoff)
 *   5. --down-only: with the sidecar stopped, the real refused connection
 *      degrades to the marked local estimate
 *
 * Latency and guardrail verdicts from the real sidecar are printed as
 * measurements — the evidence behind docs/demo-beats.md's host-reachability
 * note. Run: npx node@22 tests/demo-dogfood.mjs [--down-only]
 */
import assert from "node:assert/strict";
import { execSync, spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const downOnly = process.argv.includes("--down-only");
const PORT = Number(process.env.DEMO_APP_PORT || 3390);
const origin = `http://127.0.0.1:${PORT}`;
const SIDECAR_BASE = (
  process.env.DEMO_SIDECAR_URL || "http://127.0.0.1:8080"
).replace(/\/+$/, "");
const WARM_START_FILE = process.env.DEMO_WARM_START_FILE || "/tmp/laya-warmstart.txt";

// The receiver the demo pairs against the sender — overlap on interests and
// goals so the real model gets its best shot at a confident peer read.
const RECEIVER_PROFILE = {
  name: "Maya Chen",
  role: "Mathematics prototyping engineer",
  interests: ["Analytical Engines", "Combinatorics", "mechanical computation"],
  spark: "Built a mechanical reasoning toy for classrooms",
  sparkDetails: "It took three gears and far too much patience.",
  canHelp: "Algorithm prototyping and teaching tools",
  lookingFor: "Collaborators on analytical tooling for education",
  values: ["diligence", "curiosity"],
  communicationStyle: "Direct, warm, and curious",
  funFact: "Once computed Bernoulli numbers by hand for fun",
  personality: [0.6, 0.4, 0.7, 0.5, 0.5],
};

const BAND_LABELS = {
  strong: "Strong overlap",
  some: "Some common ground",
  low: "Little shared signal",
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

/** Sidecar health gate — the dogfood is only meaningful against a warm sidecar. */
async function requireSidecarHealthy() {
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    try {
      const response = await fetch(`${SIDECAR_BASE}/health`);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  console.error(
    `sidecar at ${SIDECAR_BASE} is not healthy — start it first per ` +
      `laya-sidecar/README.md (uvicorn app.main:app --port 8080), then rerun.`,
  );
  process.exit(2);
}

const node22 = await resolveNode22();

if (process.env.SKIP_BUILD !== "1") {
  console.log(`building with ${SIDECAR_BASE} inlined as the sidecar URL…`);
  execSync(`${node22} node_modules/vinext/dist/cli.js build`, {
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_PUBLIC_LAYA_URL: SIDECAR_BASE,
      WRANGLER_LOG_PATH: ".wrangler/wrangler.log",
    },
  });
}

console.log("starting production server…");
// detached + process-group kill: same zombie-port hygiene as dossier-flow.mjs.
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
// Known production-build noise (same signatures as the other flows): font
// 404s, and — only in the --down-only phase — the refused sidecar connection
// that the degradation contract expects.
const font404s = [];
const networkErrors = [];
// Known live defect (findings report, HIGH): the app's guardrails client posts
// per-field maps the real sidecar rejects with 422 — every real request fails
// and the app silently skips. Recorded as evidence, not a script failure.
const guardrails422s = [];
const watchPage = (page) => {
  page.on("console", (message) => {
    if (message.type() !== "error" && message.type() !== "warning") return;
    const text = message.text();
    if (/status of 404/.test(text)) {
      font404s.push(text);
      return;
    }
    if (/status of 422/.test(text)) {
      guardrails422s.push(text);
      return;
    }
    if (/Failed to load resource: net::ERR_/.test(text)) {
      networkErrors.push(text);
      return;
    }
    issues.push(`${message.type()}: ${text}`);
  });
  page.on("pageerror", (error) => issues.push(`pageerror: ${error.message}`));
};

const measurements = {
  dossierLatenciesMs: [],
  firstDossierLatencyMs: null,
  dossierResponses: 0,
  guardrails: [],
  warmStartSeconds: null,
};
try {
  measurements.warmStartSeconds = Number(
    readFileSync(WARM_START_FILE, "utf8").match(/WARM_START_SECONDS=([\d.]+)/)?.[1],
  ) || null;
} catch {
  // no warm-start file — the runner records it separately
}

try {
  await waitForServer(`${origin}/receive`);
  await mkdir("artifacts", { recursive: true });
  const viewport = { width: 390, height: 844 };

  if (!downOnly) {
    await requireSidecarHealthy();

    // Track real sidecar traffic: dossier latencies + guardrail verdicts.
    const instrument = (page) => {
      page.on("request", (request) => {
        if (request.url().includes("/v1/match/deep")) {
          request.__t0 = Date.now();
        }
      });
      page.on("requestfinished", async (request) => {
        const url = request.url();
        if (url.includes("/v1/match/deep") && request.__t0) {
          const ms = Date.now() - request.__t0;
          if (measurements.firstDossierLatencyMs === null) {
            measurements.firstDossierLatencyMs = ms;
          }
          measurements.dossierLatenciesMs.push(ms);
          measurements.dossierResponses += 1;
        }
        if (url.includes("/v1/profile-guardrails")) {
          try {
            const response = await request.response();
            const body = await response.json();
            measurements.guardrails.push({
              status: response.status(),
              flagged: Object.entries(body?.results ?? {})
                .filter(([, v]) => v && (v.contact || v.tone))
                .map(([field, v]) => `${field}:${v.contact ? "contact" : ""}${v.tone ? "tone" : ""}`),
            });
          } catch {
            measurements.guardrails.push({ status: "unreadable" });
          }
        }
      });
    };

    // ---------- 1. Sender: speed setup with the real parser + guardrails ----
    const senderContext = await browser.newContext({ viewport });
    await senderContext.grantPermissions(
      ["clipboard-read", "clipboard-write"],
      { origin },
    );
    const sender = await senderContext.newPage();
    watchPage(sender);
    instrument(sender);
    await sender.goto(`${origin}/`, { waitUntil: "networkidle" });
    assert.equal(await sender.locator(".setup-doors .door-card--primary").count(), 1);
    await sender
      .getByRole("button", { name: /Start with your AI/i })
      .click();
    await sender.locator(".setup-panel").waitFor();
    assert.equal(
      await sender.locator(".setup-panel h2").textContent(),
      "Let your AI introduce you.",
    );
    assert.match(
      (await sender.locator(".save-status").first().textContent()) ?? "",
      /Nothing saved until you confirm/i,
    );
    await sender.getByRole("button", { name: "Copy the prompt" }).click();
    await sender
      .getByRole("button", { name: "Copied ✓" })
      .waitFor({ timeout: 2_000 });
    const setupPrompt = await sender.evaluate(() =>
      navigator.clipboard.readText(),
    );
    assert.match(setupPrompt, /Test yourself/i);
    assert.match(setupPrompt, /NAME: /);

    // The paste: a real draft with an LLM-emitted email and a contact key.
    await sender.locator(".speed-paste textarea").fill(
      [
        "NAME: Ada Lovelace",
        "ROLE: Analytical engine product engineer",
        "SPARK: Teaching machines to reason",
        "SPARK_DETAILS: One sentence of context for the Spark.",
        "CAN_HELP: Algorithm design — email ada@example.com",
        "LOOKING_FOR: Collaborators on analytical tooling",
        "INTERESTS: Analytical Engines, Combinatorics",
        "VALUES: diligence, curiosity",
        "COMMUNICATION_STYLE: Direct, warm, and curious",
        "FUN_FACT: Ask me about the first published algorithm.",
        "LINKEDIN: https://linkedin.com/in/ada",
      ].join("\n"),
    );
    await sender.screenshot({ path: "artifacts/dogfood-01-speed-paste.png" });
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
    await sender.screenshot({ path: "artifacts/dogfood-02-speed-advisories.png" });

    // Consent gating: review writes nothing; confirming is the only write.
    assert.equal(
      await sender.evaluate(() =>
        localStorage.getItem("event-icebreaker.profile.v1"),
      ),
      null,
      "review must not write storage before confirmation",
    );

    // The advisory, then the fix: the demo beat is flag → edit → confirm.
    const fixHelp = async () => {
      const canHelp = sender.getByLabel("I can help with…");
      if (await canHelp.count()) {
        await canHelp.fill("Algorithm design and combinatorics software");
        return true;
      }
      return false;
    };
    let fixedHelp = await fixHelp();
    for (let step = 0; step < 7 && !fixedHelp; step += 1) {
      await sender.getByRole("button", { name: "Next question" }).click();
      fixedHelp = await fixHelp();
    }
    for (let step = 0; step < 8; step += 1) {
      const confirm = sender.getByRole("button", {
        name: "Confirm and save my profile",
      });
      if (await confirm.count()) break;
      await sender.getByRole("button", { name: "Next question" }).click();
    }
    await sender
      .getByRole("button", { name: "Confirm and save my profile" })
      .click();
    await sender
      .locator(".visual-card h2")
      .first()
      .filter({ hasText: "Ada Lovelace" })
      .waitFor();
    const storedSender = await sender.evaluate(() =>
      localStorage.getItem("event-icebreaker.profile.v1"),
    );
    assert.match(storedSender ?? "", /Ada Lovelace/);
    assert.doesNotMatch(storedSender ?? "", /linkedin/i);
    results.senderSpeedSetup = "passed";

    // ---------- 2. Sender share: QR, URL, Connection String, PNG ----------
    await sender.getByRole("button", { name: /Refresh share QR/i }).click();
    assert.equal(await sender.locator(".qr-frame svg").count(), 1);
    await sender
      .locator(".fallback-grid details")
      .first()
      .locator("summary")
      .click();
    const shareUrl = await sender
      .locator(".fallback-grid details")
      .first()
      .locator("code")
      .textContent();
    const payload = shareUrl.split("#")[1];
    assert.ok(payload, "sender page must produce a share payload");
    await sender
      .locator(".fallback-grid details")
      .nth(1)
      .locator("summary")
      .click();
    const connectionString = await sender
      .locator(".fallback-grid details")
      .nth(1)
      .locator("pre")
      .textContent();
    assert.match(
      connectionString ?? "",
      /BEGIN EVENT ICEBREAKER PROFILE[\s\S]+END EVENT ICEBREAKER PROFILE/,
    );
    const downloadPromise = sender.waitForEvent("download");
    await sender.getByRole("button", { name: "Download card" }).click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /icebreaker-card\.png$/);
    await sender.screenshot({
      path: "artifacts/dogfood-03-sender-share.png",
      fullPage: true,
    });
    await senderContext.close();
    results.senderShare = "passed";
    const receiveUrl = `${origin}/receive#${payload}`;

    // ---------- 3. Receiver: no-profile doors, wizard fallback ----------
    const receiverContext = await browser.newContext({ viewport });
    await receiverContext.grantPermissions(
      ["clipboard-read", "clipboard-write"],
      { origin },
    );
    const receiver = await receiverContext.newPage();
    watchPage(receiver);
    instrument(receiver);
    await receiver.goto(receiveUrl, { waitUntil: "domcontentloaded" });
    await receiver.locator(".visual-card h2").waitFor();
    assert.equal(await receiver.locator(".visual-card h2").textContent(), "Ada Lovelace");
    assert.equal(await receiver.locator(".setup-doors").count(), 1);
    // Current behavior (finding #2 in docs): the receiver speed door is a
    // reserved teaser; the wizard is the working fallback.
    const speedDoor = receiver.getByRole("button", {
      name: /Speed setup — opening soon/i,
    });
    assert.equal(await speedDoor.count(), 1);
    assert.equal(await speedDoor.isDisabled(), true);
    await receiver.screenshot({ path: "artifacts/dogfood-04-receiver-doors.png" });

    await receiver.getByRole("button", { name: "Open the wizard" }).click();
    await receiver.locator(".setup-panel").waitFor();
    results.wizardKeepsSenderCard =
      (await receiver.locator(".visual-card h2").count()) > 0;
    assert.equal(
      await receiver.evaluate(() =>
        localStorage.getItem("event-icebreaker.profile.v1"),
      ),
      null,
      "open wizard must not write storage",
    );

    await receiver.getByLabel("Name").fill(RECEIVER_PROFILE.name);
    await receiver.getByLabel("Role or one-line identity").fill(RECEIVER_PROFILE.role);
    await receiver.getByRole("button", { name: "Next question" }).click();
    await receiver.getByLabel("Current Spark").fill(RECEIVER_PROFILE.spark);
    await receiver.getByLabel("One sentence of context").fill(RECEIVER_PROFILE.sparkDetails);
    await receiver.getByRole("button", { name: "Next question" }).click();
    await receiver.getByLabel("I can help with…").fill(RECEIVER_PROFILE.canHelp);
    await receiver.getByRole("button", { name: "Next question" }).click();
    await receiver.getByLabel("I’d like to meet…").fill(RECEIVER_PROFILE.lookingFor);
    await receiver.getByRole("button", { name: "Next question" }).click();
    // role/textbox selectors: the wizard renders starter-chip divs that share
    // the field's accessible name (getByLabel would collide on Interests).
    await receiver.getByRole("textbox", { name: /Interests/ }).fill(RECEIVER_PROFILE.interests.join(", "));
    await receiver.getByRole("textbox", { name: /Values/ }).fill(RECEIVER_PROFILE.values.join(", "));
    await receiver.getByLabel("Communication style").fill(RECEIVER_PROFILE.communicationStyle);
    await receiver.getByLabel("Fun fact or invitation").fill(RECEIVER_PROFILE.funFact);
    await receiver.screenshot({ path: "artifacts/dogfood-05-receiver-wizard.png" });
    await receiver.getByRole("button", { name: "Show my match read" }).click();

    // ---------- 4. Real dossier: loading → confident OR escalated ----------
    const loadingSeen = await receiver
      .locator(".match-read-card--loading")
      .waitFor({ timeout: 1_500 })
      .then(() => true)
      .catch(() => false);
    results.loadingCardSeen = loadingSeen;
    const readCard = receiver.locator(".match-read-card");
    await readCard.getByText(/Stateless model read/i).first().waitFor({ timeout: 15_000 });
    const storedReceiver = await receiver.evaluate(() =>
      localStorage.getItem("event-icebreaker.profile.v1"),
    );
    assert.match(storedReceiver ?? "", /Maya/);

    let lastDossier = null;
    receiver.on("response", async (response) => {
      if (response.url().includes("/v1/match/deep")) {
        try {
          lastDossier = await response.json();
        } catch {
          lastDossier = null;
        }
      }
    });

    const readText = (await readCard.textContent()) ?? "";
    const ladder = readCard.locator(".match-ladder");
    const isEscalated = (await readCard.locator(".match-read-card__escalation").count()) === 1;

    if (!isEscalated && (await ladder.count()) === 1) {
      // Confident beat: band label, ribbon rungs 1→2→3, skip, footnote.
      assert.match(readText, /Decoded on device/i);
      if (lastDossier) {
        assert.match(readText, new RegExp(BAND_LABELS[lastDossier.score.band], "i"));
        results.rawScoreLeaked = readText.includes(String(lastDossier.score.value));
      }
      const rungOne = ladder.locator('[data-ladder-rung="1"]');
      await rungOne.waitFor();
      assert.equal(await ladder.locator('[data-ladder-rung="2"]').count(), 0);
      assert.equal(await ladder.locator('[data-ladder-rung="3"]').count(), 0);
      await receiver.screenshot({
        path: "artifacts/dogfood-06-dossier-confident.png",
        fullPage: true,
      });
      await ladder.getByRole("button", { name: /keep going/i }).click();
      const rungTwo = ladder.locator('[data-ladder-rung="2"]');
      await rungTwo.waitFor();
      await receiver.screenshot({
        path: "artifacts/dogfood-07-ladder-rung2.png",
        fullPage: true,
      });
      await ladder
        .getByRole("button", { name: /show the deeper question/i })
        .click();
      await ladder.locator('[data-ladder-rung="3"]').waitFor();
      await receiver.screenshot({
        path: "artifacts/dogfood-08-ladder-rung3.png",
        fullPage: true,
      });
      await ladder.getByRole("button", { name: /not now/i }).click();
      await ladder.getByText(/paused/i).waitFor();
      await ladder
        .getByRole("button", { name: /show the ladder again/i })
        .click();
      await ladder.locator('[data-ladder-rung="1"]').waitFor();
      results.realDossierState = "confident-with-ladder";
    } else {
      // Escalated beat: honest uncertainty + guarded AI-prompt handoff.
      await readCard
        .getByText(/Want a sharper read\?/i)
        .first()
        .waitFor();
      assert.match(readText, /Local estimate|Stateless model read/i);
      assert.equal(await ladder.count(), 0, "escalated read must not render a ladder");
      await readCard.getByRole("button", { name: "Copy AI prompt" }).click();
      await readCard
        .getByRole("button", { name: "Copied ✓" })
        .waitFor({ timeout: 2_000 });
      const copiedPrompt = await receiver.evaluate(() =>
        navigator.clipboard.readText(),
      );
      assert.match(copiedPrompt, /untrusted profile data/i);
      results.realDossierState = "escalated-with-ai-handoff";
    }
    await receiver.screenshot({
      path: "artifacts/dogfood-09-dossier-terminal.png",
      fullPage: true,
    });
    await receiverContext.close();
    results.realDossier = "passed";

    // ---------- 4b. Ribbon pass: the rehearsal pair that routes confident ---
    // mix-01 from laya-sidecar/eval_corpus.json routes investor @ ~0.70 with
    // the real checkpoint. Both sides go through the wizard with the optional
    // questions left empty — the app omits empty strings on the wire, so the
    // payloads match the corpus pair (verified against the live sidecar).
    // Most real pairs escalate; this is the demo's rehearsed ladder beat.
    results.ribbonPass = "failed";
    const ribbonSenderContext = await browser.newContext({ viewport });
    await ribbonSenderContext.grantPermissions(
      ["clipboard-read", "clipboard-write"],
      { origin },
    );
    const ribbonSender = await ribbonSenderContext.newPage();
    watchPage(ribbonSender);
    instrument(ribbonSender);
    await ribbonSender.goto(`${origin}/`, { waitUntil: "networkidle" });
    await ribbonSender
      .getByRole("button", { name: "Use the five-step form" })
      .click();
    await ribbonSender.locator(".setup-panel").waitFor();
    await ribbonSender.getByLabel("Name").fill("Petra Vogel");
    await ribbonSender
      .getByLabel("Role or one-line identity")
      .fill("Web3 fund partner");
    await ribbonSender.getByRole("button", { name: "Next question" }).click();
    // The sender wizard edits the live profile, which ships prefilled with
    // the app's demo card — clear every field the corpus pair omits so the
    // wire payload matches (empty strings are omitted by cleanText).
    await ribbonSender
      .getByRole("textbox", { name: "Current Spark" })
      .fill("");
    await ribbonSender.getByLabel("One sentence of context").fill("");
    await ribbonSender.getByRole("button", { name: "Next question" }).click();
    await ribbonSender
      .getByLabel("I can help with…")
      .fill("Token design help and capital");
    await ribbonSender.getByRole("button", { name: "Next question" }).click();
    await ribbonSender
      .getByLabel("I’d like to meet…")
      .fill("Founders doing serious token economics");
    await ribbonSender.getByRole("button", { name: "Next question" }).click();
    await ribbonSender
      .getByRole("textbox", { name: /Interests/ })
      .fill("Venture Capital, Web3");
    await ribbonSender.getByRole("textbox", { name: /Values/ }).fill("");
    await ribbonSender.getByLabel("Communication style").fill("");
    await ribbonSender.getByLabel("Fun fact or invitation").fill("");
    // The sender wizard's finish keeps its default label — the door's
    // "Confirm and save" label belongs to the speed-review flow.
    await ribbonSender
      .getByRole("button", { name: "Refresh my share card" })
      .click();
    await ribbonSender
      .locator(".visual-card h2")
      .first()
      .filter({ hasText: "Petra Vogel" })
      .waitFor();
    await ribbonSender
      .getByRole("button", { name: /Refresh share QR/i })
      .click();
    await ribbonSender
      .locator(".fallback-grid details")
      .first()
      .locator("summary")
      .click();
    const ribbonShareUrl = await ribbonSender
      .locator(".fallback-grid details")
      .first()
      .locator("code")
      .textContent();
    assert.match(ribbonShareUrl ?? "", /#/);

    const ribbonReceiverContext = await browser.newContext({ viewport });
    const ribbonReceiver = await ribbonReceiverContext.newPage();
    watchPage(ribbonReceiver);
    instrument(ribbonReceiver);
    let ribbonDeepRequest = null;
    ribbonReceiver.on("request", (request) => {
      if (request.url().includes("/v1/match/deep")) {
        ribbonDeepRequest = request;
      }
    });
    await ribbonReceiver.goto(ribbonShareUrl, { waitUntil: "domcontentloaded" });
    await ribbonReceiver.locator(".setup-doors").waitFor();
    await ribbonReceiver.getByRole("button", { name: "Open the wizard" }).click();
    await ribbonReceiver.locator(".setup-panel").waitFor();
    await ribbonReceiver.getByLabel("Name").fill("Caleb Moss");
    await ribbonReceiver
      .getByLabel("Role or one-line identity")
      .fill("ZK protocol engineer exploring a startup");
    await ribbonReceiver.getByRole("button", { name: "Next question" }).click();
    await ribbonReceiver.getByRole("button", { name: "Next question" }).click();
    await ribbonReceiver
      .getByLabel("I can help with…")
      .fill("ZK circuit design and Rust");
    await ribbonReceiver.getByRole("button", { name: "Next question" }).click();
    await ribbonReceiver
      .getByLabel("I’d like to meet…")
      .fill("A fund that understands deep tech tokens");
    await ribbonReceiver.getByRole("button", { name: "Next question" }).click();
    await ribbonReceiver
      .getByRole("textbox", { name: /Interests/ })
      .fill("Web3, Zero Knowledge, Rust");
    await ribbonReceiver
      .getByRole("button", { name: "Show my match read" })
      .click();

    const ribbonCard = ribbonReceiver.locator(".match-read-card");
    await ribbonCard
      .getByText(/Stateless model read/i)
      .first()
      .waitFor({ timeout: 15_000 });
    // Confident route: no escalation card, the ladder present, Web3 bridge.
    const escalationCount = await ribbonCard
      .locator(".match-read-card__escalation")
      .count();
    if (escalationCount !== 0) {
      // Debug: dump the exact wire payloads the browser sent so the
      // drift from the probed corpus pair is visible in the run log.
      console.error(
        `ribbon wire payload: ${ribbonDeepRequest?.postData() ?? "unavailable"}`,
      );
    }
    assert.equal(
      escalationCount,
      0,
      "rehearsal pair must route confident — the ladder beat depends on it",
    );
    assert.equal(await ribbonCard.locator(".match-ladder").count(), 1);
    const ribbonText = (await ribbonCard.textContent()) ?? "";
    assert.match(ribbonText, /Web3/);
    await ribbonReceiver.screenshot({
      path: "artifacts/dogfood-07-ribbon-confident.png",
      fullPage: true,
    });
    results.ribbonPass = "passed";
    await ribbonReceiverContext.close();
    await ribbonSenderContext.close();

    // Latency sanity: the client aborts at 2.5 s — every real request must
    // land under it or the demo dies on stage 4.
    for (const ms of measurements.dossierLatenciesMs) {
      assert.ok(
        ms < 2_500,
        `real sidecar dossier took ${ms} ms — over the client's 2.5 s abort`,
      );
    }
  } else {
    // ---------- 5. Sidecar stopped: real degradation to the local estimate --
    const context = await browser.newContext({ viewport });
    await context.addInitScript((profile) => {
      window.localStorage.setItem(
        "event-icebreaker.profile.v1",
        JSON.stringify(profile),
      );
    }, RECEIVER_PROFILE);
    const page = await context.newPage();
    watchPage(page);
    const senderSeed = await context.newPage();
    watchPage(senderSeed);
    await senderSeed.goto(`${origin}/`, { waitUntil: "networkidle" });
    await senderSeed.getByRole("button", { name: /Refresh share QR/i }).click();
    await senderSeed
      .locator(".fallback-grid details")
      .first()
      .locator("summary")
      .click();
    const shareUrl = await senderSeed
      .locator(".fallback-grid details")
      .first()
      .locator("code")
      .textContent();
    await senderSeed.close();

    await page.goto(`${origin}/receive#${shareUrl.split("#")[1]}`, {
      waitUntil: "domcontentloaded",
    });
    const readCard = page.locator(".match-read-card");
    await readCard.getByText(/Local estimate/i).first().waitFor({ timeout: 15_000 });
    const downText = (await readCard.textContent()) ?? "";
    assert.match(downText, /unreachable/i);
    assert.equal(await readCard.locator(".match-ladder").count(), 0);
    await page.screenshot({
      path: "artifacts/dogfood-10-local-estimate.png",
      fullPage: true,
    });
    await context.close();
    results.realDegradation = "passed";
  }

  // The console gate: only expected signatures may appear.
  const expectedNoise = downOnly ? networkErrors.length : 0;
  if (!downOnly && networkErrors.length > 0) {
    issues.push(...networkErrors.map((e) => `unexpected network error: ${e}`));
  }
  assert.deepEqual(issues, []);
  console.log(
    JSON.stringify(
      {
        phase: downOnly ? "down-only" : "full",
        ...results,
        measurements: {
          ...measurements,
          expectedNetworkErrors: expectedNoise,
          font404s: font404s.length,
          guardrails422s: guardrails422s.length,
          consoleIssues: issues.length,
        },
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
