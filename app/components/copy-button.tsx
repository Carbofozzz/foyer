"use client";

import { useState } from "react";

export function CopyButton({ text, copyLabel, copiedLabel }: { text: string; copyLabel: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button type="button" className={copied ? "ghost is-copied" : "ghost"} onClick={onCopy}>
      {copied ? copiedLabel : copyLabel}
    </button>
  );
}
