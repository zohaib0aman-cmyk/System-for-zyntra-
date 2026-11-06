"use client";

import { useState } from "react";
import { ALL_EXPORT_COLUMNS, DEFAULT_EXPORT_COLUMNS } from "@/services/exportColumns";
type Col = { key: string; label: string };
import { BottomSheet } from "@/components/pipeline/BottomSheet";
import { Spinner } from "@/components/Spinner";

/** Export the current filtered + sorted list to Excel or PDF, with a column picker. */
export function ExportButton({ query, total }: { query: string; total: number }) {
  const [open, setOpen] = useState(false);
  const [cols, setCols] = useState<string[]>(DEFAULT_EXPORT_COLUMNS);
  const [downloading, setDownloading] = useState<"xlsx" | "pdf" | null>(null);

  function toggle(key: string) {
    setCols((c) => (c.includes(key) ? c.filter((x) => x !== key) : [...c, key]));
  }

  function download(format: "xlsx" | "pdf") {
    setDownloading(format);
    const params = new URLSearchParams(query);
    params.set("format", format);
    // Keep the chosen columns in default order.
    const ordered = ALL_EXPORT_COLUMNS.filter((c: Col) => cols.includes(c.key)).map((c: Col) => c.key);
    params.set("columns", ordered.join(","));
    const url = `/api/export/leads?${params.toString()}`;
    // Trigger a download without leaving the page.
    const a = document.createElement("a");
    a.href = url;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => setDownloading(null), 1500);
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-secondary shrink-0 py-2" aria-haspopup="dialog">
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
          <path d="M10 3a1 1 0 0 1 1 1v6.6l1.3-1.3a1 1 0 1 1 1.4 1.4l-3 3a1 1 0 0 1-1.4 0l-3-3a1 1 0 1 1 1.4-1.4L9 10.6V4a1 1 0 0 1 1-1Z" />
          <path d="M4 14a1 1 0 0 1 1 1v1h10v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1Z" />
        </svg>
        Export
      </button>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Export leads"
        footer={
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => download("xlsx")} disabled={!cols.length || !!downloading} className="btn-primary">
              {downloading === "xlsx" ? <Spinner /> : null} Excel (.xlsx)
            </button>
            <button onClick={() => download("pdf")} disabled={!cols.length || !!downloading} className="btn-secondary">
              {downloading === "pdf" ? <Spinner /> : null} PDF
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Exports the <b>{total.toLocaleString("en-IN")}</b> lead{total === 1 ? "" : "s"} in the current view (filters + sort + search).
            The PDF uses the first 8 chosen columns.
          </p>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Columns</p>
            <div className="flex gap-2 text-xs font-semibold text-brand-700">
              <button onClick={() => setCols(ALL_EXPORT_COLUMNS.map((c: Col) => c.key))}>All</button>
              <button onClick={() => setCols(DEFAULT_EXPORT_COLUMNS)}>Default</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {ALL_EXPORT_COLUMNS.map((c: Col) => (
              <label key={c.key} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                <input type="checkbox" checked={cols.includes(c.key)} onChange={() => toggle(c.key)} className="h-4 w-4 accent-brand-600" />
                {c.label}
              </label>
            ))}
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
