"use client";

import { useState } from "react";
import type { Rung } from "../lib/match";

/**
 * The invisible conversation ladder (blueprint art_gdKW4J5q, locked ladder
 * decisions). A purely presentational three-rung reveal driven entirely by
 * the rungs the sidecar's dossier carries — no client-side selection:
 *
 *   rung 1 · bridge        — the primary visible prompt, always shown
 *   rung 2 · fit           — revealed only by an explicit "keep going" tap
 *   rung 3 · curiosity gap — revealed only by a deliberate tap that follows
 *                            an explicit notice that it goes deeper
 *
 * Voluntary by construction: skip ("Not now") is permanently available at
 * every level and never penalized — the ladder pauses to a quiet line that
 * can be reopened. Resuming restarts at rung 1, so a deeper rung only ever
 * renders right after its own fresh, deliberate tap — never unasked. There
 * are no timers and no effects: nothing advances unless it is tapped, which
 * is the locked "no auto-reveal" guarantee in its strongest form.
 */

const LADDER_LEVELS = [1, 2, 3] as const;

type RevealedLevel = (typeof LADDER_LEVELS)[number];

function rungsAtLevel(rungs: Rung[], level: Rung["level"]): Rung[] {
  return rungs.filter((rung) => rung.level === level);
}

function RungItem({ rung }: { rung: Rung }) {
  return (
    <li className="match-ladder__rung" data-ladder-rung={rung.level}>
      <p className="match-ladder__question">{rung.question}</p>
      {/* Quiet dimension trace — personalization stays inspectable. */}
      <p className="match-ladder__why">{rung.why}</p>
    </li>
  );
}

export function MatchReadRibbon({ rungs }: { rungs: Rung[] }) {
  const [revealedLevel, setRevealedLevel] = useState<RevealedLevel>(1);
  const [paused, setPaused] = useState(false);

  // No rungs from the sidecar → no ribbon (local estimates never carry one).
  if (rungs.length === 0) return null;

  const nextLevel =
    LADDER_LEVELS.find(
      (level) => level > revealedLevel && rungsAtLevel(rungs, level).length > 0,
    ) ?? null;
  const visibleRungs = LADDER_LEVELS.filter(
    (level) => level <= revealedLevel,
  ).flatMap((level) => rungsAtLevel(rungs, level));

  function revealNext() {
    if (nextLevel !== null) setRevealedLevel(nextLevel);
  }

  function resume() {
    // Restart at the bridge: deeper rungs must earn a fresh deliberate tap
    // in this attention window, not inherit one from before the pause.
    setPaused(false);
    setRevealedLevel(1);
  }

  return (
    <section className="match-ladder" aria-label="Conversation ladder">
      <p className="step-label match-ladder__label">
        Conversation ladder · ask each other
      </p>
      {paused ? (
        <p className="match-ladder__paused">
          Paused — the questions stay hidden until you ask for them again.
          <button
            className="match-ladder__resume"
            onClick={resume}
            type="button"
          >
            Show the ladder again
          </button>
        </p>
      ) : (
        <>
          {visibleRungs.length > 0 && (
            <ol className="match-ladder__rungs">
              {visibleRungs.map((rung, index) => (
                <RungItem
                  // Level plus position: rung content is untrusted sidecar
                  // text and need not be unique within a level.
                  key={`${rung.level}-${index}`}
                  rung={rung}
                />
              ))}
            </ol>
          )}
          {nextLevel === 3 && (
            <p className="match-ladder__notice">
              The next question goes a little deeper — it invites a bit more
              openness than the first two. Show it only if it feels right.
            </p>
          )}
          <div className="match-ladder__gates">
            {nextLevel !== null && (
              <button
                className={`match-ladder__gate${
                  nextLevel === 3 ? " match-ladder__gate--deeper" : ""
                }`}
                onClick={revealNext}
                type="button"
              >
                {nextLevel === 2 ? "Keep going" : "Show the deeper question"}
              </button>
            )}
            <button
              className="match-ladder__skip"
              onClick={() => setPaused(true)}
              type="button"
            >
              Not now
            </button>
          </div>
        </>
      )}
    </section>
  );
}
