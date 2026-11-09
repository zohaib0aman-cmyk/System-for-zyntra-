import type { FollowupRow } from "@/lib/database.types";
import { endOfToday } from "@/lib/time";
import { logActivity, type ActorOptions } from "./activities";
import { recalculateScore } from "./pipeline";
import { dbError, type DB, type ServiceResult } from "./types";

export type FollowupWithLead = FollowupRow & {
  lead: { id: string; tracking_id: string; brand_name: string; logo_url: string | null; status: string; city: string | null; state: string; phone: string | null; whatsapp: string | null };
};

const LEAD_COLUMNS = "id,tracking_id,brand_name,logo_url,status,city,state,phone,whatsapp";

function parseDue(due: string | Date): Date | null {
  const d = due instanceof Date ? due : new Date(due);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function setFollowup(
  db: DB,
  leadId: string,
  input: { dueAt: string | Date; note?: string | null },
  options: ActorOptions = {},
): Promise<ServiceResult<FollowupRow>> {
  const due = parseDue(input.dueAt);
  if (!due) return { ok: false, code: "validation", message: "Pick a valid date and time.", fieldErrors: {} };
  if (due.getTime() < Date.now() - 5 * 60_000) {
    return { ok: false, code: "validation", message: "That time is in the past.", fieldErrors: {} };
  }
  const note = input.note?.trim().slice(0, 500) || null;
  const { data, error } = await db
    .from("followups")
    .insert({ lead_id: leadId, due_at: due.toISOString(), note, actor: options.actor ?? "owner" })
    .select("*")
    .single();
  if (error) return dbError(error);
  await logActivity(db, leadId, "followup_set", { followup_id: data.id, due_at: data.due_at, note }, options.actor);
  return { ok: true, data };
}

export async function completeFollowup(
  db: DB,
  followupId: string,
  options: ActorOptions & { outcome?: string } = {},
): Promise<ServiceResult<FollowupRow>> {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("followups")
    .update({ done: true, done_at: now })
    .eq("id", followupId)
    .eq("done", false)
    .select("*")
    .maybeSingle();
  if (error) return dbError(error);
  if (!data) return { ok: false, code: "not_found", message: "Follow-up not found or already done." };
  await db.from("leads").update({ last_contacted_at: now }).eq("id", data.lead_id);
  await logActivity(
    db,
    data.lead_id,
    "followup_done",
    { followup_id: data.id, due_at: data.due_at, note: data.note, ...(options.outcome ? { outcome: options.outcome } : {}) },
    options.actor,
  );
  await recalculateScore(db, data.lead_id);
  return { ok: true, data };
}

export async function snoozeFollowup(
  db: DB,
  followupId: string,
  until: string | Date,
  options: ActorOptions = {},
): Promise<ServiceResult<FollowupRow>> {
  const due = parseDue(until);
  if (!due) return { ok: false, code: "validation", message: "Pick a valid date and time.", fieldErrors: {} };
  const old = await db.from("followups").select("*").eq("id", followupId).maybeSingle();
  if (old.error) return dbError(old.error);
  if (!old.data || old.data.done) return { ok: false, code: "not_found", message: "Follow-up not found or already done." };
  const { data, error } = await db
    .from("followups")
    .update({ due_at: due.toISOString(), notified_at: null })
    .eq("id", followupId)
    .select("*")
    .single();
  if (error) return dbError(error);
  await logActivity(db, data.lead_id, "followup_snoozed", { followup_id: data.id, old: old.data.due_at, new: data.due_at }, options.actor);
  return { ok: true, data };
}

export async function deleteFollowup(db: DB, followupId: string): Promise<ServiceResult<null>> {
  const { error } = await db.from("followups").delete().eq("id", followupId);
  if (error) return dbError(error);
  return { ok: true, data: null };
}

/** Open follow-ups due before `before` (default: end of today) — today's and overdue, oldest first. */
export async function getDueFollowups(
  db: DB,
  options: { before?: Date; limit?: number } = {},
): Promise<ServiceResult<FollowupWithLead[]>> {
  const before = options.before ?? endOfToday();
  const { data, error } = await db
    .from("followups")
    .select(`*, lead:leads!inner(${LEAD_COLUMNS})`)
    .eq("done", false)
    .lt("due_at", before.toISOString())
    .order("due_at")
    .limit(options.limit ?? 100);
  if (error) return dbError(error);
  return { ok: true, data: (data ?? []) as unknown as FollowupWithLead[] };
}

/** All open follow-ups (for the Follow-ups tab), soonest first. */
export async function listOpenFollowups(db: DB, limit = 200): Promise<ServiceResult<FollowupWithLead[]>> {
  const { data, error } = await db
    .from("followups")
    .select(`*, lead:leads!inner(${LEAD_COLUMNS})`)
    .eq("done", false)
    .order("due_at")
    .limit(limit);
  if (error) return dbError(error);
  return { ok: true, data: (data ?? []) as unknown as FollowupWithLead[] };
}

export async function countDueFollowups(db: DB, before: Date = endOfToday()): Promise<number> {
  const { count } = await db
    .from("followups")
    .select("id", { count: "exact", head: true })
    .eq("done", false)
    .lt("due_at", before.toISOString());
  return count ?? 0;
}

export async function listLeadFollowups(db: DB, leadId: string): Promise<ServiceResult<FollowupRow[]>> {
  const { data, error } = await db
    .from("followups")
    .select("*")
    .eq("lead_id", leadId)
    .order("done")
    .order("due_at", { ascending: true })
    .limit(50);
  if (error) return dbError(error);
  return { ok: true, data: data ?? [] };
}
