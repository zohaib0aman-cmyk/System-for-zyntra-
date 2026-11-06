import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLeadByTrackingId } from "@/services";
import { LeadProfileCard } from "@/components/LeadProfileCard";
import { LogoActions } from "@/components/LogoActions";

export const maxDuration = 60;

type Params = { params: Promise<{ trackingId: string }>; searchParams: Promise<{ created?: string; updated?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { trackingId } = await params;
  return { title: decodeURIComponent(trackingId) };
}

export default async function LeadProfilePage({ params, searchParams }: Params) {
  const [{ trackingId }, flags] = await Promise.all([params, searchParams]);
  const db = await createClient();
  const res = await getLeadByTrackingId(db, decodeURIComponent(trackingId));
  if (!res.ok) {
    if (res.code === "not_found") notFound();
    throw new Error(res.message);
  }
  const lead = res.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/" className="rounded-lg px-2 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">← All leads</Link>
        <Link href={`/leads/${lead.tracking_id}/edit`} className="btn-primary py-2">Edit</Link>
      </div>

      {(flags.created || flags.updated) && (
        <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-800">
          {flags.created ? "Lead saved. Tracking ID created." : "Lead updated."}
        </p>
      )}

      <LeadProfileCard lead={lead} />
      <LogoActions leadId={lead.id} status={lead.logo_status} hasWebsite={!!lead.website} />
    </div>
  );
}
