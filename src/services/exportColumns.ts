import type { LeadListItem } from "./leadList";
import { formatPhone } from "@/lib/normalize";
import { stateName } from "@/lib/constants";
import { formatDateTime } from "@/lib/time";

/** Columns available for export, in default order. */
export type ExportColumn = {
  key: string;
  label: string;
  width: number; // Excel character width
  value: (lead: LeadListItem) => string | number;
};

export const EXPORT_COLUMNS: ExportColumn[] = [
  { key: "tracking_id", label: "Tracking ID", width: 18, value: (l) => l.tracking_id },
  { key: "brand_name", label: "Brand", width: 26, value: (l) => l.brand_name },
  { key: "owner_name", label: "Owner", width: 20, value: (l) => l.owner_name ?? "" },
  { key: "status", label: "Status", width: 14, value: (l) => l.status },
  { key: "score", label: "Score", width: 8, value: (l) => l.score },
  { key: "score_label", label: "Rating", width: 8, value: (l) => l.score_label },
  { key: "phone", label: "Phone", width: 18, value: (l) => formatPhone(l.phone) },
  { key: "whatsapp", label: "WhatsApp", width: 18, value: (l) => formatPhone(l.whatsapp) },
  { key: "email", label: "Email", width: 26, value: (l) => l.email ?? "" },
  { key: "instagram", label: "Instagram", width: 20, value: (l) => (l.instagram ? `@${l.instagram}` : "") },
  { key: "website", label: "Website", width: 28, value: (l) => l.website ?? "" },
  { key: "city", label: "City", width: 16, value: (l) => l.city ?? "" },
  { key: "state", label: "State", width: 16, value: (l) => stateName(l.state, l.country) },
  { key: "country", label: "Country", width: 10, value: (l) => l.country },
  { key: "niche", label: "Niche", width: 18, value: (l) => l.niche ?? "" },
  { key: "source", label: "Source", width: 10, value: (l) => l.source },
  { key: "tags", label: "Tags", width: 24, value: (l) => l.tags.map((t) => t.name).join(", ") },
  { key: "priority", label: "Priority", width: 9, value: (l) => (l.priority ? "Yes" : "") },
  { key: "next_followup_at", label: "Next follow-up", width: 20, value: (l) => (l.next_followup_at ? formatDateTime(l.next_followup_at) : "") },
  { key: "last_contacted_at", label: "Last contacted", width: 20, value: (l) => (l.last_contacted_at ? formatDateTime(l.last_contacted_at) : "") },
  { key: "created_at", label: "Date added", width: 20, value: (l) => formatDateTime(l.created_at) },
  { key: "notes", label: "Notes", width: 40, value: (l) => l.notes ?? "" },
];

export const DEFAULT_EXPORT_COLUMNS = [
  "tracking_id", "brand_name", "owner_name", "status", "score", "phone", "whatsapp",
  "instagram", "city", "state", "niche", "source", "tags", "next_followup_at", "created_at",
];

export function pickColumns(keys?: string[] | null): ExportColumn[] {
  if (!keys || keys.length === 0) return EXPORT_COLUMNS.filter((c) => DEFAULT_EXPORT_COLUMNS.includes(c.key));
  const set = new Set(keys);
  return EXPORT_COLUMNS.filter((c) => set.has(c.key));
}

/** {key,label} list for the column picker (client-safe; no server-only imports). */
export const ALL_EXPORT_COLUMNS: { key: string; label: string }[] = EXPORT_COLUMNS.map((c) => ({ key: c.key, label: c.label }));
