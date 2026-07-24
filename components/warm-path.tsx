"use client";

import { useEffect, useMemo, useState } from "react";

import {
  MY_CIRCLE_STORAGE_KEY,
  parseCircleContacts,
  type CircleContact,
} from "../lib/my-circle";
import {
  DEMO_WARM_PATH_RESPONSE,
  createWarmPathRequest,
  parseWarmPathResponse,
  type WarmPathResult,
} from "../lib/warm-path";
import { SiteFooter, SiteHeader } from "./icebreaker-app";
import { WarmPathPicker } from "./warm-path-picker";
import { WarmPathResults } from "./warm-path-results";

const AGENTS = [
  "Circle Librarian",
  "Investor Researcher",
  "Path Scout",
  "Evidence Auditor",
  "Intro Strategist",
];

export function WarmPath() {
  const [contacts, setContacts] = useState<CircleContact[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmedIds, setConfirmedIds] = useState<string[]>([]);
  const [targetUrl, setTargetUrl] = useState("");
  const [result, setResult] = useState<WarmPathResult | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "result">("idle");
  const [error, setError] = useState("");
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = localStorage.getItem(MY_CIRCLE_STORAGE_KEY);
        setContacts(stored ? parseCircleContacts(JSON.parse(stored)) : []);
      } catch {
        setContacts([]);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const eligibleContacts = useMemo(
    () => contacts.filter((contact) => Boolean(contact.profile.u)),
    [contacts],
  );
  const selectedContacts = useMemo(
    () => eligibleContacts.filter((contact) => selectedIds.includes(contact.id)),
    [eligibleContacts, selectedIds],
  );
  const isReady =
    Boolean(targetUrl.trim()) &&
    selectedContacts.length > 0 &&
    selectedContacts.every((contact) => confirmedIds.includes(contact.id));

  function select(contactId: string, selected: boolean) {
    setSelectedIds((current) =>
      selected
        ? [...current, contactId].slice(0, 5)
        : current.filter((id) => id !== contactId),
    );
    if (!selected) {
      setConfirmedIds((current) =>
        current.filter((id) => id !== contactId),
      );
    }
  }

  function confirm(contactId: string, confirmed: boolean) {
    setConfirmedIds((current) =>
      confirmed
        ? [...new Set([...current, contactId])]
        : current.filter((id) => id !== contactId),
    );
  }

  async function research() {
    try {
      setError("");
      setResult(null);
      setIsDemo(false);
      setState("loading");
      const request = createWarmPathRequest(
        targetUrl,
        selectedContacts.map((contact) => ({
          name: contact.profile.n,
          role: contact.profile.r,
          publicProfileUrl: contact.profile.u ?? "",
          askConfirmed: confirmedIds.includes(contact.id),
        })),
      );
      const response = await fetch("/api/warm-paths", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof body.error === "object" &&
          body.error !== null &&
          "message" in body.error &&
          typeof body.error.message === "string"
            ? body.error.message
            : "Warm Path research is temporarily unavailable.";
        throw new Error(message);
      }
      setResult(parseWarmPathResponse(body));
      setState("result");
    } catch (caught) {
      setState("idle");
      setError(
        caught instanceof Error
          ? caught.message
          : "Warm Path research could not be completed.",
      );
    }
  }

  function loadDemo() {
    setError("");
    setIsDemo(true);
    setResult(parseWarmPathResponse(DEMO_WARM_PATH_RESPONSE));
    setState("result");
    window.setTimeout(() => {
      document
        .getElementById("warm-path-results")
        ?.scrollIntoView({ behavior: "smooth" });
    }, 0);
  }

  return (
    <main>
      <SiteHeader mode="warm-path" />
      <section className="warm-path-hero shell">
        <div>
          <p className="eyebrow">MY CIRCLE × LIVE PUBLIC EVIDENCE</p>
          <h1>Find the human path.</h1>
          <p>
            Choose people you actually met. Our agents look for a legitimate,
            cited route to the investor—then help you ask, without assuming.
          </p>
        </div>
        <div className="warm-path-principles">
          <span>01 · No scraped social graph</span>
          <span>02 · Every public edge cited</span>
          <span>03 · Humans approve the ask</span>
        </div>
      </section>

      <section className="warm-path-workbench">
        <div className="shell warm-path-workbench__grid">
          <div className="warm-path-form">
            <WarmPathPicker
              contacts={eligibleContacts}
              selectedIds={selectedIds}
              confirmedIds={confirmedIds}
              onSelect={select}
              onConfirm={confirm}
            />
            <label className="warm-path-target">
              <span>Target investor or fund URL</span>
              <input
                type="url"
                value={targetUrl}
                placeholder="https://fund.example/team/investor"
                onChange={(event) => setTargetUrl(event.target.value)}
              />
            </label>

            <div className="warm-path-disclosure">
              <strong>Only selected contacts leave this device</strong>
              <p>
                When you start research, the target URL plus each selected
                contact’s name, role, and public URL go to the agent service and
                You.com. Your remaining Circle stays local.
              </p>
              {selectedContacts.length > 0 && (
                <ul>
                  {selectedContacts.map((contact) => (
                    <li key={contact.id}>{contact.profile.n}: name, role, URL</li>
                  ))}
                </ul>
              )}
            </div>

            {error && (
              <p className="warm-path-error" role="alert">
                {error}
              </p>
            )}
            <div className="button-row">
              <button
                className="button button--primary"
                type="button"
                disabled={!isReady || state === "loading"}
                onClick={research}
              >
                {state === "loading"
                  ? "Agents are researching…"
                  : "Research Warm Paths"}
              </button>
              <button
                className="button button--secondary"
                type="button"
                onClick={loadDemo}
              >
                Load a cited demo
              </button>
            </div>
          </div>

          <aside className="agent-rail" aria-live="polite">
            <p className="step-label">THE RESEARCH CREW</p>
            <h2>Five jobs. One accountable answer.</h2>
            <ol>
              {AGENTS.map((agent, index) => (
                <li className={state === "loading" ? "is-running" : ""} key={agent}>
                  <span>0{index + 1}</span>
                  <strong>{agent}</strong>
                </li>
              ))}
            </ol>
            <p>
              Deterministic code—not an agent—enforces HTTPS URLs, citation
              requirements, path length, and the final three-result limit.
            </p>
          </aside>
        </div>
      </section>

      {result && (
        <div id="warm-path-results">
          <WarmPathResults result={result} isDemo={isDemo} />
        </div>
      )}
      <SiteFooter />
    </main>
  );
}
