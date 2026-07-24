"use client";

import { useId, useState } from "react";

import {
  AI_REWRITE_STYLES,
  type AiRewriteStyle,
  type ResearchSource,
} from "../lib/ai-writing";
import type { DeepSectionId } from "../lib/deep-profile";

type AssistantMode = "rewrite" | "research";

type AiWritingAssistantProps = {
  section: DeepSectionId;
  sectionLabel: string;
  text: string;
  onAccept: (text: string) => void;
};

const STYLE_LABELS: Record<AiRewriteStyle, string> = {
  concise: "Clear and concise",
  professional: "Professional",
  conversational: "Conversational",
  wikipedia: "Wikipedia-style",
};

const AI_ENDPOINT =
  process.env.NEXT_PUBLIC_AI_WRITER_URL?.replace(/\/+$/, "") ?? "";

export function AiWritingAssistant({
  section,
  sectionLabel,
  text,
  onAccept,
}: AiWritingAssistantProps) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AssistantMode>("rewrite");
  const [style, setStyle] = useState<AiRewriteStyle>("concise");
  const [proposal, setProposal] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [researchConsent, setResearchConsent] = useState(false);
  const [researchReport, setResearchReport] = useState("");
  const [researchSources, setResearchSources] = useState<ResearchSource[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function switchMode(nextMode: AssistantMode) {
    setMode(nextMode);
    setError("");
  }

  async function rewriteDraft() {
    setBusy(true);
    setError("");
    setProposal("");
    try {
      const response = await postJson(`${AI_ENDPOINT}/api/ai/rewrite`, {
        section,
        style,
        text,
      });
      if (typeof response.draft !== "string" || !response.draft.trim()) {
        throw new Error("The rewriting service returned an empty draft.");
      }
      setProposal(response.draft.trim());
    } catch (caught) {
      setError(readError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function researchDraft() {
    setBusy(true);
    setError("");
    setResearchReport("");
    setResearchSources([]);
    try {
      const response = await postJson(`${AI_ENDPOINT}/api/ai/research`, {
        section,
        text,
        sourceUrls: parseSourceUrls(sourceText),
        consent: researchConsent,
      });
      if (typeof response.report !== "string" || !response.report.trim()) {
        throw new Error("The research service returned an empty brief.");
      }
      setResearchReport(response.report.trim());
      setResearchSources(
        Array.isArray(response.sources)
          ? response.sources.filter(isResearchSource)
          : [],
      );
    } catch (caught) {
      setError(readError(caught));
    } finally {
      setBusy(false);
    }
  }

  function acceptProposal() {
    if (!proposal) return;
    onAccept(proposal);
    setOpen(false);
    setProposal("");
    setError("");
  }

  return (
    <div className="ai-writer">
      <button
        className="ai-writer__trigger"
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">✦</span>
        <span>
          <strong>Improve with AI</strong>
          <small>
            Only this section is sent when you choose an AI action.
          </small>
        </span>
      </button>

      {open && (
        <section className="ai-writer__panel" id={panelId}>
          <header className="ai-writer__header">
            <div>
              <p className="step-label">AI WRITING ASSISTANT</p>
              <h3>Improve {sectionLabel.toLowerCase()}</h3>
            </div>
            <button
              className="button button--quiet"
              type="button"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </header>

          <div className="ai-writer__modes" aria-label="AI action">
            <button
              className={mode === "rewrite" ? "is-active" : ""}
              type="button"
              aria-pressed={mode === "rewrite"}
              onClick={() => switchMode("rewrite")}
            >
              Rewrite draft
            </button>
            <button
              className={mode === "research" ? "is-active" : ""}
              type="button"
              aria-pressed={mode === "research"}
              onClick={() => switchMode("research")}
            >
              Verify &amp; enrich
            </button>
          </div>

          {mode === "rewrite" ? (
            <div className="ai-writer__step">
              <div className="ai-disclosure">
                <strong>Parasail receives this draft only.</strong>
                <span>
                  Your other sections stay on this device. Nothing changes
                  until you accept the proposal.
                </span>
              </div>
              <label>
                <span>Writing style</span>
                <select
                  value={style}
                  onChange={(event) =>
                    setStyle(event.target.value as AiRewriteStyle)
                  }
                >
                  {AI_REWRITE_STYLES.map((item) => (
                    <option key={item} value={item}>
                      {STYLE_LABELS[item]}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button button--secondary"
                type="button"
                disabled={busy || !text.trim()}
                onClick={rewriteDraft}
              >
                {busy ? "Writing…" : "Create rewrite"}
              </button>

              {proposal && (
                <section className="ai-proposal" aria-live="polite">
                  <p className="step-label">PROPOSED — NOT SAVED</p>
                  <p>{proposal}</p>
                  <div className="button-row">
                    <button
                      className="button button--primary"
                      type="button"
                      onClick={acceptProposal}
                    >
                      Use this version
                    </button>
                    <button
                      className="button button--quiet"
                      type="button"
                      onClick={() => setProposal("")}
                    >
                      Keep original
                    </button>
                  </div>
                </section>
              )}
            </div>
          ) : (
            <div className="ai-writer__step">
              <div className="ai-disclosure ai-disclosure--research">
                <strong>You.com may review approved public sources.</strong>
                <span>
                  It receives this draft and may inspect the links and other
                  public pages on those same domains.
                </span>
              </div>
              <label>
                <span>Approved source links</span>
                <textarea
                  rows={3}
                  value={sourceText}
                  placeholder={"https://your-site.com/about\nhttps://company.com/team"}
                  onChange={(event) => setSourceText(event.target.value)}
                />
                <small>One to five public HTTPS links, one per line.</small>
              </label>
              <label className="ai-research-consent">
                <input
                  type="checkbox"
                  checked={researchConsent}
                  onChange={(event) =>
                    setResearchConsent(event.target.checked)
                  }
                />
                <span>
                  I give permission to send this section and research these
                  public source domains.
                </span>
              </label>
              <button
                className="button button--secondary"
                type="button"
                disabled={
                  busy ||
                  !text.trim() ||
                  !sourceText.trim() ||
                  !researchConsent
                }
                onClick={researchDraft}
              >
                {busy ? "Researching…" : "Verify & enrich"}
              </button>

              {researchReport && (
                <section className="ai-research-result" aria-live="polite">
                  <p className="step-label">RESEARCH BRIEF — REVIEW ONLY</p>
                  <pre>{researchReport}</pre>
                  {researchSources.length > 0 && (
                    <div className="ai-research-sources">
                      <strong>Sources reviewed</strong>
                      <ul>
                        {researchSources.map((source) => (
                          <li key={source.url}>
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noreferrer nofollow"
                            >
                              {source.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p>
                    Research is not added automatically. Use it to revise your
                    draft, then approve the section yourself.
                  </p>
                </section>
              )}
            </div>
          )}

          {error && (
            <p className="ai-writer__error" role="alert">
              {error} Your saved draft was not changed.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

async function postJson(
  url: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const value = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    throw new Error(
      typeof value.error === "string"
        ? value.error
        : "The AI service could not complete this request.",
    );
  }
  return value;
}

function parseSourceUrls(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isResearchSource(value: unknown): value is ResearchSource {
  if (typeof value !== "object" || value === null) return false;
  const source = value as Record<string, unknown>;
  return typeof source.title === "string" && typeof source.url === "string";
}

function readError(value: unknown): string {
  return value instanceof Error
    ? value.message
    : "The AI service could not complete this request.";
}
