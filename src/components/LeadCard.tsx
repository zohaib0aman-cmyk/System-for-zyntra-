"use client";

import Link from "next/link";
import { useRef } from "react";
import type { LeadListItem } from "@/services/leadList";
import { relativeTime } from "@/lib/time";
import { LeadAvatar } from "./LeadAvatar";
import { StatusBadge } from "./StatusBadge";
import { ScoreChip, TagChip } from "./pipeline/Chips";
import { WhatsAppButton } from "./whatsapp/WhatsAppButton";
import type { MessageTemplateRow } from "@/lib/database.types";

type Props = {
  lead: LeadListItem;
  selecting?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  onQuickMenu?: (lead: LeadListItem) => void;
  templates?: Pick<MessageTemplateRow, "id" | "name">[];
};

/** Lead card. Tap = open profile, long-press or ⋯ = quick menu, in select mode tap = select. */
export function LeadCard({ lead, selecting, selected, onToggleSelect, onQuickMenu, templates = [] }: Props) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const longPressed = useRef(false);
  const place = [lead.city, lead.state].filter(Boolean).join(", ");
  const due = lead.next_followup_at;
  const overdue = due ? new Date(due).getTime() < Date.now() : false;

  const startPress = () => {
    longPressed.current = false;
    if (!onQuickMenu) return;
    timer.current = setTimeout(() => {
      longPressed.current = true;
      if (navigator.vibrate) navigator.vibrate(15);
      onQuickMenu(lead);
    }, 500);
  };
  const cancelPress = () => clearTimeout(timer.current);

  const body = (
    <div className="flex items-start gap-3">
      {selecting && (
        <span
          aria-hidden="true"
          className={`mt-3 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 text-xs font-bold ${
            selected ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white"
          }`}
        >
          {selected && "✓"}
        </span>
      )}
      <LeadAvatar name={lead.brand_name} logoUrl={lead.logo_url} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate font-semibold">
            {lead.priority && <span className="mr-1 text-amber-500" title="Priority">★</span>}
            {lead.brand_name}
          </h3>
          <StatusBadge status={lead.status} />
        </div>
        <p className="font-mono text-xs font-medium tracking-wide text-brand-700">{lead.tracking_id}</p>
        <p className="mt-0.5 truncate text-xs text-slate-500">{[lead.niche, place].filter(Boolean).join(" · ") || "—"}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <ScoreChip score={lead.score} label={lead.score_label} compact />
          {due && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${overdue ? "bg-red-100 text-red-700" : "bg-orange-50 text-orange-700"}`}>
              ⏰ {relativeTime(due)}
            </span>
          )}
          {lead.tags.slice(0, 3).map((t) => (
            <TagChip key={t.id} name={t.name} color={t.color} />
          ))}
          {lead.tags.length > 3 && <span className="text-[11px] text-slate-400">+{lead.tags.length - 3}</span>}
        </div>
      </div>
    </div>
  );

  const cls = `card block p-3 transition select-none ${selected ? "border-brand-500 ring-2 ring-brand-200" : "hover:border-brand-200 hover:shadow-md"} active:scale-[0.99]`;
  const pressHandlers = {
    onPointerDown: startPress,
    onPointerUp: cancelPress,
    onPointerLeave: cancelPress,
    onPointerCancel: cancelPress,
    onContextMenu: (e: React.MouseEvent) => {
      if (onQuickMenu) {
        e.preventDefault();
        cancelPress();
        if (!longPressed.current) onQuickMenu(lead);
      }
    },
  };

  return (
    <div className="relative">
      {selecting ? (
        <button type="button" onClick={() => onToggleSelect?.(lead.id)} className={`${cls} w-full text-left`} aria-pressed={selected}>
          {body}
        </button>
      ) : (
        <Link
          href={`/leads/${lead.tracking_id}`}
          className={cls}
          {...pressHandlers}
          onClick={(e) => {
            if (longPressed.current) e.preventDefault();
          }}
        >
          {body}
        </Link>
      )}
      {!selecting && (
        <div className="absolute bottom-2 right-2 flex items-center gap-1">
          <WhatsAppButton
            leadId={lead.id}
            hasContact={!!(lead.whatsapp || lead.phone)}
            status={lead.status}
            templates={templates}
            variant="icon"
          />
          {onQuickMenu && (
            <button
              type="button"
              aria-label={`Quick actions for ${lead.brand_name}`}
              onClick={() => onQuickMenu(lead)}
              className="rounded-full px-2.5 py-1 text-lg leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              ⋯
            </button>
          )}
        </div>
      )}
    </div>
  );
}
