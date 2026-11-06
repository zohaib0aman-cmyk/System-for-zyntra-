"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setPriorityAction } from "@/app/(app)/pipeline-actions";
import type { ScoreResult } from "@/config/scoring";
import { ScoreChip } from "./Chips";

export function ScorePanel({ leadId, priority, result }: { leadId: string; priority: boolean; result: ScoreResult }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [star, setStar] = useState(priority);

  return (
    <section className="card p-4" aria-label="Lead score">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Score</h2>
          <ScoreChip score={result.score} label={result.label} />
        </div>
        <button
          aria-pressed={star}
          disabled={pending}
          onClick={() => {
            const next = !star;
            setStar(next);
            start(async () => {
              const r = await setPriorityAction(leadId, next);
              if (r.error) setStar(!next);
              router.refresh();
            });
          }}
          className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ring-inset ${
            star ? "bg-amber-100 text-amber-800 ring-amber-300" : "bg-white text-slate-600 ring-slate-200"
          }`}
        >
          {star ? "★ Priority" : "☆ Mark priority"}
        </button>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${result.label === "hot" ? "bg-rose-500" : result.label === "warm" ? "bg-amber-400" : "bg-slate-400"}`}
          style={{ width: `${result.score}%` }}
        />
      </div>
      <button onClick={() => setOpen((o) => !o)} className="mt-2 text-xs font-semibold text-brand-700" aria-expanded={open}>
        {open ? "Hide" : "Why this score?"}
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5 text-sm">
          {result.breakdown.map((b) => (
            <li key={b.label} className="flex items-start justify-between gap-3">
              <span className="text-slate-600">{b.label}</span>
              <span className={`shrink-0 font-mono text-xs font-semibold ${b.points ? "text-slate-900" : "text-slate-400"}`}>
                +{b.points}/{b.max}
              </span>
            </li>
          ))}
          {result.note && <li className="text-xs font-medium text-slate-500">{result.note}</li>}
          <li className="border-t border-slate-100 pt-1.5 text-xs text-slate-500">
            Hot ≥ 70 · Warm 40–69 · Cold &lt; 40. Rules: src/config/scoring.ts
          </li>
        </ul>
      )}
    </section>
  );
}
