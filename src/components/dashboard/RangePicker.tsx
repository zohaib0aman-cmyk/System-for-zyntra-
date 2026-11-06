"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import type { DashboardRange } from "@/services/dashboard";
import { Spinner } from "@/components/Spinner";

const OPTIONS: { value: DashboardRange; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "all", label: "All time" },
];

export function RangePicker({ current, from, to }: { current: DashboardRange; from?: string; to?: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [customOpen, setCustomOpen] = useState(current === "custom");
  const [f, setF] = useState(from ?? "");
  const [t, setT] = useState(to ?? "");

  function go(range: DashboardRange, extra?: Record<string, string>) {
    const params = new URLSearchParams(sp.toString());
    params.set("range", range);
    params.delete("from");
    params.delete("to");
    if (extra) for (const [k, v] of Object.entries(extra)) if (v) params.set(k, v);
    start(() => router.replace(`/?${params.toString()}`, { scroll: false }));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            onClick={() => {
              setCustomOpen(false);
              go(o.value);
            }}
            aria-pressed={current === o.value}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset ${
              current === o.value ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-200"
            }`}
          >
            {o.label}
          </button>
        ))}
        <button
          onClick={() => setCustomOpen((v) => !v)}
          aria-pressed={current === "custom"}
          className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset ${
            current === "custom" ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-200"
          }`}
        >
          Custom
        </button>
        {pending && <Spinner className="h-4 w-4 text-brand-600" />}
      </div>
      {customOpen && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-500">
            From
            <input type="date" value={f} max={t || undefined} onChange={(e) => setF(e.target.value)} className="input mt-1 py-2 text-sm" />
          </label>
          <label className="text-xs text-slate-500">
            To
            <input type="date" value={t} min={f || undefined} onChange={(e) => setT(e.target.value)} className="input mt-1 py-2 text-sm" />
          </label>
          <button onClick={() => go("custom", { from: f, to: t })} disabled={!f && !t} className="btn-primary py-2">Apply</button>
        </div>
      )}
    </div>
  );
}
