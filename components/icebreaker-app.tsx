"use client";

/* eslint-disable @next/next/no-html-link-for-pages */

import QRCodeModule from "react-qr-code";
import { useEffect, useMemo, useState } from "react";

import {
  OPENNESS_LEVELS,
  SAMPLE_PROFILE,
  createAiPrompt,
  createConnectionString,
  createSharedProfile,
  decodePayload,
  encodePayload,
  extractEncodedPayload,
  type FullProfile,
  type Intent,
  type Openness,
  type ShareSettings,
  type SharedProfile,
} from "../lib/icebreaker";

const PROFILE_STORAGE_KEY = "event-icebreaker.profile.v1";
const SETTINGS_STORAGE_KEY = "event-icebreaker.settings.v1";
const QRCode =
  (
    QRCodeModule as unknown as {
      default?: typeof QRCodeModule;
    }
  ).default ?? QRCodeModule;
const PERSONALITY_LABELS = [
  "Openness",
  "Conscientiousness",
  "Extraversion",
  "Agreeableness",
  "Neuroticism",
];

const OPENNESS_COPY: Record<Openness, string> = {
  low: "Name, role, two interests, short Spark",
  medium: "Adds more interests and communication style",
  high: "Adds values, full Spark, personality, and fun fact",
  max: "Shares every field you explicitly added",
};

const INTENT_LABELS: Record<Intent, string> = {
  networking: "Networking",
  friendship: "Friendship",
  dating: "Dating",
  general: "General",
};

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Older mobile browsers can expose Clipboard API without granting it.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Copying is unavailable in this browser.");
}

function VisualCard({ profile }: { profile: SharedProfile }) {
  return (
    <article className="visual-card" aria-label={`${profile.n}'s visual card`}>
      <div className="visual-card__topline">
        <span className="visual-card__mark">EI</span>
        <span>{INTENT_LABELS[profile.i]}</span>
        <span className="visual-card__openness">
          {Object.keys(OPENNESS_LEVELS).find(
            (key) =>
              OPENNESS_LEVELS[key as Openness] === profile.o,
          )}{" "}
          signal
        </span>
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
      </div>
      <div className="visual-card__footer">
        <span>Skip small talk</span>
        <span>⚡ Find the signal</span>
      </div>
    </article>
  );
}

function CopyButton({
  label,
  value,
  variant = "secondary",
}: {
  label: string;
  value: string;
  variant?: "primary" | "secondary" | "quiet";
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await copyText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      className={`button button--${variant}`}
      type="button"
      onClick={handleCopy}
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}

function SenderMode() {
  const [profile, setProfile] = useState<FullProfile>(SAMPLE_PROFILE);
  const [settings, setSettings] = useState<ShareSettings>({
    openness: "high",
    intent: "networking",
    includeSpark: true,
  });
  const [generated, setGenerated] = useState<SharedProfile>(() =>
    createSharedProfile(SAMPLE_PROFILE, {
      openness: "high",
      intent: "networking",
      includeSpark: true,
    }),
  );
  const [shareUrl, setShareUrl] = useState("");
  const [saveState, setSaveState] = useState("Sample profile ready");

  useEffect(() => {
    try {
      const savedProfile = localStorage.getItem(PROFILE_STORAGE_KEY);
      const savedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
      const storedProfile = savedProfile
        ? (JSON.parse(savedProfile) as Partial<FullProfile>)
        : null;
      const nextProfile = storedProfile
        ? ({
            ...SAMPLE_PROFILE,
            ...storedProfile,
            name:
              storedProfile.name === "James"
                ? "Stefano"
                : (storedProfile.name ?? SAMPLE_PROFILE.name),
          } as FullProfile)
        : SAMPLE_PROFILE;
      const nextSettings = savedSettings
        ? ({ ...settings, ...JSON.parse(savedSettings) } as ShareSettings)
        : settings;

      // Browser storage is unavailable during the server render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProfile(nextProfile);
      if (storedProfile?.name === "James") {
        localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(nextProfile));
      }
      setSettings(nextSettings);
      const nextShared = createSharedProfile(nextProfile, nextSettings);
      setGenerated(nextShared);
      setShareUrl(
        `${window.location.origin}/receive#${encodePayload(nextShared)}`,
      );
      setSaveState(savedProfile ? "Saved on this device" : "Sample profile ready");
    } catch {
      const nextShared = createSharedProfile(SAMPLE_PROFILE, settings);
      setGenerated(nextShared);
      setShareUrl(
        `${window.location.origin}/receive#${encodePayload(nextShared)}`,
      );
    }
    // Initial device hydration intentionally runs once.
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

  function generateShare() {
    const nextShared = createSharedProfile(profile, settings);
    setGenerated(nextShared);
    setShareUrl(
      `${window.location.origin}/receive#${encodePayload(nextShared)}`,
    );
    document
      .getElementById("share-output")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
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
        // Closing the native share sheet is not an error state.
      }
      return;
    }
    await copyText(shareUrl);
  }

  return (
    <main>
      <SiteHeader mode="sender" />

      <section className="hero shell">
        <div className="hero__copy">
          <p className="eyebrow">YOUR SIGNAL, NOT YOUR RÉSUMÉ</p>
          <h1>Skip the small talk.</h1>
          <p className="hero__lede">
            Share just enough context for someone to know what would be
            interesting to discuss with you.
          </p>
          <div className="trust-row" aria-label="Privacy features">
            <span>◆ No account</span>
            <span>◆ Stays on device</span>
            <span>◆ You choose what travels</span>
          </div>
        </div>
        <div className="hero__card">
          <VisualCard profile={createSharedProfile(profile, settings)} />
          <p className="microcopy">
            Live preview · only selected openness fields appear
          </p>
        </div>
      </section>

      <section className="builder-section">
        <div className="shell builder-grid">
          <div className="panel profile-panel">
            <div className="panel-heading">
              <div>
                <p className="step-label">01 · BUILD YOUR CARD</p>
                <h2>What should people know?</h2>
              </div>
              <span className="save-status">{saveState}</span>
            </div>

            <div className="form-grid">
              <label>
                <span>Name</span>
                <input
                  value={profile.name}
                  maxLength={80}
                  onChange={(event) =>
                    updateProfile("name", event.target.value)
                  }
                />
              </label>
              <label>
                <span>Role or tagline</span>
                <input
                  value={profile.role}
                  maxLength={120}
                  onChange={(event) =>
                    updateProfile("role", event.target.value)
                  }
                />
              </label>
              <label className="field-wide">
                <span>Interests</span>
                <input
                  value={profile.interests.join(", ")}
                  maxLength={420}
                  onChange={(event) =>
                    updateProfile("interests", parseList(event.target.value))
                  }
                />
                <small>Separate interests with commas.</small>
              </label>
              <label className="field-wide">
                <span>Current Spark</span>
                <input
                  value={profile.spark}
                  maxLength={160}
                  onChange={(event) =>
                    updateProfile("spark", event.target.value)
                  }
                />
              </label>
              <label className="field-wide">
                <span>Spark details</span>
                <textarea
                  value={profile.sparkDetails}
                  maxLength={360}
                  rows={3}
                  onChange={(event) =>
                    updateProfile("sparkDetails", event.target.value)
                  }
                />
              </label>
              <label>
                <span>Values</span>
                <input
                  value={profile.values.join(", ")}
                  maxLength={260}
                  onChange={(event) =>
                    updateProfile("values", parseList(event.target.value))
                  }
                />
              </label>
              <label>
                <span>Communication style</span>
                <input
                  value={profile.communicationStyle}
                  maxLength={160}
                  onChange={(event) =>
                    updateProfile("communicationStyle", event.target.value)
                  }
                />
              </label>
              <label className="field-wide">
                <span>Fun fact</span>
                <input
                  value={profile.funFact}
                  maxLength={220}
                  onChange={(event) =>
                    updateProfile("funFact", event.target.value)
                  }
                />
              </label>
            </div>

            <details className="personality-details">
              <summary>Personality signal (OCEAN)</summary>
              <p>
                Optional context, shared only at High or Max openness.
              </p>
              <div className="slider-list">
                {PERSONALITY_LABELS.map((label, index) => (
                  <label className="slider-row" key={label}>
                    <span>{label}</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={profile.personality[index]}
                      onChange={(event) => {
                        const next = [...profile.personality] as FullProfile["personality"];
                        next[index] = Number(event.target.value);
                        updateProfile("personality", next);
                      }}
                    />
                    <output>{profile.personality[index].toFixed(2)}</output>
                  </label>
                ))}
              </div>
            </details>
          </div>

          <aside className="panel share-controls">
            <p className="step-label">02 · SET THE SIGNAL</p>
            <h2>What travels today?</h2>

            <fieldset>
              <legend>Openness</legend>
              <div className="segmented-control">
                {(Object.keys(OPENNESS_LEVELS) as Openness[]).map((level) => (
                  <button
                    className={settings.openness === level ? "is-active" : ""}
                    type="button"
                    key={level}
                    aria-pressed={settings.openness === level}
                    onClick={() =>
                      updateSettings({ ...settings, openness: level })
                    }
                  >
                    {level}
                  </button>
                ))}
              </div>
              <p className="control-help">
                {OPENNESS_COPY[settings.openness]}
              </p>
            </fieldset>

            <fieldset>
              <legend>Intent</legend>
              <div className="choice-grid">
                {(Object.keys(INTENT_LABELS) as Intent[]).map((intent) => (
                  <button
                    className={settings.intent === intent ? "is-active" : ""}
                    type="button"
                    key={intent}
                    aria-pressed={settings.intent === intent}
                    onClick={() =>
                      updateSettings({ ...settings, intent })
                    }
                  >
                    {INTENT_LABELS[intent]}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="toggle-row">
              <span>
                <strong>Include current Spark</strong>
                <small>The strongest conversation hook.</small>
              </span>
              <input
                type="checkbox"
                checked={settings.includeSpark}
                onChange={(event) =>
                  updateSettings({
                    ...settings,
                    includeSpark: event.target.checked,
                  })
                }
              />
            </label>

            <button
              className="button button--primary button--generate"
              type="button"
              onClick={generateShare}
              disabled={!profile.name.trim()}
            >
              Generate my QR code <span>↗</span>
            </button>
            <p className="privacy-note">
              Your complete profile stays in this browser. The QR includes only
              the filtered card above.
            </p>
          </aside>
        </div>
      </section>

      <section className="output-section" id="share-output">
        <div className="shell">
          <div className="section-heading">
            <div>
              <p className="step-label">03 · SHARE THE SIGNAL</p>
              <h2>One scan. Something real to talk about.</h2>
            </div>
            <span className="payload-meter">
              {shareUrl.length} characters · QR-safe
            </span>
          </div>

          <div className="output-grid">
            <div className="qr-panel">
              <div className="qr-frame">
                {shareUrl ? (
                  <QRCode
                    value={shareUrl}
                    size={248}
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
                <p>
                  No app needed. The profile is decoded privately in the
                  receiver’s browser.
                </p>
              </div>
              <div className="button-row">
                <button
                  className="button button--primary"
                  type="button"
                  onClick={shareProfile}
                >
                  Share profile
                </button>
                <CopyButton label="Copy link" value={shareUrl} />
              </div>
            </div>

            <div className="output-card-panel">
              <VisualCard profile={generated} />
              <div className="output-callout">
                <span className="callout-icon">↳</span>
                <p>
                  <strong>The card is the product.</strong>
                  <br />
                  AI is optional; this alone should start the conversation.
                </p>
              </div>
            </div>
          </div>

          <div className="fallback-grid">
            <details>
              <summary>Shareable URL</summary>
              <code>{shareUrl}</code>
              <CopyButton label="Copy share URL" value={shareUrl} variant="quiet" />
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

function ReceiverMode() {
  const [profile, setProfile] = useState<SharedProfile | null>(null);
  const [error, setError] = useState("");
  const [manualInput, setManualInput] = useState("");
  const [sourcePayload, setSourcePayload] = useState("");

  useEffect(() => {
    try {
      const encoded = extractEncodedPayload(window.location.href);
      // The URL fragment exists only in the receiver's browser.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSourcePayload(encoded);
      setProfile(decodePayload(encoded));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "This Icebreaker link could not be opened.",
      );
    }
  }, []);

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
              placeholder={`${"-----BEGIN EVENT ICEBREAKER PROFILE-----"}\n…\n${"-----END EVENT ICEBREAKER PROFILE-----"}`}
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
        </div>

        <div className="receiver-card-wrap">
          <VisualCard profile={profile} />
          <div className="decoded-locally">
            <span>✓</span>
            Decoded on this device · nothing was uploaded
          </div>
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
              get your own QR in under two minutes.
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
  return (
    <header className="site-header">
      <div className="shell site-header__inner">
        <a className="brand" href="/" aria-label="Event Icebreaker home">
          <span className="brand__mark">⚡</span>
          <span>
            Event <strong>Icebreaker</strong>
          </span>
        </a>
        <div className="mode-chip">
          <span className="mode-chip__dot" />
          {mode === "sender" ? "Sender mode" : "Receiver mode"}
        </div>
      </div>
    </header>
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
