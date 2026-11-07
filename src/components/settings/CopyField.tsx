"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Copy", className = "" }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {}
      }}
      className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1 ring-inset ${copied ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-white text-brand-700 ring-slate-200 hover:bg-slate-50"} ${className}`}
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}

export function CopyField({ value, mono = true }: { value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
      <code className={`min-w-0 flex-1 truncate ${mono ? "font-mono" : ""} text-xs text-slate-700`}>{value}</code>
      <CopyButton text={value} />
    </div>
  );
}
