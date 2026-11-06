const STYLES: Record<string, string> = {
  New: "bg-sky-50 text-sky-700 ring-sky-200",
  Contacted: "bg-amber-50 text-amber-800 ring-amber-200",
  Interested: "bg-violet-50 text-violet-700 ring-violet-200",
  "Follow-up": "bg-orange-50 text-orange-700 ring-orange-200",
  Converted: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "Not Interested": "bg-slate-100 text-slate-600 ring-slate-200",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[status] ?? STYLES["Not Interested"]}`}>
      {status}
    </span>
  );
}
