"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  createTemplate,
  deleteTemplate,
  getWhatsAppLink,
  logWhatsAppOpened,
  setStatus,
  updateTemplate,
} from "@/services";

type Result = { error?: string };

// --- WhatsApp -------------------------------------------------------------

export async function getWhatsAppLinkAction(
  leadId: string,
  templateId: string | null,
): Promise<{ url?: string; message?: string; channel?: "whatsapp" | "phone"; templateName?: string | null; number?: string; error?: string }> {
  const r = await getWhatsAppLink(await createClient(), leadId, templateId);
  if (!r.ok) return { error: r.message };
  return { url: r.data.url, message: r.data.message, channel: r.data.channel, templateName: r.data.templateName, number: r.data.number };
}

export async function logWhatsAppOpenedAction(
  leadId: string,
  templateName: string | null,
  number: string,
): Promise<Result> {
  await logWhatsAppOpened(await createClient(), leadId, { templateName, number }, { actor: "owner" });
  revalidatePath(`/leads`, "layout");
  return {};
}

export async function markContactedAction(leadId: string): Promise<Result> {
  const r = await setStatus(await createClient(), leadId, "Contacted", { actor: "owner", reason: "After WhatsApp" });
  revalidatePath("/", "layout");
  return r.ok ? {} : { error: r.message };
}

// --- Templates (Settings) -------------------------------------------------

export async function createTemplateAction(name: string, body: string): Promise<Result> {
  const r = await createTemplate(await createClient(), name, body);
  revalidatePath("/settings/templates");
  return r.ok ? {} : { error: r.message };
}

export async function updateTemplateAction(id: string, name: string, body: string): Promise<Result> {
  const r = await updateTemplate(await createClient(), id, name, body);
  revalidatePath("/settings/templates");
  return r.ok ? {} : { error: r.message };
}

export async function deleteTemplateAction(id: string): Promise<Result> {
  const r = await deleteTemplate(await createClient(), id);
  revalidatePath("/settings/templates");
  return r.ok ? {} : { error: r.message };
}
