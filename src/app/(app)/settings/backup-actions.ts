"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  createBackup,
  getBackupDownloadUrl,
  previewRestore,
  restoreBackup,
  type RestoreMode,
  type RestorePreview,
} from "@/services";

export async function backupNowAction(): Promise<{ error?: string; leadCount?: number }> {
  const r = await createBackup(await createClient(), "manual", "owner");
  revalidatePath("/settings/backups");
  revalidatePath("/");
  return r.ok ? { leadCount: r.data.lead_count } : { error: r.message };
}

export async function backupUrlAction(id: string, which: "json" | "xlsx"): Promise<{ url?: string; error?: string }> {
  const r = await getBackupDownloadUrl(await createClient(), id, which);
  return r.ok ? { url: r.data } : { error: r.message };
}

export async function previewRestoreAction(text: string): Promise<{ preview?: RestorePreview; error?: string }> {
  const r = await previewRestore(await createClient(), text);
  return r.ok ? { preview: r.data } : { error: r.message };
}

export async function restoreBackupAction(text: string, mode: RestoreMode): Promise<{ error?: string; restored?: Record<string, number> }> {
  const r = await restoreBackup(await createClient(), text, mode, "owner");
  revalidatePath("/", "layout");
  return r.ok ? { restored: r.data.restored } : { error: r.message };
}
