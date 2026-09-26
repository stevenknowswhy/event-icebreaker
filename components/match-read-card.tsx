"use client";

import type { MatchDossier, MatchDossierSource } from "../lib/match";
import { CopyButton } from "./copy-button";

/**
 * Presentational renderer for the two-way match dossier (blueprint
 * art_gdKW4J5q, "The client — thin renderer plus honest fallback"). Driven
 * entirely by props: all scoring, composition, and ladder selection live in
 * the sidecar; the local fallback estimate is composed in lib/match.ts. This
 * component never fetches, computes, or invents — it renders what it is
 * handed and marks honestly where the read came from.
 *
 * States (spec "Flow and states"):
 * - loading          — dossier request in flight
 * - ready (sidecar)  — scored by the stateless model; confident or escalated
 * - ready (local)    — sidecar off/down; the estimate is clearly marked
 *
 * The score renders as a band plus reasons, never a raw number (locked spec
 * decision). The conversation ladder is deliberately NOT rendered here — the
 * ribbon slot below is reserved for the parallel ladder task.
 */
export type MatchReadCardProps =
  | { status: "loading" }
  | {
      status: "ready";
      dossier: MatchDossier;
      source: MatchDossierSource;
      /** The app's existing guarded AI prompt — the escalation handoff target. */
      aiPrompt?: string;
    };

// Named shape reads — what a bounded classification "means" in the room.
const SHAPE_READS: Record<MatchDossier["shape"]["kind"], string> = {
  peer: "Reads like two peers solving adjacent problems.",
  collab: "Reads like natural collaborators from different worlds.",
  mentor: "Reads like a mentor–mentee connection.",
  investor: "Reads like an investor meeting a builder.",
  customer: "Reads like a provider–customer fit.",
  unclear: "Too little signal to name this relationship yet.",
};

// Bands plus reasons, never the raw number.
const BAND_LABELS: Record<MatchDossier["score"]["band"], string> = {
  strong: "Strong overlap",
  some: "Some common ground",
  low: "Little shared signal",
};

function confidencePercent(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function DimensionRow({
  dimension,
}: {
  dimension: MatchDossier["dimensions"][number];
}) {
  return (
    <li className="match-read-card__dimension">
      <header>
        <h4>{dimension.label}</h4>
        <span className="match-read-card__confidence">
          {confidencePercent(dimension.confidence)} confident
        </span>
      </header>
      <p>{dimension.verdict}</p>
      {dimension.evidence.length > 0 && (
        <ul className="match-read-card__evidence">
          {dimension.evidence.map((line) => (
            <li key={line}>“{line}”</li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function MatchReadCard(props: MatchReadCardProps) {
  if (props.status === "loading" || props.dossier === undefined) {
    return (
      <article
        className="match-read-card match-read-card--loading"
        aria-busy="true"
        aria-label="Two-way match read loading"
      >
        <p className="match-read-card__loading-text">
          Reading the two profiles…
        </p>
      </article>
    );
  }

  const { dossier, source } = props;
  const isLocal = source === "local";
  // The local fallback is always flagged escalated, but it is the *degraded*
  // state, not the sidecar's honest "I could not call this" escalation —
  // only a sidecar-produced dossier leads to the sharper-read handoff.
  const isEscalated = !isLocal && dossier.escalated;
  const showLadderSlot = !isLocal && !isEscalated && dossier.ladder.length > 0;

  return (
    <article
      className={`match-read-card${isLocal ? " match-read-card--local" : ""}`}
      aria-label="Two-way match read"
    >
      <header className="match-read-card__head">
        <p className="step-label">THE TWO-WAY READ</p>
        <span
          className={`match-read-card__badge${
            isLocal ? " match-read-card__badge--local" : ""
          }`}
        >
          {isLocal ? "Local estimate" : "Stateless model read"}
        </span>
      </header>

      {isLocal && (
        <p className="match-read-card__notice">
          The stateless scorer was unreachable, so this read was computed on
          this device from word overlap alone — treat it as a rough estimate.
        </p>
      )}

      {!isLocal && (
        <p className="match-read-card__shape">
          {SHAPE_READS[dossier.shape.kind]}
          <span className="match-read-card__confidence">
            {confidencePercent(dossier.shape.confidence)} confidence
          </span>
        </p>
      )}

      <div className={`match-band match-band--${dossier.score.band}`}>
        <span className="match-band__label">
          {BAND_LABELS[dossier.score.band]}
        </span>
        <p className="match-band__reason">{dossier.score.byShape}</p>
      </div>

      {isEscalated && (
        <div className="match-read-card__escalation">
          <h3>Want a sharper read?</h3>
          <p>
            This match is genuinely uncertain — the model could not call
            enough of it with confidence, and it would rather admit that than
            guess. Your own AI can take the shared card and go deeper.
          </p>
          {props.aiPrompt && (
            <CopyButton
              label="Copy AI prompt"
              value={props.aiPrompt}
              variant="primary"
            />
          )}
          <p className="microcopy">
            Runs in your AI, on your account — this app never calls one.
          </p>
        </div>
      )}

      <div className="match-read-card__first-move">
        <p className="step-label">START HERE</p>
        <p className="match-read-card__move">{dossier.bestFirstMove}</p>
      </div>

      <ul className="match-read-card__dimensions">
        {dossier.dimensions.map((dimension) => (
          <DimensionRow key={dimension.id} dimension={dimension} />
        ))}
      </ul>

      {(dossier.bridge || dossier.curiosityGap) && (
        <div className="match-read-card__insights">
          {dossier.bridge && (
            <div className="match-insight">
              <h4>Shared ground</h4>
              <p className="match-insight__interest">
                {dossier.bridge.interest}
              </p>
              <p className="match-insight__why">{dossier.bridge.why}</p>
            </div>
          )}
          {dossier.curiosityGap && (
            <div className="match-insight">
              <h4>Your curiosity gap</h4>
              <p className="match-insight__interest">
                {dossier.curiosityGap.interest}
              </p>
              <p className="match-insight__why">{dossier.curiosityGap.why}</p>
            </div>
          )}
        </div>
      )}

      {showLadderSlot && (
        <div className="match-ladder-slot" data-ladder-slot="reserved">
          <details className="match-ladder-slot__ribbon">
            <summary>Keep going</summary>
            <p className="microcopy">
              Deeper questions load with the full conversation ladder.
            </p>
          </details>
        </div>
      )}

      <footer className="match-read-card__footnote">
        {isLocal
          ? "Local estimate · computed on this device"
          : "Decoded on device · scored by a stateless model"}
      </footer>
    </article>
  );
}
