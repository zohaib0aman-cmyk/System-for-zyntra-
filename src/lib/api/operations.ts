import "server-only";
import type { LeadFilters, LeadSort } from "@/lib/filters";
import {
  addLead,
  addNote,
  addTag,
  commitImport,
  exportLeads as exportLeadsSvc,
  findLogos,
  getDashboardStats,
  getLeadByTrackingId,
  getLeadTags,
  getTimeline,
  getWhatsAppLink,
  importLeadsFromPdf,
  listLeadFollowups,
  listLeads,
  listOpenFollowups,
  getDueFollowups,
  mergeLeadDetails,
  setFollowup,
  setStatus,
  updateLead,
  type DB,
  type DashboardRange,
  type ServiceResult,
} from "@/services";
import type { LeadStatus } from "@/lib/database.types";
import { compactLead, fullLead } from "./serialize";
import type { LeadInputApi } from "./schemas";

/** Reusable by the REST routes AND the MCP tools — the only code that calls the services. */

export async function opSearch(db: DB, q: string, limit = 30): Promise<ServiceResult<{ count: number; results: ReturnType<typeof compactLead>[] }>> {
  const r = await listLeads(db, { q }, "newest", { limit });
  if (!r.ok) return r;
  return { ok: true, data: { count: r.data.total, results: r.data.rows.map(compactLead) } };
}

export async function opList(
  db: DB,
  filters: Partial<LeadFilters>,
  sort: LeadSort,
  page: { limit: number; offset: number },
): Promise<ServiceResult<{ total: number; limit: number; offset: number; results: ReturnType<typeof compactLead>[] }>> {
  const r = await listLeads(db, filters, sort, page);
  if (!r.ok) return r;
  return { ok: true, data: { total: r.data.total, limit: r.data.limit, offset: r.data.offset, results: r.data.rows.map(compactLead) } };
}

export async function opGet(db: DB, trackingId: string): Promise<ServiceResult<ReturnType<typeof fullLead>>> {
  const r = await getLeadByTrackingId(db, trackingId);
  if (!r.ok) return r;
  const [tags, timeline, followups] = await Promise.all([
    getLeadTags(db, r.data.id),
    getTimeline(db, r.data.id, { limit: 10 }),
    listLeadFollowups(db, r.data.id),
  ]);
  const openFu = followups.ok ? followups.data.find((f) => !f.done) : null;
  return {
    ok: true,
    data: fullLead(r.data, {
      tags: tags.ok ? tags.data.map((t) => t.name) : [],
      timeline: timeline.ok ? timeline.data : [],
      nextFollowup: openFu ? { due_at: openFu.due_at, note: openFu.note } : null,
    }),
  };
}

export async function opAddLead(
  db: DB,
  actor: string,
  input: LeadInputApi,
): Promise<ServiceResult<{ created: boolean; merged?: boolean; lead: ReturnType<typeof compactLead> }>> {
  const res = await addLead(db, input, { actor });
  if (res.ok) {
    const withTags = { ...res.data, tags: [] as { id: string; name: string; color: string }[] };
    return { ok: true, data: { created: true, lead: compactLead(withTags) } };
  }
  // Duplicate → merge the new details into the existing lead (same behaviour as the app).
  if (res.code === "duplicate" && res.duplicates[0]) {
    const target = res.duplicates[0];
    const merged = await mergeLeadDetails(db, target, input as unknown as Parameters<typeof mergeLeadDetails>[2], `API (${actor})`, { actor });
    if (!merged.ok) return merged;
    const tags = await getLeadTags(db, merged.data.id);
    return {
      ok: true,
      data: { created: false, merged: true, lead: compactLead({ ...merged.data, tags: tags.ok ? tags.data : [] }) },
    };
  }
  return res;
}

export type BulkResult = {
  added: number;
  merged: number;
  failed: number;
  results: { index: number; brand_name: string; outcome: "added" | "merged" | "failed"; tracking_id?: string; reason?: string }[];
};

export async function opAddLeadsBulk(db: DB, actor: string, leads: LeadInputApi[]): Promise<ServiceResult<BulkResult>> {
  const results: BulkResult["results"] = [];
  let added = 0;
  let merged = 0;
  let failed = 0;
  for (const [index, input] of leads.entries()) {
    const r = await opAddLead(db, actor, input);
    if (!r.ok) {
      failed++;
      results.push({ index, brand_name: input.brand_name, outcome: "failed", reason: r.message });
    } else if (r.data.created) {
      added++;
      results.push({ index, brand_name: input.brand_name, outcome: "added", tracking_id: r.data.lead.tracking_id });
    } else {
      merged++;
      results.push({ index, brand_name: input.brand_name, outcome: "merged", tracking_id: r.data.lead.tracking_id });
    }
  }
  return { ok: true, data: { added, merged, failed, results } };
}

export async function opUpdate(db: DB, actor: string, trackingId: string, fields: Partial<LeadInputApi>): Promise<ServiceResult<ReturnType<typeof fullLead>>> {
  const lead = await getLeadByTrackingId(db, trackingId);
  if (!lead.ok) return lead;
  const res = await updateLead(db, lead.data.id, fields, { actor });
  if (!res.ok) return res;
  return opGet(db, res.data.tracking_id);
}

export async function opSetStatus(db: DB, actor: string, trackingId: string, status: LeadStatus): Promise<ServiceResult<{ tracking_id: string; status: LeadStatus; score: number }>> {
  const lead = await getLeadByTrackingId(db, trackingId);
  if (!lead.ok) return lead;
  const res = await setStatus(db, lead.data.id, status, { actor });
  if (!res.ok) return res;
  return { ok: true, data: { tracking_id: res.data.tracking_id, status: res.data.status, score: res.data.score } };
}

export async function opAddNote(db: DB, actor: string, trackingId: string, note: string): Promise<ServiceResult<{ tracking_id: string; note: string }>> {
  const lead = await getLeadByTrackingId(db, trackingId);
  if (!lead.ok) return lead;
  const res = await addNote(db, lead.data.id, note, { actor });
  if (!res.ok) return res;
  return { ok: true, data: { tracking_id: trackingId, note: res.data.text } };
}

export async function opSetFollowup(db: DB, actor: string, trackingId: string, dueAt: string, note?: string | null): Promise<ServiceResult<{ tracking_id: string; due_at: string; note: string | null }>> {
  const lead = await getLeadByTrackingId(db, trackingId);
  if (!lead.ok) return lead;
  const res = await setFollowup(db, lead.data.id, { dueAt, note }, { actor });
  if (!res.ok) return res;
  return { ok: true, data: { tracking_id: trackingId, due_at: res.data.due_at, note: res.data.note } };
}

export async function opAddTags(db: DB, actor: string, trackingId: string, tags: string[]): Promise<ServiceResult<{ tracking_id: string; tags: string[] }>> {
  const lead = await getLeadByTrackingId(db, trackingId);
  if (!lead.ok) return lead;
  for (const t of tags) {
    const r = await addTag(db, lead.data.id, t, { actor });
    if (!r.ok) return r;
  }
  const all = await getLeadTags(db, lead.data.id);
  return { ok: true, data: { tracking_id: trackingId, tags: all.ok ? all.data.map((t) => t.name) : [] } };
}

export async function opDueFollowups(db: DB, scope: "due" | "open" = "due") {
  const r = scope === "open" ? await listOpenFollowups(db) : await getDueFollowups(db);
  if (!r.ok) return r;
  return {
    ok: true as const,
    data: r.data.map((f) => ({
      tracking_id: f.lead.tracking_id,
      brand_name: f.lead.brand_name,
      due_at: f.due_at,
      overdue: new Date(f.due_at).getTime() < Date.now(),
      note: f.note,
      phone: f.lead.phone,
      whatsapp: f.lead.whatsapp,
    })),
  };
}

export async function opStats(db: DB, range: DashboardRange = "30d") {
  const r = await getDashboardStats(db, range);
  if (!r.ok) return r;
  const d = r.data;
  return {
    ok: true as const,
    data: {
      total_leads: d.cards.total,
      new_this_week: d.cards.new_this_week,
      new_this_month: d.cards.new_this_month,
      hot_leads: d.cards.hot,
      due_today: d.cards.due_today,
      deals_closed: d.cards.deals_closed,
      conversion_rate: d.conversionRate,
      pipeline: d.funnel,
      by_state: d.by_state,
      by_niche: d.by_niche,
      by_source: d.by_source,
    },
  };
}

export async function opWhatsAppLink(db: DB, trackingId: string, templateName?: string | null): Promise<ServiceResult<{ tracking_id: string; url: string; message: string; channel: string }>> {
  const lead = await getLeadByTrackingId(db, trackingId);
  if (!lead.ok) return lead;
  let templateId: string | null = null;
  if (templateName) {
    const { data } = await db.from("message_templates").select("id,name").ilike("name", templateName).maybeSingle();
    templateId = data?.id ?? null;
  }
  const r = await getWhatsAppLink(db, lead.data.id, templateId);
  if (!r.ok) return r;
  return { ok: true, data: { tracking_id: trackingId, url: r.data.url, message: r.data.message, channel: r.data.channel } };
}

export async function opExport(
  db: DB,
  actor: string,
  format: "xlsx" | "pdf",
  filters: Partial<LeadFilters>,
  sort: LeadSort,
  columns?: string[],
): Promise<ServiceResult<{ filename: string; content_type: string; base64: string; lead_count: number }>> {
  const r = await exportLeadsSvc(db, filters, format, sort, columns, { actor });
  if (!r.ok) return r;
  return {
    ok: true,
    data: {
      filename: r.data.filename,
      content_type: r.data.contentType,
      base64: Buffer.from(r.data.bytes).toString("base64"),
      lead_count: r.data.leadCount,
    },
  };
}

/** Runs the Phase 2 PDF import; when review=false, saves everything and finds logos. */
export async function opImportPdf(
  db: DB,
  actor: string,
  file: Uint8Array,
  fileName: string,
  review: boolean,
): Promise<ServiceResult<{ import_id: string; status: string; total_found: number; summary?: { added: number; merged: number; skipped: number; tracking_ids: string[] } }>> {
  const r = await importLeadsFromPdf(db, { file, fileName }, { autoSave: !review, actor });
  if (!r.ok) return r;
  const imp = r.data.import;
  if (review || !r.data.summary) {
    return { ok: true, data: { import_id: imp.id, status: imp.status, total_found: imp.total_found } };
  }
  const s = r.data.summary;
  // Logos run in the background after a direct import.
  void findLogos(db, s.logoLeadIds);
  return {
    ok: true,
    data: {
      import_id: imp.id,
      status: imp.status,
      total_found: imp.total_found,
      summary: {
        added: s.added,
        merged: s.merged,
        skipped: s.skipped,
        tracking_ids: s.results.filter((x) => x.tracking_id).map((x) => x.tracking_id!),
      },
    },
  };
}

export { commitImport };
