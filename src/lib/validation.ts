import { z } from "zod";
import { DEFAULT_COUNTRY, INDIAN_STATE_CODES, LEAD_SOURCES, LEAD_STATUSES } from "./constants";
import type { LeadInsert, LeadUpdate } from "./database.types";
import { normalizeInstagram, normalizePhone, normalizeWebsite, type NormalizeResult } from "./normalize";

/**
 * Lead validation shared by the browser (instant feedback), server actions,
 * and future API / MCP entry points.
 *
 * Text rules: values are trimmed; "" becomes null (clears the field);
 * undefined means "not provided" (left untouched on update).
 */

function optText(max: number, label: string) {
  return z
    .string()
    .nullable()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined) return undefined;
      const t = (v ?? "").trim();
      if (t === "") return null;
      if (t.length > max) {
        ctx.addIssue({ code: "custom", message: `${label} is too long (max ${max} characters).` });
        return z.NEVER;
      }
      return t;
    });
}

const fields = {
  // Required-ness of brand_name / state is checked in normalizeAll so that
  // every field error is reported at once.
  brand_name: z.string().trim().max(120, "Brand name is too long.").optional(),
  owner_name: optText(120, "Owner name"),
  phone: optText(30, "Phone"),
  whatsapp: optText(30, "WhatsApp"),
  email: optText(254, "Email"),
  instagram: optText(200, "Instagram"),
  website: optText(500, "Website"),
  city: optText(80, "City"),
  state: z.string().trim().toUpperCase().optional(),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Country must be a 2-letter code, e.g. IN.")
    .optional(),
  niche: optText(80, "Niche"),
  logo_url: optText(1000, "Logo URL"),
  source: z
    .enum(LEAD_SOURCES.map((s) => s.value) as ["manual", "pdf", "claude", "gpt"], {
      error: "Invalid source.",
    })
    .optional(),
  status: z.enum(LEAD_STATUSES, { error: "Pick a valid status." }).optional(),
  notes: optText(5000, "Notes"),
};

export type LeadField = keyof typeof fields;

type Parsed = { [K in keyof typeof fields]?: z.output<(typeof fields)[K]> };

function normalizeAll<T extends Parsed>(data: T, ctx: z.RefinementCtx, isCreate: boolean): T {
  const out = { ...data };
  const country = out.country ?? DEFAULT_COUNTRY;
  if (isCreate) out.country = country;

  if (isCreate || out.brand_name !== undefined) {
    if (!out.brand_name) ctx.addIssue({ code: "custom", path: ["brand_name"], message: "Brand name is required." });
  }
  if (isCreate || out.state !== undefined) {
    if (!out.state) ctx.addIssue({ code: "custom", path: ["state"], message: "State is required." });
    else if (!/^[A-Z]{2}$/.test(out.state))
      ctx.addIssue({ code: "custom", path: ["state"], message: "State must be a 2-letter code." });
  }

  if (out.state && country === "IN" && !INDIAN_STATE_CODES.includes(out.state)) {
    ctx.addIssue({ code: "custom", path: ["state"], message: "Pick a valid Indian state." });
  }

  const apply = (key: "phone" | "whatsapp" | "instagram" | "website", fn: (v: string) => NormalizeResult) => {
    const v = out[key];
    if (typeof v !== "string") return;
    const r = fn(v);
    if (r.ok) out[key] = r.value;
    else ctx.addIssue({ code: "custom", path: [key], message: r.error });
  };
  apply("phone", (v) => normalizePhone(v, country));
  apply("whatsapp", (v) => normalizePhone(v, country));
  apply("instagram", normalizeInstagram);
  apply("website", normalizeWebsite);

  if (typeof out.email === "string") {
    out.email = out.email.toLowerCase();
    if (!z.email().safeParse(out.email).success) {
      ctx.addIssue({ code: "custom", path: ["email"], message: "Enter a valid email address." });
    }
  }
  if (typeof out.logo_url === "string") {
    const r = normalizeWebsite(out.logo_url);
    if (r.ok) out.logo_url = r.value;
    else ctx.addIssue({ code: "custom", path: ["logo_url"], message: "Enter a valid image URL." });
  }
  return out;
}

export const createLeadSchema = z
  .object(fields)
  .transform((d, ctx) => normalizeAll(d, ctx, true) as LeadInsert);

export const updateLeadSchema = z
  .object(fields)
  .partial()
  .transform((d, ctx) => normalizeAll(d, ctx, false) as LeadUpdate);

export const nicheNameSchema = z
  .string()
  .trim()
  .min(2, "Niche name is too short.")
  .max(80, "Niche name is too long.");

export type FieldErrors = Partial<Record<LeadField, string>>;

export function toFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as LeadField | undefined;
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

/** Raw form values as strings (what the form sends / what an API might send). */
export type LeadFormValues = Record<LeadField, string>;

export const EMPTY_LEAD_FORM: LeadFormValues = {
  brand_name: "",
  owner_name: "",
  phone: "",
  whatsapp: "",
  email: "",
  instagram: "",
  website: "",
  city: "",
  state: "",
  country: DEFAULT_COUNTRY,
  niche: "",
  logo_url: "",
  source: "manual",
  status: "New",
  notes: "",
};

/** Existing lead → form values (null → ""). */
export function leadToFormValues(lead: { [K in LeadField]?: string | null }): LeadFormValues {
  const out = { ...EMPTY_LEAD_FORM };
  for (const key of Object.keys(out) as LeadField[]) {
    const v = lead[key];
    out[key] = v ?? "";
  }
  return out;
}
