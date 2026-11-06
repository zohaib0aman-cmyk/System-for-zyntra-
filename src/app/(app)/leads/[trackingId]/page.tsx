import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getLeadByTrackingId,
  getLeadTags,
  getTimeline,
  listLeadFollowups,
  listTags,
  recalculateScore,
  scoreFor,
} from "@/services";
import { LeadProfileCard } from "@/components/LeadProfileCard";
import { LogoActions } from "@/components/LogoActions";
import { StatusPicker } from "@/components/pipeline/StatusPicker";
import { ScorePanel } from "@/components/pipeline/ScorePanel";
import { FollowupPanel } from "@/components/pipeline/FollowupPanel";
import { TagEditor } from "@/components/pipeline/TagEditor";
import { NoteBox } from "@/components/pipeline/NoteBox";
import { Timeline } from "@/components/pipeline/Timeline";

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
  let lead = res.data;

  // Keep the stored score in sync (e.g. the "recent activity" bonus expired, or rules were tuned).
  const score = scoreFor(lead);
  if (score.score !== lead.score || score.label !== lead.score_label) {
    const r = await recalculateScore(db, lead.id);
    if (r.ok) lead = r.data;
  }

  const [timeline, followups, tags, allTags] = await Promise.all([
    getTimeline(db, lead.id, { limit: 100 }),
    listLeadFollowups(db, lead.id),
    getLeadTags(db, lead.id),
    listTags(db),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 lg:max-w-5xl">
      <div className="flex items-center justify-between">
        <Link href="/" className="rounded-lg px-2 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">← All leads</Link>
        <Link href={`/leads/${lead.tracking_id}/edit`} className="btn-primary py-2">Edit</Link>
      </div>

      {(flags.created || flags.updated) && (
        <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-800">
          {flags.created ? "Lead saved. Tracking ID created." : "Lead updated."}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="space-y-4">
          <LeadProfileCard lead={lead} />
          <LogoActions leadId={lead.id} status={lead.logo_status} hasWebsite={!!lead.website} />
        </div>

        <div className="space-y-4">
          <StatusPicker leadId={lead.id} status={lead.status} />
          <FollowupPanel leadId={lead.id} followups={followups.ok ? followups.data : []} />
          <ScorePanel leadId={lead.id} priority={lead.priority} result={scoreFor(lead)} />
          <TagEditor leadId={lead.id} tags={tags.ok ? tags.data : []} allTags={allTags.ok ? allTags.data : []} />

          <section className="card space-y-4 p-4" aria-label="Timeline">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Timeline</h2>
            <NoteBox leadId={lead.id} />
            {timeline.ok ? (
              <Timeline items={timeline.data} />
            ) : (
              <p className="text-sm text-red-700">Could not load the timeline: {timeline.message}</p>
            )}
          </section>

        </div>
      </div>
    </div>
  );
}
