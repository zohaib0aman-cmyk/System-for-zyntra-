"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  addTagAction,
  loadLeadsAction,
  setStatusAction,
  setStatusManyAction,
} from "@/app/(app)/pipeline-actions";
import { LEAD_STATUSES, STATUS_STYLES } from "@/lib/constants";
import type { LeadStatus } from "@/lib/database.types";
import type { LeadListItem, LeadPage } from "@/services/leadList";
import { LeadCard } from "@/components/LeadCard";
import { Spinner } from "@/components/Spinner";
import { BottomSheet } from "./BottomSheet";
import { TagChip } from "./Chips";

type Props = {
  initial: LeadPage;
  query: string;
  allTags: { id: string; name: string; color: string }[];
  templates: { id: string; name: string }[];
};

export function LeadList({ initial, query, allTags, templates }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState(initial.rows);
  const [total, setTotal] = useState(initial.total);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const sentinel = useRef<HTMLDivElement>(null);

  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quick, setQuick] = useState<LeadListItem | null>(null);
  const [bulkSheet, setBulkSheet] = useState<"tag" | "status" | null>(null);
  const [tagName, setTagName] = useState("");
  const [toast, setToast] = useState<string>();
  const [pending, start] = useTransition();

  const hasMore = rows.length < total;

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    setLoadError(undefined);
    const r = await loadLeadsAction(query, rows.length);
    setLoading(false);
    if (r.error || !r.page) return setLoadError(r.error ?? "Could not load more.");
    setTotal(r.page.total);
    setRows((prev) => {
      const seen = new Set(prev.map((x) => x.id));
      return [...prev, ...r.page!.rows.filter((x) => !seen.has(x.id))];
    });
  }, [loading, hasMore, query, rows.length]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && loadMore(), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  function quickStatus(lead: LeadListItem, status: LeadStatus) {
    setQuick(null);
    setRows((rs) => rs.map((r) => (r.id === lead.id ? { ...r, status } : r)));
    start(async () => {
      const r = await setStatusAction(lead.id, status);
      setToast(r.error ?? `${lead.brand_name}: ${status}`);
      router.refresh();
    });
  }

  function bulkTag(name: string) {
    const ids = [...selected];
    if (!name.trim() || ids.length === 0) return;
    start(async () => {
      const r = await addTagAction(ids, name);
      if (r.error) return setToast(r.error);
      setToast(`#${name.trim()} added to ${r.added} lead${r.added === 1 ? "" : "s"}`);
      setBulkSheet(null);
      setTagName("");
      exitSelect();
      router.refresh();
    });
  }

  function bulkStatus(status: LeadStatus) {
    const ids = [...selected];
    start(async () => {
      const r = await setStatusManyAction(ids, status);
      if (r.error) return setToast(r.error);
      setToast(`${r.updated} lead${r.updated === 1 ? "" : "s"} → ${status}`);
      setBulkSheet(null);
      exitSelect();
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="font-medium">No leads match.</p>
        <p className="mt-1 text-sm text-slate-500">Try removing a filter or changing the search.</p>
        <Link href="/leads/new" className="btn-primary mt-4">Add a lead</Link>
      </div>
    );
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {total.toLocaleString("en-IN")} lead{total === 1 ? "" : "s"}
          {selecting && ` · ${selected.size} selected`}
        </p>
        {selecting ? (
          <div className="flex gap-1">
            <button className="rounded-lg px-2 py-1 text-sm font-medium text-brand-700" onClick={() => setSelected(new Set(rows.map((r) => r.id)))}>
              Select all ({rows.length})
            </button>
            <button className="rounded-lg px-2 py-1 text-sm font-medium text-slate-600" onClick={exitSelect}>Cancel</button>
          </div>
        ) : (
          <button className="rounded-lg px-2 py-1 text-sm font-medium text-brand-700" onClick={() => setSelecting(true)}>
            Select
          </button>
        )}
      </div>

      <ul className="grid gap-2.5 sm:grid-cols-2">
        {rows.map((lead) => (
          <li key={lead.id}>
            <LeadCard
              lead={lead}
              selecting={selecting}
              selected={selected.has(lead.id)}
              onToggleSelect={toggle}
              onQuickMenu={setQuick}
              templates={templates}
            />
          </li>
        ))}
      </ul>

      <div ref={sentinel} className="py-6 text-center text-sm text-slate-500">
        {loading && <Spinner className="mx-auto h-5 w-5 text-brand-600" />}
        {loadError && (
          <button onClick={loadMore} className="text-red-700 underline">{loadError} Tap to retry.</button>
        )}
        {!loading && !loadError && hasMore && (
          <button onClick={loadMore} className="btn-secondary py-2">Load more</button>
        )}
        {!hasMore && rows.length > 10 && <span>That’s all {total.toLocaleString("en-IN")} leads.</span>}
      </div>

      {selecting && (
        <div className="fixed inset-x-0 bottom-above-nav z-40 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-2">
            <p className="flex-1 text-sm font-medium">{selected.size} selected</p>
            <button className="btn-secondary py-2" disabled={!selected.size || pending} onClick={() => setBulkSheet("status")}>Status</button>
            <button className="btn-primary py-2" disabled={!selected.size || pending} onClick={() => setBulkSheet("tag")}>
              {pending && <Spinner />} # Add tag
            </button>
          </div>
        </div>
      )}

      <BottomSheet open={!!quick} onClose={() => setQuick(null)} title={quick?.brand_name ?? ""}>
        {quick && (
          <div className="space-y-3">
            <p className="font-mono text-xs text-brand-700">{quick.tracking_id}</p>
            <p className="text-sm font-medium text-slate-600">Change status</p>
            <div className="grid gap-2">
              {LEAD_STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => quickStatus(quick, s)}
                  className={`flex items-center justify-between rounded-xl px-4 py-3 text-left font-semibold ring-1 ring-inset ${
                    s === quick.status ? `${STATUS_STYLES[s]} ring-2` : "bg-white ring-slate-200"
                  }`}
                >
                  {s} {s === quick.status && <span aria-hidden="true">✓</span>}
                </button>
              ))}
            </div>
            <Link href={`/leads/${quick.tracking_id}`} className="btn-secondary w-full">Open profile</Link>
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={bulkSheet === "tag"} onClose={() => setBulkSheet(null)} title={`Add tag to ${selected.size} leads`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            bulkTag(tagName);
          }}
          className="flex gap-2"
        >
          <input autoFocus value={tagName} onChange={(e) => setTagName(e.target.value)} maxLength={40} placeholder="Tag name" className="input py-2.5" aria-label="Tag name" />
          <button className="btn-primary shrink-0 py-2.5" disabled={pending || !tagName.trim()}>{pending ? <Spinner /> : "Add"}</button>
        </form>
        {allTags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {allTags
              .filter((t) => !tagName || t.name.toLowerCase().includes(tagName.toLowerCase()))
              .slice(0, 20)
              .map((t) => (
                <button key={t.id} onClick={() => bulkTag(t.name)} disabled={pending}>
                  <TagChip name={t.name} color={t.color} />
                </button>
              ))}
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={bulkSheet === "status"} onClose={() => setBulkSheet(null)} title={`Set status for ${selected.size} leads`}>
        <div className="grid gap-2">
          {LEAD_STATUSES.map((s) => (
            <button key={s} disabled={pending} onClick={() => bulkStatus(s)} className={`rounded-xl px-4 py-3 text-left font-semibold ring-1 ring-inset ${STATUS_STYLES[s]}`}>
              {s}
            </button>
          ))}
        </div>
      </BottomSheet>

      {toast && (
        <div role="status" className="fixed inset-x-0 bottom-above-nav z-50 mb-20 flex justify-center px-4">
          <p className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg">{toast}</p>
        </div>
      )}
    </section>
  );
}
