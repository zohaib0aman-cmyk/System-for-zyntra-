import Link from "next/link";
import { Suspense } from "react";
import { activeFilterCount, filtersToParams, parseFilters } from "@/lib/filters";
import { createClient } from "@/lib/supabase/server";
import { getFilterOptions, listLeads, listTags } from "@/services";
import { SearchBar } from "@/components/SearchBar";
import { FilterPanel, LeadsToolbar } from "@/components/pipeline/FilterPanel";
import { LeadList } from "@/components/pipeline/LeadList";
import { TodayFollowups } from "@/components/pipeline/TodayFollowups";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { filters, sort } = parseFilters(await searchParams);
  const query = filtersToParams(filters, sort).toString();
  const db = await createClient();
  const [page, options, tags] = await Promise.all([listLeads(db, filters, sort), getFilterOptions(db), listTags(db)]);
  const showToday = !filters.q && activeFilterCount(filters) === 0;
  const opts = options.ok ? options.data : { total: 0, niches: [], countries: [], states: [], cities: [], tags: [] };

  return (
    <div className="lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-6">
      <aside className="hidden lg:block">
        <div className="card sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto p-4">
          <FilterPanel options={opts} filters={filters} sort={sort} />
        </div>
      </aside>

      <div className="min-w-0 space-y-4">
        {showToday && (
          <Suspense fallback={null}>
            <TodayFollowups />
          </Suspense>
        )}

        <div className="sticky top-14 z-10 -mx-4 space-y-2 bg-slate-50/95 px-4 pb-2 pt-1 backdrop-blur">
          <SearchBar initialQuery={filters.q} />
          <LeadsToolbar options={opts} filters={filters} sort={sort} />
        </div>

        {page.ok ? (
          <LeadList key={query} initial={page.data} query={query} allTags={tags.ok ? tags.data : []} />
        ) : (
          <p role="alert" className="card border-red-200 bg-red-50 p-4 text-sm text-red-700">Could not load leads: {page.message}</p>
        )}
      </div>

      <Link
        href="/leads/new"
        className="fixed bottom-above-nav right-4 z-30 mb-4 inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-4 font-semibold text-white shadow-lg shadow-brand-600/30 hover:bg-brand-700 active:scale-95 md:right-6"
      >
        <span className="text-xl leading-none">+</span> Add lead
      </Link>
    </div>
  );
}
