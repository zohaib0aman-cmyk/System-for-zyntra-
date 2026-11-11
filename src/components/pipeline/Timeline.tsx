import type { ActivityRow, ActivityType } from "@/lib/database.types";
import { formatDateTime, relativeTime } from "@/lib/time";

const ICONS: Record<ActivityType, { icon: string; cls: string }> = {
  created: { icon: "✦", cls: "bg-brand-100 text-brand-700" },
  imported: { icon: "⇩", cls: "bg-sky-100 text-sky-700" },
  updated: { icon: "✎", cls: "bg-slate-100 text-slate-600" },
  status_changed: { icon: "➜", cls: "bg-violet-100 text-violet-700" },
  note_added: { icon: "✍", cls: "bg-amber-100 text-amber-800" },
  followup_set: { icon: "⏰", cls: "bg-orange-100 text-orange-700" },
  followup_snoozed: { icon: "💤", cls: "bg-orange-50 text-orange-700" },
  followup_done: { icon: "✓", cls: "bg-emerald-100 text-emerald-700" },
  logo_found: { icon: "◉", cls: "bg-teal-100 text-teal-700" },
  merged: { icon: "⇄", cls: "bg-indigo-100 text-indigo-700" },
  tag_added: { icon: "#", cls: "bg-pink-100 text-pink-700" },
  tag_removed: { icon: "#", cls: "bg-slate-100 text-slate-500" },
  priority_changed: { icon: "★", cls: "bg-amber-100 text-amber-700" },
  whatsapp_opened: { icon: "✆", cls: "bg-green-100 text-green-700" },
  demo_sent: { icon: "➚", cls: "bg-green-100 text-green-700" },
  demo_viewed: { icon: "👁", cls: "bg-sky-100 text-sky-700" },
  whatsapp_in: { icon: "✉", cls: "bg-green-50 text-green-700" },
  whatsapp_out: { icon: "✆", cls: "bg-green-100 text-green-700" },
  handoff: { icon: "☎", cls: "bg-red-100 text-red-700" },
};

const FIELD_LABELS: Record<string, string> = {
  brand_name: "brand name", owner_name: "owner", phone: "phone", whatsapp: "WhatsApp", email: "email",
  instagram: "Instagram", website: "website", city: "city", state: "state", country: "country",
  niche: "niche", logo_url: "logo", source: "source", notes: "notes",
};

type D = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
const when = (iso: unknown) => (typeof iso === "string" ? formatDateTime(iso) : "");

function describe(a: ActivityRow): { title: string; body?: string } {
  const d = (a.details ?? {}) as D;
  switch (a.type) {
    case "created":
      return { title: d.backfilled ? "Lead record (created before the timeline existed)" : `Lead created (${str(d.source)})` };
    case "imported":
      return { title: "Added from PDF import", body: d.file_name ? `File: ${str(d.file_name)}` : undefined };
    case "updated": {
      const changes = (d.changes ?? {}) as Record<string, { old: unknown; new: unknown }>;
      const keys = Object.keys(changes);
      return {
        title: `Updated ${keys.map((k) => FIELD_LABELS[k] ?? k).join(", ") || "details"}`,
        body: keys
          .filter((k) => k !== "notes")
          .slice(0, 6)
          .map((k) => `${FIELD_LABELS[k] ?? k}: ${str(changes[k].old)} → ${str(changes[k].new)}`)
          .join("\n") || undefined,
      };
    }
    case "status_changed":
      return { title: `Status: ${str(d.old)} → ${str(d.new)}`, body: d.reason ? str(d.reason) : undefined };
    case "note_added":
      return { title: "Note", body: str(d.text) };
    case "followup_set":
      return { title: `Follow-up set for ${when(d.due_at)}`, body: d.note ? str(d.note) : undefined };
    case "followup_snoozed":
      return { title: `Follow-up snoozed to ${when(d.new)}` };
    case "followup_done":
      return { title: "Follow-up done", body: [d.note, d.outcome].filter(Boolean).map(str).join(" — ") || undefined };
    case "logo_found":
      return { title: d.source === "upload" ? "Logo uploaded" : `Logo found (${str(d.source).replace(/_/g, " ")})` };
    case "merged": {
      const filled = (d.filled as string[] | undefined) ?? [];
      const conflicts = (d.conflicts as string[] | undefined) ?? [];
      return {
        title: `Merged details from ${str(d.from)}`,
        body: [
          filled.length ? `Filled: ${filled.map((k) => FIELD_LABELS[k] ?? k).join(", ")}` : "",
          conflicts.length ? `Kept in notes: ${conflicts.join("; ")}` : "",
        ].filter(Boolean).join("\n") || undefined,
      };
    }
    case "tag_added":
      return { title: `Tag added: #${str(d.tag)}` };
    case "tag_removed":
      return { title: `Tag removed: #${str(d.tag)}` };
    case "priority_changed":
      return { title: d.new ? "Marked as priority ★" : "Priority removed" };
    case "whatsapp_opened":
      return { title: `WhatsApp opened${d.template ? ` · ${str(d.template)}` : ""}`, body: d.to ? `To ${str(d.to)}` : undefined };
    case "demo_sent":
      return { title: "Demo link sent on WhatsApp", body: d.link ? str(d.link) : undefined };
    case "demo_viewed":
      return { title: "Lead opened the demo" };
    case "whatsapp_in":
      return { title: "WhatsApp message received", body: d.text ? str(d.text) : undefined };
    case "whatsapp_out":
      return { title: d.ai ? "AI replied on WhatsApp" : "WhatsApp message sent", body: d.text ? str(d.text) : undefined };
    case "handoff":
      return { title: "Needs you: call this lead", body: d.reason ? str(d.reason) : undefined };
    default:
      return { title: a.type };
  }
}

const ACTOR_LABEL: Record<string, string> = { owner: "You", system: "System", claude: "Claude", gpt: "GPT", ai: "AI" };

export function Timeline({ items }: { items: ActivityRow[] }) {
  if (items.length === 0) return <p className="text-sm text-slate-400">No activity yet.</p>;
  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-6">
      {items.map((a) => {
        const { title, body } = describe(a);
        const icon = ICONS[a.type] ?? ICONS.updated;
        return (
          <li key={a.id} className="relative">
            <span
              className={`absolute -left-[37px] flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ring-4 ring-white ${icon.cls}`}
              aria-hidden="true"
            >
              {icon.icon}
            </span>
            <p className="text-sm font-semibold text-slate-800">{title}</p>
            {body && <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-slate-600">{body}</p>}
            <p className="mt-0.5 text-xs text-slate-400">
              <time dateTime={a.created_at} title={formatDateTime(a.created_at)}>{relativeTime(a.created_at)}</time>
              {" · "}
              {ACTOR_LABEL[a.actor] ?? a.actor}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
