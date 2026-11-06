import Link from "next/link";
import type { RecentActivity as Activity } from "@/services/dashboard";
import { relativeTime } from "@/lib/time";
import { LeadAvatar } from "@/components/LeadAvatar";

const VERB: Record<string, string> = {
  created: "added", imported: "imported", updated: "updated", status_changed: "status changed",
  note_added: "note added", followup_set: "follow-up set", followup_done: "follow-up done",
  followup_snoozed: "follow-up snoozed", logo_found: "logo found", merged: "details merged",
  tag_added: "tag added", tag_removed: "tag removed", priority_changed: "priority changed",
  whatsapp_opened: "WhatsApp opened",
};
const ACTOR: Record<string, string> = { owner: "You", system: "System", claude: "Claude", gpt: "GPT" };

export function RecentActivity({ items }: { items: Activity[] }) {
  if (items.length === 0) return <p className="text-sm text-slate-400">No activity yet.</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((a) => (
        <li key={a.id}>
          <Link href={`/leads/${a.tracking_id}`} className="flex items-center gap-3 py-2.5 hover:opacity-80">
            <LeadAvatar name={a.brand_name} logoUrl={a.logo_url} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                <span className="font-semibold">{a.brand_name}</span>
                <span className="text-slate-500"> · {VERB[a.type] ?? a.type}</span>
              </p>
              <p className="text-xs text-slate-400">{relativeTime(a.created_at)} · {ACTOR[a.actor] ?? a.actor}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
