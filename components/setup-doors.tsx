"use client";

import { useEffect, useMemo, useState } from "react";

import type { FullProfile } from "../lib/icebreaker";
import {
  SPEED_SETUP_FIELD_LABELS,
  checkSpeedSetupGuardrails,
  createSpeedSetupPrompt,
  parseSpeedSetupPaste,
  type GuardrailVerdicts,
  type SpeedSetupFieldId,
  type SpeedSetupParseFailure,
  type SpeedSetupWarning,
} from "../lib/speed-setup";
import { CopyButton } from "./copy-button";
import { ProfileSetup } from "./profile-setup";
import { useGuardrailAdvisories } from "./use-guardrail-advisories";

type DoorView = "doors" | "speed" | "review" | "wizard";

const SPEED_FIELD_IDS: readonly SpeedSetupFieldId[] = [
  "name",
  "role",
  "spark",
  "sparkDetails",
  "canHelp",
  "lookingFor",
  "interests",
  "values",
  "communicationStyle",
  "funFact",
];

const EXPECTED_KEYS_LINE =
  "NAME · ROLE · SPARK · SPARK_DETAILS · CAN_HELP · LOOKING_FOR · INTERESTS · VALUES · COMMUNICATION_STYLE · FUN_FACT";

const DROPPED_CONTACT_KEY =
  /MAIL|PHONE|LINKEDIN|WEBSITE|URL|HANDLE|CONTACT|TWITTER|GITHUB|INSTAGRAM|FACEBOOK|SLACK|DISCORD|TELEGRAM|CALENDLY/i;

/**
 * The two setup doors (blueprint item 4): speed setup with the user's own AI
 * is the primary door, the five-question wizard the fallback. Both feed the
 * same FullProfile schema and storage; the speed path stages the parsed
 * draft and writes nothing until the wizard review confirms it.
 */
export function SetupDoors({
  profile,
  onProfileChange,
  onCommitProfile,
  onFinishWizard,
  saveState,
}: {
  profile: FullProfile;
  onProfileChange: <K extends keyof FullProfile>(
    key: K,
    value: FullProfile[K],
  ) => void;
  onCommitProfile: (next: FullProfile) => void;
  onFinishWizard: () => void;
  saveState: string;
}) {
  const [view, setView] = useState<DoorView>("doors");
  const [staged, setStaged] = useState<FullProfile | null>(null);
  const [patternWarnings, setPatternWarnings] = useState<SpeedSetupWarning[]>(
    [],
  );
  const [sidecarWarnings, setSidecarWarnings] = useState<SpeedSetupWarning[]>(
    [],
  );
  const [droppedKeys, setDroppedKeys] = useState<string[]>([]);
  const [parseFailure, setParseFailure] =
    useState<SpeedSetupParseFailure | null>(null);
  const [paste, setPaste] = useState("");
  const prompt = useMemo(() => createSpeedSetupPrompt(), []);
  // Save-time guardrails for the wizard door only — the speed path runs its
  // own ingest checks before review (blueprint item 5).
  const wizardAdvisories = useGuardrailAdvisories(profile, view === "wizard");

  function clearStaged() {
    setStaged(null);
    setPatternWarnings([]);
    setSidecarWarnings([]);
    setDroppedKeys([]);
  }

  function openSpeed() {
    setParseFailure(null);
    setPaste("");
    clearStaged();
    setView("speed");
  }

  function openWizard() {
    setParseFailure(null);
    clearStaged();
    setView("wizard");
  }

  // Cancel at any point returns to the doors with nothing written.
  function cancelToDoors() {
    setParseFailure(null);
    setPaste("");
    clearStaged();
    setView("doors");
  }

  function stageChange<K extends keyof FullProfile>(
    key: K,
    value: FullProfile[K],
  ) {
    setStaged((current) => (current ? { ...current, [key]: value } : current));
  }

  function handleParse() {
    const result = parseSpeedSetupPaste(paste);
    if (!result.ok) {
      setParseFailure(result);
      return;
    }
    setParseFailure(null);
    clearStaged();
    setStaged(result.profile);
    setPatternWarnings(result.warnings);
    setDroppedKeys(result.droppedKeys);
    setView("review");
  }

  function commitStaged() {
    if (!staged) return;
    const next = staged;
    setParseFailure(null);
    setPaste("");
    clearStaged();
    onCommitProfile(next);
    setView("wizard");
  }

  // Ingest guardrails: advisory sidecar judgments on the staged draft, merged
  // into the review notes when they arrive. Unreachable sidecar → null →
  // silently skipped, per the degradation contract.
  useEffect(() => {
    if (view !== "review" || !staged) return;

    const fields: Record<string, string> = {};
    for (const fieldId of SPEED_FIELD_IDS) {
      const value = staged[fieldId];
      const text = Array.isArray(value) ? value.join(", ") : value;
      if (text?.trim()) fields[fieldId] = text;
    }

    let cancelled = false;
    void checkSpeedSetupGuardrails(fields).then((verdicts) => {
      if (cancelled || !verdicts) return;
      setSidecarWarnings(verdictWarnings(verdicts));
    });
    return () => {
      cancelled = true;
    };
  }, [view, staged]);

  if (view === "wizard") {
    return (
      <ProfileSetup
        profile={profile}
        onChange={onProfileChange}
        advisories={wizardAdvisories}
        onFinish={onFinishWizard}
        saveState={saveState}
        onBack={cancelToDoors}
      />
    );
  }

  if (view === "review" && staged) {
    const warnings = [...patternWarnings, ...sidecarWarnings];
    return (
      <section className="panel setup-panel" aria-labelledby="setup-heading">
        <div className="panel-heading">
          <div>
            <p className="step-label">REVIEW YOUR AI DRAFT</p>
            <h2 id="setup-heading">Make it yours, then confirm.</h2>
          </div>
          <span className="save-status">Review only — nothing saved yet</span>
        </div>

        {warnings.length > 0 || droppedKeys.length > 0 ? (
          <aside className="setup-advisories" aria-label="Draft review notes">
            <h3>Before you confirm</h3>
            <ul>
              {warnings.map((warning, index) => (
                <li key={`${warning.fieldId}-${warning.kind}-${index}`}>
                  <strong>{SPEED_SETUP_FIELD_LABELS[warning.fieldId]}</strong>
                  {" — "}
                  {warning.message}
                </li>
              ))}
              {droppedKeys.length > 0 ? (
                <li>
                  <strong>Ignored keys</strong>
                  {" — "}
                  {droppedKeys.join(", ")}.{" "}
                  {droppedKeys.some((key) => DROPPED_CONTACT_KEY.test(key))
                    ? "Contact-looking keys were dropped: profiles never carry contact details."
                    : "Your profile keeps only the fields the card uses."}
                </li>
              ) : null}
            </ul>
          </aside>
        ) : null}

        <ProfileSetup
          profile={staged}
          onChange={stageChange}
          onFinish={commitStaged}
          saveState="Review only — nothing saved yet"
          finishLabel="Confirm and save my profile"
        />

        <div className="speed-review__footer">
          <button
            className="button button--quiet"
            type="button"
            onClick={cancelToDoors}
          >
            Cancel review
          </button>
        </div>
      </section>
    );
  }

  if (view === "speed") {
    return (
      <section className="panel setup-panel" aria-labelledby="setup-heading">
        <div className="panel-heading">
          <div>
            <p className="step-label">SPEED SETUP · YOUR AI KNOWS YOU</p>
            <h2 id="setup-heading">Let your AI introduce you.</h2>
          </div>
          <span className="save-status">Nothing saved until you confirm</span>
        </div>

        <ol className="speed-steps">
          <li>Copy the prompt below.</li>
          <li>
            Paste it into your own AI — ChatGPT, Claude, Gemini, or any chat
            you trust — and play the test-yourself game until the draft sounds
            like you.
          </li>
          <li>
            Copy its final block and paste it below. The app reads it on this
            device and never calls an AI itself.
          </li>
        </ol>

        <div className="button-row">
          <CopyButton
            label="Copy the prompt"
            value={prompt}
            variant="primary"
          />
        </div>
        <details className="prompt-preview">
          <summary>Preview the prompt</summary>
          <pre>{prompt}</pre>
        </details>

        <label className="manual-paste speed-paste">
          <span>Paste your profile block</span>
          <textarea
            rows={9}
            value={paste}
            onChange={(event) => setPaste(event.target.value)}
            placeholder={
              "NAME: Ada Lovelace\nROLE: …\nSPARK: …\nLOOKING_FOR: …\nINTERESTS: …"
            }
          />
          <small>
            Untrusted input, read locally: fields are validated and capped, and
            unknown keys are dropped before you review anything.
          </small>
        </label>

        {parseFailure ? (
          <div
            className="setup-advisories setup-advisories--error"
            role="alert"
          >
            <h3>That paste didn’t read as a profile.</h3>
            <p>{parseFailure.message}</p>
            <p>Expected keys: {EXPECTED_KEYS_LINE}.</p>
            <div className="button-row">
              <button
                className="button button--secondary"
                type="button"
                onClick={openWizard}
              >
                Use the five-step form instead
              </button>
            </div>
          </div>
        ) : null}

        <div className="setup-actions">
          <button
            className="button button--quiet"
            type="button"
            onClick={cancelToDoors}
          >
            Back to setup options
          </button>
          <button
            className="button button--primary"
            type="button"
            onClick={handleParse}
            disabled={!paste.trim()}
          >
            Read my profile block
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="panel setup-panel" aria-labelledby="setup-heading">
      <div className="panel-heading">
        <div>
          <p className="step-label">SET UP YOUR CARD</p>
          <h2 id="setup-heading">Make the card yours.</h2>
        </div>
        <span className="save-status">{saveState}</span>
      </div>

      <div className="setup-doors">
        <article className="door-card door-card--primary">
          <p className="step-label">FASTEST · ABOUT A MINUTE</p>
          <h3>Let your AI introduce you.</h3>
          <p>
            Copy one prompt into ChatGPT, Claude, or Gemini. Your AI drafts the
            profile, you correct it, then paste the result back for a quick
            review — nothing is saved until you confirm.
          </p>
          <button
            className="button button--primary"
            type="button"
            onClick={openSpeed}
          >
            Start with your AI →
          </button>
        </article>
        <article className="door-card">
          <p className="step-label">FIVE QUESTIONS · NO AI</p>
          <h3>Build it with the form.</h3>
          <p>
            The classic five-question wizard, right here on this device —
            always here as the floor.
          </p>
          <button
            className="button button--secondary"
            type="button"
            onClick={openWizard}
          >
            Use the five-step form
          </button>
        </article>
      </div>
    </section>
  );
}

function verdictWarnings(verdicts: GuardrailVerdicts): SpeedSetupWarning[] {
  const warnings: SpeedSetupWarning[] = [];
  for (const fieldId of SPEED_FIELD_IDS) {
    const verdict = verdicts[fieldId];
    if (!verdict) continue;
    if (verdict.contact) {
      warnings.push({
        fieldId,
        kind: "contact",
        message:
          "looks like it contains contact details — edit it out before confirming.",
      });
    }
    if (verdict.tone) {
      warnings.push({
        fieldId,
        kind: "tone",
        message:
          "may read wrong in a professional room — consider softening it before you share.",
      });
    }
  }
  return warnings;
}
