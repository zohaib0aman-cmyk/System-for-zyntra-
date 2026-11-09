import type { ImportStatus } from "@/lib/database.types";

const STYLE: Record<ImportStatus, [string, string]> = {
  processing: ["Processing", "bg-sky-50 text-sky-700 ring-sky-200"],
  review: ["Needs review", "bg-amber-50 text-amber-800 ring-amber-200"],
  done: ["Done", "bg-emerald-50 text-emerald-700 ring-emerald-200"],
  failed: ["Failed", "bg-red-50 text-red-700 ring-red-200"],
};

export function ImportStatusBadge({ status }: { status: ImportStatus }) {
  const [label, cls] = STYLE[status];
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>{label}</span>;
}
