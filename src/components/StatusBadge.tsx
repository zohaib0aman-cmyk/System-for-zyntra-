import { STATUS_STYLES } from "@/lib/constants";
import type { LeadStatus } from "@/lib/database.types";

export function StatusBadge({ status }: { status: LeadStatus | string }) {
  const cls = STATUS_STYLES[status as LeadStatus] ?? STATUS_STYLES.New;
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>
      {status}
    </span>
  );
}
