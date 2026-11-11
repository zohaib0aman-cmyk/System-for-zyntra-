import type { LeadRow, MessageTemplateRow } from "@/lib/database.types";
import { logActivity, type ActorOptions } from "./activities";
import { dbError, type DB, type ServiceResult } from "./types";

export type MessageTemplate = MessageTemplateRow;

/** Variables a template body can use. */
export const TEMPLATE_VARS = ["brand_name", "owner_name", "city", "state", "niche", "tracking_id", "demo_link"] as const;
export type TemplateVar = (typeof TEMPLATE_VARS)[number];

/** Fills {brand_name} etc. from a lead. Unknown or empty values become a friendly fallback. */
export function renderTemplate(body: string, lead: Pick<LeadRow, Exclude<TemplateVar, "demo_link">>): string {
  const demoBase = (process.env.DEMO_BASE_URL || "").replace(/\/+$/, "");
  const vars: Record<TemplateVar, string | null | undefined> = {
    ...lead,
    demo_link: demoBase && lead.tracking_id ? `${demoBase}/?id=${lead.tracking_id}` : null,
  };
  return body.replace(/\{(\w+)\}/g, (match, name: string) => {
    if (!(TEMPLATE_VARS as readonly string[]).includes(name)) return match;
    const value = vars[name as TemplateVar];
    if (value) return String(value);
    return name === "owner_name" ? "there" : name === "brand_name" ? "your brand" : "";
  }).replace(/\s{2,}/g, " ").trim();
}

/** Digits-only phone for a wa.me link (no "+", spaces or dashes). */
function waNumber(e164: string): string {
  return e164.replace(/\D/g, "");
}

export type WhatsAppLink = {
  url: string;
  channel: "whatsapp" | "phone";
  number: string;
  message: string;
  templateName: string | null;
};

/**
 * Builds a wa.me link for a lead, with the chosen template filled in.
 * Uses the WhatsApp number, falling back to the phone number.
 */
export async function getWhatsAppLink(
  db: DB,
  leadId: string,
  templateId?: string | null,
): Promise<ServiceResult<WhatsAppLink>> {
  const { data: lead, error } = await db
    .from("leads")
    .select("id,brand_name,owner_name,city,state,niche,tracking_id,phone,whatsapp")
    .eq("id", leadId)
    .maybeSingle();
  if (error) return dbError(error);
  if (!lead) return { ok: false, code: "not_found", message: "Lead not found." };

  const target = lead.whatsapp || lead.phone;
  if (!target) {
    return { ok: false, code: "validation", message: "This lead has no phone or WhatsApp number.", fieldErrors: {} };
  }

  let message = "";
  let templateName: string | null = null;
  if (templateId) {
    const t = await db.from("message_templates").select("*").eq("id", templateId).maybeSingle();
    if (t.error) return dbError(t.error);
    if (t.data) {
      message = renderTemplate(t.data.body, lead);
      templateName = t.data.name;
    }
  }

  const url = `https://wa.me/${waNumber(target)}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
  return {
    ok: true,
    data: { url, channel: lead.whatsapp ? "whatsapp" : "phone", number: target, message, templateName },
  };
}

/** Records that a WhatsApp chat was opened (called after the user taps through). */
export async function logWhatsAppOpened(
  db: DB,
  leadId: string,
  info: { templateName?: string | null; number?: string },
  options: ActorOptions = {},
): Promise<ServiceResult<null>> {
  await logActivity(
    db,
    leadId,
    "whatsapp_opened",
    { template: info.templateName ?? null, to: info.number ?? null },
    options.actor,
  );
  // Opening a chat counts as reaching out.
  await db.from("leads").update({ last_contacted_at: new Date().toISOString() }).eq("id", leadId);
  return { ok: true, data: null };
}

// ---------------------------------------------------------------------------
// Template CRUD (Settings page)
// ---------------------------------------------------------------------------

export async function listTemplates(db: DB): Promise<ServiceResult<MessageTemplate[]>> {
  const { data, error } = await db.from("message_templates").select("*").order("sort").order("created_at");
  if (error) return dbError(error);
  return { ok: true, data: data ?? [] };
}

function validateTemplate(name: string, body: string): string | null {
  if (name.trim().length < 1 || name.trim().length > 60) return "Name must be 1–60 characters.";
  if (body.trim().length < 1) return "Message body is empty.";
  if (body.length > 2000) return "Message is too long (max 2000 characters).";
  return null;
}

export async function createTemplate(db: DB, name: string, body: string): Promise<ServiceResult<MessageTemplate>> {
  const err = validateTemplate(name, body);
  if (err) return { ok: false, code: "validation", message: err, fieldErrors: {} };
  const max = await db.from("message_templates").select("sort").order("sort", { ascending: false }).limit(1).maybeSingle();
  const sort = (max.data?.sort ?? 0) + 1;
  const { data, error } = await db.from("message_templates").insert({ name: name.trim(), body, sort }).select("*").single();
  if (error) return dbError(error);
  return { ok: true, data };
}

export async function updateTemplate(db: DB, id: string, name: string, body: string): Promise<ServiceResult<MessageTemplate>> {
  const err = validateTemplate(name, body);
  if (err) return { ok: false, code: "validation", message: err, fieldErrors: {} };
  const { data, error } = await db
    .from("message_templates")
    .update({ name: name.trim(), body })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) return dbError(error);
  if (!data) return { ok: false, code: "not_found", message: "Template not found." };
  return { ok: true, data };
}

export async function deleteTemplate(db: DB, id: string): Promise<ServiceResult<null>> {
  const { error } = await db.from("message_templates").delete().eq("id", id);
  if (error) return dbError(error);
  return { ok: true, data: null };
}
