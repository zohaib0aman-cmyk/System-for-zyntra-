"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { SCORE_LABEL_TEXT } from "@/config/scoring";
import { LEAD_SOURCES, LEAD_STATUSES, stateName } from "@/lib/constants";
import { activeFilterCount, filtersHref, SCORE_LABELS, SORT_OPTIONS, type LeadFilters, type LeadSort } from "@/lib/filters";
import type { FilterOptions } from "@/services/leadList";
import { Spinner } from "@/components/Spinner";
import { BottomSheet } from "./BottomSheet";

type ListKey = "niches" | "countries" | "states" | "cities" | "statuses" | "scores" | "tags" | "sources";

function useFilterNav(filters: LeadFilters, sort: LeadSort) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (next: LeadFilters, nextSort: LeadSort = sort) =>
    start(() => router.replace(filtersHref(next, nextSort), { scroll: false }));
  const toggle = (key: ListKey, value: string) => {
    const cur = filters[key] as string[];
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    go({ ...filters, [key]: next });
  };
  return { go, toggle, pending };
}

/** All filters. `variant="sidebar"` on desktop, inside a bottom sheet on phones. */
export function FilterPanel({
  options,
  filters,
  sort,
}: {
  options: FilterOptions;
  filters: LeadFilters;
  sort: LeadSort;
}) {
  const { go, toggle, pending } = useFilterNav(filters, sort);
  const [showAllNiches, setShowAllNiches] = useState(false);
  const [showAllCities, setShowAllCities] = useState(false);

  const niches = showAllNiches ? options.niches : options.niches.slice(0, 12);
  const cities = useMemo(() => {
    const inStates = filters.states.length ? options.cities.filter((c) => filters.states.includes(c.state ?? "")) : options.cities;
    return showAllCities ? inStates : inStates.slice(0, 15);
  }, [options.cities, filters.states, showAllCities]);

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-sm ring-1 ring-inset transition active:scale-95 ${
      active ? "bg-brand-600 font-semibold text-white ring-brand-600" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
    }`;

  return (
    <div className="space-y-5" aria-busy={pending}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">
          Filters {pending && <Spinner className="ml-1 inline h-3.5 w-3.5 text-brand-600" />}
        </p>
        {activeFilterCount(filters) > 0 && (
          <button onClick={() => go({ ...filters, ...clearedFilters() })} className="text-sm font-semibold text-brand-700">
            Clear all
          </button>
        )}
      </div>

      <Group title="Niche">
        <ul className="space-y-1">
          {niches.map((n) => {
            const active = filters.niches.includes(n.value);
            return (
              <li key={n.value}>
                <button
                  onClick={() => toggle("niches", n.value)}
                  aria-pressed={active}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm ${
                    active ? "bg-brand-600 font-semibold text-white" : "bg-slate-50 hover:bg-slate-100"
                  }`}
                >
                  <span className="truncate">{n.value}</span>
                  <span className={`ml-2 shrink-0 rounded-full px-2 text-xs font-semibold ${active ? "bg-white/20" : "bg-white text-slate-500"}`}>
                    {n.count.toLocaleString("en-IN")}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {options.niches.length > 12 && (
          <button onClick={() => setShowAllNiches((s) => !s)} className="mt-1 text-xs font-semibold text-brand-700">
            {showAllNiches ? "Show fewer" : `Show all ${options.niches.length} niches`}
          </button>
        )}
      </Group>

      <Group title="Status">
        <div className="flex flex-wrap gap-1.5">
          {LEAD_STATUSES.map((s) => (
            <button key={s} className={chip(filters.statuses.includes(s))} onClick={() => toggle("statuses", s)} aria-pressed={filters.statuses.includes(s)}>
              {s}
            </button>
          ))}
        </div>
      </Group>

      <Group title="Score">
        <div className="flex flex-wrap gap-1.5">
          {SCORE_LABELS.map((s) => (
            <button key={s} className={chip(filters.scores.includes(s))} onClick={() => toggle("scores", s)} aria-pressed={filters.scores.includes(s)}>
              {s === "hot" ? "🔥" : s === "warm" ? "☀️" : "❄️"} {SCORE_LABEL_TEXT[s]}
            </button>
          ))}
          <button className={chip(filters.priority)} onClick={() => go({ ...filters, priority: !filters.priority })} aria-pressed={filters.priority}>
            ★ Priority
          </button>
        </div>
      </Group>

      <Group title="Follow-up">
        <button className={chip(filters.due)} onClick={() => go({ ...filters, due: !filters.due })} aria-pressed={filters.due}>
          ⏰ Due today or overdue
        </button>
      </Group>

      {options.countries.length > 1 && (
        <Group title="Country">
          <div className="flex flex-wrap gap-1.5">
            {options.countries.map((c) => (
              <button key={c.value} className={chip(filters.countries.includes(c.value))} onClick={() => toggle("countries", c.value)}>
                {c.value} <span className="opacity-60">{c.count}</span>
              </button>
            ))}
          </div>
        </Group>
      )}

      <Group title="State">
        <div className="flex flex-wrap gap-1.5">
          {options.states.map((s) => (
            <button
              key={s.value}
              className={chip(filters.states.includes(s.value))}
              onClick={() => toggle("states", s.value)}
              aria-pressed={filters.states.includes(s.value)}
              title={stateName(s.value)}
            >
              {stateName(s.value)} <span className="opacity-60">{s.count}</span>
            </button>
          ))}
        </div>
      </Group>

      {cities.length > 0 && (
        <Group title="City">
          <div className="flex flex-wrap gap-1.5">
            {cities.map((c) => (
              <button
                key={`${c.value}-${c.state}`}
                className={chip(filters.cities.some((x) => x.toLowerCase() === c.value.toLowerCase()))}
                onClick={() => toggle("cities", filters.cities.find((x) => x.toLowerCase() === c.value.toLowerCase()) ?? c.value)}
              >
                {c.value} <span className="opacity-60">{c.count}</span>
              </button>
            ))}
          </div>
          {options.cities.length > 15 && (
            <button onClick={() => setShowAllCities((s) => !s)} className="mt-1 text-xs font-semibold text-brand-700">
              {showAllCities ? "Show fewer" : "Show more cities"}
            </button>
          )}
        </Group>
      )}

      {options.tags.length > 0 && (
        <Group title="Tags (must have all)">
          <div className="flex flex-wrap gap-1.5">
            {options.tags.map((t) => {
              const active = filters.tags.some((x) => x.toLowerCase() === t.value.toLowerCase());
              return (
                <button
                  key={t.value}
                  className={chip(active)}
                  onClick={() => toggle("tags", filters.tags.find((x) => x.toLowerCase() === t.value.toLowerCase()) ?? t.value)}
                >
                  #{t.value} <span className="opacity-60">{t.count}</span>
                </button>
              );
            })}
          </div>
        </Group>
      )}

      <Group title="Source">
        <div className="flex flex-wrap gap-1.5">
          {LEAD_SOURCES.map((s) => (
            <button key={s.value} className={chip(filters.sources.includes(s.value))} onClick={() => toggle("sources", s.value)}>
              {s.label}
            </button>
          ))}
        </div>
      </Group>

      <Group title="Date added">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-slate-500">
            From
            <input type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => go({ ...filters, from: e.target.value })} className="input mt-1 py-2 text-sm" />
          </label>
          <label className="text-xs text-slate-500">
            To
            <input type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => go({ ...filters, to: e.target.value })} className="input mt-1 py-2 text-sm" />
          </label>
        </div>
      </Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
      {children}
    </section>
  );
}

function clearedFilters(): Omit<LeadFilters, "q"> {
  return { niches: [], countries: [], states: [], cities: [], statuses: [], scores: [], tags: [], sources: [], from: "", to: "", due: false, priority: false };
}

/** Filter button (opens the sheet on phones), sort menu and removable chips for active filters. */
export function LeadsToolbar({
  options,
  filters,
  sort,
}: {
  options: FilterOptions;
  filters: LeadFilters;
  sort: LeadSort;
}) {
  const [open, setOpen] = useState(false);
  const { go, pending } = useFilterNav(filters, sort);
  const count = activeFilterCount(filters);

  const chips: { label: string; remove: () => void }[] = [];
  const add = (label: string, next: Partial<LeadFilters>) => chips.push({ label, remove: () => go({ ...filters, ...next }) });
  filters.niches.forEach((v) => add(v, { niches: filters.niches.filter((x) => x !== v) }));
  filters.statuses.forEach((v) => add(v, { statuses: filters.statuses.filter((x) => x !== v) }));
  filters.scores.forEach((v) => add(SCORE_LABEL_TEXT[v], { scores: filters.scores.filter((x) => x !== v) }));
  filters.countries.forEach((v) => add(v, { countries: filters.countries.filter((x) => x !== v) }));
  filters.states.forEach((v) => add(stateName(v), { states: filters.states.filter((x) => x !== v) }));
  filters.cities.forEach((v) => add(v, { cities: filters.cities.filter((x) => x !== v) }));
  filters.tags.forEach((v) => add(`#${v}`, { tags: filters.tags.filter((x) => x !== v) }));
  filters.sources.forEach((v) => add(LEAD_SOURCES.find((s) => s.value === v)?.label ?? v, { sources: filters.sources.filter((x) => x !== v) }));
  if (filters.from) add(`From ${filters.from}`, { from: "" });
  if (filters.to) add(`To ${filters.to}`, { to: "" });
  if (filters.due) add("Follow-up due", { due: false });
  if (filters.priority) add("★ Priority", { priority: false });

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button onClick={() => setOpen(true)} className="btn-secondary py-2 lg:hidden" aria-haspopup="dialog">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path d="M3 5a1 1 0 0 1 1-1h12a1 1 0 0 1 .8 1.6L12 12v4a1 1 0 0 1-1.45.9l-2-1A1 1 0 0 1 8 15v-3L3.2 5.6A1 1 0 0 1 3 5Z" />
          </svg>
          Filter{count > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-xs text-white">{count}</span>}
        </button>
        <label className="ml-auto flex items-center gap-1.5 text-sm text-slate-600">
          <span className="hidden sm:inline">Sort</span>
          <select
            value={sort}
            onChange={(e) => go(filters, e.target.value as LeadSort)}
            className="rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-sm font-medium"
            aria-label="Sort leads"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        {pending && <Spinner className="h-4 w-4 text-brand-600" />}
      </div>

      {chips.length > 0 && (
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
          {chips.map((c) => (
            <button
              key={c.label}
              onClick={c.remove}
              className="flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700 ring-1 ring-inset ring-brand-200"
              aria-label={`Remove filter ${c.label}`}
            >
              {c.label} <span aria-hidden="true">×</span>
            </button>
          ))}
          <button onClick={() => go({ ...filters, ...clearedFilters() })} className="shrink-0 px-2 text-sm font-semibold text-slate-500">
            Clear all
          </button>
        </div>
      )}

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Filter leads"
        footer={
          <button onClick={() => setOpen(false)} className="btn-primary w-full">
            {pending ? <Spinner /> : "Show results"}
          </button>
        }
      >
        <FilterPanel options={options} filters={filters} sort={sort} />
      </BottomSheet>
    </div>
  );
}
