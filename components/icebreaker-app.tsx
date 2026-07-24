"use client";

/* eslint-disable @next/next/no-html-link-for-pages */

import QRCodeModule from "react-qr-code";
import { useCallback, useEffect, useMemo, useState } from "react";

import { downloadVisualCard } from "../lib/card-download";
import {
  DEEP_PROFILE_STORAGE_KEY,
  DEEP_SHARE_STORAGE_KEY,
  createDefaultDeepProfile,
  createDefaultDeepSharePreferences,
  createDeepSnapshot,
  validateDeepProfile,
  validateDeepSharePreferences,
  type DeepProfile,
  type DeepSharePreferences,
} from "../lib/deep-profile";
import { encryptDeepSnapshot } from "../lib/deep-crypto";
import {
  calculateDeepExpiry,
  validateRevokeToken,
  validateSessionToken,
} from "../lib/deep-session";
import { createHybridShareUrl } from "../lib/hybrid-url";
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
import { DemoMode } from "./demo-mode";
import { DeepShareControls } from "./deep-share-controls";
import { ProfileSetup } from "./profile-setup";

const PROFILE_STORAGE_KEY = "event-icebreaker.profile.v1";
const SETTINGS_STORAGE_KEY = "event-icebreaker.settings.v1";
const PRIVATE_SESSION_STORAGE_KEY = "event-icebreaker.private-session.v1";
const AGENT_SESSION_STORAGE_KEY = "event-icebreaker.agent-session.v1";
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

type StoredPrivateSession = {
  sessionToken: string;
  revokeToken: string;
  decryptionKey: string;
  expiresAt: number;
  quickPayload: string;
};

type StoredAgentSession = {
  sessionToken: string;
  revokeToken: string;
  expiresAt: number;
  quickPayload: string;
};

async function revokeStoredSession(
  value: string,
  endpoint: "deep-sessions" | "agent-profiles",
): Promise<boolean> {
  try {
    const session = JSON.parse(value) as StoredPrivateSession | StoredAgentSession;
    const sessionToken = validateSessionToken(session.sessionToken);
    const revokeToken = validateRevokeToken(session.revokeToken);
    const response = await fetch(`/api/${endpoint}/${sessionToken}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ revokeToken }),
    });
    return response.ok;
  } catch {
    // Revocation is best-effort; every session still expires automatically.
    return false;
  }
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Some mobile browsers expose Clipboard API without granting it.
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

async function createTemporarySession(
  endpoint: "/api/deep-sessions" | "/api/agent-profiles",
  body: Record<string, unknown>,
): Promise<Response> {
  const request = () =>
    fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const response = await request();
  return response.status >= 500 ? request() : response;
}

export function VisualCard({ profile }: { profile: SharedProfile }) {
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

export function CopyButton({
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
      disabled={!value}
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}

export function DownloadCardButton({ profile }: { profile: SharedProfile }) {
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

function OpennessControl({
  settings,
  onChange,
}: {
  settings: ShareSettings;
  onChange: (settings: ShareSettings) => void;
}) {
  return (
    <div className="share-control wizard-control">
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
  );
}

function IntentControl({
  settings,
  onChange,
}: {
  settings: ShareSettings;
  onChange: (settings: ShareSettings) => void;
}) {
  return (
    <div className="share-control wizard-control">
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
  );
}

function SparkControl({
  settings,
  onChange,
}: {
  settings: ShareSettings;
  onChange: (settings: ShareSettings) => void;
}) {
  return (
    <label className="toggle-row wizard-toggle">
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
  );
}

export type SenderPage = "home" | "quick" | "deep" | "profile";

function SenderMode({ page }: { page: SenderPage }) {
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
  const [deepProfile, setDeepProfile] = useState<DeepProfile | null>(null);
  const [deepPreferences, setDeepPreferences] =
    useState<DeepSharePreferences>(() =>
      createDefaultDeepSharePreferences(
        createDefaultDeepProfile(SAMPLE_PROFILE),
      ),
    );
  const [shareUrl, setShareUrl] = useState("");
  const [saveState, setSaveState] = useState("Stefano profile ready");
  const [sessionStatus, setSessionStatus] = useState("Quick Connect ready");
  const [activeSessionKind, setActiveSessionKind] = useState<
    "private" | "agent-readable" | null
  >(null);
  const shareFlow =
    page === "quick" || page === "deep" ? page : null;
  const totalSteps = page === "deep" ? 6 : 4;
  const [wizardStep, setWizardStep] = useState(0);
  const [shareReady, setShareReady] = useState(false);

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
        const savedDeepProfile = localStorage.getItem(DEEP_PROFILE_STORAGE_KEY);
        if (savedDeepProfile) {
          const nextDeepProfile = validateDeepProfile(
            JSON.parse(savedDeepProfile),
          );
          const savedDeepPreferences = localStorage.getItem(
            DEEP_SHARE_STORAGE_KEY,
          );
          const storedDeepPreferences = savedDeepPreferences
            ? validateDeepSharePreferences(JSON.parse(savedDeepPreferences))
            : createDefaultDeepSharePreferences(nextDeepProfile);
          const nextDeepPreferences =
            page === "deep" && storedDeepPreferences.mode === "quick"
              ? { ...storedDeepPreferences, mode: "private" as const }
              : storedDeepPreferences;
          setDeepProfile(nextDeepProfile);
          setDeepPreferences(nextDeepPreferences);

          const storedSession = localStorage.getItem(
            PRIVATE_SESSION_STORAGE_KEY,
          );
          if (
            storedSession &&
            nextDeepPreferences.mode === "private"
          ) {
            const session = JSON.parse(
              storedSession,
            ) as StoredPrivateSession;
            if (
              Number.isInteger(session.expiresAt) &&
              session.expiresAt > Date.now()
            ) {
              const sessionToken = validateSessionToken(
                session.sessionToken,
              );
              validateRevokeToken(session.revokeToken);
              setShareUrl(
                createHybridShareUrl({
                  origin: window.location.origin,
                  sessionToken,
                  quickPayload: session.quickPayload,
                  accessMode: "private",
                  decryptionKey: session.decryptionKey,
                }),
              );
              setSessionStatus("Private Deep session restored");
              setActiveSessionKind("private");
            }
          }

          const storedAgentSession = localStorage.getItem(
            AGENT_SESSION_STORAGE_KEY,
          );
          if (
            storedAgentSession &&
            nextDeepPreferences.mode === "agent-readable"
          ) {
            const session = JSON.parse(
              storedAgentSession,
            ) as StoredAgentSession;
            if (
              Number.isInteger(session.expiresAt) &&
              session.expiresAt > Date.now()
            ) {
              const sessionToken = validateSessionToken(session.sessionToken);
              validateRevokeToken(session.revokeToken);
              setShareUrl(
                createHybridShareUrl({
                  origin: window.location.origin,
                  sessionToken,
                  quickPayload: session.quickPayload,
                  accessMode: "agent-readable",
                }),
              );
              setSessionStatus("AI-readable session restored");
              setActiveSessionKind("agent-readable");
            }
          }
        }
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
    setShareReady(false);
    setShareUrl("");
  }

  function updateDeepPreferences(next: DeepSharePreferences) {
    setDeepPreferences(next);
    localStorage.setItem(DEEP_SHARE_STORAGE_KEY, JSON.stringify(next));
    setShareReady(false);
    setShareUrl("");
  }

  async function generateShare() {
    if (!shareFlow) return;
    const nextShared = createSharedProfile(profile, settings);
    const quickPayload = encodePayload(nextShared);
    setGenerated(nextShared);
    let nextShareUrl = `${window.location.origin}/receive#${quickPayload}`;
    setSessionStatus("Preparing share…");

    if (
      shareFlow === "deep" &&
      deepProfile &&
      deepPreferences.mode === "private"
    ) {
      try {
        const snapshot = createDeepSnapshot(deepProfile, {
          openness: settings.openness,
          intent: settings.intent,
          includedSectionIds: deepPreferences.includedSectionIds,
          includeSocialLinks: deepPreferences.includeSocialLinks,
          includeContactLinks: deepPreferences.includeContactLinks,
        });
        const encrypted = await encryptDeepSnapshot(snapshot);
        const expiresAt = calculateDeepExpiry(deepPreferences.expiry).getTime();
        const response = await createTemporarySession("/api/deep-sessions", {
          envelope: encrypted.envelope,
          expiresAt,
        });
        if (!response.ok) throw new Error("Deep session unavailable.");
        const created = (await response.json()) as Record<string, unknown>;
        const sessionToken = validateSessionToken(created.sessionToken);
        const revokeToken = validateRevokeToken(created.revokeToken);
        if (created.expiresAt !== expiresAt) {
          throw new Error("Deep session expiry mismatch.");
        }
        nextShareUrl = createHybridShareUrl({
          origin: window.location.origin,
          sessionToken,
          quickPayload,
          accessMode: "private",
          decryptionKey: encrypted.decryptionKey,
        });

        const previous = localStorage.getItem(PRIVATE_SESSION_STORAGE_KEY);
        localStorage.setItem(
          PRIVATE_SESSION_STORAGE_KEY,
          JSON.stringify({
            sessionToken,
            revokeToken,
            decryptionKey: encrypted.decryptionKey,
            expiresAt,
            quickPayload,
          } satisfies StoredPrivateSession),
        );
        if (previous) void revokeStoredSession(previous, "deep-sessions");
        const previousAgent = localStorage.getItem(AGENT_SESSION_STORAGE_KEY);
        if (previousAgent) {
          localStorage.removeItem(AGENT_SESSION_STORAGE_KEY);
          void revokeStoredSession(previousAgent, "agent-profiles");
        }
        setActiveSessionKind("private");
        setSessionStatus(
          `Private Deep ready · expires ${new Date(expiresAt).toLocaleString()}`,
        );
      } catch {
        setSessionStatus("Deep unavailable · Quick Connect fallback ready");
      }
    } else if (
      shareFlow === "deep" &&
      deepPreferences.mode === "agent-readable"
    ) {
      try {
        if (!deepPreferences.agentReadableAccepted) {
          throw new Error("AI-readable privacy exception not accepted.");
        }
        if (!deepProfile) throw new Error("No Deep profile.");
        const snapshot = createDeepSnapshot(deepProfile, {
          openness: settings.openness,
          intent: settings.intent,
          includedSectionIds: deepPreferences.includedSectionIds,
          includeSocialLinks: deepPreferences.includeSocialLinks,
          includeContactLinks: deepPreferences.includeContactLinks,
        });
        const expiresAt = calculateDeepExpiry(deepPreferences.expiry).getTime();
        const response = await createTemporarySession("/api/agent-profiles", {
          snapshot,
          expiresAt,
          readableStorageAccepted: true,
        });
        if (!response.ok) throw new Error("AI-readable session unavailable.");
        const created = (await response.json()) as Record<string, unknown>;
        const sessionToken = validateSessionToken(created.sessionToken);
        const revokeToken = validateRevokeToken(created.revokeToken);
        if (created.expiresAt !== expiresAt) {
          throw new Error("AI-readable session expiry mismatch.");
        }
        nextShareUrl = createHybridShareUrl({
          origin: window.location.origin,
          sessionToken,
          quickPayload,
          accessMode: "agent-readable",
        });

        const previous = localStorage.getItem(AGENT_SESSION_STORAGE_KEY);
        localStorage.setItem(
          AGENT_SESSION_STORAGE_KEY,
          JSON.stringify({
            sessionToken,
            revokeToken,
            expiresAt,
            quickPayload,
          } satisfies StoredAgentSession),
        );
        if (previous) void revokeStoredSession(previous, "agent-profiles");
        const previousPrivate = localStorage.getItem(
          PRIVATE_SESSION_STORAGE_KEY,
        );
        if (previousPrivate) {
          localStorage.removeItem(PRIVATE_SESSION_STORAGE_KEY);
          void revokeStoredSession(previousPrivate, "deep-sessions");
        }
        setActiveSessionKind("agent-readable");
        setSessionStatus(
          `AI-readable Deep ready · expires ${new Date(expiresAt).toLocaleString()}`,
        );
      } catch {
        setSessionStatus(
          "AI-readable Deep unavailable · Quick Connect fallback ready",
        );
      }
    } else {
      const sessions = [
        {
          key: PRIVATE_SESSION_STORAGE_KEY,
          endpoint: "deep-sessions" as const,
        },
        {
          key: AGENT_SESSION_STORAGE_KEY,
          endpoint: "agent-profiles" as const,
        },
      ];
      for (const session of sessions) {
        const stored = localStorage.getItem(session.key);
        if (stored) {
          localStorage.removeItem(session.key);
          void revokeStoredSession(stored, session.endpoint);
        }
      }
      setActiveSessionKind(null);
      setSessionStatus("Quick Connect ready");
    }

    setShareUrl(nextShareUrl);
    setShareReady(true);
    setWizardStep(totalSteps - 1);
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

  async function revokeDeepAccess() {
    if (!activeSessionKind) return;
    const storageKey =
      activeSessionKind === "private"
        ? PRIVATE_SESSION_STORAGE_KEY
        : AGENT_SESSION_STORAGE_KEY;
    const endpoint =
      activeSessionKind === "private" ? "deep-sessions" : "agent-profiles";
    const stored = localStorage.getItem(storageKey);
    if (stored) await revokeStoredSession(stored, endpoint);
    localStorage.removeItem(storageKey);
    setActiveSessionKind(null);
    setShareUrl(`${window.location.origin}/receive#${encodedPayload}`);
    setSessionStatus("Deep access revoked · Quick Connect ready");
  }

  if (page === "home") {
    return (
      <main className="sender-home">
        <SiteHeader mode="sender" />
        <section className="sender-choice shell">
          <div className="sender-choice__intro">
            <p className="eyebrow">CHOOSE YOUR NEXT MOVE</p>
            <h1>Skip the small talk.</h1>
            <p>What would you like the other person to receive?</p>
          </div>
          <div className="share-path-grid">
            <a href="/send/icebreaker">
              <span className="share-path-number">01</span>
              <span>
                <strong>Send an Icebreaker</strong>
                <small>
                  A fast Visual Card with conversation context. Four short
                  steps.
                </small>
              </span>
              <span className="share-path-arrow">→</span>
            </a>
            <a href="/send/deep">
              <span className="share-path-number">02</span>
              <span>
                <strong>Send a Deep Connection Request</strong>
                <small>
                  A temporary, selective view of your Connection Story.
                </small>
              </span>
              <span className="share-path-arrow">→</span>
            </a>
          </div>
          <div className="sender-choice__utility">
            <span>Your saved profile stays on this device.</span>
            <a href="/profile/setup">Edit Icebreaker profile</a>
            <a href="/deep/setup">Edit Connection Story</a>
          </div>
        </section>
        <SiteFooter />
      </main>
    );
  }

  if (page === "profile") {
    return (
      <main>
        <SiteHeader mode="sender" />
        <section className="profile-editor-page shell compact-builder">
          <a className="wizard-back-link" href="/">
            ← Back to send options
          </a>
          <ProfileSetup
            profile={profile}
            onChange={updateProfile}
            onFinish={() => {
              window.location.href = "/send/icebreaker";
            }}
            saveState={saveState}
          />
        </section>
        <SiteFooter />
      </main>
    );
  }

  if (page === "deep" && !deepProfile) {
    return (
      <main>
        <SiteHeader mode="sender" />
        <section className="wizard-page shell">
          <a className="wizard-back-link" href="/">
            ← Back
          </a>
          <div className="wizard-card wizard-card--empty">
            <p className="step-label">DEEP CONNECTION SETUP</p>
            <h1>Create your Connection Story first.</h1>
            <p>
              Deep requests can only share sections you have written and
              explicitly approved.
            </p>
            <a className="button button--primary" href="/deep/setup">
              Create my Connection Story →
            </a>
          </div>
        </section>
        <SiteFooter />
      </main>
    );
  }

  const quickTitles = [
    "How much would you like to share?",
    "What kind of connection is this?",
    "Review your Icebreaker.",
    "Show this QR for them to scan.",
  ];
  const deepTitles = [
    "How much should the first impression reveal?",
    "How should the deeper story open?",
    "Which parts of your story can they see?",
    "Should links travel, and for how long?",
    "Review exactly what they can unlock.",
    "Show this QR for them to scan.",
  ];
  const titles = page === "deep" ? deepTitles : quickTitles;
  const reviewProfile = createSharedProfile(profile, settings);
  const isReviewStep =
    (page === "quick" && wizardStep === 2) ||
    (page === "deep" && wizardStep === 4);
  const isQrStep = wizardStep === totalSteps - 1;
  const canGenerate =
    Boolean(profile.name.trim()) &&
    Boolean(shareFlow) &&
    (page !== "deep" || Boolean(deepProfile)) &&
    (page !== "deep" ||
      deepPreferences.mode !== "agent-readable" ||
      deepPreferences.agentReadableAccepted);

  function previousStep() {
    setShareReady(false);
    setWizardStep((current) => Math.max(0, current - 1));
  }

  return (
    <main className="wizard-layout">
      <SiteHeader mode="sender" />
      <section className="wizard-page shell">
        <div className="wizard-topline">
          <a className="wizard-back-link" href="/">
            ← Cancel
          </a>
          <span>
            Step {wizardStep + 1} of {totalSteps}
          </span>
        </div>
        <div
          className="wizard-progress"
          aria-label={`Step ${wizardStep + 1} of ${totalSteps}`}
        >
          {Array.from({ length: totalSteps }, (_, index) => (
            <span
              className={index <= wizardStep ? "is-active" : ""}
              key={index}
            />
          ))}
        </div>
        <article className="wizard-card">
          <header className="wizard-card__header">
            <p className="step-label">
              {page === "deep"
                ? "SEND A DEEP CONNECTION REQUEST"
                : "SEND AN ICEBREAKER"}
            </p>
            <h1>{titles[wizardStep]}</h1>
          </header>
          <div className="wizard-card__body">
            {wizardStep === 0 && (
              <OpennessControl
                settings={settings}
                onChange={updateSettings}
              />
            )}
            {page === "quick" && wizardStep === 1 && (
              <IntentControl settings={settings} onChange={updateSettings} />
            )}
            {page === "quick" && wizardStep === 2 && (
              <div className="wizard-review">
                <SparkControl settings={settings} onChange={updateSettings} />
                <VisualCard profile={reviewProfile} />
                <a className="text-link" href="/profile/setup">
                  Edit my saved profile →
                </a>
              </div>
            )}
            {page === "deep" && wizardStep === 1 && (
              <DeepShareControls
                profile={deepProfile}
                quickSettings={settings}
                preferences={deepPreferences}
                onChange={updateDeepPreferences}
                stage="mode"
              />
            )}
            {page === "deep" && wizardStep === 2 && (
              <DeepShareControls
                profile={deepProfile}
                quickSettings={settings}
                preferences={deepPreferences}
                onChange={updateDeepPreferences}
                stage="content"
              />
            )}
            {page === "deep" && wizardStep === 3 && (
              <DeepShareControls
                profile={deepProfile}
                quickSettings={settings}
                preferences={deepPreferences}
                onChange={updateDeepPreferences}
                stage="access"
              />
            )}
            {page === "deep" && wizardStep === 4 && (
              <DeepShareControls
                profile={deepProfile}
                quickSettings={settings}
                preferences={deepPreferences}
                onChange={updateDeepPreferences}
                stage="review"
              />
            )}
            {isQrStep && shareReady && (
              <div className="wizard-qr">
                <div className="qr-frame">
                  <QRCode
                    value={shareUrl}
                    size={256}
                    level="M"
                    bgColor="#ffffff"
                    fgColor="#101114"
                    aria-label="QR code for this Icebreaker profile"
                  />
                </div>
                <p className="payload-meter">{sessionStatus}</p>
                <div className="button-row">
                  <button
                    className="button button--primary"
                    type="button"
                    onClick={shareProfile}
                  >
                    Share profile
                  </button>
                  <CopyButton label="Copy link" value={shareUrl} />
                  {activeSessionKind && (
                    <button
                      className="button button--quiet"
                      type="button"
                      onClick={() => void revokeDeepAccess()}
                    >
                      Revoke Deep access
                    </button>
                  )}
                </div>
                <details className="wizard-backup">
                  <summary>Backup sharing options</summary>
                  <code>{shareUrl}</code>
                  <CopyButton
                    label="Copy Connection String"
                    value={connectionString}
                    variant="quiet"
                  />
                </details>
              </div>
            )}
          </div>
          {!isQrStep && (
            <footer className="wizard-actions">
              <button
                className="button button--quiet"
                type="button"
                onClick={previousStep}
                disabled={wizardStep === 0}
              >
                Back
              </button>
              {isReviewStep ? (
                <button
                  className="button button--primary"
                  type="button"
                  onClick={() => void generateShare()}
                  disabled={!canGenerate}
                >
                  Generate QR to scan →
                </button>
              ) : (
                <button
                  className="button button--primary"
                  type="button"
                  onClick={() => setWizardStep((current) => current + 1)}
                >
                  Continue →
                </button>
              )}
            </footer>
          )}
        </article>
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
    const timer = window.setTimeout(() => {
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

export function SiteHeader({ mode }: { mode: "sender" | "receiver" }) {
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

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell site-footer__inner">
        <p>
          <span>⚡ Event Icebreaker</span>
          <br />
          Conversation context, carried by you.
        </p>
        <p>
          No accounts. No analytics. Temporary Deep sessions expire.
          <br />
          You choose exactly what leaves your device.
        </p>
      </div>
    </footer>
  );
}

export function IcebreakerApp({
  mode,
  page = "home",
}: {
  mode: "sender" | "receiver";
  page?: SenderPage;
}) {
  return mode === "receiver" ? <ReceiverMode /> : <SenderMode page={page} />;
}
