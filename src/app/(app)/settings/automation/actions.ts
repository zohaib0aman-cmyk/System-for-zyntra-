"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AutomationSettingsRow } from "@/lib/database.types";

const clean = (v: FormDataEntryValue | null, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function saveAutomationSettings(form: FormData) {
  const db = await createClient();
  const update: Partial<AutomationSettingsRow> = {
    enabled: form.get("enabled") === "on",
    wa_phone_number_id: clean(form.get("wa_phone_number_id"), 40).replace(/\D/g, "") || null,
    wa_template_name: clean(form.get("wa_template_name"), 100) || "zyntra_demo",
    wa_followup_template: clean(form.get("wa_followup_template"), 100) || "zyntra_followup",
    wa_template_lang: clean(form.get("wa_template_lang"), 10) || "hi",
    demo_base_url: clean(form.get("demo_base_url"), 300).replace(/\/+$/, "") || null,
    business_name: clean(form.get("business_name"), 60) || "Zyntra",
    high_score: Math.min(100, Math.max(0, Number(form.get("high_score")) || 60)),
    followup_minutes: Math.min(1440, Math.max(1, Number(form.get("followup_minutes")) || 15)),
    updated_at: new Date().toISOString(),
  };
  // Secrets are write-only: an empty box keeps the saved value.
  const token = clean(form.get("wa_access_token"), 1000);
  const secret = clean(form.get("wa_app_secret"), 200);
  if (token) update.wa_access_token = token;
  if (secret) update.wa_app_secret = secret;
  if (update.demo_base_url && !/^https:\/\//i.test(update.demo_base_url)) {
    redirect("/settings/automation?error=" + encodeURIComponent("Demo website URL must start with https://"));
  }
  const { error } = await db.from("automation_settings").update(update).eq("id", true);
  if (error) redirect("/settings/automation?error=" + encodeURIComponent(error.message));
  revalidatePath("/settings/automation");
  redirect("/settings/automation?saved=1");
}
