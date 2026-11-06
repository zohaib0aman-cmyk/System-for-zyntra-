import { extractLeads, type LeadExtractor } from "@/lib/ai/extractLeads";
import { AiConfigError } from "@/lib/ai/types";
import type { ImportRow, Json, LeadInsert } from "@/lib/database.types";
import { normalizeExtracted } from "@/lib/import/normalizeExtracted";
import { extractPdfText, PdfError } from "@/lib/pdf/extractText";
import { createLeadSchema, toFieldErrors, type LeadField, type LeadFormValues } from "@/lib/validation";
import { findDuplicateLeads, mergeLeadDetails } from "./leads";
import { addNiche, listNiches } from "./niches";
import { dbError, type DB, type ServiceResult } from "./types";

export const IMPORT_BUCKET = "imports";
export const MAX_PDF_BYTES = 20 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Types stored as JSON on the imports row
// ---------------------------------------------------------------------------

export type ImportItemStatus = "new" | "duplicate" | "missing";

export type ImportItem = {
  key: string;
  values: LeadFormValues;
  status: ImportItemStatus;
  /** Problems to show on the card. */
  issues: string[];
  /** False when the row would fail validation (e.g. no state) — it will be skipped unless fixed. */
  canSave: boolean;
  /** Existing lead this row will be merged into. */
  duplicateOf: { id: string; tracking_id: string; brand_name: string } | null;
  /** Earlier row in the same PDF with the same contact details (merged on save). */
  duplicateInFile: string | null;
  removed: boolean;
};

export type ImportOutcome = "added" | "merged" | "skipped" | "failed";

export type ImportResultRow = {
  key: string;
  brand_name: string;
  outcome: ImportOutcome;
  tracking_id?: string;
  lead_id?: string;
  reason?: string;
};

export type ImportSummary = {
  added: number;
  merged: number;
  skipped: number;
  results: ImportResultRow[];
  /** Leads whose logo should be looked up in the background. */
  logoLeadIds: string[];
};

export function importItems(row: Pick<ImportRow, "items">): ImportItem[] {
  return Array.isArray(row.items) ? (row.items as unknown as ImportItem[]) : [];
}
export function importResults(row: Pick<ImportRow, "results">): ImportResultRow[] {
  return Array.isArray(row.results) ? (row.results as unknown as ImportResultRow[]) : [];
}

const FIELD_LABELS: Partial<Record<LeadField, string>> = {
  brand_name: "Brand name",
  state: "State",
  phone: "Phone",
  whatsapp: "WhatsApp",
  email: "Email",
  instagram: "Instagram",
  website: "Website",
  country: "Country",
};

// ---------------------------------------------------------------------------
// Import records
// ---------------------------------------------------------------------------

export async function createImport(
  db: DB,
  input: { fileName: string; fileSize: number; autoSave?: boolean },
): Promise<ServiceResult<ImportRow>> {
  const fileName = input.fileName.trim().slice(0, 200) || "leads.pdf";
  if (!/\.pdf$/i.test(fileName)) {
    return { ok: false, code: "validation", message: "Please choose a PDF file.", fieldErrors: {} };
  }
  if (input.fileSize > MAX_PDF_BYTES) {
    return { ok: false, code: "validation", message: "This PDF is larger than 20 MB.", fieldErrors: {} };
  }
  if (input.fileSize <= 0) {
    return { ok: false, code: "validation", message: "This file is empty.", fieldErrors: {} };
  }
  const { data, error } = await db
    .from("imports")
    .insert({ file_name: fileName, file_size: input.fileSize, auto_save: !!input.autoSave, progress: "Uploading PDF…" })
    .select("*")
    .single();
  if (error) return dbError(error);
  const path = `${data.id}.pdf`;
  const upd = await db.from("imports").update({ file_path: path }).eq("id", data.id).select("*").single();
  if (upd.error) return dbError(upd.error);
  return { ok: true, data: upd.data };
}

export async function getImport(db: DB, id: string): Promise<ServiceResult<ImportRow>> {
  const { data, error } = await db.from("imports").select("*").eq("id", id).maybeSingle();
  if (error) return dbError(error);
  if (!data) return { ok: false, code: "not_found", message: "Import not found." };
  return { ok: true, data };
}

export type ImportListRow = Omit<ImportRow, "items" | "results">;

/** Recent imports, without the (large) items/results JSON. */
export async function listImports(db: DB, limit = 30): Promise<ServiceResult<ImportListRow[]>> {
  const { data, error } = await db
    .from("imports")
    .select("id,file_name,file_path,file_size,page_count,uploaded_at,updated_at,status,progress,auto_save,total_found,added,merged,skipped,error")
    .order("uploaded_at", { ascending: false })
    .limit(limit);
  if (error) return dbError(error);
  return { ok: true, data: (data ?? []) as ImportListRow[] };
}

export async function failImport(db: DB, id: string, message: string) {
  await db.from("imports").update({ status: "failed", error: message, progress: null }).eq("id", id);
}

async function setProgress(db: DB, id: string, progress: string) {
  await db.from("imports").update({ progress }).eq("id", id);
}

// ---------------------------------------------------------------------------
// Step 1: read the PDF, extract leads with AI, prepare the review list
// ---------------------------------------------------------------------------

export type ProcessOptions = { extractor?: LeadExtractor };

/**
 * Downloads the uploaded PDF, extracts its text, asks the AI for leads,
 * normalises them and marks each one New / Duplicate / Missing info.
 * Leaves the import in "review" (or saves directly when auto_save is set).
 */
export async function processImport(db: DB, importId: string, options: ProcessOptions = {}): Promise<ServiceResult<ImportRow>> {
  const imp = await getImport(db, importId);
  if (!imp.ok) return imp;
  const row = imp.data;

  try {
    await setProgress(db, importId, "Reading the PDF…");
    const file = await db.storage.from(IMPORT_BUCKET).download(row.file_path ?? `${importId}.pdf`);
    if (file.error || !file.data) throw new Error(`Could not read the uploaded PDF: ${file.error?.message ?? "missing file"}`);
    const bytes = new Uint8Array(await file.data.arrayBuffer());

    const pdf = await extractPdfText(bytes);
    await db.from("imports").update({ page_count: pdf.pageCount }).eq("id", importId);
    if (pdf.charCount < Math.max(20, pdf.pageCount * 5)) {
      throw new PdfError(
        "No text was found in this PDF — it looks like a scanned image or photo. Export the list as a text PDF (e.g. “Save as PDF” from Excel/Word/Google Sheets) or run it through OCR first.",
        "no_text",
      );
    }

    await setProgress(db, importId, "Finding leads with AI…");
    const niches = await listNiches(db);
    const nicheNames = niches.ok ? niches.data.map((n) => n.name) : [];
    const extraction = await extractLeads(pdf.text, {
      niches: nicheNames,
      extractor: options.extractor,
      onProgress: (done, total) =>
        total > 1 ? setProgress(db, importId, `Finding leads with AI… part ${done} of ${total} done`) : undefined,
    });

    // Parts of the PDF the AI could not process are reported, never dropped silently.
    const preResults: ImportResultRow[] = extraction.failures.map((f) => ({
      key: `chunk-${f.chunk}`,
      brand_name: `PDF part ${f.chunk} of ${extraction.chunks}`,
      outcome: "failed",
      reason: `Could not read this part: ${f.error}. Starts with: “${f.preview}…”`,
    }));

    if (extraction.leads.length === 0) {
      throw new Error(
        extraction.failures.length
          ? `The AI could not read this PDF: ${extraction.failures[0].error}`
          : "No leads were found in this PDF.",
      );
    }

    await setProgress(db, importId, `Checking ${extraction.leads.length} leads for duplicates…`);
    const items: ImportItem[] = [];
    for (const [i, raw] of extraction.leads.entries()) {
      const n = normalizeExtracted(raw, nicheNames);
      const item: ImportItem = {
        key: `row-${i + 1}`,
        values: n.values,
        status: "new",
        issues: n.issues,
        canSave: true,
        duplicateOf: null,
        duplicateInFile: null,
        removed: false,
      };
      items.push(await classifyItem(db, item, items, n.issues));
    }

    const upd = await db
      .from("imports")
      .update({
        status: "review",
        progress: null,
        total_found: items.length,
        items: items as unknown as Json,
        results: preResults as unknown as Json,
        error: null,
      })
      .eq("id", importId)
      .select("*")
      .single();
    if (upd.error) return dbError(upd.error);
    return { ok: true, data: upd.data };
  } catch (e) {
    const message =
      e instanceof PdfError || e instanceof AiConfigError
        ? e.message
        : `Import failed: ${e instanceof Error ? e.message : String(e)}`;
    await failImport(db, importId, message);
    return { ok: false, code: "db_error", message };
  }
}

/**
 * Validates one review item and works out its badge:
 *   duplicate — matches an existing lead (will be merged into it)
 *               or an earlier row of the same PDF
 *   missing   — required info missing / invalid, or no way to contact
 *   new       — ready to add with a new tracking ID
 */
export async function classifyItem(
  db: DB,
  item: ImportItem,
  earlier: ImportItem[],
  hints: string[] = [],
): Promise<ImportItem> {
  const parsed = createLeadSchema.safeParse({ ...item.values, source: "pdf" });
  const issues: string[] = [];
  let canSave = true;
  if (!parsed.success) {
    canSave = false;
    const errs = toFieldErrors(parsed.error);
    for (const [field, msg] of Object.entries(errs)) {
      const hint = hints.find((h) => h.toLowerCase().startsWith((FIELD_LABELS[field as LeadField] ?? field).toLowerCase()));
      issues.push(hint ?? `${FIELD_LABELS[field as LeadField] ?? field}: ${msg}`);
    }
    if (!errs.state) issues.push(...hints.filter((h) => /state/i.test(h)));
  }
  const v = item.values;
  if (!v.phone && !v.whatsapp && !v.email && !v.instagram && !v.website) issues.push("No contact details");

  let duplicateOf: ImportItem["duplicateOf"] = null;
  let duplicateInFile: string | null = null;
  const keys = parsed.success ? parsed.data : null;
  if (keys) {
    const dup = await findDuplicateLeads(db, keys);
    if (dup.ok && dup.data.length > 0) {
      const d = dup.data[0];
      duplicateOf = { id: d.id, tracking_id: d.tracking_id, brand_name: d.brand_name };
    } else {
      const twin = earlier.find((o) => !o.removed && o.key !== item.key && sameLead(o.values, v));
      if (twin) duplicateInFile = twin.key;
    }
  }

  const status: ImportItemStatus = duplicateOf || duplicateInFile ? "duplicate" : issues.length ? "missing" : "new";
  return { ...item, issues: [...new Set(issues)], canSave, duplicateOf, duplicateInFile, status };
}

function sameLead(a: LeadFormValues, b: LeadFormValues): boolean {
  const eq = (x: string, y: string) => !!x && !!y && x.toLowerCase() === y.toLowerCase();
  const host = (u: string) => u.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").split(/[/?#]/)[0];
  return (
    eq(a.phone, b.phone) ||
    eq(a.phone, b.whatsapp) ||
    eq(a.whatsapp, b.phone) ||
    eq(a.whatsapp, b.whatsapp) ||
    eq(a.instagram, b.instagram) ||
    eq(host(a.website), host(b.website)) ||
    (eq(a.brand_name.trim(), b.brand_name.trim()) && eq(a.city.trim(), b.city.trim()))
  );
}

/** Re-checks review items after the user edited them (badges + duplicate status). */
export async function reclassifyItems(db: DB, items: ImportItem[]): Promise<ImportItem[]> {
  const out: ImportItem[] = [];
  for (const item of items) out.push(item.removed ? item : await classifyItem(db, item, out));
  return out;
}

export async function saveImportItems(db: DB, importId: string, items: ImportItem[]): Promise<ServiceResult<ImportItem[]>> {
  const checked = await reclassifyItems(db, items);
  const { error } = await db
    .from("imports")
    .update({ items: checked as unknown as Json })
    .eq("id", importId)
    .eq("status", "review");
  if (error) return dbError(error);
  return { ok: true, data: checked };
}

// ---------------------------------------------------------------------------
// Step 2: save the reviewed leads
// ---------------------------------------------------------------------------

/**
 * Saves every non-removed item: new leads get a tracking ID (source = pdf,
 * import_id set); duplicates are merged into the existing lead; rows that
 * cannot be saved are skipped with a reason. Every row ends up in `results`.
 */
export async function commitImport(db: DB, importId: string, itemsInput?: ImportItem[]): Promise<ServiceResult<ImportSummary>> {
  // Claim the import so a double tap cannot save twice.
  const claim = await db
    .from("imports")
    .update({ status: "processing", progress: "Saving leads…" })
    .eq("id", importId)
    .eq("status", "review")
    .select("*")
    .maybeSingle();
  if (claim.error) return dbError(claim.error);
  if (!claim.data) {
    return { ok: false, code: "validation", message: "This import was already saved or is not ready yet.", fieldErrors: {} };
  }
  const row = claim.data;
  const items = itemsInput ?? importItems(row);
  const results: ImportResultRow[] = [...importResults(row)];
  const logoLeadIds: string[] = [];
  const createdByKey = new Map<string, string>(); // item key → lead id (for in-file duplicates)
  const label = `PDF import “${row.file_name}”`;

  try {
    // Create any new niches first.
    const niches = await listNiches(db);
    const known = new Set((niches.ok ? niches.data : []).map((n) => n.name.toLowerCase()));
    for (const item of items) {
      const niche = item.values.niche?.trim();
      if (!item.removed && niche && !known.has(niche.toLowerCase())) {
        const added = await addNiche(db, niche);
        if (added.ok) {
          known.add(added.data.name.toLowerCase());
          item.values.niche = added.data.name;
        }
      }
    }

    for (const [index, item] of items.entries()) {
      const brand = item.values.brand_name || `Row ${index + 1}`;
      if (index % 5 === 0) await setProgress(db, importId, `Saving leads… ${index} of ${items.length}`);
      if (item.removed) {
        results.push({ key: item.key, brand_name: brand, outcome: "skipped", reason: "Removed during review" });
        continue;
      }
      try {
        const parsed = createLeadSchema.safeParse({ ...item.values, source: "pdf" });
        if (!parsed.success) {
          const errs = toFieldErrors(parsed.error);
          results.push({
            key: item.key,
            brand_name: brand,
            outcome: "skipped",
            reason: Object.entries(errs)
              .map(([f, m]) => `${FIELD_LABELS[f as LeadField] ?? f}: ${m}`)
              .join("; "),
          });
          continue;
        }
        const lead: LeadInsert = { ...parsed.data, source: "pdf" };

        const dup = await findDuplicateLeads(db, lead);
        if (!dup.ok) throw new Error(dup.message);
        if (dup.data.length > 0) {
          const target = dup.data[0];
          const merged = await mergeLeadDetails(db, target, lead, label);
          if (!merged.ok) throw new Error(merged.message);
          results.push({
            key: item.key,
            brand_name: brand,
            outcome: "merged",
            tracking_id: merged.data.tracking_id,
            lead_id: merged.data.id,
            reason: createdByKey.has(target.id) ? "Same lead appears twice in this PDF" : undefined,
          });
          if (!merged.data.logo_url && merged.data.website) logoLeadIds.push(merged.data.id);
          continue;
        }

        const ins = await db
          .from("leads")
          .insert({ ...lead, import_id: importId })
          .select("*")
          .single();
        if (ins.error) throw new Error(ins.error.message);
        createdByKey.set(ins.data.id, item.key);
        results.push({
          key: item.key,
          brand_name: brand,
          outcome: "added",
          tracking_id: ins.data.tracking_id,
          lead_id: ins.data.id,
        });
        if (ins.data.website) logoLeadIds.push(ins.data.id);
        else await db.from("leads").update({ logo_status: "not_found" }).eq("id", ins.data.id);
      } catch (e) {
        results.push({
          key: item.key,
          brand_name: brand,
          outcome: "failed",
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    }
  } finally {
    const count = (o: ImportOutcome) => results.filter((r) => r.outcome === o).length;
    await db
      .from("imports")
      .update({
        status: "done",
        progress: null,
        items: items as unknown as Json,
        results: results as unknown as Json,
        added: count("added"),
        merged: count("merged"),
        skipped: count("skipped") + count("failed"),
      })
      .eq("id", importId);
  }

  const count = (o: ImportOutcome) => results.filter((r) => r.outcome === o).length;
  return {
    ok: true,
    data: {
      added: count("added"),
      merged: count("merged"),
      skipped: count("skipped") + count("failed"),
      results,
      logoLeadIds: [...new Set(logoLeadIds)],
    },
  };
}

// ---------------------------------------------------------------------------
// One-call import for the API / MCP server (later phases)
// ---------------------------------------------------------------------------

export type ImportPdfInput = {
  file: Uint8Array | ArrayBuffer | Blob;
  fileName: string;
};

export type ImportPdfOptions = ProcessOptions & {
  /** Save straight away (no review). Default false: leaves the import in "review". */
  autoSave?: boolean;
};

/**
 * Full pipeline in one call: upload → extract → (optionally) save.
 * Returns the import row plus the save summary when autoSave is true.
 * Logo lookup is NOT awaited here — call findLogos(db, summary.logoLeadIds)
 * in the background (e.g. Next.js `after()`).
 */
export async function importLeadsFromPdf(
  db: DB,
  input: ImportPdfInput,
  options: ImportPdfOptions = {},
): Promise<ServiceResult<{ import: ImportRow; summary: ImportSummary | null }>> {
  const bytes =
    input.file instanceof Uint8Array
      ? input.file
      : input.file instanceof ArrayBuffer
        ? new Uint8Array(input.file)
        : new Uint8Array(await input.file.arrayBuffer());

  const created = await createImport(db, { fileName: input.fileName, fileSize: bytes.byteLength, autoSave: options.autoSave });
  if (!created.ok) return created;
  const imp = created.data;

  const up = await db.storage
    .from(IMPORT_BUCKET)
    .upload(imp.file_path!, bytes, { contentType: "application/pdf", upsert: true });
  if (up.error) {
    await failImport(db, imp.id, `Upload failed: ${up.error.message}`);
    return { ok: false, code: "db_error", message: `Upload failed: ${up.error.message}` };
  }

  const processed = await processImport(db, imp.id, options);
  if (!processed.ok) return processed;
  if (!options.autoSave) return { ok: true, data: { import: processed.data, summary: null } };

  const summary = await commitImport(db, imp.id);
  if (!summary.ok) return summary;
  const final = await getImport(db, imp.id);
  if (!final.ok) return final;
  return { ok: true, data: { import: final.data, summary: summary.data } };
}
