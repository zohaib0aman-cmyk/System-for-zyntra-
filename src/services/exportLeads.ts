import "server-only";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { LEAD_SOURCES, stateName } from "@/lib/constants";
import type { LeadFilters, LeadSort } from "@/lib/filters";
import { SORT_OPTIONS } from "@/lib/filters";
import { formatDateTime } from "@/lib/time";
import type { Json } from "@/lib/database.types";
import { logActivity, type ActorOptions } from "./activities";
import { getTimeline } from "./activities";
import { getLeadTags } from "./tags";
import { listLeads, type LeadListItem } from "./leadList";
import { getLeadById } from "./leads";
import { DEFAULT_EXPORT_COLUMNS, EXPORT_COLUMNS, pickColumns, type ExportColumn } from "./exportColumns";
import { SCORE_LABEL_TEXT } from "@/config/scoring";
import { formatPhone } from "@/lib/normalize";
import { dbError, type DB, type ServiceResult } from "./types";

export type ExportFormat = "xlsx" | "pdf";
export type ExportFile = { filename: string; contentType: string; bytes: Uint8Array; leadCount: number };

const MAX_EXPORT = 100_000;

/** Fetches every lead matching the filters (paged), in the chosen sort order. */
async function fetchAllLeads(db: DB, filters: Partial<LeadFilters>, sort: LeadSort): Promise<ServiceResult<LeadListItem[]>> {
  const all: LeadListItem[] = [];
  const PAGE = 200;
  for (let offset = 0; offset < MAX_EXPORT; offset += PAGE) {
    const r = await listLeads(db, filters, sort, { offset, limit: PAGE });
    if (!r.ok) return r;
    all.push(...r.data.rows);
    if (all.length >= r.data.total || r.data.rows.length < PAGE) break;
  }
  return { ok: true, data: all };
}

/** Human-readable description of the applied filters (for PDF header / sheet). */
export function describeFilters(filters: Partial<LeadFilters>, sort: LeadSort): string[] {
  const lines: string[] = [];
  if (filters.q) lines.push(`Search: "${filters.q}"`);
  if (filters.niches?.length) lines.push(`Niche: ${filters.niches.join(", ")}`);
  if (filters.statuses?.length) lines.push(`Status: ${filters.statuses.join(", ")}`);
  if (filters.scores?.length) lines.push(`Rating: ${filters.scores.map((s) => SCORE_LABEL_TEXT[s]).join(", ")}`);
  if (filters.states?.length) lines.push(`State: ${filters.states.map((s) => stateName(s)).join(", ")}`);
  if (filters.cities?.length) lines.push(`City: ${filters.cities.join(", ")}`);
  if (filters.countries?.length) lines.push(`Country: ${filters.countries.join(", ")}`);
  if (filters.tags?.length) lines.push(`Tags: ${filters.tags.join(", ")}`);
  if (filters.sources?.length) lines.push(`Source: ${filters.sources.map((s) => LEAD_SOURCES.find((x) => x.value === s)?.label ?? s).join(", ")}`);
  if (filters.from) lines.push(`From: ${filters.from}`);
  if (filters.to) lines.push(`To: ${filters.to}`);
  if (filters.due) lines.push("Follow-up due today or overdue");
  if (filters.priority) lines.push("Priority only");
  lines.push(`Sorted by: ${SORT_OPTIONS.find((o) => o.value === sort)?.label ?? sort}`);
  return lines;
}

/** Builds an .xlsx: bold + coloured frozen header, auto column widths. */
async function buildXlsx(rows: LeadListItem[], columns: ExportColumn[], subtitle: string[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Zyntra Lead ID";
  wb.created = new Date();
  const ws = wb.addWorksheet("Leads", { views: [{ state: "frozen", ySplit: 1 }] });

  ws.columns = columns.map((c) => ({ header: c.label, key: c.key, width: c.width }));
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
  header.alignment = { vertical: "middle" };
  header.height = 20;

  for (const lead of rows) {
    ws.addRow(Object.fromEntries(columns.map((c) => [c.key, c.value(lead)])));
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

  // Second sheet documenting the export.
  const info = wb.addWorksheet("Export info");
  info.columns = [{ width: 60 }];
  info.addRow(["Zyntra Lead ID — lead export"]);
  info.getRow(1).font = { bold: true, size: 14 };
  info.addRow([`Generated: ${formatDateTime(new Date().toISOString())}`]);
  info.addRow([`Total leads: ${rows.length}`]);
  info.addRow([]);
  info.addRow(["Applied filters:"]).getCell(1).font = { bold: true };
  subtitle.forEach((l) => info.addRow([l]));

  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** Builds a clean PDF table report (A4 landscape), paginated. */
async function buildPdf(rows: LeadListItem[], columns: ExportColumn[], subtitle: string[]): Promise<Uint8Array> {
  // Keep the PDF readable: cap at a sensible number of columns.
  const pdfCols = columns.slice(0, 8);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const [W, H] = [842, 595];
  const margin = 32;
  const usable = W - margin * 2;
  const weights = pdfCols.map((c) => c.width);
  const totalW = weights.reduce((a, b) => a + b, 0);
  const colX: number[] = [];
  let x = margin;
  for (const w of weights) {
    colX.push(x);
    x += (w / totalW) * usable;
  }
  const rowH = 16;
  const fontSize = 7.5;

  let page!: PDFPage;
  let y = 0;
  let pageNo = 0;
  const total = rows.length;

  const clip = (text: string, width: number, f: PDFFont, size: number): string => {
    let t = String(text ?? "").replace(/[\n\r\t]+/g, " ");
    while (t.length > 1 && f.widthOfTextAtSize(t, size) > width - 4) t = t.slice(0, -1);
    if (t !== String(text ?? "").replace(/[\n\r\t]+/g, " ")) t = t.slice(0, -1) + "…";
    return t;
  };

  const header = () => {
    pageNo++;
    page = doc.addPage([W, H]);
    page.drawText("Zyntra Lead ID — Lead Report", { x: margin, y: H - margin, size: 15, font: bold, color: rgb(0.31, 0.27, 0.9) });
    page.drawText(`${formatDateTime(new Date().toISOString())}  ·  ${total} lead${total === 1 ? "" : "s"}`, {
      x: margin, y: H - margin - 16, size: 8, font, color: rgb(0.4, 0.4, 0.4),
    });
    const filterText = subtitle.join("   ·   ");
    page.drawText(clip(filterText, usable, font, 7.5), { x: margin, y: H - margin - 28, size: 7.5, font, color: rgb(0.45, 0.45, 0.45) });

    y = H - margin - 46;
    page.drawRectangle({ x: margin, y: y - 3, width: usable, height: rowH, color: rgb(0.31, 0.27, 0.9) });
    pdfCols.forEach((c, i) => {
      const w = i < pdfCols.length - 1 ? colX[i + 1] - colX[i] : margin + usable - colX[i];
      page.drawText(clip(c.label, w, bold, fontSize), { x: colX[i] + 2, y: y + 1, size: fontSize, font: bold, color: rgb(1, 1, 1) });
    });
    y -= rowH;
  };

  header();
  rows.forEach((lead, idx) => {
    if (y < margin + rowH) {
      page.drawText(`Page ${pageNo}`, { x: W - margin - 40, y: margin - 12, size: 7, font, color: rgb(0.6, 0.6, 0.6) });
      header();
    }
    if (idx % 2 === 1) page.drawRectangle({ x: margin, y: y - 3, width: usable, height: rowH, color: rgb(0.95, 0.96, 0.99) });
    pdfCols.forEach((c, i) => {
      const w = i < pdfCols.length - 1 ? colX[i + 1] - colX[i] : margin + usable - colX[i];
      page.drawText(clip(String(c.value(lead)), w, font, fontSize), { x: colX[i] + 2, y: y + 1, size: fontSize, font, color: rgb(0.1, 0.1, 0.15) });
    });
    y -= rowH;
  });
  page.drawText(`Page ${pageNo}`, { x: W - margin - 40, y: margin - 12, size: 7, font, color: rgb(0.6, 0.6, 0.6) });

  return doc.save();
}

/** Exports the current filtered + sorted view to Excel or PDF, and logs it. */
export async function exportLeads(
  db: DB,
  filters: Partial<LeadFilters>,
  format: ExportFormat,
  sort: LeadSort = "newest",
  columnKeys?: string[] | null,
  options: ActorOptions = {},
): Promise<ServiceResult<ExportFile>> {
  const leadsRes = await fetchAllLeads(db, filters, sort);
  if (!leadsRes.ok) return leadsRes;
  const rows = leadsRes.data;
  const columns = pickColumns(columnKeys);
  if (columns.length === 0) return { ok: false, code: "validation", message: "Pick at least one column.", fieldErrors: {} };
  const subtitle = describeFilters(filters, sort);

  const stamp = new Date().toISOString().slice(0, 10);
  const bytes = format === "xlsx" ? await buildXlsx(rows, columns, subtitle) : await buildPdf(rows, columns, subtitle);

  await db.from("exports").insert({
    format,
    lead_count: rows.length,
    filters: filters as unknown as Json,
    columns: columns.map((c) => c.key) as unknown as Json,
    actor: options.actor ?? "owner",
  });

  return {
    ok: true,
    data: {
      filename: `zyntra-leads-${stamp}.${format}`,
      contentType:
        format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf",
      bytes,
      leadCount: rows.length,
    },
  };
}

export { DEFAULT_EXPORT_COLUMNS, ALL_EXPORT_COLUMNS } from "./exportColumns";

/** Builds a one-page ID-card style profile PDF for a single lead. */
export async function exportLeadProfile(db: DB, leadId: string, options: ActorOptions = {}): Promise<ServiceResult<ExportFile>> {
  const leadRes = await getLeadById(db, leadId);
  if (!leadRes.ok) return leadRes;
  const lead = leadRes.data;
  const [tags, timeline] = await Promise.all([getLeadTags(db, leadId), getTimeline(db, leadId, { limit: 12 })]);

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595, 842]); // A4 portrait
  const { width } = page.getSize();
  const brand = rgb(0.31, 0.27, 0.9);
  let y = 800;

  // Header band
  page.drawRectangle({ x: 0, y: 742, width, height: 100, color: brand });
  page.drawText("ZYNTRA · LEAD RECORD", { x: 40, y: 812, size: 10, font: bold, color: rgb(0.85, 0.85, 1) });
  page.drawText(lead.tracking_id, { x: 40, y: 780, size: 26, font: bold, color: rgb(1, 1, 1) });
  page.drawText(lead.status, { x: width - 40 - bold.widthOfTextAtSize(lead.status, 11), y: 812, size: 11, font: bold, color: rgb(1, 1, 1) });

  // Try to embed the logo
  if (lead.logo_url) {
    try {
      const res = await fetch(lead.logo_url);
      if (res.ok) {
        const buf = new Uint8Array(await res.arrayBuffer());
        const ct = res.headers.get("content-type") ?? "";
        const img = ct.includes("png") ? await doc.embedPng(buf) : ct.match(/jpe?g/) ? await doc.embedJpg(buf) : null;
        if (img) page.drawImage(img, { x: 40, y: 668, width: 64, height: 64 });
      }
    } catch {
      /* ignore logo errors */
    }
  }
  page.drawText(lead.brand_name, { x: 120, y: 710, size: 20, font: bold, color: rgb(0.1, 0.1, 0.15) });
  if (lead.niche) page.drawText(lead.niche, { x: 120, y: 692, size: 11, font, color: rgb(0.4, 0.4, 0.45) });

  y = 640;
  const detail = (label: string, value: string) => {
    page.drawText(label.toUpperCase(), { x: 40, y, size: 7.5, font: bold, color: rgb(0.55, 0.55, 0.6) });
    page.drawText(value || "—", { x: 40, y: y - 13, size: 11, font, color: rgb(0.1, 0.1, 0.15) });
    y -= 34;
  };
  detail("Owner", lead.owner_name ?? "");
  detail("Location", [lead.city, stateName(lead.state, lead.country), lead.country].filter(Boolean).join(", "));
  detail("Phone", formatPhone(lead.phone));
  detail("WhatsApp", formatPhone(lead.whatsapp));
  detail("Email", lead.email ?? "");
  detail("Instagram", lead.instagram ? `@${lead.instagram}` : "");
  detail("Website", lead.website ?? "");
  detail("Score", `${lead.score}/100 (${SCORE_LABEL_TEXT[lead.score_label]})`);
  detail("Source", lead.source);
  detail("Tags", (tags.ok ? tags.data.map((t) => `#${t.name}`) : []).join("  ") || "");
  if (lead.notes) detail("Notes", lead.notes.slice(0, 120));

  // Timeline summary
  y -= 6;
  page.drawText("RECENT ACTIVITY", { x: 40, y, size: 8, font: bold, color: rgb(0.55, 0.55, 0.6) });
  y -= 16;
  const events = timeline.ok ? timeline.data.slice(0, 8) : [];
  for (const a of events) {
    const line = `${formatDateTime(a.created_at)}  ·  ${a.type.replace(/_/g, " ")}  ·  ${a.actor}`;
    page.drawText(line.slice(0, 95), { x: 44, y, size: 8.5, font, color: rgb(0.35, 0.35, 0.4) });
    y -= 14;
    if (y < 60) break;
  }

  page.drawText(`Generated by Zyntra Lead ID · ${formatDateTime(new Date().toISOString())}`, {
    x: 40, y: 32, size: 7.5, font, color: rgb(0.6, 0.6, 0.6),
  });

  await db.from("exports").insert({ format: "profile_pdf", lead_count: 1, filters: { tracking_id: lead.tracking_id } as unknown as Json, actor: options.actor ?? "owner" });
  await logActivity(db, leadId, "updated", { exported: "profile_pdf" }, options.actor);

  return {
    ok: true,
    data: {
      filename: `${lead.tracking_id}.pdf`,
      contentType: "application/pdf",
      bytes: await doc.save(),
      leadCount: 1,
    },
  };
}
