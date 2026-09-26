"use client";

/* eslint-disable @next/next/no-html-link-for-pages */

import QRCodeModule from "react-qr-code";
import { useCallback, useEffect, useMemo, useState } from "react";

import { downloadVisualCard } from "../lib/card-download";
import {
  OPENNESS_LEVELS,
  SAMPLE_PROFILE,
  createAiPrompt,
  createConnectionString,
  createConversationStarters,
  createSharedProfile,
  decodePayload,
  encodePayload,
  extractEncodedPayload,
  migrateStoredProfile,
  type FullProfile,
  type Intent,
  type Openness,
  type ShareSettings,
  type SharedProfile,
} from "../lib/icebreaker";
import { requestMatchDossierResult, type MatchDossierResult } from "../lib/match";
import { CopyButton, copyText } from "./copy-button";
import { DemoMode } from "./demo-mode";
import { MatchReadCard } from "./match-read-card";
import { ProfileSetup } from "./profile-setup";
import { SetupDoors } from "./setup-doors";

const PROFILE_STORAGE_KEY = "event-icebreaker.profile.v1";
const SETTINGS_STORAGE_KEY = "event-icebreaker.settings.v1";

// The receiver's shared profile follows the openness settings they already
// chose for themselves (falling back to the sender defaults) — the sidecar
// never sees more than this receiver would share.
const RECEIVER_DEFAULT_SETTINGS: ShareSettings = {
  openness: "high",
  intent: "networking",
  includeSpark: true,
};

// The receiver's wizard starts empty on purpose: nothing is stored and no
// dossier is requested until they review their draft and finish — the
// consent moment.
const EMPTY_RECEIVER_PROFILE: FullProfile = {
  name: "",
  role: "",
  interests: [],
  spark: "",
  sparkDetails: "",
  canHelp: "",
  lookingFor: "",
  values: [],
  communicationStyle: "",
  funFact: "",
  personality: [0.5, 0.5, 0.5, 0.5, 0.5],
};

const QRCode =
  (
    QRCodeModule as unknown as {
      default?: typeof QRCodeModule;
    }
  ).default ?? QRCodeModule;

const OPENNESS_COPY: Record<Openness, string> = {
  low: "Name, role, two interests, and a short Spark",
  medium: "Adds how you can help, what you seek, and communication style",
  high: "Adds values, full Spark, personality, and your memorable detail",
  max: "Shares every field you explicitly added",
};

const INTENT_LABELS: Record<Intent, string> = {
  networking: "Networking",
  friendship: "Friendship",
  dating: "Dating",
  general: "General",
};

function VisualCard({ profile }: { profile: SharedProfile }) {
  const openness = Object.keys(OPENNESS_LEVELS).find(
    (key) => OPENNESS_LEVELS[key as Openness] === profile.o,
  );

  return (
    <article className="visual-card" aria-label={`${profile.n}'s visual card`}>
      <div className="visual-card__topline">
        <span className="visual-card__mark">EI</span>
        <span>{INTENT_LABELS[profile.i]}</span>
        <span className="visual-card__openness">{openness} signal</span>
      </div>
      <div className="visual-card__body">
        <p className="eyebrow">MEET</p>
        <h2>{profile.n}</h2>
        {profile.r && <p className="visual-card__role">{profile.r}</p>}
        {profile.s && (
          <blockquote>
            <span>Current Spark</span>
            “{profile.s}”
          </blockquote>
        )}
        {profile.x.length > 0 && (
          <div className="tag-list" aria-label="Interests">
            {profile.x.map((interest) => (
              <span className="tag" key={interest}>
                {interest}
              </span>
            ))}
          </div>
        )}
        {(profile.h || profile.q) && (
          <div className="visual-card__signals">
            {profile.h && (
              <p>
                <strong>Can help</strong>
                <span>{profile.h}</span>
              </p>
            )}
            {profile.q && (
              <p>
                <strong>Looking for</strong>
                <span>{profile.q}</span>
              </p>
            )}
          </div>
        )}
      </div>
      <div className="visual-card__footer">
        <span>Skip small talk</span>
        <span>⚡ Find the signal</span>
      </div>
    </article>
  );
}

function DownloadCardButton({ profile }: { profile: SharedProfile }) {
  const [label, setLabel] = useState("Download card");

  async function handleDownload() {
    try {
      await downloadVisualCard(profile);
      setLabel("Downloaded ✓");
      window.setTimeout(() => setLabel("Download card"), 1800);
    } catch {
      setLabel("Download unavailable");
    }
  }

  return (
    <button
      className="button button--secondary"
      type="button"
      onClick={handleDownload}
    >
      {label}
    </button>
  );
}

function ShareControls({
  settings,
  onChange,
  onGenerate,
  canGenerate,
}: {
  settings: ShareSettings;
  onChange: (settings: ShareSettings) => void;
  onGenerate: () => void;
  canGenerate: boolean;
}) {
  return (
    <div className="share-studio__controls">
      <div className="share-control">
        <span className="share-control__label">Openness</span>
        <div className="segmented-control">
          {(Object.keys(OPENNESS_LEVELS) as Openness[]).map((level) => (
            <button
              className={settings.openness === level ? "is-active" : ""}
              type="button"
              key={level}
              aria-pressed={settings.openness === level}
              onClick={() => onChange({ ...settings, openness: level })}
            >
              {level}
            </button>
          ))}
        </div>
        <small>{OPENNESS_COPY[settings.openness]}</small>
      </div>
      <div className="share-control">
        <span className="share-control__label">Intent</span>
        <div className="choice-grid">
          {(Object.keys(INTENT_LABELS) as Intent[]).map((intent) => (
            <button
              className={settings.intent === intent ? "is-active" : ""}
              type="button"
              key={intent}
              aria-pressed={settings.intent === intent}
              onClick={() => onChange({ ...settings, intent })}
            >
              {INTENT_LABELS[intent]}
            </button>
          ))}
        </div>
      </div>
      <label className="toggle-row toggle-row--compact">
        <span>
          <strong>Include current Spark</strong>
          <small>Your strongest conversation hook</small>
        </span>
        <input
          type="checkbox"
          checked={settings.includeSpark}
          onChange={(event) =>
            onChange({ ...settings, includeSpark: event.target.checked })
          }
        />
      </label>
      <button
        className="button button--primary"
        type="button"
        onClick={onGenerate}
        disabled={!canGenerate}
      >
        Refresh share QR ↗
      </button>
    </div>
  );
}

function SenderMode() {
  const defaultSettings: ShareSettings = {
    openness: "high",
    intent: "networking",
    includeSpark: true,
  };
  const [profile, setProfile] = useState<FullProfile>(SAMPLE_PROFILE);
  const [settings, setSettings] = useState<ShareSettings>(defaultSettings);
  const [generated, setGenerated] = useState<SharedProfile>(() =>
    createSharedProfile(SAMPLE_PROFILE, defaultSettings),
  );
  const [shareUrl, setShareUrl] = useState("");
  const [saveState, setSaveState] = useState("Stefano profile ready");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const savedProfile = localStorage.getItem(PROFILE_STORAGE_KEY);
        const savedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
        const nextProfile = savedProfile
          ? migrateStoredProfile(JSON.parse(savedProfile))
          : SAMPLE_PROFILE;
        const nextSettings = savedSettings
          ? ({
              ...defaultSettings,
              ...JSON.parse(savedSettings),
            } as ShareSettings)
          : defaultSettings;
        const nextShared = createSharedProfile(nextProfile, nextSettings);

        setProfile(nextProfile);
        setSettings(nextSettings);
        setGenerated(nextShared);
        setShareUrl(
          `${window.location.origin}/receive#${encodePayload(nextShared)}`,
        );
        if (savedProfile) {
          localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(nextProfile));
          setSaveState("Saved on this device");
        }
      } catch {
        const nextShared = createSharedProfile(SAMPLE_PROFILE, defaultSettings);
        setShareUrl(
          `${window.location.origin}/receive#${encodePayload(nextShared)}`,
        );
      }
    }, 0);
    return () => window.clearTimeout(timer);
    // Device hydration intentionally runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const encodedPayload = useMemo(() => encodePayload(generated), [generated]);
  const connectionString = useMemo(
    () => createConnectionString(encodedPayload),
    [encodedPayload],
  );

  function updateProfile<K extends keyof FullProfile>(
    key: K,
    value: FullProfile[K],
  ) {
    setProfile((current) => {
      const next = { ...current, [key]: value };
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    setSaveState("Saved on this device");
  }

  function updateSettings(next: ShareSettings) {
    setSettings(next);
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
  }

  function pushShare(source: FullProfile, scroll: boolean) {
    const nextShared = createSharedProfile(source, settings);
    setGenerated(nextShared);
    setShareUrl(
      `${window.location.origin}/receive#${encodePayload(nextShared)}`,
    );
    if (scroll) {
      document
        .getElementById("share-studio")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function generateShare(scroll = true) {
    pushShare(profile, scroll);
  }

  // Speed-setup consent moment: the staged draft becomes the live profile
  // only here — the same storage and downstream as a wizard-finished edit.
  function commitProfile(next: FullProfile) {
    setProfile(next);
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(next));
    setSaveState("Saved on this device");
    pushShare(next, true);
  }

  async function shareProfile() {
    if (!shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Meet ${generated.n}`,
          text: `Here is ${generated.n}'s Event Icebreaker card.`,
          url: shareUrl,
        });
      } catch {
        // Closing the native share sheet is expected.
      }
    } else {
      await copyText(shareUrl);
    }
  }

  return (
    <main>
      <SiteHeader mode="sender" />

      <section className="sender-intro shell">
        <div>
          <p className="eyebrow">YOUR SIGNAL, NOT YOUR RÉSUMÉ</p>
          <h1>Skip the small talk.</h1>
          <p>
            Share enough context for someone to know what would be interesting
            to discuss with you.
          </p>
        </div>
        <div className="trust-row" aria-label="Privacy features">
          <span>◆ No account</span>
          <span>◆ Stays on device</span>
          <span>◆ You choose what travels</span>
        </div>
      </section>

      <section className="share-studio-section" id="share-studio">
        <div className="shell">
          <div className="section-heading section-heading--compact">
            <div>
              <p className="step-label">READY TO SHARE</p>
              <h2>Your QR and card, front and center.</h2>
            </div>
            <span className="payload-meter">
              {shareUrl.length} characters · QR-safe
            </span>
          </div>
          <div className="share-studio">
            <div className="share-studio__qr">
              <div className="qr-frame">
                {shareUrl ? (
                  <QRCode
                    value={shareUrl}
                    size={256}
                    level="M"
                    bgColor="#ffffff"
                    fgColor="#101114"
                    aria-label="QR code for this Icebreaker profile"
                  />
                ) : (
                  <div className="qr-placeholder">Preparing QR…</div>
                )}
              </div>
              <div>
                <h3>Scan with any phone camera</h3>
                <p>No app or login. The profile opens as a normal web link.</p>
              </div>
              <div className="button-row">
                <button
                  className="button button--primary"
                  type="button"
                  onClick={shareProfile}
                  disabled={!shareUrl}
                >
                  Share profile
                </button>
                <CopyButton label="Copy link" value={shareUrl} />
              </div>
            </div>

            <div className="share-studio__card">
              <VisualCard profile={generated} />
              <DownloadCardButton profile={generated} />
              <p className="microcopy">
                Save the card as an offline backup or lock-screen image.
              </p>
            </div>

            <ShareControls
              settings={settings}
              onChange={updateSettings}
              onGenerate={() => generateShare(false)}
              canGenerate={Boolean(profile.name.trim())}
            />
          </div>
        </div>
      </section>

      <section className="builder-section">
        <div className="shell compact-builder">
          <SetupDoors
            profile={profile}
            onProfileChange={updateProfile}
            onCommitProfile={commitProfile}
            onFinishWizard={() => generateShare(true)}
            saveState={saveState}
          />

          <div className="fallback-grid fallback-grid--compact">
            <details>
              <summary>Shareable URL</summary>
              <code>{shareUrl}</code>
              <CopyButton
                label="Copy share URL"
                value={shareUrl}
                variant="quiet"
              />
            </details>
            <details>
              <summary>Connection String fallback</summary>
              <pre>{connectionString}</pre>
              <CopyButton
                label="Copy Connection String"
                value={connectionString}
                variant="quiet"
              />
            </details>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

function ReceiverSetupDoors({ onOpenWizard }: { onOpenWizard: () => void }) {
  return (
    <div className="setup-doors">
      <div
        className="setup-door setup-door--speed"
        data-speed-setup-slot="reserved"
      >
        <p className="step-label">FASTEST · RECOMMENDED</p>
        <h3>Let your AI introduce you.</h3>
        <p>
          Ask the AI you already use to draft your profile, paste it back,
          review, and you are done in about a minute.
        </p>
        <button className="button button--primary" type="button" disabled>
          Speed setup — opening soon
        </button>
        <p className="microcopy">The five-question wizard works right now.</p>
      </div>
      <div className="setup-door">
        <p className="step-label">FIVE QUESTIONS · ABOUT 2 MIN</p>
        <h3>Build it yourself.</h3>
        <p>
          Five short questions. Everything stays on this device until you
          choose to share it.
        </p>
        <button
          className="button button--secondary"
          type="button"
          onClick={onOpenWizard}
        >
          Open the wizard
        </button>
      </div>
    </div>
  );
}

function ReceiverMode() {
  const [profile, setProfile] = useState<SharedProfile | null>(null);
  const [error, setError] = useState("");
  const [manualInput, setManualInput] = useState("");
  const [sourcePayload, setSourcePayload] = useState("");
  const [receiverProfile, setReceiverProfile] = useState<FullProfile | null>(
    null,
  );
  const [receiverSettings, setReceiverSettings] = useState<ShareSettings>(
    RECEIVER_DEFAULT_SETTINGS,
  );
  const [wizardOpen, setWizardOpen] = useState(false);
  const [draftProfile, setDraftProfile] = useState<FullProfile>(
    EMPTY_RECEIVER_PROFILE,
  );
  // `match === null` renders as the loading card; the effect only sets state
  // when a request resolves, so re-decodes refresh in place.
  const [match, setMatch] = useState<MatchDossierResult | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const savedProfile = localStorage.getItem(PROFILE_STORAGE_KEY);
        if (savedProfile) {
          setReceiverProfile(migrateStoredProfile(JSON.parse(savedProfile)));
          const savedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
          if (savedSettings) {
            setReceiverSettings({
              ...RECEIVER_DEFAULT_SETTINGS,
              ...JSON.parse(savedSettings),
            } as ShareSettings);
          }
        }
      } catch {
        // A damaged local profile must not break the sender's card.
      }
      try {
        const encoded = extractEncodedPayload(window.location.href);
        setSourcePayload(encoded);
        setProfile(decodePayload(encoded));
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "This Icebreaker link could not be opened.",
        );
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // The dossier request resolves for every sidecar state — unset URL,
  // timeout, rejection, or a malformed response all degrade to the local
  // estimate (lib/match.ts degradation contract), so this never throws.
  useEffect(() => {
    if (!profile || !receiverProfile) return;
    let cancelled = false;
    const receiverShared = createSharedProfile(
      receiverProfile,
      receiverSettings,
    );
    requestMatchDossierResult(profile, receiverShared).then((result) => {
      if (!cancelled) setMatch(result);
    });
    return () => {
      cancelled = true;
    };
  }, [profile, receiverProfile, receiverSettings]);

  function updateDraftProfile<K extends keyof FullProfile>(
    key: K,
    value: FullProfile[K],
  ) {
    setDraftProfile((current) => ({ ...current, [key]: value }));
  }

  // The consent moment: nothing is stored — and no dossier is requested —
  // until the receiver reviews their draft and finishes the wizard.
  function finishReceiverWizard() {
    if (!draftProfile.name.trim()) return;
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(draftProfile));
    setReceiverProfile(draftProfile);
    setWizardOpen(false);
  }

  function decodeManual() {
    try {
      const encoded = extractEncodedPayload(manualInput);
      const nextProfile = decodePayload(encoded);
      setProfile(nextProfile);
      setSourcePayload(encoded);
      setError("");
      window.history.replaceState(null, "", `/receive#${encoded}`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "That Connection String could not be opened.",
      );
    }
  }

  if (!profile) {
    return (
      <main>
        <SiteHeader mode="receiver" />
        <section className="receiver-empty shell">
          <div className="empty-signal" aria-hidden="true">
            ⚡
          </div>
          <p className="eyebrow">PROFILE UNAVAILABLE</p>
          <h1>Let’s recover the signal.</h1>
          <p>
            {error ||
              "This Icebreaker link is incomplete. Paste the Connection String below."}
          </p>
          <label className="manual-paste">
            <span>Icebreaker link or Connection String</span>
            <textarea
              rows={7}
              value={manualInput}
              onChange={(event) => setManualInput(event.target.value)}
              placeholder={
                "-----BEGIN EVENT ICEBREAKER PROFILE-----\n…\n-----END EVENT ICEBREAKER PROFILE-----"
              }
            />
          </label>
          <button
            className="button button--primary"
            type="button"
            onClick={decodeManual}
            disabled={!manualInput.trim()}
          >
            Decode profile
          </button>
          <a className="text-link" href="/">
            Build my own profile instead →
          </a>
        </section>
        <SiteFooter />
      </main>
    );
  }

  const prompt = createAiPrompt(profile);
  const starters = createConversationStarters(profile);
  const connectionString = createConnectionString(sourcePayload);

  return (
    <main>
      <SiteHeader mode="receiver" />
      <section className="receiver-hero shell">
        <div className="receiver-intro">
          <p className="eyebrow">YOU JUST MET SOMEONE INTERESTING</p>
          <h1>Here’s the signal.</h1>
          <p>
            Read the card. Pick a thread. Ask something only you could ask
            because you saw this.
          </p>
          <DownloadCardButton profile={profile} />
        </div>
        <div className="receiver-card-wrap">
          <VisualCard profile={profile} />
          <div className="decoded-locally">
            <span>✓</span>
            Decoded on this device · nothing was uploaded
          </div>
        </div>
      </section>

      <section className="match-section" aria-label="Two-way match">
        <div className="shell">
          <div className="section-heading section-heading--compact">
            <div>
              <p className="step-label">THE TWO-WAY READ</p>
              <h2>How the two of you land.</h2>
            </div>
          </div>

          {receiverProfile ? (
            match ? (
              <MatchReadCard
                status="ready"
                dossier={match.dossier}
                source={match.source}
                aiPrompt={prompt}
              />
            ) : (
              <MatchReadCard status="loading" />
            )
          ) : (
            <>
              <ReceiverSetupDoors onOpenWizard={() => setWizardOpen(true)} />
              {wizardOpen && (
                <ProfileSetup
                  profile={draftProfile}
                  onChange={updateDraftProfile}
                  onFinish={finishReceiverWizard}
                  saveState="Draft — saved when you finish"
                  finishLabel="Show my match read"
                />
              )}
            </>
          )}
        </div>
      </section>

      <section className="starter-section">
        <div className="shell">
          <div className="section-heading section-heading--compact">
            <div>
              <p className="step-label">START HERE · NO AI NEEDED</p>
              <h2>Three questions worth asking.</h2>
            </div>
          </div>
          <ol className="starter-grid">
            {starters.map((starter, index) => (
              <li key={starter}>
                <span>0{index + 1}</span>
                <p>{starter}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="receiver-actions">
        <div className="shell receiver-actions__grid">
          <article className="action-card action-card--primary">
            <span className="action-number">01</span>
            <p className="step-label">OPTIONAL AI ASSIST</p>
            <h2>Want sharper questions?</h2>
            <p>
              Copy a ready-made prompt into ChatGPT, Claude, Gemini, or another
              AI. It uses only the details shown on this card.
            </p>
            <CopyButton
              label="Copy AI prompt"
              value={prompt}
              variant="primary"
            />
            <details className="prompt-preview">
              <summary>Preview the prompt</summary>
              <pre>{prompt}</pre>
            </details>
          </article>

          <article className="action-card">
            <span className="action-number">02</span>
            <p className="step-label">YOUR TURN</p>
            <h2>Make your own signal.</h2>
            <p>
              Build a private card on this device, choose what to reveal, and
              get your own QR in about two minutes.
            </p>
            <a className="button button--secondary" href="/">
              Build my profile
            </a>
          </article>
        </div>

        <div className="shell receiver-fallbacks">
          <details>
            <summary>Connection String fallback</summary>
            <pre>{connectionString}</pre>
            <CopyButton
              label="Copy Connection String"
              value={connectionString}
              variant="quiet"
            />
          </details>
          <details>
            <summary>Paste a different profile</summary>
            <label className="manual-paste manual-paste--compact">
              <span>Icebreaker link or Connection String</span>
              <textarea
                rows={4}
                value={manualInput}
                onChange={(event) => setManualInput(event.target.value)}
              />
            </label>
            <button
              className="button button--quiet"
              type="button"
              onClick={decodeManual}
              disabled={!manualInput.trim()}
            >
              Decode another profile
            </button>
          </details>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

function SiteHeader({ mode }: { mode: "sender" | "receiver" }) {
  const [demoOpen, setDemoOpen] = useState(false);
  const closeDemo = useCallback(() => setDemoOpen(false), []);

  return (
    <>
      <header className="site-header">
        <div className="shell site-header__inner">
          <a className="brand" href="/" aria-label="Event Icebreaker home">
            <span className="brand__mark">⚡</span>
            <span>
              Event <strong>Icebreaker</strong>
            </span>
          </a>
          <div className="site-header__actions">
            <button
              className="demo-button"
              type="button"
              onClick={() => setDemoOpen(true)}
            >
              ▶ 60-sec demo
            </button>
            <div className="mode-chip">
              <span className="mode-chip__dot" />
              {mode === "sender" ? "Sender" : "Receiver"}
            </div>
          </div>
        </div>
      </header>
      {demoOpen && <DemoMode open onClose={closeDemo} />}
    </>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell site-footer__inner">
        <p>
          <span>⚡ Event Icebreaker</span>
          <br />
          Conversation context, carried by you.
        </p>
        <p>
          No accounts. No database. No analytics.
          <br />
          Your signal leaves only when you share it.
        </p>
      </div>
    </footer>
  );
}

export function IcebreakerApp({
  mode,
}: {
  mode: "sender" | "receiver";
}) {
  return mode === "receiver" ? <ReceiverMode /> : <SenderMode />;
}
