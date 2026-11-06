"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="rounded-lg bg-white/15 px-2.5 py-1 text-xs font-semibold text-white ring-1 ring-white/30 hover:bg-white/25"
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}
