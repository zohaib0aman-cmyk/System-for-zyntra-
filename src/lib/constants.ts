import type { LeadSource } from "./database.types";

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

export const LEAD_STATUSES = [
  "New",
  "Contacted",
  "Interested",
  "Follow-up",
  "Converted",
  "Not Interested",
] as const;

export const DEFAULT_COUNTRY = "IN";
