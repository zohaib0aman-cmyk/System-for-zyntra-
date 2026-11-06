"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { FieldErrors, LeadFormValues } from "@/lib/validation";
import type { NicheRow } from "@/lib/database.types";
import { addLead, addNiche, updateLead, type Lead } from "@/services";

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
