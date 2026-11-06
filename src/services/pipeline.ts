import { computeScore, type ScoreResult } from "@/config/scoring";
import { LEAD_STATUSES } from "@/lib/constants";
import type { LeadStatus, LeadUpdate } from "@/lib/database.types";
import { logActivity, type ActorOptions } from "./activities";
import { dbError, type DB, type Lead, type ServiceResult } from "./types";

/** Statuses that mean we actually spoke to the lead (they refresh "last contacted"). */
const CONTACT_STATUSES: LeadStatus[] = ["Contacted", "Interested", "Deal Closed"];

export async function setStatus(
  db: DB,
  leadId: string,
  status: LeadStatus,
  options: ActorOptions & { reason?: string } = {},
): Promise<ServiceResult<Lead>> {
  if (!LEAD_STATUSES.includes(status)) {
    return { ok: false, code: "validation", message: `Unknown status "${status}".`, fieldErrors: {} };
  }
  const current = await db.from("leads").select("id,status").eq("id", leadId).maybeSingle();
  if (current.error) return dbError(current.error);
  if (!current.data) return { ok: false, code: "not_found", message: "Lead not found." };
  if (current.data.status === status) return recalculateScore(db, leadId);

  const patch: LeadUpdate = { status };
  if (CONTACT_STATUSES.includes(status)) patch.last_contacted_at = new Date().toISOString();
  const { error } = await db.from("leads").update(patch).eq("id", leadId);
  if (error) return dbError(error);
  await logActivity(
    db,
    leadId,
    "status_changed",
    { old: current.data.status, new: status, ...(options.reason ? { reason: options.reason } : {}) },
    options.actor,
  );
  return recalculateScore(db, leadId);
}

/** Bulk status change (same rules as setStatus). */
export async function setStatusMany(
  db: DB,
  leadIds: string[],
  status: LeadStatus,
  options: ActorOptions = {},
): Promise<ServiceResult<{ updated: number }>> {
  let updated = 0;
  for (const id of leadIds) {
    const r = await setStatus(db, id, status, options);
    if (r.ok) updated++;
  }
  return { ok: true, data: { updated } };
}

export async function setPriority(
  db: DB,
  leadId: string,
  priority: boolean,
  options: ActorOptions = {},
): Promise<ServiceResult<Lead>> {
  const { error } = await db.from("leads").update({ priority }).eq("id", leadId);
  if (error) return dbError(error);
  await logActivity(db, leadId, "priority_changed", { new: priority }, options.actor);
  return recalculateScore(db, leadId);
}

/** Adds a note to the lead's timeline. */
export async function addNote(
  db: DB,
  leadId: string,
  text: string,
  options: ActorOptions = {},
): Promise<ServiceResult<{ text: string }>> {
  const clean = text.trim().slice(0, 2000);
  if (!clean) return { ok: false, code: "validation", message: "Write something first.", fieldErrors: {} };
  const lead = await db.from("leads").select("id").eq("id", leadId).maybeSingle();
  if (lead.error) return dbError(lead.error);
  if (!lead.data) return { ok: false, code: "not_found", message: "Lead not found." };
  const { error } = await db
    .from("lead_activities")
    .insert({ lead_id: leadId, type: "note_added", details: { text: clean }, actor: options.actor ?? "owner" });
  if (error) return dbError(error);
  return { ok: true, data: { text: clean } };
}

export function scoreFor(lead: Lead, now = new Date()): ScoreResult {
  return computeScore(lead, now);
}

/** Recomputes the score from the rules in src/config/scoring.ts and saves it if it changed. */
export async function recalculateScore(db: DB, leadId: string): Promise<ServiceResult<Lead>> {
  const { data: lead, error } = await db.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (error) return dbError(error);
  if (!lead) return { ok: false, code: "not_found", message: "Lead not found." };
  const r = computeScore(lead);
  if (r.score === lead.score && r.label === lead.score_label && lead.score_updated_at) return { ok: true, data: lead };
  const upd = await db
    .from("leads")
    .update({ score: r.score, score_label: r.label, score_updated_at: new Date().toISOString() })
    .eq("id", leadId)
    .select("*")
    .single();
  if (upd.error) return dbError(upd.error);
  return { ok: true, data: upd.data };
}

/** Recalculates many leads (in pages). Used after imports, by the cron job and by Settings. */
export async function recalculateScores(
  db: DB,
  scope: { leadIds?: string[]; stale?: boolean } = {},
): Promise<ServiceResult<{ checked: number; changed: number }>> {
  const now = new Date();
  const PAGE = 500;
  let checked = 0;
  let changed = 0;

  const process = async (leads: Lead[]) => {
    for (const lead of leads) {
      checked++;
      const r = computeScore(lead, now);
      if (r.score === lead.score && r.label === lead.score_label && lead.score_updated_at) continue;
      const u = await db
        .from("leads")
        .update({ score: r.score, score_label: r.label, score_updated_at: now.toISOString() })
        .eq("id", lead.id);
      if (!u.error) changed++;
    }
  };

  if (scope.leadIds) {
    for (let i = 0; i < scope.leadIds.length; i += PAGE) {
      const { data, error } = await db.from("leads").select("*").in("id", scope.leadIds.slice(i, i + PAGE));
      if (error) return dbError(error);
      await process(data ?? []);
    }
    return { ok: true, data: { checked, changed } };
  }

  // Never scored, or contacted within the last 8 days (the "recent activity" bonus may have expired).
  const cutoff = new Date(now.getTime() - 8 * 86_400_000).toISOString();
  for (let from = 0; ; from += PAGE) {
    let q = db.from("leads").select("*").order("id").range(from, from + PAGE - 1);
    if (scope.stale) q = q.or(`score_updated_at.is.null,last_contacted_at.gte.${cutoff}`);
    const { data, error } = await q;
    if (error) return dbError(error);
    await process(data ?? []);
    if (!data || data.length < PAGE) break;
  }
  return { ok: true, data: { checked, changed } };
}
