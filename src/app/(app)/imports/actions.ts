"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  commitImport,
  createImport,
  failImport,
  findLogos,
  getImport,
  IMPORT_BUCKET,
  processImport,
  saveImportItems,
  type DB,
  type ImportItem,
  type ImportSummary,
} from "@/services";

/** An import stuck in "processing" this long can be retried (the server was probably stopped). */
const STUCK_AFTER_MS = 6 * 60 * 1000;

export async function createImportAction(input: {
  fileName: string;
  fileSize: number;
  autoSave: boolean;
}): Promise<{ id?: string; path?: string; error?: string }> {
  const db = await createClient();
  const res = await createImport(db, input);
  if (!res.ok) return { error: res.message };
  return { id: res.data.id, path: res.data.file_path! };
}

/** Starts processing in the background (after the response is sent) so the phone can show progress. */
export async function startImportAction(id: string): Promise<{ error?: string }> {
  const db = await createClient();
  const imp = await getImport(db, id);
  if (!imp.ok) return { error: imp.message };
  after(() => runImport(db, id, imp.data.auto_save));
  return {};
}

async function runImport(db: DB, id: string, autoSave: boolean) {
  const processed = await processImport(db, id);
  if (!processed.ok || !autoSave) return;
  const summary = await commitImport(db, id);
  if (summary.ok) await findLogos(db, summary.data.logoLeadIds);
}

export async function uploadFailedAction(id: string, message: string) {
  const db = await createClient();
  await failImport(db, id, `Upload failed: ${message.slice(0, 300)}`);
}

export async function retryImportAction(id: string): Promise<{ error?: string }> {
  const db = await createClient();
  const imp = await getImport(db, id);
  if (!imp.ok) return { error: imp.message };
  const stuck = imp.data.status === "processing" && Date.now() - new Date(imp.data.updated_at).getTime() > STUCK_AFTER_MS;
  if (imp.data.status !== "failed" && !stuck) return { error: "This import is still running." };
  if (imp.data.added + imp.data.merged > 0) {
    return { error: "Some leads from this import were already saved. Upload the PDF again instead." };
  }
  const reset = await db
    .from("imports")
    .update({ status: "processing", progress: "Starting again…", error: null })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (reset.error || !reset.data) return { error: reset.error?.message ?? "Could not restart." };
  after(() => runImport(db, id, imp.data.auto_save));
  return {};
}

export async function saveItemsAction(id: string, items: ImportItem[]): Promise<{ items?: ImportItem[]; error?: string }> {
  const db = await createClient();
  const res = await saveImportItems(db, id, items);
  if (!res.ok) return { error: res.message };
  return { items: res.data };
}

export async function commitImportAction(
  id: string,
  items: ImportItem[],
): Promise<{ summary?: Omit<ImportSummary, "logoLeadIds">; error?: string }> {
  const db = await createClient();
  const res = await commitImport(db, id, items);
  if (!res.ok) return { error: res.message };
  // Logos are found in the background — the import is not blocked.
  after(() => findLogos(db, res.data.logoLeadIds));
  revalidatePath("/");
  revalidatePath(`/imports/${id}`);
  const { logoLeadIds: _ids, ...summary } = res.data;
  void _ids;
  return { summary };
}

export async function deleteImportAction(id: string): Promise<{ error?: string }> {
  const db = await createClient();
  const imp = await getImport(db, id);
  if (!imp.ok) return { error: imp.message };
  if (imp.data.file_path) await db.storage.from(IMPORT_BUCKET).remove([imp.data.file_path]);
  // Leads created from this import stay; their import_id becomes null.
  const { error } = await db.from("imports").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/imports");
  return {};
}
