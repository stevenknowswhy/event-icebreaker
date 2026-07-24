"use client";

import { useMemo, useState } from "react";

import type { DeepSnapshot } from "../lib/deep-profile";
import {
  createMutualConnectionBrief,
  createMutualDisclosure,
  validateReceiverSignal,
  type MutualConnectionBrief,
  type ReceiverSignal,
} from "../lib/mutual-connect";

const EMPTY_SIGNAL: ReceiverSignal = {
  name: "",
  currentFocus: "",
  canHelp: "",
  lookingFor: "",
};

export function MutualConnect({ sender }: { sender: DeepSnapshot }) {
  const [signal, setSignal] = useState<ReceiverSignal>(EMPTY_SIGNAL);
  const [confirmed, setConfirmed] = useState(false);
  const [brief, setBrief] = useState<MutualConnectionBrief | null>(null);
  const [error, setError] = useState("");

  const disclosure = useMemo(() => {
    try {
      return createMutualDisclosure(signal);
    } catch {
      return "";
    }
  }, [signal]);

  function update(field: keyof ReceiverSignal, value: string) {
    setSignal((current) => ({ ...current, [field]: value }));
    setConfirmed(false);
    setBrief(null);
    setError("");
  }

  function findConnection() {
    try {
      if (!confirmed) {
        throw new Error("Confirm the exact disclosure before continuing.");
      }
      const validated = validateReceiverSignal(signal);
      setBrief(createMutualConnectionBrief(sender, validated));
      setError("");
    } catch (caught) {
      setBrief(null);
      setError(
        caught instanceof Error
          ? caught.message
          : "The connection brief could not be created.",
      );
    }
  }

  return (
    <section className="mutual-connect" aria-labelledby="mutual-connect-title">
      <div className="mutual-connect__heading">
        <div>
          <p className="step-label">OPTIONAL MUTUAL CONNECT</p>
          <h2 id="mutual-connect-title">Find the useful overlap.</h2>
          <p>
            Share three short signals to create a two-way connection brief on
            this device. Nothing is uploaded or saved.
          </p>
        </div>
        <span className="privacy-pill">Private to this tab</span>
      </div>

      <div className="mutual-connect__grid">
        <div className="mutual-connect__fields">
          <label>
            <span>Name <small>optional</small></span>
            <input
              value={signal.name ?? ""}
              maxLength={80}
              onChange={(event) => update("name", event.target.value)}
              placeholder="Mary"
            />
          </label>
          <label>
            <span>What are you focused on now?</span>
            <textarea
              value={signal.currentFocus}
              maxLength={300}
              rows={3}
              onChange={(event) =>
                update("currentFocus", event.target.value)
              }
              placeholder="The problem, project, or question holding your attention"
            />
          </label>
          <label>
            <span>What can you help with?</span>
            <textarea
              value={signal.canHelp}
              maxLength={300}
              rows={3}
              onChange={(event) => update("canHelp", event.target.value)}
              placeholder="Experience, access, skills, or a useful perspective"
            />
          </label>
          <label>
            <span>What are you looking for?</span>
            <textarea
              value={signal.lookingFor}
              maxLength={300}
              rows={3}
              onChange={(event) => update("lookingFor", event.target.value)}
              placeholder="People, knowledge, feedback, or an introduction"
            />
          </label>
        </div>

        <div className="mutual-disclosure">
          <p className="step-label">EXACT DISCLOSURE</p>
          {disclosure ? (
            <pre>{disclosure}</pre>
          ) : (
            <p className="mutual-disclosure__empty">
              Complete the three required fields to preview exactly what will
              be used.
            </p>
          )}
          <label className="mutual-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={!disclosure}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>
              Use only these fields with {sender.n}&apos;s approved profile to
              find our connection.
            </span>
          </label>
          <button
            className="button button--primary"
            type="button"
            onClick={findConnection}
            disabled={!disclosure || !confirmed}
          >
            Find our connection
          </button>
          {error && <p className="form-error">{error}</p>}
        </div>
      </div>

      {brief && (
        <article className="connection-brief" aria-live="polite">
          <p className="step-label">YOUR CONNECTION BRIEF</p>
          <h3>{brief.quickRead}</h3>
          <div className="connection-brief__grid">
            <div>
              <strong>Possible mutual value</strong>
              <p>{brief.mutualValue}</p>
            </div>
            <div>
              <strong>Start here</strong>
              <ol>
                {brief.questions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ol>
            </div>
          </div>
          <div className="connection-brief__next">
            <strong>Best next step</strong>
            <p>{brief.nextStep}</p>
          </div>
        </article>
      )}
    </section>
  );
}
