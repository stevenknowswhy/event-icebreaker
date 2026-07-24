"use client";

import { useState } from "react";

import type { WarmPathResult } from "../lib/warm-path";

function CopyIntroButton({ message }: { message: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button className="button button--primary" type="button" onClick={copy}>
      {copied ? "Request copied ✓" : "Copy introduction request"}
    </button>
  );
}

function ApprovedSendPanel({
  message,
  contactName,
  disabled,
}: {
  message: string;
  contactName: string;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [approved, setApproved] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "sending" | "sent" | "failed"
  >("idle");
  const subject = `Warm introduction request for ${contactName}`;

  async function send() {
    setStatus("sending");
    try {
      const response = await fetch("/api/warm-path-actions/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipient,
          subject,
          message,
          approved,
        }),
      });
      if (!response.ok) throw new Error("send failed");
      setStatus("sent");
    } catch {
      setStatus("failed");
    }
  }

  if (disabled) {
    return (
      <p className="pica-demo-note">
        Sending is disabled for simulated demo people. Copy remains available.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        className="button button--quiet"
        type="button"
        onClick={() => setOpen(true)}
      >
        Preview optional Pica email
      </button>
    );
  }

  return (
    <div className="pica-approval">
      <div>
        <span className="step-label">EXACT RECIPIENT</span>
        <input
          aria-label={`${contactName} email address`}
          type="email"
          placeholder="contact@example.com"
          value={recipient}
          onChange={(event) => {
            setRecipient(event.target.value);
            setStatus("idle");
          }}
        />
      </div>
      <div>
        <span className="step-label">EXACT SUBJECT</span>
        <input aria-label="Email subject" readOnly value={subject} />
      </div>
      <label>
        <input
          type="checkbox"
          checked={approved}
          onChange={(event) => {
            setApproved(event.target.checked);
            setStatus("idle");
          }}
        />
        <span>
          I reviewed the recipient, subject, and exact message above. Send this
          email now.
        </span>
      </label>
      <button
        className="button button--quiet"
        type="button"
        disabled={
          !approved ||
          !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient) ||
          status === "sending" ||
          status === "sent"
        }
        onClick={send}
      >
        {status === "sending"
          ? "Sending approved email…"
          : status === "sent"
            ? "Email sent ✓"
            : "Send approved email"}
      </button>
      {status === "failed" && (
        <p role="alert">
          The email was not sent. Copy the request and send it yourself instead.
        </p>
      )}
    </div>
  );
}

export function WarmPathResults({
  result,
  isDemo,
}: {
  result: WarmPathResult;
  isDemo: boolean;
}) {
  return (
    <section className="warm-path-results" aria-labelledby="results-heading">
      <div className="shell">
        <div className="warm-path-results__heading">
          <div>
            <p className="step-label">
              {isDemo ? "CITED DEMO · SIMULATED PEOPLE" : "RESEARCH COMPLETE"}
            </p>
            <h2 id="results-heading">
              {result.paths.length
                ? `${result.paths.length} human path${result.paths.length === 1 ? "" : "s"} to ${result.target.name}.`
                : "No supported path yet."}
            </h2>
          </div>
          <a
            className="text-link"
            href={result.target.url}
            rel="noreferrer"
            target="_blank"
          >
            Review target profile ↗
          </a>
        </div>

        {!result.paths.length ? (
          <div className="warm-path-no-result" role="status">
            <span aria-hidden="true">∅</span>
            <h3>The honest answer is no path.</h3>
            <p>
              The agents could not support every edge with public evidence.
              Try a different Circle contact or confirm the route yourself.
            </p>
          </div>
        ) : (
          <div className="warm-path-result-list">
            {result.paths.map((path, pathIndex) => (
              <article className="warm-path-result" key={path.contactName}>
                <header>
                  <div>
                    <span className="warm-path-result__number">
                      0{pathIndex + 1}
                    </span>
                    <p>Ask {path.contactName}</p>
                  </div>
                  <span
                    className={`strength-badge strength-badge--${path.strength}`}
                  >
                    {path.strength} evidence
                  </span>
                </header>

                <p className="warm-path-result__explanation">
                  {path.explanation}
                </p>

                <ol className="path-edges" aria-label="Evidence path">
                  {path.edges.map((edge, edgeIndex) => (
                    <li key={`${edge.from}-${edge.to}`}>
                      <div className="path-edge__nodes">
                        <strong>{edge.from}</strong>
                        <span>{edge.relationship}</span>
                        <strong>{edge.to}</strong>
                      </div>
                      <div className="path-edge__sources">
                        {edge.citations.map((citation) => (
                          <a
                            href={citation.url}
                            key={citation.url}
                            rel="noreferrer"
                            target="_blank"
                          >
                            [{edgeIndex + 1}] {citation.title} ↗
                          </a>
                        ))}
                      </div>
                    </li>
                  ))}
                </ol>

                <div className="path-uncertainty">
                  <strong>What we cannot claim</strong>
                  <p>{path.uncertainty}</p>
                </div>

                <div className="intro-request">
                  <p className="step-label">ASK PERMISSION, NOT A FAVOR</p>
                  <blockquote>{path.introRequest}</blockquote>
                  <div className="intro-request__actions">
                    <CopyIntroButton message={path.introRequest} />
                    <ApprovedSendPanel
                      message={path.introRequest}
                      contactName={path.contactName}
                      disabled={isDemo}
                    />
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {result.workflow.length > 0 && (
          <div className="workflow-receipt" aria-label="Agent artifact receipt">
            <div>
              <p className="step-label">INSPECTABLE RUN RECEIPT</p>
              <h3>Five bounded jobs produced typed artifacts.</h3>
            </div>
            <ol>
              {result.workflow.map((step) => (
                <li key={step.role}>
                  <span aria-hidden="true">✓</span>
                  <div>
                    <strong>{step.role}</strong>
                    <small>
                      {step.artifactType} · {step.itemCount} item
                      {step.itemCount === 1 ? "" : "s"}
                    </small>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}
