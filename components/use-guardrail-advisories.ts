"use client";

import { useEffect, useState } from "react";

import type { FullProfile } from "../lib/icebreaker";
import {
  checkProfileText,
  profileGuardrailFields,
  verdictsToAdvisories,
  type GuardrailFieldId,
} from "../lib/guardrails";

export type GuardrailAdvisories = Partial<Record<GuardrailFieldId, string[]>>;

/** Quiet pause after the last keystroke before the advisory check fires. */
const GUARDRAIL_DEBOUNCE_MS = 600;

/** Content fingerprint of a fields snapshot — advisories apply only while
    the checked snapshot is still the draft on screen. */
function stableFieldsKey(
  fields: Partial<Record<GuardrailFieldId, string>>,
): string {
  return JSON.stringify(
    Object.entries(fields).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

/**
 * Save-time guardrails (blueprint item 5): while a wizard edit surface is
 * open, the draft's free-text fields get a debounced advisory check against
 * the sidecar, and flagged fields surface banners. Strictly advisory — an
 * unavailable sidecar resolves to no advisories and the save path is never
 * touched. Stale results (the draft moved on) derive to `{}` during render,
 * so no state is synced from the effect body.
 */
export function useGuardrailAdvisories(
  profile: FullProfile,
  enabled: boolean,
): GuardrailAdvisories {
  const [checked, setChecked] = useState<{
    key: string;
    advisories: GuardrailAdvisories;
  }>({ key: "", advisories: {} });

  useEffect(() => {
    const fields = profileGuardrailFields(profile);
    if (!enabled || Object.keys(fields).length === 0) return;

    const key = stableFieldsKey(fields);
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void checkProfileText(fields).then((result) => {
        if (cancelled) return;
        setChecked({
          key,
          advisories:
            result.status === "ok" ? verdictsToAdvisories(result.verdicts) : {},
        });
      });
    }, GUARDRAIL_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, profile]);

  const current = enabled ? profileGuardrailFields(profile) : null;
  const currentKey = current ? stableFieldsKey(current) : "";
  if (!currentKey || checked.key !== currentKey) return {};
  return checked.advisories;
}
