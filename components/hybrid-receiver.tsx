"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { createDeepAiContext } from "../lib/deep-ai";
import { decryptDeepSnapshot } from "../lib/deep-crypto";
import {
  validateDeepSnapshot,
  type DeepSnapshot,
} from "../lib/deep-profile";
import {
  parseHybridShareUrl,
  type DeepAccessMode,
} from "../lib/hybrid-url";
import { decodePayload, type SharedProfile } from "../lib/icebreaker";
import { DeepProfilePage } from "./deep-profile-page";
import {
  CopyButton,
  DownloadCardButton,
  SiteFooter,
  SiteHeader,
  VisualCard,
} from "./icebreaker-app";
import { MutualConnect } from "./mutual-connect";

export function HybridReceiver() {
  const [quickProfile, setQuickProfile] = useState<SharedProfile | null>(null);
  const [deepProfile, setDeepProfile] = useState<DeepSnapshot | null>(null);
  const [deepStatus, setDeepStatus] = useState("Checking for deeper context…");
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [accessMode, setAccessMode] = useState<DeepAccessMode | null>(null);
  const [sessionToken, setSessionToken] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const parsed = parseHybridShareUrl(window.location.href);
        setQuickProfile(decodePayload(parsed.quickPayload));
        setAccessMode(parsed.accessMode);
        setSessionToken(parsed.sessionToken);

        if (parsed.accessMode === "agent-readable") {
          const response = await fetch(
            `/api/agent-profiles/${parsed.sessionToken}`,
            { headers: { accept: "application/json" } },
          );
          if (!response.ok) {
            setDeepStatus(
              response.status === 410
                ? "The AI-readable story expired or was revoked."
                : "The AI-readable story is unavailable.",
            );
            return;
          }
          const body = (await response.json()) as Record<string, unknown>;
          setDeepProfile(validateDeepSnapshot(body.profile));
          setExpiresAt(
            typeof body.expiresAt === "number" ? body.expiresAt : null,
          );
          setDeepStatus("Readable temporary profile loaded");
          return;
        }

        const response = await fetch(
          `/api/deep-sessions/${parsed.sessionToken}`,
          { headers: { accept: "application/json" } },
        );
        if (!response.ok) {
          setDeepStatus(
            response.status === 410
              ? "The deeper story expired or was revoked."
              : "The deeper story is unavailable.",
          );
          return;
        }
        const body = (await response.json()) as Record<string, unknown>;
        const decrypted = await decryptDeepSnapshot(
          body.envelope,
          parsed.decryptionKey ?? "",
        );
        setDeepProfile(decrypted);
        setExpiresAt(
          typeof body.expiresAt === "number" ? body.expiresAt : null,
        );
        setDeepStatus("Decrypted privately on this device");
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "This connection link could not be opened.",
        );
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (!quickProfile) {
    return (
      <main>
        <SiteHeader mode="receiver" />
        <section className="receiver-empty shell">
          <div className="empty-signal" aria-hidden="true">
            ⚡
          </div>
          <p className="eyebrow">HYBRID CONNECTION</p>
          <h1>{error ? "The signal could not be opened." : "Opening the connection…"}</h1>
          <p>
            {error ||
              "Reading the Quick Connect fallback before checking for deeper context."}
          </p>
          {error && (
            <Link className="button button--secondary" href="/">
              Build my own profile
            </Link>
          )}
        </section>
        <SiteFooter />
      </main>
    );
  }

  return (
    <main>
      <SiteHeader mode="receiver" />
      <section className="hybrid-quick shell">
        <div className="receiver-intro">
          <p className="eyebrow">QUICK CONNECT · AVAILABLE FIRST</p>
          <h1>Here’s the signal.</h1>
          <p>
            The card works independently. Deeper context is optional and never
            blocks the first conversation.
          </p>
          <DownloadCardButton profile={quickProfile} />
        </div>
        <div className="receiver-card-wrap">
          <VisualCard profile={quickProfile} />
          <div className="decoded-locally">
            <span>✓</span>
            Quick fallback decoded on this device
          </div>
        </div>
      </section>

      <section className="deep-receiver-section">
        <div className="shell">
          <div className="deep-receiver-status">
            <div>
              <p className="step-label">
                {accessMode === "agent-readable"
                  ? "AI-READABLE DEEP CONNECT"
                  : "PRIVATE DEEP CONNECT"}
              </p>
              <h2>
                {deepProfile
                  ? `${quickProfile.n} shared the story behind the signal.`
                  : "Quick Connect is still available."}
              </h2>
            </div>
            <div className="deep-receiver-status__privacy">
              <strong>{deepStatus}</strong>
              {expiresAt && (
                <span>
                  Expires {new Date(expiresAt).toLocaleString()}
                </span>
              )}
            </div>
          </div>

          {deepProfile ? (
            <>
              <div className="deep-receiver-notice">
                <strong>
                  {accessMode === "agent-readable"
                    ? "Temporary readable privacy exception"
                    : "Shared intentionally with this link"}
                </strong>
                {accessMode === "agent-readable" ? (
                  <p>
                    This filtered profile is temporarily readable by anyone or
                    any AI with the link. It still expires and can be revoked.
                  </p>
                ) : (
                  <p>
                    The hosting service stored only encrypted text. Copying,
                    forwarding, or screenshots remain possible after viewing.
                  </p>
                )}
              </div>
              <DeepProfilePage snapshot={deepProfile} />
              <div className="deep-receiver-actions">
                <CopyButton
                  label="Copy approved context for AI"
                  value={createDeepAiContext(deepProfile)}
                  variant="secondary"
                />
                {accessMode === "agent-readable" && sessionToken && (
                  <a
                    className="button button--quiet"
                    href={`/api/agent-profiles/${sessionToken}?format=markdown`}
                  >
                    Open AI-readable text
                  </a>
                )}
                <Link className="button button--quiet" href="/">
                  Build my own profile
                </Link>
              </div>
              <MutualConnect sender={deepProfile} />
            </>
          ) : (
            <div className="deep-fallback-message">
              <strong>{deepStatus}</strong>
              <p>
                Nothing is broken—the Quick Connect card above remains the
                complete fallback.
              </p>
            </div>
          )}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
