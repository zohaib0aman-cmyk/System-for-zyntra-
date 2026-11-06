import { TAG_COLORS } from "@/lib/constants";
import type { TagRow } from "@/lib/database.types";
import { logActivity, type ActorOptions } from "./activities";
import { dbError, type DB, type ServiceResult } from "./types";

const COLOR_NAMES = Object.keys(TAG_COLORS).filter((c) => c !== "slate");

function colorFor(name: string): string {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLOR_NAMES[h % COLOR_NAMES.length];
}

function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, 40);
}

export async function listTags(db: DB): Promise<ServiceResult<TagRow[]>> {
  const { data, error } = await db.from("tags").select("*").order("name");
  if (error) return dbError(error);
  return { ok: true, data: data ?? [] };
}

/** Finds a tag by name (case-insensitive) or creates it. */
export async function getOrCreateTag(db: DB, name: string): Promise<ServiceResult<TagRow>> {
  const clean = cleanName(name);
  if (!clean) return { ok: false, code: "validation", message: "Tag name is empty.", fieldErrors: {} };
  const existing = await db.from("tags").select("*").ilike("name", clean.replace(/[\\%_]/g, "\\$&")).maybeSingle();
  if (existing.error) return dbError(existing.error);
  if (existing.data) return { ok: true, data: existing.data };
  const ins = await db.from("tags").insert({ name: clean, color: colorFor(clean) }).select("*").single();
  if (ins.error) {
    // Created by someone else in the meantime → fetch it.
    const again = await db.from("tags").select("*").ilike("name", clean.replace(/[\\%_]/g, "\\$&")).maybeSingle();
    if (again.data) return { ok: true, data: again.data };
    return dbError(ins.error);
  }
  return { ok: true, data: ins.data };
}

/**
 * Adds a tag (by name, created if new) to one or many leads.
 * Leads that already have it are left alone.
 */
export async function addTag(
  db: DB,
  leadIds: string | string[],
  tagName: string,
  options: ActorOptions = {},
): Promise<ServiceResult<{ tag: TagRow; added: number }>> {
  const ids = [...new Set(Array.isArray(leadIds) ? leadIds : [leadIds])];
  const tag = await getOrCreateTag(db, tagName);
  if (!tag.ok) return tag;
  if (ids.length === 0) return { ok: true, data: { tag: tag.data, added: 0 } };

  const existing = await db.from("lead_tags").select("lead_id").eq("tag_id", tag.data.id).in("lead_id", ids);
  if (existing.error) return dbError(existing.error);
  const have = new Set((existing.data ?? []).map((r) => r.lead_id));
  const toAdd = ids.filter((id) => !have.has(id));
  for (let i = 0; i < toAdd.length; i += 500) {
    const { error } = await db
      .from("lead_tags")
      .insert(toAdd.slice(i, i + 500).map((lead_id) => ({ lead_id, tag_id: tag.data.id })));
    if (error) return dbError(error);
  }
  await logActivity(db, toAdd, "tag_added", { tag: tag.data.name, tag_id: tag.data.id }, options.actor);
  return { ok: true, data: { tag: tag.data, added: toAdd.length } };
}

export async function removeTag(
  db: DB,
  leadId: string,
  tagId: string,
  options: ActorOptions = {},
): Promise<ServiceResult<null>> {
  const { data, error } = await db
    .from("lead_tags")
    .delete()
    .eq("lead_id", leadId)
    .eq("tag_id", tagId)
    .select("tag_id, tag:tags(name)");
  if (error) return dbError(error);
  if (data && data.length > 0) {
    const name = (data[0] as unknown as { tag: { name: string } | null }).tag?.name ?? null;
    await logActivity(db, leadId, "tag_removed", { tag: name, tag_id: tagId }, options.actor);
  }
  return { ok: true, data: null };
}

export async function getLeadTags(db: DB, leadId: string): Promise<ServiceResult<TagRow[]>> {
  const { data, error } = await db.from("lead_tags").select("tag:tags(*)").eq("lead_id", leadId);
  if (error) return dbError(error);
  const tags = (data ?? []).map((r) => (r as unknown as { tag: TagRow }).tag).filter(Boolean);
  return { ok: true, data: tags.sort((a, b) => a.name.localeCompare(b.name)) };
}
