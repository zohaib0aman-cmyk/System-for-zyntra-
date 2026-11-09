import { getDocumentProxy } from "unpdf";

export type PdfText = {
  text: string;
  pageCount: number;
  /** Characters of real text found (excluding page markers / whitespace). */
  charCount: number;
};

export class PdfError extends Error {
  constructor(
    message: string,
    public code: "invalid_pdf" | "encrypted" | "no_text",
  ) {
    super(message);
  }
}

type TextItem = { str: string; x: number; y: number; width: number; height: number };

/**
 * Extracts text from a PDF while keeping table rows together:
 * text items on the same line are joined, and a large horizontal gap between
 * items (a table column boundary) becomes " | ". Each page is prefixed with
 * "--- Page N ---" so chunking and the AI can see page boundaries.
 */
export async function extractPdfText(data: Uint8Array): Promise<PdfText> {
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(data));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/password/i.test(msg)) {
      throw new PdfError("This PDF is password-protected. Remove the password and upload it again.", "encrypted");
    }
    throw new PdfError("This file could not be read as a PDF. It may be damaged.", "invalid_pdf");
  }

  const pages: string[] = [];
  let charCount = 0;

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items: TextItem[] = [];
    for (const raw of content.items as Array<Record<string, unknown>>) {
      if (typeof raw.str !== "string" || !Array.isArray(raw.transform)) continue;
      const str = raw.str;
      if (!str.trim()) continue;
      const t = raw.transform as number[];
      items.push({
        str,
        x: t[4],
        y: t[5],
        width: typeof raw.width === "number" ? raw.width : str.length * 4,
        height: typeof raw.height === "number" && raw.height > 0 ? raw.height : Math.abs(t[3]) || 10,
      });
      charCount += str.trim().length;
    }
    pages.push(`--- Page ${p} ---\n${itemsToLines(items).join("\n")}`);
    page.cleanup();
  }
  await pdf.cleanup();

  return { text: pages.join("\n\n"), pageCount: pages.length, charCount };
}

function itemsToLines(items: TextItem[]): string[] {
  if (items.length === 0) return [];
  // Top of page first (PDF y grows upwards), then left to right.
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: TextItem[][] = [];
  for (const item of sorted) {
    const row = rows[rows.length - 1];
    const tolerance = Math.max(2, item.height * 0.5);
    if (row && Math.abs(row[0].y - item.y) <= tolerance) row.push(item);
    else rows.push([item]);
  }

  const lines: string[] = [];
  let lastY: number | null = null;
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    let line = "";
    let prevEnd: number | null = null;
    const fontSize = row[0].height || 10;
    for (const it of row) {
      if (prevEnd === null) line = it.str;
      else {
        const gap = it.x - prevEnd;
        if (gap > fontSize * 1.5) line += " | " + it.str.trimStart();
        else if (gap > fontSize * 0.15 && !line.endsWith(" ") && !it.str.startsWith(" ")) line += " " + it.str;
        else line += it.str;
      }
      prevEnd = it.x + it.width;
    }
    // Blank line between visually separated blocks (helps chunking of "card" layouts).
    if (lastY !== null && lastY - row[0].y > fontSize * 2.2) lines.push("");
    lines.push(line.replace(/\s+/g, " ").trim());
    lastY = row[0].y;
  }
  return lines;
}

/**
 * Splits text into chunks of at most `maxChars`, breaking at blank lines
 * (lead blocks) or, failing that, line boundaries (table rows) — never in the
 * middle of a row. The first header-like line of the document is repeated at
 * the top of every later chunk so table columns stay understandable.
 */
export function chunkText(text: string, maxChars = 12000): string[] {
  const blocks = text.split(/\n\s*\n/);
  const header = findHeaderLine(text);
  const chunks: string[] = [];
  let current = "";

  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };
  const add = (piece: string) => {
    if (current && current.length + piece.length + 2 > maxChars) push();
    current += (current ? "\n\n" : "") + piece;
  };

  for (const block of blocks) {
    if (block.length <= maxChars) {
      add(block);
      continue;
    }
    for (const line of block.split("\n")) {
      if (current && current.length + line.length + 1 > maxChars) push();
      current += (current ? "\n" : "") + line.slice(0, maxChars);
    }
  }
  push();

  if (header) {
    for (let i = 1; i < chunks.length; i++) {
      if (!chunks[i].includes(header)) chunks[i] = `(Table columns: ${header})\n${chunks[i]}`;
    }
  }
  return chunks;
}

const HEADER_WORDS = /\b(brand|company|business|name|owner|phone|mobile|contact|whatsapp|email|instagram|website|city|state)\b/gi;

function findHeaderLine(text: string): string | null {
  for (const line of text.split("\n").slice(0, 60)) {
    if (line.includes(" | ") && (line.match(HEADER_WORDS)?.length ?? 0) >= 3) return line.trim();
  }
  return null;
}
