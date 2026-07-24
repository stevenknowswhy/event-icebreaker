"use client";

import { useRef, useState } from "react";

import type { FullProfile } from "../lib/icebreaker";

const PERSONALITY_LABELS = [
  "Openness",
  "Conscientiousness",
  "Extraversion",
  "Agreeableness",
  "Neuroticism",
];

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function ProfileSetup({
  profile,
  onChange,
  onFinish,
  saveState,
}: {
  profile: FullProfile;
  onChange: <K extends keyof FullProfile>(
    key: K,
    value: FullProfile[K],
  ) => void;
  onFinish: () => void;
  saveState: string;
}) {
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);

  function move(next: number) {
    setStep(next);
    window.setTimeout(() => heading.current?.focus(), 0);
  }

  const steps = [
    {
      title: "Who are you?",
      copy: "Give people a useful first sentence—not a full résumé.",
      content: (
        <>
          <label>
            <span>Name</span>
            <input
              value={profile.name}
              maxLength={80}
              onChange={(event) => onChange("name", event.target.value)}
            />
          </label>
          <label>
            <span>Role or one-line identity</span>
            <input
              value={profile.role}
              maxLength={120}
              onChange={(event) => onChange("role", event.target.value)}
            />
          </label>
        </>
      ),
    },
    {
      title: "What has your attention?",
      copy: "Your Spark is the thread someone can pick up immediately.",
      content: (
        <>
          <label>
            <span>Current Spark</span>
            <input
              value={profile.spark}
              maxLength={160}
              onChange={(event) => onChange("spark", event.target.value)}
            />
          </label>
          <label>
            <span>One sentence of context</span>
            <textarea
              value={profile.sparkDetails}
              maxLength={360}
              rows={3}
              onChange={(event) =>
                onChange("sparkDetails", event.target.value)
              }
            />
          </label>
        </>
      ),
    },
    {
      title: "How can you help?",
      copy: "Make your practical value legible to the person across from you.",
      content: (
        <label>
          <span>I can help with…</span>
          <textarea
            value={profile.canHelp}
            maxLength={280}
            rows={4}
            onChange={(event) => onChange("canHelp", event.target.value)}
          />
        </label>
      ),
    },
    {
      title: "What are you looking for?",
      copy: "A specific ask gives the right person a reason to lean in.",
      content: (
        <label>
          <span>I’d like to meet…</span>
          <textarea
            value={profile.lookingFor}
            maxLength={280}
            rows={4}
            onChange={(event) => onChange("lookingFor", event.target.value)}
          />
        </label>
      ),
    },
    {
      title: "What makes you memorable?",
      copy: "A few human details turn a profile into a conversation.",
      content: (
        <>
          <label>
            <span>Interests</span>
            <input
              value={profile.interests.join(", ")}
              maxLength={420}
              onChange={(event) =>
                onChange("interests", parseList(event.target.value))
              }
            />
            <small>Separate with commas.</small>
          </label>
          <label>
            <span>Values</span>
            <input
              value={profile.values.join(", ")}
              maxLength={260}
              onChange={(event) =>
                onChange("values", parseList(event.target.value))
              }
            />
          </label>
          <label>
            <span>Communication style</span>
            <input
              value={profile.communicationStyle}
              maxLength={160}
              onChange={(event) =>
                onChange("communicationStyle", event.target.value)
              }
            />
          </label>
          <label>
            <span>Fun fact or invitation</span>
            <input
              value={profile.funFact}
              maxLength={220}
              onChange={(event) => onChange("funFact", event.target.value)}
            />
          </label>
        </>
      ),
    },
  ];

  const current = steps[step];

  return (
    <section className="panel setup-panel" aria-labelledby="setup-heading">
      <div className="panel-heading">
        <div>
          <p className="step-label">YOUR FIVE-QUESTION SETUP</p>
          <h2 id="setup-heading">Make the card yours.</h2>
        </div>
        <span className="save-status">{saveState}</span>
      </div>
      <div className="setup-progress" aria-label={`Question ${step + 1} of 5`}>
        {steps.map((item, index) => (
          <button
            className={index === step ? "is-active" : ""}
            type="button"
            key={item.title}
            onClick={() => move(index)}
            aria-label={`Question ${index + 1}: ${item.title}`}
          >
            <span>{index + 1}</span>
          </button>
        ))}
      </div>
      <div className="setup-question">
        <p className="setup-count">Question {step + 1} of 5</p>
        <h3 ref={heading} tabIndex={-1}>
          {current.title}
        </h3>
        <p>{current.copy}</p>
        <div className="setup-fields">{current.content}</div>
      </div>
      <div className="setup-actions">
        <button
          className="button button--quiet"
          type="button"
          disabled={step === 0}
          onClick={() => move(step - 1)}
        >
          Back
        </button>
        {step < steps.length - 1 ? (
          <button
            className="button button--secondary"
            type="button"
            onClick={() => move(step + 1)}
          >
            Next question
          </button>
        ) : (
          <button
            className="button button--primary"
            type="button"
            onClick={onFinish}
            disabled={!profile.name.trim()}
          >
            Refresh my share card
          </button>
        )}
      </div>

      <details className="personality-details">
        <summary>Optional personality signal (OCEAN)</summary>
        <p>Shared only at High or Max openness.</p>
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
                  const next = [
                    ...profile.personality,
                  ] as FullProfile["personality"];
                  next[index] = Number(event.target.value);
                  onChange("personality", next);
                }}
              />
              <output>{profile.personality[index].toFixed(2)}</output>
            </label>
          ))}
        </div>
      </details>
    </section>
  );
}
