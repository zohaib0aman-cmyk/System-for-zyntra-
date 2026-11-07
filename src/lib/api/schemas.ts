import { z } from "zod";
import { LEAD_SOURCES, LEAD_STATUSES } from "@/lib/constants";
import { SCORE_LABELS, type LeadFilters, type LeadSort } from "@/lib/filters";
import type { ApiScope } from "@/lib/database.types";

const statusEnum = z.enum(LEAD_STATUSES);
const sourceEnum = z.enum(LEAD_SOURCES.map((s) => s.value) as [string, ...string[]]);
const scoreEnum = z.enum(SCORE_LABELS as unknown as [string, ...string[]]);

/** Lead fields accepted from the API / MCP (the service layer normalises + validates again). */
export const leadInputSchema = z
  .object({
    brand_name: z.string().min(1).max(120),
    owner_name: z.string().max(120).nullish(),
    phone: z.string().max(40).nullish(),
    whatsapp: z.string().max(40).nullish(),
    email: z.string().max(254).nullish(),
    instagram: z.string().max(200).nullish(),
    website: z.string().max(500).nullish(),
    city: z.string().max(80).nullish(),
    state: z.string().min(2).max(2),
    country: z.string().length(2).nullish(),
    niche: z.string().max(80).nullish(),
    notes: z.string().max(5000).nullish(),
    status: statusEnum.nullish(),
  })
  .strip();

export const leadUpdateSchema = leadInputSchema.partial();

export type LeadInputApi = z.infer<typeof leadInputSchema>;

export const bulkLeadsSchema = z.object({
  leads: z.array(leadInputSchema).min(1).max(500),
  review: z.boolean().optional(),
});

export const statusSchema = z.object({ status: statusEnum });
export const noteSchema = z.object({ note: z.string().min(1).max(2000) });
export const followupSchema = z.object({
  due_at: z.string().min(4),
  note: z.string().max(500).nullish(),
});
export const tagsSchema = z.object({ tags: z.array(z.string().min(1).max(40)).min(1).max(50) });

export const importPdfSchema = z.object({
  file_base64: z.string().min(16).optional(),
  url: z.string().url().optional(),
  file_name: z.string().max(200).optional(),
  review: z.boolean().optional(),
}).refine((v) => v.file_base64 || v.url, { message: "Provide file_base64 or url." });

export const exportSchema = z.object({
  format: z.enum(["xlsx", "pdf"]).default("xlsx"),
  filters: z.record(z.string(), z.unknown()).optional(),
  columns: z.array(z.string()).optional(),
  sort: z.enum(["newest", "score", "followup", "name"]).optional(),
});

/** Parse filter + sort from URL query params (REST list/search) or a plain object (MCP). */
export function parseApiFilters(src: URLSearchParams | Record<string, unknown>): { filters: Partial<LeadFilters>; sort: LeadSort; limit: number; offset: number } {
  const get = (k: string): string | undefined => {
    if (src instanceof URLSearchParams) return src.get(k) ?? undefined;
    const v = src[k];
    return v == null ? undefined : String(v);
  };
  const getAll = (k: string): string[] => {
    if (src instanceof URLSearchParams) return src.getAll(k).flatMap((v) => v.split(",")).map((s) => s.trim()).filter(Boolean);
    const v = src[k];
    if (Array.isArray(v)) return v.map(String);
    if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean);
    return [];
  };

  const statuses = getAll("status").filter((s) => (LEAD_STATUSES as readonly string[]).includes(s)) as LeadFilters["statuses"];
  const scores = getAll("score").filter((s) => (SCORE_LABELS as string[]).includes(s)) as LeadFilters["scores"];
  const sources = getAll("source").filter((s) => LEAD_SOURCES.some((x) => x.value === s)) as LeadFilters["sources"];

  const sortRaw = get("sort");
  const sort: LeadSort = (["newest", "score", "followup", "name"] as const).includes(sortRaw as LeadSort) ? (sortRaw as LeadSort) : "newest";

  return {
    filters: {
      q: get("q") ?? "",
      niches: getAll("niche"),
      countries: getAll("country").map((c) => c.toUpperCase()),
      states: getAll("state").map((c) => c.toUpperCase()),
      cities: getAll("city"),
      statuses,
      scores,
      tags: getAll("tag"),
      sources,
      from: get("from") ?? "",
      to: get("to") ?? "",
      due: get("due") === "1" || get("due") === "true",
      priority: get("priority") === "1" || get("priority") === "true",
    },
    sort,
    limit: Math.min(Math.max(Number(get("limit") ?? 30) || 30, 1), 200),
    offset: Math.max(Number(get("offset") ?? 0) || 0, 0),
  };
}

export type { ApiScope };
export { statusEnum, sourceEnum, scoreEnum };
