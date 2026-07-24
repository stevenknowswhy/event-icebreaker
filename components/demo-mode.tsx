"use client";

import { useEffect, useRef, useState } from "react";

const DEMO_STEPS = [
  {
    kicker: "1 · STEFANO IS READY",
    title: "A private profile, already on his phone.",
    body: "Stefano chooses High openness and Networking. His complete profile stays on this device.",
    visual: "profile",
  },
  {
    kicker: "2 · ONE TAP",
    title: "The QR carries only today’s signal.",
    body: "A compact profile is filtered, encoded, and placed after # in a normal HTTPS link.",
    visual: "qr",
  },
  {
    kicker: "3 · MARY SCANS",
    title: "Her camera opens the link.",
    body: "No Event Icebreaker app, account, or onboarding is required.",
    visual: "scan",
  },
  {
    kicker: "4 · VALUE FIRST",
    title: "The Visual Card starts the conversation.",
    body: "Mary sees Stefano’s Spark and interests, plus three useful questions generated on her phone.",
    visual: "questions",
  },
  {
    kicker: "5 · AI IS OPTIONAL",
    title: "Go deeper—or just start talking.",
    body: "Mary can copy a structured prompt into any AI, download the card, or build her own profile.",
    visual: "spark",
  },
] as const;

export function DemoMode({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const timer = window.setInterval(
      () => setStep((current) => (current + 1) % DEMO_STEPS.length),
      10000,
    );
    return () => window.clearInterval(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;
  const current = DEMO_STEPS[step];

  return (
    <div className="demo-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="demo-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="demo-dialog__header">
          <span>60-second demo</span>
          <button
            ref={closeButton}
            type="button"
            aria-label="Close demo"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className={`demo-visual demo-visual--${current.visual}`}>
          {current.visual === "qr" || current.visual === "scan" ? (
            <span className="demo-qr" aria-hidden="true">
              ▦
            </span>
          ) : current.visual === "questions" ? (
            <ol aria-hidden="true">
              <li>Why public trust?</li>
              <li>Where can you help?</li>
              <li>Which AI rabbit hole?</li>
            </ol>
          ) : (
            <div className="demo-mini-card" aria-hidden="true">
              <small>MEET</small>
              <strong>Stefano</strong>
              <span>AI Agents · Disaster Preparedness</span>
            </div>
          )}
        </div>
        <div className="demo-dialog__copy">
          <p className="step-label">{current.kicker}</p>
          <h2 id="demo-title">{current.title}</h2>
          <p>{current.body}</p>
        </div>
        <div className="demo-progress" aria-label={`Step ${step + 1} of 5`}>
          {DEMO_STEPS.map((item, index) => (
            <button
              key={item.kicker}
              type="button"
              className={index === step ? "is-active" : ""}
              aria-label={`Show demo step ${index + 1}`}
              onClick={() => setStep(index)}
            />
          ))}
        </div>
        <div className="demo-dialog__actions">
          <button
            className="button button--quiet"
            type="button"
            onClick={() =>
              setStep(
                (currentStep) =>
                  (currentStep - 1 + DEMO_STEPS.length) % DEMO_STEPS.length,
              )
            }
          >
            Back
          </button>
          <button
            className="button button--primary"
            type="button"
            onClick={() => {
              if (step === DEMO_STEPS.length - 1) onClose();
              else setStep((currentStep) => currentStep + 1);
            }}
          >
            {step === DEMO_STEPS.length - 1 ? "Start using it" : "Next"}
          </button>
        </div>
      </section>
    </div>
  );
}
