import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { leadToFormValues } from "@/lib/validation";
import { getLeadByTrackingId, listNiches } from "@/services";
import { LeadForm } from "@/components/LeadForm";

export const maxDuration = 60;

export async function generateMetadata({ params }: { params: Promise<{ trackingId: string }> }): Promise<Metadata> {
  const { trackingId } = await params;
  return { title: `Edit ${decodeURIComponent(trackingId)}` };
}

export default async function EditLeadPage({ params }: { params: Promise<{ trackingId: string }> }) {
  const { trackingId } = await params;
  const db = await createClient();
  const [lead, niches] = await Promise.all([
    getLeadByTrackingId(db, decodeURIComponent(trackingId)),
    listNiches(db),
  ]);
  if (!lead.ok) {
    if (lead.code === "not_found") notFound();
    throw new Error(lead.message);
  }
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center gap-2">
        <Link href={`/leads/${lead.data.tracking_id}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Back">←</Link>
        <div>
          <h1 className="text-xl font-bold">Edit lead</h1>
          <p className="font-mono text-xs text-brand-700">{lead.data.tracking_id}</p>
        </div>
      </div>
      <LeadForm
        mode="edit"
        leadId={lead.data.id}
        trackingId={lead.data.tracking_id}
        initialValues={leadToFormValues(lead.data)}
        niches={niches.ok ? niches.data.map((n) => n.name) : []}
      />
    </div>
  );
}
