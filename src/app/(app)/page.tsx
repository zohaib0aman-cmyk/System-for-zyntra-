import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { searchLeads } from "@/services";
import { LeadCard } from "@/components/LeadCard";
import { SearchBar } from "@/components/SearchBar";
import { LeadListSkeleton } from "@/components/Skeletons";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  return (
    <div className="space-y-4">
      <div className="sticky top-14 z-10 -mx-4 bg-slate-50/95 px-4 pb-2 pt-1 backdrop-blur">
        <SearchBar initialQuery={q} />
      </div>
      <Suspense key={q} fallback={<LeadListSkeleton />}>
        <LeadResults query={q} />
      </Suspense>
      <Link
        href="/leads/new"
        className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-4 font-semibold text-white shadow-lg shadow-brand-600/30 hover:bg-brand-700 active:scale-95"
      >
        <span className="text-xl leading-none">+</span> Add lead
      </Link>
    </div>
  );
}

async function LeadResults({ query }: { query: string }) {
  const db = await createClient();
  const res = await searchLeads(db, query);
  if (!res.ok) {
    return <p role="alert" className="card border-red-200 bg-red-50 p-4 text-sm text-red-700">Could not load leads: {res.message}</p>;
  }
  const leads = res.data;
  if (leads.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="font-medium">{query ? `No leads match “${query}”.` : "No leads yet."}</p>
        <Link href="/leads/new" className="btn-primary mt-4">Add a lead</Link>
      </div>
    );
  }
  return (
    <section>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        {query ? `${leads.length} result${leads.length === 1 ? "" : "s"}` : `Latest ${leads.length} lead${leads.length === 1 ? "" : "s"}`}
      </p>
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {leads.map((lead) => (
          <li key={lead.id}><LeadCard lead={lead} /></li>
        ))}
      </ul>
    </section>
  );
}
