import { DEFAULT_COUNTRY, INDIAN_STATES, INDIAN_STATE_CODES } from "@/lib/constants";
import type { ExtractedLead } from "@/lib/ai/types";
import { normalizeInstagram, normalizePhone, normalizeWebsite } from "@/lib/normalize";
import { EMPTY_LEAD_FORM, type LeadFormValues } from "@/lib/validation";

const STATE_ALIASES: Record<string, string> = {
  orissa: "OD", or: "OD", pondicherry: "PY", uttaranchal: "UK", ua: "UK", ut: "UK",
  ct: "CG", chattisgarh: "CG", tg: "TS", "new delhi": "DL", "delhi ncr": "DL", nct: "DL",
  "nct of delhi": "DL", "j&k": "JK", "jammu & kashmir": "JK", "andaman & nicobar": "AN",
  "daman and diu": "DH", "dadra and nagar haveli": "DH", dn: "DH", dd: "DH", tamilnadu: "TN",
};

/** Major cities → state code, used when the PDF has a city but no state. */
const CITY_STATE: Record<string, string> = {
  mumbai: "MH", bombay: "MH", pune: "MH", nagpur: "MH", nashik: "MH", thane: "MH", aurangabad: "MH",
  ahmedabad: "GJ", surat: "GJ", vadodara: "GJ", baroda: "GJ", rajkot: "GJ", gandhinagar: "GJ", bhavnagar: "GJ",
  jaipur: "RJ", jodhpur: "RJ", udaipur: "RJ", kota: "RJ", ajmer: "RJ", bikaner: "RJ",
  chennai: "TN", madras: "TN", coimbatore: "TN", tiruppur: "TN", tirupur: "TN", madurai: "TN", salem: "TN", erode: "TN",
  bengaluru: "KA", bangalore: "KA", mysuru: "KA", mysore: "KA", mangaluru: "KA", mangalore: "KA", hubli: "KA",
  hyderabad: "TS", secunderabad: "TS", warangal: "TS",
  kolkata: "WB", calcutta: "WB", howrah: "WB", siliguri: "WB",
  delhi: "DL", "new delhi": "DL",
  noida: "UP", lucknow: "UP", kanpur: "UP", agra: "UP", varanasi: "UP", ghaziabad: "UP", meerut: "UP",
  gurugram: "HR", gurgaon: "HR", faridabad: "HR", panipat: "HR",
  ludhiana: "PB", amritsar: "PB", jalandhar: "PB",
  chandigarh: "CH", indore: "MP", bhopal: "MP", gwalior: "MP", jabalpur: "MP",
  kochi: "KL", cochin: "KL", thiruvananthapuram: "KL", trivandrum: "KL", kozhikode: "KL", calicut: "KL",
  patna: "BR", ranchi: "JH", raipur: "CG", bhubaneswar: "OD", cuttack: "OD", guwahati: "AS",
  visakhapatnam: "AP", vizag: "AP", vijayawada: "AP", panaji: "GA", goa: "GA",
  dehradun: "UK", shimla: "HP", srinagar: "JK", jammu: "JK",
};

export function resolveStateCode(state: string | null, city: string | null): string | null {
  if (state) {
    const s = state.trim();
    const upper = s.toUpperCase();
    if (INDIAN_STATE_CODES.includes(upper)) return upper;
    const lower = s.toLowerCase().replace(/\s+/g, " ").replace(/\.$/, "");
    const byName = INDIAN_STATES.find((st) => st.name.toLowerCase() === lower);
    if (byName) return byName.code;
    if (STATE_ALIASES[lower]) return STATE_ALIASES[lower];
  }
  if (city) {
    const c = city.trim().toLowerCase();
    if (CITY_STATE[c]) return CITY_STATE[c];
  }
  return null;
}

function titleCase(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b(And|Of|&)\b/g, (m) => m.toLowerCase());
}

const stem = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/(es|s)\b/g, "");

/** Matches an AI-suggested niche to the existing list; returns { niche, isNew }. */
export function matchNiche(raw: string | null, niches: string[]): { niche: string; isNew: boolean } | null {
  if (!raw?.trim()) return null;
  const want = stem(raw);
  const exact = niches.find((n) => stem(n) === want);
  if (exact) return { niche: exact, isNew: false };
  // "Clothing" → "Clothing Brand", "Clothing brands" → "Clothing Brand"
  const partial = niches.find((n) => {
    const s = stem(n);
    return want.length >= 4 && (s.startsWith(want) || want.startsWith(s));
  });
  if (partial) return { niche: partial, isNew: false };
  return { niche: titleCase(raw).slice(0, 80), isNew: true };
}

export type NormalizedLead = {
  values: LeadFormValues;
  /** Human-readable problems: missing info or values that could not be cleaned. */
  issues: string[];
  newNiche: string | null;
};

/**
 * Turns one AI-extracted lead into form values in the same format the rest
 * of the app stores: +91 phones, bare Instagram handles, https websites,
 * 2-letter state codes, niches matched to the existing list.
 * Values that cannot be cleaned are kept as-is and reported in `issues`.
 */
export function normalizeExtracted(raw: ExtractedLead, niches: string[]): NormalizedLead {
  const issues: string[] = [];
  const country = (raw.country?.trim().toUpperCase().match(/^[A-Z]{2}$/)?.[0] ??
    (/india/i.test(raw.country ?? "") ? "IN" : null) ??
    DEFAULT_COUNTRY) as string;

  const v: LeadFormValues = { ...EMPTY_LEAD_FORM, source: "pdf", country };
  v.brand_name = raw.brand_name?.replace(/\s+/g, " ").trim() ?? "";
  v.owner_name = raw.owner_name?.trim() ?? "";
  v.email = raw.email?.trim().toLowerCase().replace(/^mailto:/, "") ?? "";
  v.city = raw.city ? titleCase(raw.city) : "";
  v.notes = raw.notes?.trim() ?? "";

  const phone = (value: string | null, label: string): string => {
    if (!value) return "";
    // Several numbers in one cell: keep the first, note the rest.
    const parts = value.split(/\s*(?:,|\/|;|\bor\b)\s*/i).filter((p) => /\d{6,}/.test(p.replace(/\D/g, "")));
    const first = parts[0] ?? value;
    if (parts.length > 1) v.notes = [v.notes, `Other ${label} numbers: ${parts.slice(1).join(", ")}`].filter(Boolean).join(" · ");
    const r = normalizePhone(first, country);
    if (r.ok) return r.value;
    issues.push(`${label}: ${r.error} (“${first}”)`);
    return first;
  };
  v.phone = phone(raw.phone, "Phone");
  v.whatsapp = phone(raw.whatsapp, "WhatsApp");

  if (raw.instagram) {
    const r = normalizeInstagram(raw.instagram);
    if (r.ok) v.instagram = r.value;
    else {
      v.instagram = raw.instagram;
      issues.push(`Instagram: ${r.error}`);
    }
  }
  if (raw.website) {
    const r = normalizeWebsite(raw.website);
    if (r.ok) v.website = r.value;
    else {
      v.website = raw.website;
      issues.push(`Website: ${r.error}`);
    }
  }

  if (country === "IN") {
    const code = resolveStateCode(raw.state, raw.city);
    if (code) v.state = code;
    else issues.push(raw.state ? `State “${raw.state}” not recognised` : "Missing state");
  } else if (raw.state && /^[A-Za-z]{2}$/.test(raw.state.trim())) {
    v.state = raw.state.trim().toUpperCase();
  } else {
    issues.push("Missing state");
  }

  if (!v.brand_name) issues.push("Missing brand name");
  if (!v.phone && !v.whatsapp && !v.email && !v.instagram && !v.website) issues.push("No contact details");

  const n = matchNiche(raw.niche, niches);
  v.niche = n?.niche ?? "";
  return { values: v, issues, newNiche: n?.isNew ? n.niche : null };
}
