"use client";

import { useState } from "react";

import type { SharedProfile } from "../lib/icebreaker";
import type { MatchDossier } from "../lib/match";
import { isMintModeEnabled, loadAttestation } from "../lib/mint-mode";
import type { AttestationReceipt } from "../lib/attestation";

/**
 * The single, deliberate UI entry point for the optional Monad testnet
 * attestation (blueprint art_gdKW4J5q, "The Monad moment"). Rendered only
 * when NEXT_PUBLIC_MINT_MODE enables it; renders nothing otherwise.
 *
 * Off-happy-path states are contained entirely inside this component — idle
 * → confirm → submitting → done / failed — so a failed or absent RPC degrades
 * to a quiet error here and never touches the match flow. The attestation
 * module itself is loaded through `loadAttestation()` (dynamic import) only
 * inside the confirm handler: with the flag off, zero attestation code loads
 * and zero requests are made.
 *
 * Confirm-before-send is structural: the "confirm" stage states exactly what
 * will go onchain (a hash and a random nonce, nothing else) and requires a
 * second tap before any wallet prompt. The receipt stays client-side.
 */
export type MatchAttestationActionProps = {
  sender: SharedProfile;
  receiver: SharedProfile;
  band: Band;
};

type Band = MatchDossier["score"]["band"];

type Stage =
  | { kind: "idle" }
  | { kind: "confirm" }
  | { kind: "submitting" }
  | { kind: "done"; receipt: AttestationReceipt }
  | { kind: "failed"; reason: string; message: string };

const FAILURE_HEADLINES: Record<string, string> = {
  unavailable: "No wallet connected.",
  rejected: "Not sent — declined.",
  unsupported_chain: "Wallet not on Monad testnet.",
  rpc: "Testnet unreachable.",
  reverted: "Testnet declined the record.",
  timeout: "Still confirming.",
  unknown: "Attestation did not complete.",
};

function shortHash(hash: string): string {
  return hash.length > 14 ? `${hash.slice(0, 12)}…` : hash;
}

export function MatchAttestationAction(props: MatchAttestationActionProps) {
  // The flag is a build-time constant; re-reading per render is harmless and
  // keeps this component honest if the constant changes across builds.
  if (!isMintModeEnabled()) return null;
  return <MatchAttestationActionInner {...props} />;
}

function MatchAttestationActionInner({
  sender,
  receiver,
  band,
}: MatchAttestationActionProps) {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [lastMatch, setLastMatch] = useState<[SharedProfile, SharedProfile, Band]>(
    [sender, receiver, band],
  );

  // A re-decoded sender card or an edited receiver profile produces a
  // different match — the old receipt no longer describes what is on
  // screen. Adjusting state during render (React's documented alternative
  // to a reset effect) avoids cascading renders.
  if (
    lastMatch[0] !== sender ||
    lastMatch[1] !== receiver ||
    lastMatch[2] !== band
  ) {
    setLastMatch([sender, receiver, band]);
    setStage({ kind: "idle" });
  }

  async function confirmAttestation() {
    setStage({ kind: "submitting" });
    try {
      const attestation = await loadAttestation();
      if (!attestation) {
        // The flag was withdrawn mid-session — stay quiet, send nothing.
        setStage({
          kind: "failed",
          reason: "unknown",
          message: "Attestation is disabled in this build.",
        });
        return;
      }
      const outcome = await attestation.attestMatch({
        sender,
        receiver,
        band,
      });
      if (outcome.ok) {
        setStage({ kind: "done", receipt: outcome.receipt });
      } else {
        setStage({
          kind: "failed",
          reason: outcome.reason,
          message: outcome.message,
        });
      }
    } catch {
      setStage({
        kind: "failed",
        reason: "unknown",
        message: "The attestation could not be completed.",
      });
    }
  }

  return (
    <div
      className="match-attestation"
      data-match-attestation={stage.kind}
      aria-label="Optional onchain attestation"
    >
      <p className="step-label">OPTIONAL · MONAD TESTNET</p>

      {stage.kind === "idle" && (
        <>
          <button
            className="button button--quiet"
            type="button"
            onClick={() => setStage({ kind: "confirm" })}
          >
            Seal this match onchain
          </button>
          <p className="microcopy">
            Records only a one-way hash — never your profile. Default off.
          </p>
        </>
      )}

      {stage.kind === "confirm" && (
        <div className="match-attestation__confirm">
          <p>
            Record this match on Monad testnet? Only a one-way cryptographic
            hash goes onchain — no names, no roles, no text from either of
            you, and not even enough to re-derive the match. The receipt,
            including the random nonce inside that hash, stays on this device.
          </p>
          <div className="button-row">
            <button
              className="button button--primary"
              type="button"
              onClick={confirmAttestation}
            >
              Confirm — send to testnet
            </button>
            <button
              className="button button--quiet"
              type="button"
              onClick={() => setStage({ kind: "idle" })}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {stage.kind === "submitting" && (
        <p className="match-attestation__status" aria-live="polite">
          Sealing… approve the transaction in your wallet.
        </p>
      )}

      {stage.kind === "done" && (
        <p className="match-attestation__status" aria-live="polite">
          ✓ Sealed on Monad testnet — tx{" "}
          {stage.receipt.explorerUrl ? (
            <a
              className="text-link"
              href={stage.receipt.explorerUrl}
              target="_blank"
              rel="noreferrer"
            >
              {shortHash(stage.receipt.txHash)}
            </a>
          ) : (
            <code>{shortHash(stage.receipt.txHash)}</code>
          )}
          <span className="match-attestation__microcopy">
            Receipt kept on this device only.
          </span>
        </p>
      )}

      {stage.kind === "failed" && (
        <p className="match-attestation__status match-attestation__status--error">
          {FAILURE_HEADLINES[stage.reason] ?? FAILURE_HEADLINES.unknown}{" "}
          {stage.message}
          <button
            className="button button--quiet"
            type="button"
            onClick={() => setStage({ kind: "idle" })}
          >
            Try again
          </button>
        </p>
      )}
    </div>
  );
}
