import type { LeadSource, LeadStatus } from "./database.types";

/** Indian states & union territories with 2-letter codes (ISO 3166-2:IN style). */
export const INDIAN_STATES = [
  { code: "AN", name: "Andaman and Nicobar Islands" },
  { code: "AP", name: "Andhra Pradesh" },
  { code: "AR", name: "Arunachal Pradesh" },
  { code: "AS", name: "Assam" },
  { code: "BR", name: "Bihar" },
  { code: "CH", name: "Chandigarh" },
  { code: "CG", name: "Chhattisgarh" },
  { code: "DH", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "DL", name: "Delhi" },
  { code: "GA", name: "Goa" },
  { code: "GJ", name: "Gujarat" },
  { code: "HR", name: "Haryana" },
  { code: "HP", name: "Himachal Pradesh" },
  { code: "JK", name: "Jammu and Kashmir" },
  { code: "JH", name: "Jharkhand" },
  { code: "KA", name: "Karnataka" },
  { code: "KL", name: "Kerala" },
  { code: "LA", name: "Ladakh" },
  { code: "LD", name: "Lakshadweep" },
  { code: "MP", name: "Madhya Pradesh" },
  { code: "MH", name: "Maharashtra" },
  { code: "MN", name: "Manipur" },
  { code: "ML", name: "Meghalaya" },
  { code: "MZ", name: "Mizoram" },
  { code: "NL", name: "Nagaland" },
  { code: "OD", name: "Odisha" },
  { code: "PY", name: "Puducherry" },
  { code: "PB", name: "Punjab" },
  { code: "RJ", name: "Rajasthan" },
  { code: "SK", name: "Sikkim" },
  { code: "TN", name: "Tamil Nadu" },
  { code: "TS", name: "Telangana" },
  { code: "TR", name: "Tripura" },
  { code: "UP", name: "Uttar Pradesh" },
  { code: "UK", name: "Uttarakhand" },
  { code: "WB", name: "West Bengal" },
] as const;

export const INDIAN_STATE_CODES = INDIAN_STATES.map((s) => s.code) as readonly string[];

export function stateName(code: string, country = "IN"): string {
  if (country !== "IN") return code;
  return INDIAN_STATES.find((s) => s.code === code)?.name ?? code;
}

export const LEAD_SOURCES: readonly { value: LeadSource; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "pdf", label: "PDF import" },
  { value: "claude", label: "Claude" },
  { value: "gpt", label: "GPT" },
];

/** Pipeline stages, in order. Must match the lead_status enum in the database. */
export const LEAD_STATUSES = ["New", "Contacted", "Interested", "Deal Closed", "Rejected"] as const satisfies readonly LeadStatus[];

/** Badge colours per stage (Tailwind classes). */
export const STATUS_STYLES: Record<LeadStatus, string> = {
  New: "bg-sky-50 text-sky-700 ring-sky-200",
  Contacted: "bg-amber-50 text-amber-800 ring-amber-200",
  Interested: "bg-violet-50 text-violet-700 ring-violet-200",
  "Deal Closed": "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Rejected: "bg-slate-100 text-slate-600 ring-slate-200",
};

/** Time zone used for "today" (follow-ups, date filters). */
export const APP_TIMEZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata";

/** Tag colour palette (name → chip classes). */
export const TAG_COLORS: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  rose: "bg-rose-50 text-rose-700 ring-rose-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  sky: "bg-sky-50 text-sky-700 ring-sky-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
  orange: "bg-orange-50 text-orange-700 ring-orange-200",
  teal: "bg-teal-50 text-teal-700 ring-teal-200",
};

export const DEFAULT_COUNTRY = "IN";
