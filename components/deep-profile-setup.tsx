"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  DEEP_PROFILE_STORAGE_KEY,
  createDefaultDeepProfile,
  createDeepSnapshot,
  validateDeepProfile,
  type DeepLinkKind,
  type DeepProfile,
  type DeepProfileSection,
  type DeepSectionId,
} from "../lib/deep-profile";
import {
  SAMPLE_PROFILE,
  migrateStoredProfile,
  type FullProfile,
  type Intent,
  type Openness,
} from "../lib/icebreaker";
import {
  DEEP_SECTION_LABELS,
  DeepProfilePage,
} from "./deep-profile-page";

const QUICK_STORAGE_KEY = "event-icebreaker.profile.v1";
const ALL_INTENTS: Intent[] = [
  "networking",
  "friendship",
  "dating",
  "general",
];
const OPENNESS_LEVELS: Openness[] = ["low", "medium", "high", "max"];

function parseHighlights(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

export function DeepProfileSetup() {
  const [profile, setProfile] = useState<DeepProfile>(() =>
    createDefaultDeepProfile(SAMPLE_PROFILE),
  );
  const [saveState, setSaveState] = useState("Stored only on this device");
  const [newLinkKind, setNewLinkKind] = useState<DeepLinkKind>("social");
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [linkError, setLinkError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      let quickProfile: FullProfile = SAMPLE_PROFILE;
      try {
        const storedQuick = localStorage.getItem(QUICK_STORAGE_KEY);
        if (storedQuick) {
          quickProfile = migrateStoredProfile(JSON.parse(storedQuick));
        }
        const storedDeep = localStorage.getItem(DEEP_PROFILE_STORAGE_KEY);
        const next = storedDeep
          ? validateDeepProfile(JSON.parse(storedDeep))
          : createDefaultDeepProfile(quickProfile);
        setProfile(next);
        if (!storedDeep) {
          localStorage.setItem(DEEP_PROFILE_STORAGE_KEY, JSON.stringify(next));
        }
        setSaveState("Saved on this device");
      } catch {
        const next = createDefaultDeepProfile(quickProfile);
        setProfile(next);
        localStorage.setItem(DEEP_PROFILE_STORAGE_KEY, JSON.stringify(next));
        setSaveState("Started a fresh local draft");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const preview = useMemo(() => {
    try {
      return {
        snapshot: createDeepSnapshot(profile, {
          openness: "max",
          intent: "networking",
          includedSectionIds: profile.sections.map((section) => section.id),
          includeSocialLinks: true,
          includeContactLinks: true,
        }),
        error: "",
      };
    } catch (caught) {
      return {
        snapshot: null,
        error:
          caught instanceof Error
            ? caught.message
            : "This Personal Wiki needs one more edit.",
      };
    }
  }, [profile]);

  function save(next: DeepProfile) {
    setProfile(next);
    localStorage.setItem(DEEP_PROFILE_STORAGE_KEY, JSON.stringify(next));
    setSaveState("Saved on this device");
  }

  function updateSection(
    id: DeepSectionId,
    patch: Partial<DeepProfileSection>,
  ) {
    save({
      ...profile,
      sections: profile.sections.map((section) =>
        section.id === id ? { ...section, ...patch } : section,
      ),
    });
  }

  function toggleIntent(section: DeepProfileSection, intent: Intent) {
    const includes = section.intents.includes(intent);
    const intents = includes
      ? section.intents.filter((item) => item !== intent)
      : [...section.intents, intent];
    if (intents.length) updateSection(section.id, { intents });
  }

  function addLink() {
    setLinkError("");
    try {
      const next: DeepProfile = {
        ...profile,
        links: [
          ...profile.links,
          {
            kind: newLinkKind,
            label: newLinkLabel.trim(),
            url: newLinkUrl.trim(),
            approved: true,
            minOpenness: "low",
            intents: [...ALL_INTENTS],
          },
        ],
      };
      save(validateDeepProfile(next));
      setNewLinkLabel("");
      setNewLinkUrl("");
    } catch (caught) {
      setLinkError(
        caught instanceof Error ? caught.message : "That link is invalid.",
      );
    }
  }

  return (
    <main className="deep-builder">
      <header className="deep-builder__header">
        <Link className="brand" href="/">
          <span className="brand__mark">⚡</span>
          <span>
            Event <strong>Icebreaker</strong>
          </span>
        </Link>
        <Link className="button button--quiet" href="/">
          Back to Quick Connect
        </Link>
      </header>

      <section className="shell deep-builder__intro">
        <p className="eyebrow">OPTIONAL DEEP CONNECT</p>
        <h1>Build your Connection Story.</h1>
        <p>
          Create a Personal Wiki for the people you intentionally want to know
          better. Created separately from your Quick Connect card.
        </p>
        <div className="trust-row">
          <span>◆ Local draft</span>
          <span>◆ Section-by-section approval</span>
          <span>◆ Nothing shared yet</span>
        </div>
      </section>

      <section className="shell deep-builder__workspace">
        <div className="deep-editor panel">
          <div className="panel-heading">
            <div>
              <p className="step-label">PERSONAL WIKI</p>
              <h2>Edit and approve your story.</h2>
            </div>
            <span className="save-status">{saveState}</span>
          </div>

          <label className="deep-owner">
            <span>Display name</span>
            <input
              value={profile.ownerName}
              maxLength={80}
              onChange={(event) =>
                save({ ...profile, ownerName: event.target.value })
              }
            />
          </label>

          <div className="deep-section-list">
            {profile.sections.map((section, index) => (
              <details key={section.id} open={index === 0}>
                <summary>
                  <span>
                    <strong>{DEEP_SECTION_LABELS[section.id]}</strong>
                    <small>{section.minOpenness} openness</small>
                  </span>
                  <span
                    className={
                      section.approved
                        ? "approval-status is-approved"
                        : "approval-status"
                    }
                  >
                    {section.approved ? "Approved" : "Draft"}
                  </span>
                </summary>
                <div className="deep-section-fields">
                  <label className="toggle-row toggle-row--compact">
                    <span>
                      <strong>Approved for sharing</strong>
                      <small>Still filtered again every time you share</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={section.approved}
                      onChange={(event) =>
                        updateSection(section.id, {
                          approved: event.target.checked,
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>Story</span>
                    <textarea
                      rows={5}
                      maxLength={2_000}
                      value={section.body}
                      onChange={(event) =>
                        updateSection(section.id, {
                          body: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>Highlights</span>
                    <input
                      value={section.highlights.join(", ")}
                      maxLength={1_600}
                      onChange={(event) =>
                        updateSection(section.id, {
                          highlights: parseHighlights(event.target.value),
                        })
                      }
                    />
                    <small>Up to eight, separated with commas.</small>
                  </label>
                  <label>
                    <span>Minimum openness</span>
                    <select
                      value={section.minOpenness}
                      onChange={(event) =>
                        updateSection(section.id, {
                          minOpenness: event.target.value as Openness,
                        })
                      }
                    >
                      {OPENNESS_LEVELS.map((level) => (
                        <option value={level} key={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  </label>
                  <fieldset>
                    <legend>Allowed connection intents</legend>
                    <div className="intent-checks">
                      {ALL_INTENTS.map((intent) => (
                        <label key={intent}>
                          <input
                            type="checkbox"
                            checked={section.intents.includes(intent)}
                            onChange={() => toggleIntent(section, intent)}
                          />
                          <span>{intent}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </div>
              </details>
            ))}
          </div>

          <section className="deep-links-editor">
            <div>
              <p className="step-label">SELECTED LINKS</p>
              <h3>Links remain a separate disclosure choice.</h3>
            </div>
            {profile.links.map((link, index) => (
              <div className="deep-link-row" key={`${link.url}-${index}`}>
                <span>
                  <strong>{link.label}</strong>
                  <small>
                    {link.kind} · {link.url}
                  </small>
                </span>
                <button
                  className="button button--quiet"
                  type="button"
                  onClick={() =>
                    save({
                      ...profile,
                      links: profile.links.filter(
                        (_item, itemIndex) => itemIndex !== index,
                      ),
                    })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <div className="deep-link-form">
              <select
                aria-label="Link kind"
                value={newLinkKind}
                onChange={(event) =>
                  setNewLinkKind(event.target.value as DeepLinkKind)
                }
              >
                <option value="social">Social</option>
                <option value="contact">Contact</option>
              </select>
              <input
                aria-label="Link label"
                placeholder="LinkedIn"
                maxLength={80}
                value={newLinkLabel}
                onChange={(event) => setNewLinkLabel(event.target.value)}
              />
              <input
                aria-label="Link URL"
                placeholder={
                  newLinkKind === "social"
                    ? "https://…"
                    : "mailto:you@example.com"
                }
                maxLength={500}
                value={newLinkUrl}
                onChange={(event) => setNewLinkUrl(event.target.value)}
              />
              <button
                className="button button--secondary"
                type="button"
                onClick={addLink}
                disabled={!newLinkLabel.trim() || !newLinkUrl.trim()}
              >
                Add link
              </button>
            </div>
            {linkError && <p className="form-error">{linkError}</p>}
          </section>
        </div>

        <aside className="deep-preview">
          <div className="deep-preview__heading">
            <p className="step-label">Preview as the receiver</p>
            <p>
              Max openness · Networking · all approved categories. Sharing
              controls will filter this again.
            </p>
          </div>
          {preview.snapshot ? (
            <DeepProfilePage snapshot={preview.snapshot} preview />
          ) : (
            <div className="deep-preview__error">
              <strong>Preview paused</strong>
              <p>{preview.error}</p>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
