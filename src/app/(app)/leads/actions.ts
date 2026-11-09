"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { FieldErrors, LeadFormValues } from "@/lib/validation";
import type { NicheRow } from "@/lib/database.types";
import { addLead, addNiche, findLogo, updateLead, uploadLeadLogo, type DB, type Lead } from "@/services";

/** Looks up a logo after the response is sent, when the lead has a website and no logo yet. */
function findLogoLater(db: DB, lead: Lead) {
  if (lead.website && !lead.logo_url) after(() => findLogo(db, lead.id).then(() => undefined));
}

export type LeadActionState = {
  error?: string;
  fieldErrors?: FieldErrors;
  duplicates?: Lead[];
};

export async function createLeadAction(values: LeadFormValues): Promise<LeadActionState> {
  const db = await createClient();
  const res = await addLead(db, values);
  if (!res.ok) {
    return {
      error: res.message,
      fieldErrors: res.code === "validation" ? res.fieldErrors : undefined,
      duplicates: res.code === "duplicate" ? res.duplicates : undefined,
    };
  }
  findLogoLater(db, res.data);
  revalidatePath("/");
  redirect(`/leads/${res.data.tracking_id}?created=1`);
}

export async function updateLeadAction(id: string, values: LeadFormValues): Promise<LeadActionState> {
  const db = await createClient();
  const res = await updateLead(db, id, values);
  if (!res.ok) {
    return {
      error: res.message,
      fieldErrors: res.code === "validation" ? res.fieldErrors : undefined,
      duplicates: res.code === "duplicate" ? res.duplicates : undefined,
    };
  }
  findLogoLater(db, res.data);
  revalidatePath("/");
  revalidatePath(`/leads/${res.data.tracking_id}`);
  redirect(`/leads/${res.data.tracking_id}?updated=1`);
}

/** "Update existing lead" from the duplicate warning: copy only the filled-in fields. */
export async function mergeIntoLeadAction(id: string, values: LeadFormValues): Promise<LeadActionState> {
  const db = await createClient();
  // Never move an existing lead to another state/brand by accident from a duplicate merge.
  const { brand_name: _b, state: _s, country: _c, status: _st, source: _src, ...rest } = values;
  void _b; void _s; void _c; void _st; void _src;
  const res = await updateLead(db, id, rest, { allowDuplicates: true, onlyFilled: true });
  if (!res.ok) return { error: res.message, fieldErrors: res.code === "validation" ? res.fieldErrors : undefined };
  revalidatePath("/");
  revalidatePath(`/leads/${res.data.tracking_id}`);
  redirect(`/leads/${res.data.tracking_id}?updated=1`);
}

export async function addNicheAction(name: string): Promise<{ niche?: NicheRow; error?: string }> {
  const db = await createClient();
  const res = await addNiche(db, name);
  if (!res.ok) return { error: res.message };
  return { niche: res.data };
}

export async function findLogoAction(leadId: string): Promise<{ status?: string; error?: string }> {
  const db = await createClient();
  const res = await findLogo(db, leadId);
  if (!res.ok) return { error: res.message };
  revalidatePath("/", "layout");
  return { status: res.data.status };
}

export async function uploadLogoAction(leadId: string, formData: FormData): Promise<{ error?: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image first." };
  const db = await createClient();
  const res = await uploadLeadLogo(db, leadId, new Uint8Array(await file.arrayBuffer()));
  if (!res.ok) return { error: res.message };
  revalidatePath("/", "layout");
  return {};
}
