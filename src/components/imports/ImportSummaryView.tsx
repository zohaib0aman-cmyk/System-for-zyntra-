import Link from "next/link";
import type { ImportResultRow } from "@/services/imports";

export function ImportSummaryView({
  added,
  merged,
  skipped,
  results,
}: {
  added: number;
  merged: number;
  skipped: number;
  results: ImportResultRow[];
}) {
  const groups = {
    added: results.filter((r) => r.outcome === "added"),
    merged: results.filter((r) => r.outcome === "merged"),
    skipped: results.filter((r) => r.outcome === "skipped" || r.outcome === "failed"),
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat value={added} label="added" cls="text-emerald-700" />
        <Stat value={merged} label="merged" cls="text-violet-700" />
        <Stat value={skipped} label="skipped" cls={skipped ? "text-amber-700" : "text-slate-400"} />
      </div>
      {added > 0 && (
        <p className="text-center text-xs text-slate-500">Logos are being looked up in the background — refresh in a minute.</p>
      )}

      <Group title="Added — new tracking IDs" rows={groups.added} />
      <Group title="Merged into existing leads" rows={groups.merged} />
      <Group title="Skipped / failed" rows={groups.skipped} warn />
    </div>
  );
}

function Stat({ value, label, cls }: { value: number; label: string; cls: string }) {
  return (
    <div className="card p-3">
      <p className={`text-3xl font-bold ${cls}`}>{value}</p>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}

function Group({ title, rows, warn }: { title: string; rows: ImportResultRow[]; warn?: boolean }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h2>
      <ul className="card divide-y divide-slate-100">
        {rows.map((r) => (
          <li key={r.key} className="p-3">
            {r.tracking_id ? (
              <Link href={`/leads/${r.tracking_id}`} className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{r.brand_name}</span>
                <span className="shrink-0 font-mono text-xs font-semibold text-brand-700">{r.tracking_id} →</span>
              </Link>
            ) : (
              <p className="text-sm font-medium">{r.brand_name}</p>
            )}
            {r.reason && <p className={`mt-0.5 text-xs ${warn ? "text-amber-800" : "text-slate-500"}`}>{r.reason}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
