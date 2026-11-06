import { LEAD_SOURCES, stateName } from "@/lib/constants";
import { formatPhone, whatsappLink } from "@/lib/normalize";
import type { Lead } from "@/services";
import { LeadAvatar } from "./LeadAvatar";
import { StatusBadge } from "./StatusBadge";
import { CopyButton } from "./CopyButton";

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

/** School-admission-record style ID card for a lead. */
export function LeadProfileCard({ lead }: { lead: Lead }) {
  const source = LEAD_SOURCES.find((s) => s.value === lead.source)?.label ?? lead.source;
  return (
    <>
        {/* ID card */}
        <article className="card overflow-hidden">
          <header className="relative bg-gradient-to-br from-brand-700 via-brand-600 to-indigo-500 px-5 pb-14 pt-4 text-white">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80">
              <span>Zyntra · Lead Record</span>
              <StatusBadge status={lead.status} />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <p className="font-mono text-2xl font-bold tracking-wider sm:text-3xl">{lead.tracking_id}</p>
              <CopyButton text={lead.tracking_id} label="Copy ID" />
            </div>
          </header>

          <div className="relative z-10 -mt-12 px-5">
            <div className="flex items-end gap-4">
              <div className="rounded-2xl bg-white p-1 shadow-md">
                <LeadAvatar name={lead.brand_name} logoUrl={lead.logo_url} size="xl" />
              </div>
              <div className="min-w-0 pb-1">
                <h1 className="truncate text-xl font-bold sm:text-2xl">{lead.brand_name}</h1>
                {lead.niche && <p className="text-sm text-slate-500">{lead.niche}</p>}
              </div>
            </div>
          </div>

          <dl className="grid gap-x-6 p-5 sm:grid-cols-2">
            <Detail label="Owner" value={lead.owner_name} />
            <Detail label="Location" value={[lead.city, stateName(lead.state, lead.country), lead.country].filter(Boolean).join(", ")} />
            <Detail label="Phone" value={lead.phone && formatPhone(lead.phone)} href={lead.phone ? `tel:${lead.phone}` : undefined} />
            <Detail label="WhatsApp" value={lead.whatsapp && formatPhone(lead.whatsapp)} href={lead.whatsapp ? whatsappLink(lead.whatsapp) : undefined} external />
            <Detail label="Email" value={lead.email} href={lead.email ? `mailto:${lead.email}` : undefined} />
            <Detail label="Instagram" value={lead.instagram && `@${lead.instagram}`} href={lead.instagram ? `https://instagram.com/${lead.instagram}` : undefined} external />
            <Detail label="Website" value={lead.website?.replace(/^https?:\/\//, "")} href={lead.website ?? undefined} external />
            <Detail label="Source" value={source} />
            <Detail label="Added" value={dateFmt.format(new Date(lead.created_at))} />
            <Detail label="Last updated" value={dateFmt.format(new Date(lead.updated_at))} />
          </dl>

          {lead.notes && (
            <div className="border-t border-dashed border-slate-200 p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Notes</h2>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{lead.notes}</p>
            </div>
          )}

          <footer className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-5 py-3 text-[11px] text-slate-400">
            <span>Permanent ID · never changes</span>
            <span className="font-mono">{lead.id.slice(0, 8)}</span>
          </footer>
        </article>

        {/* Quick actions */}
        <div className="grid grid-cols-3 gap-2">
          <QuickAction href={lead.phone ? `tel:${lead.phone}` : undefined} label="Call" />
          <QuickAction href={lead.whatsapp ? whatsappLink(lead.whatsapp) : undefined} label="WhatsApp" external />
          <QuickAction href={lead.instagram ? `https://instagram.com/${lead.instagram}` : undefined} label="Instagram" external />
        </div>
    </>
  );
}

function Detail({ label, value, href, external }: { label: string; value?: string | null; href?: string; external?: boolean }) {
  return (
    <div className="border-b border-slate-100 py-2.5">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-slate-800">
        {value ? (
          href ? (
            <a href={href} className="text-brand-700 hover:underline" {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
              {value}
            </a>
          ) : (
            value
          )
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </dd>
    </div>
  );
}

function QuickAction({ href, label, external }: { href?: string; label: string; external?: boolean }) {
  if (!href) return <span className="btn-secondary pointer-events-none opacity-40">{label}</span>;
  return (
    <a href={href} className="btn-secondary" {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {label}
    </a>
  );
}
