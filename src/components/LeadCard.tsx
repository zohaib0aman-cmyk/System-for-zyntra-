import Link from "next/link";
import type { Lead } from "@/services";
import { LeadAvatar } from "./LeadAvatar";
import { StatusBadge } from "./StatusBadge";

export function LeadCard({ lead }: { lead: Lead }) {
  const place = [lead.city, lead.state].filter(Boolean).join(", ");
  return (
    <Link
      href={`/leads/${lead.tracking_id}`}
      className="card flex items-center gap-3 p-3 transition hover:border-brand-200 hover:shadow-md active:scale-[0.99]"
    >
      <LeadAvatar name={lead.brand_name} logoUrl={lead.logo_url} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate font-semibold">{lead.brand_name}</h3>
          <StatusBadge status={lead.status} />
        </div>
        <p className="font-mono text-xs font-medium tracking-wide text-brand-700">{lead.tracking_id}</p>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {[lead.niche, place].filter(Boolean).join(" · ") || "—"}
        </p>
      </div>
    </Link>
  );
}
