"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setFollowupAction } from "@/app/(app)/pipeline-actions";
import type { FollowupRow } from "@/lib/database.types";
import { formatDateTime } from "@/lib/time";
import { Spinner } from "@/components/Spinner";
import { FollowupItem } from "./FollowupItem";
import { followupOptions, toLocalInput } from "./dueOptions";

export function FollowupPanel({ leadId, followups }: { leadId: string; followups: FollowupRow[] }) {
  const router = useRouter();
  const open = followups.filter((f) => !f.done);
  const done = followups.filter((f) => f.done).slice(0, 3);
  const [choice, setChoice] = useState<string>(""); // option label or "custom"
  const [custom, setCustom] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const options = followupOptions();

  function save() {
    setError(undefined);
    const due =
      choice === "custom" ? (custom ? new Date(custom) : null) : (options.find((o) => o.label === choice)?.date ?? null);
    if (!due || Number.isNaN(due.getTime())) return setError("Pick when to follow up.");
    start(async () => {
      const r = await setFollowupAction(leadId, due.toISOString(), note);
      if (r.error) return setError(r.error);
      setChoice("");
      setCustom("");
      setNote("");
      router.refresh();
    });
  }

  return (
    <section className="card space-y-3 p-4" aria-label="Follow-ups">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Follow-up</h2>
      {open.map((f) => (
        <FollowupItem key={f.id} f={f} showLead={false} />
      ))}

      <div>
        <p className="mb-2 text-sm font-medium">Set follow-up</p>
        <div className="grid grid-cols-2 gap-2">
          {options.map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => setChoice(o.label)}
              aria-pressed={choice === o.label}
              className={`rounded-xl px-3 py-2 text-left text-sm ring-1 ring-inset ${
                choice === o.label ? "bg-brand-50 font-semibold text-brand-700 ring-brand-500" : "bg-white ring-slate-200"
              }`}
            >
              {o.label}
              <span className="block text-[11px] font-normal text-slate-500">{o.hint}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setChoice("custom");
              if (!custom) setCustom(toLocalInput(options[0].date));
            }}
            aria-pressed={choice === "custom"}
            className={`rounded-xl px-3 py-2 text-left text-sm ring-1 ring-inset ${
              choice === "custom" ? "bg-brand-50 font-semibold text-brand-700 ring-brand-500" : "bg-white ring-slate-200"
            }`}
          >
            Custom
            <span className="block text-[11px] font-normal text-slate-500">Pick date &amp; time</span>
          </button>
        </div>
        {choice === "custom" && (
          <input
            type="datetime-local"
            value={custom}
            min={toLocalInput(new Date())}
            onChange={(e) => setCustom(e.target.value)}
            className="input mt-2"
            aria-label="Follow-up date and time"
          />
        )}
        {choice && (
          <div className="mt-2 flex gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder="Note (optional) — e.g. send Diwali catalogue"
              className="input py-2.5"
              aria-label="Follow-up note"
            />
            <button onClick={save} disabled={pending} className="btn-primary shrink-0 py-2.5">
              {pending ? <Spinner /> : "Save"}
            </button>
          </div>
        )}
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </div>

      {done.length > 0 && (
        <div className="border-t border-slate-100 pt-2">
          <p className="text-xs font-semibold text-slate-400">Recently done</p>
          <ul className="mt-1 space-y-1 text-xs text-slate-500">
            {done.map((f) => (
              <li key={f.id} className="line-through">
                {formatDateTime(f.due_at)}
                {f.note ? ` — ${f.note}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
