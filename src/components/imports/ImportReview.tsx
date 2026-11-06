"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { commitImportAction, saveItemsAction } from "@/app/(app)/imports/actions";
import { INDIAN_STATES } from "@/lib/constants";
import { formatPhone } from "@/lib/normalize";
import type { LeadField } from "@/lib/validation";
import type { ImportItem, ImportItemStatus, ImportResultRow } from "@/services/imports";
import { LeadAvatar } from "@/components/LeadAvatar";
import { Spinner } from "@/components/Spinner";

type Filter = "all" | ImportItemStatus;

const BADGE: Record<ImportItemStatus, { label: string; cls: string }> = {
  new: { label: "New", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  duplicate: { label: "Duplicate · will merge", cls: "bg-violet-50 text-violet-700 ring-violet-200" },
  missing: { label: "Missing info", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
};

export function ImportReview({
  importId,
  initialItems,
  niches,
  failures,
}: {
  importId: string;
  initialItems: ImportItem[];
  niches: string[];
  failures: ImportResultRow[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [saving, startSaving] = useTransition();
  const [committing, startCommit] = useTransition();

  const active = items.filter((i) => !i.removed);
  const counts = useMemo(
    () => ({
      all: active.length,
      new: active.filter((i) => i.status === "new").length,
      duplicate: active.filter((i) => i.status === "duplicate").length,
      missing: active.filter((i) => i.status === "missing").length,
    }),
    [active],
  );
  const blocked = active.filter((i) => !i.canSave).length;
  const visible = items.filter((i) => filter === "all" || (i.status === filter && !i.removed));
  const nameByKey = new Map(items.map((i) => [i.key, i.values.brand_name]));

  function persist(next: ImportItem[]) {
    setItems(next);
    startSaving(async () => {
      const res = await saveItemsAction(importId, next);
      if (res.error) setError(res.error);
      else if (res.items) setItems(res.items);
    });
  }

  function addAll() {
    setError(undefined);
    startCommit(async () => {
      const res = await commitImportAction(importId, items);
      if (res.error) return setError(res.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 pb-24">
      {failures.length > 0 && (
        <div className="card border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-semibold">Some parts of the PDF could not be read</p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {failures.map((f) => (
              <li key={f.key}>{f.brand_name}: {f.reason}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist">
        {(["all", "new", "duplicate", "missing"] as Filter[]).map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset ${
              filter === f ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-300"
            }`}
          >
            {f === "all" ? "All" : BADGE[f].label.split(" ·")[0]} <span className="opacity-70">{counts[f]}</span>
          </button>
        ))}
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}

      <ul className="space-y-2.5">
        {visible.map((item) =>
          editing === item.key ? (
            <li key={item.key}>
              <ItemEditor
                item={item}
                niches={niches}
                onCancel={() => setEditing(null)}
                onSave={(values) => {
                  setEditing(null);
                  persist(items.map((i) => (i.key === item.key ? { ...i, values } : i)));
                }}
              />
            </li>
          ) : (
            <li key={item.key}>
              <ItemCard
                item={item}
                twinName={item.duplicateInFile ? nameByKey.get(item.duplicateInFile) : undefined}
                onEdit={() => setEditing(item.key)}
                onToggleRemove={() =>
                  persist(items.map((i) => (i.key === item.key ? { ...i, removed: !i.removed } : i)))
                }
                disabled={committing}
              />
            </li>
          ),
        )}
      </ul>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <p className="flex-1 text-xs text-slate-600">
            {counts.new} new · {counts.duplicate} merge
            {blocked > 0 && <span className="text-amber-700"> · {blocked} will be skipped unless fixed</span>}
            {saving && <span className="text-slate-400"> · saving…</span>}
          </p>
          <button onClick={addAll} disabled={committing || active.length === 0} className="btn-primary">
            {committing && <Spinner />} {committing ? "Saving…" : `Add all (${active.length - blocked})`}
          </button>
        </div>
      </div>
    </div>
  );
}

function ItemCard({
  item,
  twinName,
  onEdit,
  onToggleRemove,
  disabled,
}: {
  item: ImportItem;
  twinName?: string;
  onEdit: () => void;
  onToggleRemove: () => void;
  disabled: boolean;
}) {
  const v = item.values;
  const badge = BADGE[item.status];
  if (item.removed) {
    return (
      <div className="card flex items-center justify-between border-dashed p-3 text-sm text-slate-400">
        <span className="truncate line-through">{v.brand_name || "(no name)"}</span>
        <button onClick={onToggleRemove} disabled={disabled} className="font-semibold text-brand-700">Undo</button>
      </div>
    );
  }
  return (
    <div className={`card p-3 ${item.canSave ? "" : "border-amber-300"}`}>
      <div className="flex items-start gap-3">
        <LeadAvatar name={v.brand_name || "?"} logoUrl={null} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate font-semibold">{v.brand_name || <span className="text-amber-700">No brand name</span>}</p>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${badge.cls}`}>{badge.label}</span>
          </div>
          <p className="truncate text-xs text-slate-500">
            {[v.owner_name, v.niche, [v.city, v.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "—"}
          </p>
          <p className="mt-1 truncate text-xs text-slate-700">
            {[v.phone && formatPhone(v.phone), v.instagram && `@${v.instagram}`, v.website?.replace(/^https?:\/\//, ""), v.email]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {item.duplicateOf && (
            <p className="mt-1.5 text-xs text-violet-700">
              Will merge into{" "}
              <Link href={`/leads/${item.duplicateOf.tracking_id}`} className="font-mono font-semibold underline" target="_blank">
                {item.duplicateOf.tracking_id}
              </Link>{" "}
              ({item.duplicateOf.brand_name}) — empty fields are filled, nothing is overwritten.
            </p>
          )}
          {item.duplicateInFile && (
            <p className="mt-1.5 text-xs text-violet-700">Same as “{twinName}” earlier in this PDF — will be merged into it.</p>
          )}
          {item.issues.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-xs text-amber-800">
              {item.issues.map((i) => (
                <li key={i}>• {i}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={onEdit} disabled={disabled} className="btn-secondary flex-1 py-2">Edit</button>
        <button onClick={onToggleRemove} disabled={disabled} className="btn-secondary flex-1 py-2 text-red-700">Remove</button>
      </div>
    </div>
  );
}

const EDIT_FIELDS: { field: LeadField; label: string; type?: string }[] = [
  { field: "brand_name", label: "Brand name *" },
  { field: "owner_name", label: "Owner name" },
  { field: "phone", label: "Phone", type: "tel" },
  { field: "whatsapp", label: "WhatsApp", type: "tel" },
  { field: "email", label: "Email", type: "email" },
  { field: "instagram", label: "Instagram" },
  { field: "website", label: "Website", type: "url" },
  { field: "city", label: "City" },
];

function ItemEditor({
  item,
  niches,
  onSave,
  onCancel,
}: {
  item: ImportItem;
  niches: string[];
  onSave: (values: ImportItem["values"]) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState(item.values);
  const set = (f: LeadField, value: string) => setV((x) => ({ ...x, [f]: value }));
  const nicheOptions = v.niche && !niches.includes(v.niche) ? [v.niche, ...niches] : niches;
  return (
    <form
      className="card space-y-3 border-brand-300 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(v);
      }}
    >
      {EDIT_FIELDS.map(({ field, label, type }) => (
        <div key={field}>
          <label className="label" htmlFor={`${item.key}-${field}`}>{label}</label>
          <input
            id={`${item.key}-${field}`}
            type={type ?? "text"}
            value={v[field]}
            onChange={(e) => set(field, e.target.value)}
            className="input py-2.5"
            autoCapitalize={field === "instagram" || field === "website" || field === "email" ? "none" : undefined}
          />
        </div>
      ))}
      <div>
        <label className="label" htmlFor={`${item.key}-state`}>State *</label>
        <select id={`${item.key}-state`} value={v.state} onChange={(e) => set("state", e.target.value)} className="input py-2.5">
          <option value="">Select state…</option>
          {INDIAN_STATES.map((s) => (
            <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor={`${item.key}-niche`}>Niche</label>
        <select id={`${item.key}-niche`} value={v.niche} onChange={(e) => set("niche", e.target.value)} className="input py-2.5">
          <option value="">—</option>
          {nicheOptions.map((n) => (
            <option key={n} value={n}>{n}{niches.includes(n) ? "" : " (new)"}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor={`${item.key}-notes`}>Notes</label>
        <textarea id={`${item.key}-notes`} value={v.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className="input py-2.5" />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1 py-2">Cancel</button>
        <button type="submit" className="btn-primary flex-1 py-2">Done</button>
      </div>
    </form>
  );
}
