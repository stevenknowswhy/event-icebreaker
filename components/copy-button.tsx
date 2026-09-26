"use client";

import { useState } from "react";

export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Some mobile browsers expose Clipboard API without granting it.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Copying is unavailable in this browser.");
}

export function CopyButton({
  label,
  value,
  variant = "secondary",
}: {
  label: string;
  value: string;
  variant?: "primary" | "secondary" | "quiet";
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await copyText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      className={`button button--${variant}`}
      type="button"
      onClick={handleCopy}
      disabled={!value}
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}
