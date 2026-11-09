"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { completeFollowupAction, snoozeFollowupAction } from "@/app/(app)/pipeline-actions";
import { formatPhone, whatsappLink } from "@/lib/normalize";
import { formatDateTime, relativeTime } from "@/lib/time";
import { LeadAvatar } from "@/components/LeadAvatar";
import { Spinner } from "@/components/Spinner";
import { BottomSheet } from "./BottomSheet";
import { snoozeOptions } from "./dueOptions";

export type FollowupItemData = {
  id: string;
  due_at: string;
  note: string | null;
  lead?: { tracking_id: string; brand_name: string; logo_url: string | null; phone: string | null; whatsapp: string | null };
};

/** One follow-up row with Done and Snooze. Overdue = red. */
export function FollowupItem({ f, showLead = true }: { f: FollowupItemData; showLead?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [gone, setGone] = useState(false);
  const overdue = new Date(f.due_at).getTime() < Date.now();

  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.error) return setError(r.error);
      setGone(true);
      router.refresh();
    });

  if (gone) return null;
  return (
    <div className={`card p-3 ${overdue ? "border-red-200 bg-red-50/60" : ""}`}>
      <div className="flex items-start gap-3">
        {showLead && f.lead && <LeadAvatar name={f.lead.brand_name} logoUrl={f.lead.logo_url} />}
        <div className="min-w-0 flex-1">
          {showLead && f.lead && (
            <Link href={`/leads/${f.lead.tracking_id}`} className="block truncate font-semibold hover:underline">
              {f.lead.brand_name}
            </Link>
          )}
          <p className={`text-xs font-semibold ${overdue ? "text-red-700" : "text-slate-600"}`}>
            {overdue ? "Overdue · " : ""}
            {relativeTime(f.due_at)} · {formatDateTime(f.due_at)}
          </p>
          {f.note && <p className="mt-0.5 text-sm text-slate-700">{f.note}</p>}
          {showLead && f.lead && (f.lead.phone || f.lead.whatsapp) && (
            <div className="mt-1 flex gap-3 text-xs font-medium">
              {f.lead.phone && <a href={`tel:${f.lead.phone}`} className="text-brand-700">Call {formatPhone(f.lead.phone)}</a>}
              {f.lead.whatsapp && (
                <a href={whatsappLink(f.lead.whatsapp)} target="_blank" rel="noopener noreferrer" className="text-emerald-700">WhatsApp</a>
              )}
            </div>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <button className="btn-primary py-2" disabled={pending} onClick={() => run(() => completeFollowupAction(f.id))}>
          {pending ? <Spinner /> : "✓"} Done
        </button>
        <button className="btn-secondary py-2" disabled={pending} onClick={() => setSnoozeOpen(true)}>
          Snooze
        </button>
      </div>
      <BottomSheet open={snoozeOpen} onClose={() => setSnoozeOpen(false)} title="Snooze until…">
        <div className="grid gap-2">
          {snoozeOptions().map((o) => (
            <button
              key={o.label}
              className="btn-secondary justify-between"
              onClick={() => {
                setSnoozeOpen(false);
                run(() => snoozeFollowupAction(f.id, o.date.toISOString()));
              }}
            >
              <span>{o.label}</span>
              <span className="text-xs font-normal text-slate-500">{o.hint}</span>
            </button>
          ))}
        </div>
      </BottomSheet>
    </div>
  );
}
