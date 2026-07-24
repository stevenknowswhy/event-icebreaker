"use client";

import Link from "next/link";
import { useMemo } from "react";

import {
  createDeepSnapshot,
  type DeepConnectionMode,
  type DeepProfile,
  type DeepSharePreferences,
} from "../lib/deep-profile";
import type { ShareSettings } from "../lib/icebreaker";
import {
  DEEP_SECTION_LABELS,
  DeepProfilePage,
} from "./deep-profile-page";

const MODE_COPY: Record<
  DeepConnectionMode,
  { label: string; description: string }
> = {
  quick: {
    label: "Quick only",
    description: "The current card and conversation starters. No session.",
  },
  private: {
    label: "Private Deep",
    description: "Encrypted Connection Story with a temporary session.",
  },
  "agent-readable": {
    label: "AI-readable",
    description: "Temporary readable link. Anyone with it can access it.",
  },
};
const DEEP_MODES: DeepConnectionMode[] = ["private", "agent-readable"];

export function DeepShareControls({
  profile,
  quickSettings,
  preferences,
  onChange,
  stage,
}: {
  profile: DeepProfile | null;
  quickSettings: ShareSettings;
  preferences: DeepSharePreferences;
  onChange: (next: DeepSharePreferences) => void;
  stage: "mode" | "content" | "access" | "review";
}) {
  const preview = useMemo(() => {
    if (!profile || preferences.mode === "quick") return null;
    try {
      return createDeepSnapshot(profile, {
        openness: quickSettings.openness,
        intent: quickSettings.intent,
        includedSectionIds: preferences.includedSectionIds,
        includeSocialLinks: preferences.includeSocialLinks,
        includeContactLinks: preferences.includeContactLinks,
      });
    } catch {
      return null;
    }
  }, [preferences, profile, quickSettings.intent, quickSettings.openness]);

  if (!profile) {
    return (
      <article className="deep-share-panel deep-share-panel--empty">
        <div>
          <p className="step-label">DEEP CONNECT</p>
          <h2>Quick Connect is ready.</h2>
          <p>
            Create a separate Personal Wiki before adding an encrypted deeper
            story to this QR.
          </p>
        </div>
        <Link className="button button--secondary" href="/deep/setup">
          Create my Connection Story
        </Link>
      </article>
    );
  }

  function update(patch: Partial<DeepSharePreferences>) {
    onChange({ ...preferences, ...patch });
  }

  function toggleSection(id: (typeof profile.sections)[number]["id"]) {
    const included = preferences.includedSectionIds.includes(id);
    update({
      includedSectionIds: included
        ? preferences.includedSectionIds.filter((item) => item !== id)
        : [...preferences.includedSectionIds, id],
    });
  }

  return (
    <article className="deep-share-panel">
      <div className="deep-share-panel__utility">
        <p>
          {quickSettings.openness} openness · {quickSettings.intent} intent
        </p>
        <Link className="text-link" href="/deep/setup">
          Edit Personal Wiki →
        </Link>
      </div>

      {stage === "mode" && (
        <div className="deep-mode-grid">
          {DEEP_MODES.map((mode) => (
            <button
              className={preferences.mode === mode ? "is-active" : ""}
              type="button"
              key={mode}
              aria-pressed={preferences.mode === mode}
              onClick={() =>
                update({
                  mode,
                  ...(mode === "agent-readable" &&
                  preferences.mode !== "agent-readable"
                    ? { agentReadableAccepted: false }
                    : {}),
                })
              }
            >
              <strong>{MODE_COPY[mode].label}</strong>
              <span>{MODE_COPY[mode].description}</span>
            </button>
          ))}
        </div>
      )}

      {stage === "content" && (
        <fieldset>
          <legend>Approved sections for this share</legend>
          <div className="deep-section-checks">
            {profile.sections.map((section) => (
              <label
                className={!section.approved ? "is-unavailable" : ""}
                key={section.id}
              >
                <input
                  type="checkbox"
                  checked={preferences.includedSectionIds.includes(section.id)}
                  disabled={!section.approved}
                  onChange={() => toggleSection(section.id)}
                />
                <span>{DEEP_SECTION_LABELS[section.id]}</span>
                <small>{section.minOpenness}+</small>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {stage === "access" && (
        <>
          {preferences.mode === "agent-readable" && (
            <div className="deep-privacy-warning" role="note">
              <strong>Privacy exception</strong>
              <span>
                This stores the filtered snapshot in readable form until the
                link expires.
              </span>
              <label className="agent-readable-consent">
                <input
                  type="checkbox"
                  checked={preferences.agentReadableAccepted}
                  onChange={(event) =>
                    update({ agentReadableAccepted: event.target.checked })
                  }
                />
                <span>
                  I understand anyone or any AI with this temporary link can
                  read the approved preview until it expires or I revoke it.
                </span>
              </label>
            </div>
          )}
          <div className="deep-category-toggles">
            <label className="toggle-row toggle-row--compact">
              <span>
                <strong>Social links</strong>
                <small>Off unless you explicitly include them</small>
              </span>
              <input
                type="checkbox"
                checked={preferences.includeSocialLinks}
                onChange={(event) =>
                  update({ includeSocialLinks: event.target.checked })
                }
              />
            </label>
            <label className="toggle-row toggle-row--compact">
              <span>
                <strong>Contact links</strong>
                <small>Off unless you explicitly include them</small>
              </span>
              <input
                type="checkbox"
                checked={preferences.includeContactLinks}
                onChange={(event) =>
                  update({ includeContactLinks: event.target.checked })
                }
              />
            </label>
            <label className="deep-expiry">
              <span>Deep access expires</span>
              <select
                value={preferences.expiry}
                onChange={(event) =>
                  update({
                    expiry: event.target
                      .value as DeepSharePreferences["expiry"],
                  })
                }
              >
                <option value="one-hour">In one hour</option>
                <option value="tonight">End of today</option>
                <option value="seven-days">In seven days</option>
              </select>
            </label>
          </div>
        </>
      )}

      {stage === "review" && (
        <div className="deep-disclosure-preview deep-disclosure-preview--open">
          <div className="deep-review-count">
            Exact disclosure · {preview?.sections.length ?? 0} sections ·{" "}
            {preview?.links?.length ?? 0} links
          </div>
          {preview ? (
            <DeepProfilePage snapshot={preview} preview />
          ) : (
            <p>
              No approved sections match these openness, intent, and category
              settings.
            </p>
          )}
        </div>
      )}
    </article>
  );
}
