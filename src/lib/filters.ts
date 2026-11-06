import { LEAD_SOURCES, LEAD_STATUSES } from "./constants";
import type { LeadSource, LeadStatus, ScoreLabel } from "./database.types";

/**
 * Lead list filters. Stored in the URL (so a filtered view can be bookmarked):
 *   /?q=silk&niche=Clothing+Brand&state=GJ&status=Interested&score=hot&tag=Diwali+offer&sort=score
 * Repeat a key for several values: ?state=GJ&state=MH
 */
export type LeadFilters = {
  q: string;
  niches: string[];
  countries: string[];
  states: string[];
  cities: string[];
  statuses: LeadStatus[];
  scores: ScoreLabel[];
  tags: string[]; // tag names; lead must have all of them
  sources: LeadSource[];
  from: string; // YYYY-MM-DD (date added, inclusive)
  to: string; // YYYY-MM-DD (inclusive)
  due: boolean; // has a follow-up due today or overdue
  priority: boolean;
};

export type LeadSort = "newest" | "score" | "followup" | "name";

export const SORT_OPTIONS: { value: LeadSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "score", label: "Score" },
  { value: "followup", label: "Next follow-up" },
  { value: "name", label: "Brand name" },
];

export const SCORE_LABELS: ScoreLabel[] = ["hot", "warm", "cold"];

export const EMPTY_FILTERS: LeadFilters = {
  q: "",
  niches: [],
  countries: [],
  states: [],
  cities: [],
  statuses: [],
  scores: [],
  tags: [],
  sources: [],
  from: "",
  to: "",
  due: false,
  priority: false,
};

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

function getAll(p: ParamSource, key: string): string[] {
  const raw = p instanceof URLSearchParams ? p.getAll(key) : ([] as string[]).concat(p[key] ?? []);
  return [...new Set(raw.flatMap((v) => v.split("|")).map((v) => v.trim()).filter(Boolean))].slice(0, 50);
}
const getOne = (p: ParamSource, key: string) => getAll(p, key)[0] ?? "";
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export function parseFilters(p: ParamSource): { filters: LeadFilters; sort: LeadSort } {
  const sortRaw = getOne(p, "sort") as LeadSort;
  return {
    filters: {
      q: getOne(p, "q").slice(0, 200),
      niches: getAll(p, "niche"),
      countries: getAll(p, "country").map((c) => c.toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)),
      states: getAll(p, "state").map((c) => c.toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)),
      cities: getAll(p, "city"),
      statuses: getAll(p, "status").filter((s): s is LeadStatus => (LEAD_STATUSES as readonly string[]).includes(s)),
      scores: getAll(p, "score").filter((s): s is ScoreLabel => (SCORE_LABELS as string[]).includes(s)),
      tags: getAll(p, "tag"),
      sources: getAll(p, "source").filter((s): s is LeadSource => LEAD_SOURCES.some((x) => x.value === s)),
      from: isDate(getOne(p, "from")) ? getOne(p, "from") : "",
      to: isDate(getOne(p, "to")) ? getOne(p, "to") : "",
      due: getOne(p, "due") === "1",
      priority: getOne(p, "priority") === "1",
    },
    sort: SORT_OPTIONS.some((o) => o.value === sortRaw) ? sortRaw : "newest",
  };
}

export function filtersToParams(f: LeadFilters, sort: LeadSort = "newest"): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  f.niches.forEach((v) => p.append("niche", v));
  f.countries.forEach((v) => p.append("country", v));
  f.states.forEach((v) => p.append("state", v));
  f.cities.forEach((v) => p.append("city", v));
  f.statuses.forEach((v) => p.append("status", v));
  f.scores.forEach((v) => p.append("score", v));
  f.tags.forEach((v) => p.append("tag", v));
  f.sources.forEach((v) => p.append("source", v));
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.due) p.set("due", "1");
  if (f.priority) p.set("priority", "1");
  if (sort !== "newest") p.set("sort", sort);
  return p;
}

export function filtersHref(f: LeadFilters, sort: LeadSort = "newest"): string {
  const qs = filtersToParams(f, sort).toString();
  return qs ? `/?${qs}` : "/";
}

/** Number of active filters (not counting search text and sort). */
export function activeFilterCount(f: LeadFilters): number {
  return (
    f.niches.length + f.countries.length + f.states.length + f.cities.length + f.statuses.length +
    f.scores.length + f.tags.length + f.sources.length + (f.from ? 1 : 0) + (f.to ? 1 : 0) +
    (f.due ? 1 : 0) + (f.priority ? 1 : 0)
  );
}
