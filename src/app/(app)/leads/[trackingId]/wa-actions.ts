"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendOwnerMessage } from "@/services/automation";

export async function sendWhatsAppAction(leadId: string, text: string): Promise<{ error?: string }> {
  const r = await sendOwnerMessage(await createClient(), leadId, text);
  if (!r.ok) return { error: r.message };
  revalidatePath("/leads/[trackingId]", "page");
  return {};
}

export async function setHandoffAction(leadId: string, ownerHandles: boolean): Promise<{ error?: string }> {
  const db = await createClient();
  const { error } = await db.from("leads").update({ handoff_at: ownerHandles ? new Date().toISOString() : null }).eq("id", leadId);
  return error ? { error: error.message } : {};
}

export async function setAutoDemoAction(leadId: string, on: boolean): Promise<{ error?: string }> {
  const db = await createClient();
  const { error } = await db.from("leads").update({ auto_demo: on }).eq("id", leadId);
  return error ? { error: error.message } : {};
}
