import "server-only";
import ExcelJS from "exceljs";
import type { BackupRow, Json } from "@/lib/database.types";
import { formatDateTime } from "@/lib/time";
import { dbError, type DB, type ServiceResult } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Loosely-typed table accessor for the generic backup/restore loops. */
function anyTable(db: DB, table: string): any {
  return (db as any).from(table);
}

export const BACKUP_BUCKET = "backups";
export const KEEP_BACKUPS = 30;
export const BACKUP_VERSION = 1;

/** Tables included in a backup, in restore order (parents before children). */
const BACKUP_TABLES = [
  "niches", "tags", "message_templates", "imports", "leads",
  "lead_tags", "lead_activities", "followups",
] as const;
type BackupTable = (typeof BACKUP_TABLES)[number];

export type BackupManifest = {
  version: number;
  created_at: string;
  app: "zyntra-lead-id";
  counts: Record<string, number>;
  storage_paths: { logos: string[]; imports: string[] };
  data: Record<BackupTable, Record<string, unknown>[]>;
};

async function fetchAll(db: DB, table: BackupTable): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  const PAGE = 1000;
  const orderCol = table === "imports" ? "uploaded_at" : "created_at";
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await anyTable(db, table).select("*").order(orderCol, { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

async function listStoragePaths(db: DB, bucket: string): Promise<string[]> {
  const out: string[] = [];
  // Logos are stored under <leadId>/..., imports as <id>.pdf at the root.
  const { data: top } = await db.storage.from(bucket).list("", { limit: 1000 });
  for (const entry of top ?? []) {
    if (entry.id === null) {
      const { data: sub } = await db.storage.from(bucket).list(entry.name, { limit: 1000 });
      for (const f of sub ?? []) out.push(`${entry.name}/${f.name}`);
    } else {
      out.push(entry.name);
    }
  }
  return out;
}

async function buildBackupXlsx(manifest: BackupManifest): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Zyntra Lead ID";
  const summary = wb.addWorksheet("Summary");
  summary.columns = [{ width: 24 }, { width: 14 }];
  summary.addRow(["Zyntra Lead ID backup"]).getCell(1).font = { bold: true, size: 14 };
  summary.addRow(["Created", formatDateTime(manifest.created_at)]);
  summary.addRow([]);
  summary.addRow(["Table", "Rows"]).font = { bold: true };
  for (const [t, n] of Object.entries(manifest.counts)) summary.addRow([t, n]);

  for (const table of BACKUP_TABLES) {
    const rows = manifest.data[table];
    if (rows.length === 0) continue;
    const ws = wb.addWorksheet(table.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
    const keys = Object.keys(rows[0]);
    ws.columns = keys.map((k) => ({ header: k, key: k, width: Math.min(40, Math.max(12, k.length + 4)) }));
    ws.getRow(1).font = { bold: true };
    for (const r of rows) {
      ws.addRow(Object.fromEntries(keys.map((k) => [k, serializeCell(r[k])])));
    }
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** Generated / computed columns that must not be written back on restore. */
const GENERATED_COLUMNS: Partial<Record<BackupTable, string[]>> = { leads: ["website_host"] };

function stripGenerated(table: BackupTable, row: Record<string, unknown>): Record<string, unknown> {
  const drop = GENERATED_COLUMNS[table];
  if (!drop) return row;
  const copy = { ...row };
  for (const c of drop) delete copy[c];
  return copy;
}

function serializeCell(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") return JSON.stringify(v);
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") return v;
  return String(v);
}

/** Creates a full backup (JSON + Excel) in the private backups bucket, and prunes old ones. */
export async function createBackup(db: DB, kind: "manual" | "auto" = "manual", actor = "owner"): Promise<ServiceResult<BackupRow>> {
  try {
    const counts: Record<string, number> = {};
    const data = {} as BackupManifest["data"];
    for (const table of BACKUP_TABLES) {
      const rows = await fetchAll(db, table);
      data[table] = rows;
      counts[table] = rows.length;
    }
    const [logos, imports] = await Promise.all([listStoragePaths(db, "logos"), listStoragePaths(db, "imports")]);

    const manifest: BackupManifest = {
      version: BACKUP_VERSION,
      created_at: new Date().toISOString(),
      app: "zyntra-lead-id",
      counts,
      storage_paths: { logos, imports },
      data,
    };

    const stamp = manifest.created_at.replace(/[:.]/g, "-");
    const jsonPath = `${stamp}.json`;
    const xlsxPath = `${stamp}.xlsx`;
    const jsonBytes = new TextEncoder().encode(JSON.stringify(manifest));
    const xlsxBytes = await buildBackupXlsx(manifest);

    const up1 = await db.storage.from(BACKUP_BUCKET).upload(jsonPath, jsonBytes, { contentType: "application/json", upsert: true });
    if (up1.error) return { ok: false, code: "db_error", message: `Backup upload failed: ${up1.error.message}` };
    const up2 = await db.storage
      .from(BACKUP_BUCKET)
      .upload(xlsxPath, xlsxBytes, { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", upsert: true });
    if (up2.error) console.error(`[backup] xlsx upload failed: ${up2.error.message}`);

    const { data: row, error } = await db
      .from("backups")
      .insert({
        json_path: jsonPath,
        xlsx_path: up2.error ? null : xlsxPath,
        size_bytes: jsonBytes.byteLength + xlsxBytes.byteLength,
        lead_count: counts.leads ?? 0,
        table_counts: counts as unknown as Json,
        kind,
        actor,
      })
      .select("*")
      .single();
    if (error) return dbError(error);

    await pruneBackups(db);
    return { ok: true, data: row };
  } catch (e) {
    return { ok: false, code: "db_error", message: `Backup failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Keeps the most recent KEEP_BACKUPS; deletes older files and rows. */
export async function pruneBackups(db: DB): Promise<void> {
  const { data } = await db.from("backups").select("*").order("created_at", { ascending: false });
  const old = (data ?? []).slice(KEEP_BACKUPS);
  if (old.length === 0) return;
  const paths = old.flatMap((b) => [b.json_path, b.xlsx_path].filter(Boolean) as string[]);
  if (paths.length) await db.storage.from(BACKUP_BUCKET).remove(paths);
  await db.from("backups").delete().in("id", old.map((b) => b.id));
}

export async function listBackups(db: DB): Promise<ServiceResult<BackupRow[]>> {
  const { data, error } = await db.from("backups").select("*").order("created_at", { ascending: false });
  if (error) return dbError(error);
  return { ok: true, data: data ?? [] };
}

export async function latestBackup(db: DB): Promise<BackupRow | null> {
  const { data } = await db.from("backups").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data ?? null;
}

/** A short-lived signed URL to download a backup file. */
export async function getBackupDownloadUrl(db: DB, backupId: string, which: "json" | "xlsx"): Promise<ServiceResult<string>> {
  const { data: b, error } = await db.from("backups").select("*").eq("id", backupId).maybeSingle();
  if (error) return dbError(error);
  if (!b) return { ok: false, code: "not_found", message: "Backup not found." };
  const path = which === "xlsx" ? b.xlsx_path : b.json_path;
  if (!path) return { ok: false, code: "not_found", message: "That file is not in this backup." };
  const { data, error: e2 } = await db.storage.from(BACKUP_BUCKET).createSignedUrl(path, 120);
  if (e2 || !data) return { ok: false, code: "db_error", message: e2?.message ?? "Could not create link." };
  return { ok: true, data: data.signedUrl };
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

export type RestorePreview = {
  valid: boolean;
  error?: string;
  created_at?: string;
  counts: Record<string, number>;
  leadsNew: number;
  leadsExisting: number;
};

export type RestoreMode = "merge" | "replace";

export function parseBackup(text: string): { ok: true; manifest: BackupManifest } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file is not valid JSON." };
  }
  const m = json as Partial<BackupManifest>;
  if (m.app !== "zyntra-lead-id" || !m.data || typeof m.data !== "object") {
    return { ok: false, error: "This is not a Zyntra backup file." };
  }
  for (const t of BACKUP_TABLES) if (!Array.isArray(m.data[t])) (m.data as Record<string, unknown[]>)[t] = [];
  return { ok: true, manifest: m as BackupManifest };
}

/** Reads a backup file and reports what a restore would do (no changes made). */
export async function previewRestore(db: DB, text: string): Promise<ServiceResult<RestorePreview>> {
  const parsed = parseBackup(text);
  if (!parsed.ok) return { ok: true, data: { valid: false, error: parsed.error, counts: {}, leadsNew: 0, leadsExisting: 0 } };
  const m = parsed.manifest;
  const leadIds = m.data.leads.map((l) => String(l.id));
  let existing = 0;
  for (let i = 0; i < leadIds.length; i += 500) {
    const slice = leadIds.slice(i, i + 500);
    const { data } = await db.from("leads").select("id").in("id", slice);
    existing += data?.length ?? 0;
  }
  return {
    ok: true,
    data: {
      valid: true,
      created_at: m.created_at,
      counts: m.counts,
      leadsNew: leadIds.length - existing,
      leadsExisting: existing,
    },
  };
}

/**
 * Restores a backup.
 *  merge   — upsert rows; existing leads are updated, new ones inserted (default, safe).
 *  replace — DELETE all current data first, then insert (destructive; confirm in the UI).
 */
export async function restoreBackup(
  db: DB,
  text: string,
  mode: RestoreMode = "merge",
  actor = "owner",
): Promise<ServiceResult<{ mode: RestoreMode; restored: Record<string, number> }>> {
  const parsed = parseBackup(text);
  if (!parsed.ok) return { ok: false, code: "validation", message: parsed.error, fieldErrors: {} };
  const m = parsed.manifest;

  if (mode === "replace") {
    // Children first, then parents (reverse of insert order).
    for (const t of [...BACKUP_TABLES].reverse()) {
      const keyCol = t === "lead_tags" ? "lead_id" : "id";
      const { error } = await anyTable(db, t).delete().neq(keyCol, "00000000-0000-0000-0000-000000000000");
      if (error) return { ok: false, code: "db_error", message: `Restore (clearing ${t}): ${error.message}` };
    }
  }

  const restored: Record<string, number> = {};
  for (const table of BACKUP_TABLES) {
    const rows = m.data[table].map((r) => stripGenerated(table, r));
    if (rows.length === 0) {
      restored[table] = 0;
      continue;
    }
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const onConflict = table === "lead_tags" ? "lead_id,tag_id" : "id";
      const { error } = await anyTable(db, table).upsert(chunk, { onConflict, ignoreDuplicates: false });
      if (error) return { ok: false, code: "db_error", message: `Restore (${table}): ${error.message}` };
    }
    restored[table] = rows.length;
  }

  // Make sure IDs generated after the restore cannot collide with restored ones.
  await anyTable(db, "leads"); // no-op to keep types happy
  await (db as unknown as { rpc: (fn: string) => Promise<unknown> }).rpc("resync_tracking_counters");
  void actor;
  return { ok: true, data: { mode, restored } };
}
