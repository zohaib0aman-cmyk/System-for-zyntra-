"use server";

import { revalidatePath } from "next/cache";
import { parseFilters } from "@/lib/filters";
import type { LeadStatus } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import {
  addNote,
  addTag,
  completeFollowup,
  deleteFollowup,
  listLeads,
  recalculateScores,
  removeTag,
  setFollowup,
  setPriority,
  setStatus,
  setStatusMany,
  snoozeFollowup,
  type LeadPage,
} from "@/services";

// All actions here run as the logged-in owner (actor = "owner").
type Result = { error?: string };
const refresh = () => revalidatePath("/", "layout");

export async function setStatusAction(leadId: string, status: LeadStatus): Promise<Result> {
  const r = await setStatus(await createClient(), leadId, status, { actor: "owner" });
  refresh();
  return r.ok ? {} : { error: r.message };
}

export async function setStatusManyAction(leadIds: string[], status: LeadStatus): Promise<Result & { updated?: number }> {
  const r = await setStatusMany(await createClient(), leadIds.slice(0, 500), status, { actor: "owner" });
  refresh();
  return r.ok ? { updated: r.data.updated } : { error: r.message };
}

export async function setPriorityAction(leadId: string, priority: boolean): Promise<Result> {
  const r = await setPriority(await createClient(), leadId, priority, { actor: "owner" });
  refresh();
  return r.ok ? {} : { error: r.message };
}

export async function addNoteAction(leadId: string, text: string): Promise<Result> {
  const r = await addNote(await createClient(), leadId, text, { actor: "owner" });
  refresh();
  return r.ok ? {} : { error: r.message };
}

export async function setFollowupAction(leadId: string, dueAt: string, note: string): Promise<Result> {
  const r = await setFollowup(await createClient(), leadId, { dueAt, note }, { actor: "owner" });
  refresh();
  return r.ok ? {} : { error: r.message };
}

export async function completeFollowupAction(followupId: string): Promise<Result> {
  const r = await completeFollowup(await createClient(), followupId, { actor: "owner" });
  refresh();
  return r.ok ? {} : { error: r.message };
}

export async function snoozeFollowupAction(followupId: string, until: string): Promise<Result> {
  const r = await snoozeFollowup(await createClient(), followupId, until, { actor: "owner" });
  refresh();
  return r.ok ? {} : { error: r.message };
}

export async function deleteFollowupAction(followupId: string): Promise<Result> {
  const r = await deleteFollowup(await createClient(), followupId);
  refresh();
  return r.ok ? {} : { error: r.message };
}

export async function addTagAction(leadIds: string[], name: string): Promise<Result & { added?: number }> {
  const r = await addTag(await createClient(), leadIds.slice(0, 5000), name, { actor: "owner" });
  refresh();
  return r.ok ? { added: r.data.added } : { error: r.message };
}

export async function removeTagAction(leadId: string, tagId: string): Promise<Result> {
  const r = await removeTag(await createClient(), leadId, tagId, { actor: "owner" });
  refresh();
  return r.ok ? {} : { error: r.message };
}

/** Next page for infinite scroll. `query` is the list URL's query string. */
export async function loadLeadsAction(query: string, offset: number): Promise<{ page?: LeadPage; error?: string }> {
  const { filters, sort } = parseFilters(new URLSearchParams(query));
  const r = await listLeads(await createClient(), filters, sort, { offset });
  return r.ok ? { page: r.data } : { error: r.message };
}

export async function recalculateAllScoresAction(): Promise<Result & { checked?: number; changed?: number }> {
  const r = await recalculateScores(await createClient(), {});
  refresh();
  return r.ok ? r.data : { error: r.message };
}
