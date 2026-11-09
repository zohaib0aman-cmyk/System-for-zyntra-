"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setStatusAction } from "@/app/(app)/pipeline-actions";
import { LEAD_STATUSES, STATUS_STYLES } from "@/lib/constants";
import type { LeadStatus } from "@/lib/database.types";

/** One-tap status change. */
export function StatusPicker({ leadId, status }: { leadId: string; status: LeadStatus }) {
  const router = useRouter();
  const [current, setCurrent] = useState(status);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <section className="card p-4" aria-label="Status">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</h2>
      <div className="-mx-1 flex flex-wrap gap-2 px-1">
        {LEAD_STATUSES.map((s) => {
          const active = s === current;
          return (
            <button
              key={s}
              aria-pressed={active}
              disabled={pending}
              onClick={() => {
                if (active) return;
                const prev = current;
                setCurrent(s);
                setError(undefined);
                start(async () => {
                  const r = await setStatusAction(leadId, s);
                  if (r.error) {
                    setCurrent(prev);
                    setError(r.error);
                  }
                  router.refresh();
                });
              }}
              className={`rounded-full px-3.5 py-2 text-sm font-semibold ring-1 ring-inset transition active:scale-95 ${
                active ? `${STATUS_STYLES[s]} ring-2` : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {active && "✓ "}
              {s}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}
