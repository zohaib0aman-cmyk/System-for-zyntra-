import type { LeadFilters, LeadSort } from "@/lib/filters";
import type { TagRow } from "@/lib/database.types";
import { endOfToday, startOfDay } from "@/lib/time";
import { dbError, type DB, type Lead, type ServiceResult } from "./types";

export type LeadTagChip = Pick<TagRow, "id" | "name" | "color">;
export type LeadListItem = Lead & { tags: LeadTagChip[] };
export type LeadPage = { total: number; rows: LeadListItem[]; offset: number; limit: number };

export const PAGE_SIZE = 30;
const NO_MATCH = "00000000-0000-0000-0000-000000000000";

/**
 * Search + filters + sort + pagination over all leads. Every filter is
 * optional and they all combine (AND); values inside one filter are OR,
 * except tags where the lead must have ALL selected tags.
 */
export async function listLeads(
  db: DB,
  filters: Partial<LeadFilters> = {},
  sort: LeadSort = "newest",
  page: { offset?: number; limit?: number } = {},
): Promise<ServiceResult<LeadPage>> {
  const limit = Math.min(Math.max(page.limit ?? PAGE_SIZE, 1), 200);
  const offset = Math.max(page.offset ?? 0, 0);

  let tagIds: string[] | null = null;
  if (filters.tags?.length) {
    const { data, error } = await db.from("tags").select("id,name");
    if (error) return dbError(error);
    const byName = new Map((data ?? []).map((t) => [t.name.toLowerCase(), t.id]));
    tagIds = filters.tags.map((n) => byName.get(n.toLowerCase()) ?? NO_MATCH);
  }
  const arr = <T,>(v?: T[]) => (v && v.length ? v : null);

  const { data, error } = await db.rpc("list_leads", {
    p_query: filters.q ?? "",
    p_niches: arr(filters.niches),
    p_countries: arr(filters.countries),
    p_states: arr(filters.states),
    p_cities: arr(filters.cities),
    p_statuses: arr(filters.statuses),
    p_score_labels: arr(filters.scores),
    p_tag_ids: tagIds,
    p_sources: arr(filters.sources),
    p_created_from: filters.from ? startOfDay(filters.from).toISOString() : null,
    p_created_to: filters.to ? new Date(startOfDay(filters.to).getTime() + 86_400_000).toISOString() : null,
    p_due_before: filters.due ? endOfToday().toISOString() : null,
    p_priority: filters.priority ? true : null,
    p_sort: sort,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) return dbError(error);
  const result = data as unknown as { total: number; rows: LeadListItem[] };
  return { ok: true, data: { total: result.total, rows: result.rows, offset, limit } };
}

export type FacetValue = { value: string; count: number; state?: string; id?: string; color?: string };
export type FilterOptions = {
  total: number;
  niches: FacetValue[];
  countries: FacetValue[];
  states: FacetValue[];
  cities: FacetValue[];
  tags: FacetValue[];
};

export async function getFilterOptions(db: DB): Promise<ServiceResult<FilterOptions>> {
  const { data, error } = await db.rpc("lead_filter_options");
  if (error) return dbError(error);
  return { ok: true, data: data as unknown as FilterOptions };
}
