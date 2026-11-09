import { EXTRACTED_FIELDS, type ExtractContext, type ExtractedField, type ExtractedLead, type LeadExtractor } from "../types";

/**
 * Rule-based extractor — no AI, no API key. It only understands tables whose
 * header row names the columns (Brand | Owner | Phone | …) with one lead per
 * row. Useful for offline testing and as a free option for clean
 * spreadsheet-style PDFs. Set AI_PROVIDER=basic to use it.
 */
export class BasicTableExtractor implements LeadExtractor {
  readonly name = "basic";

  async extract(chunk: string, _ctx: ExtractContext): Promise<ExtractedLead[]> {
    void _ctx;
    const leads: ExtractedLead[] = [];
    let columns: (ExtractedField | null)[] | null = null;

    for (const rawLine of chunk.split("\n")) {
      const line = rawLine.replace(/^\(Table columns: (.*)\)$/, "$1").trim();
      if (!line.includes("|")) continue;
      const cells = line.split("|").map((c) => c.trim());
      const mapped = cells.map(matchColumn);
      if (mapped.filter(Boolean).length >= 3 && mapped.includes("brand_name")) {
        columns = mapped;
        continue;
      }
      if (!columns) continue;
      if (cells.length !== columns.length) {
        // Cells merged or split: never drop the row — keep it for manual review.
        const lead = Object.fromEntries(EXTRACTED_FIELDS.map((f) => [f, null])) as ExtractedLead;
        lead.brand_name = cells[0] || null;
        lead.notes = `Could not split this row into columns — check it: ${line}`;
        if (lead.brand_name) leads.push(lead);
        continue;
      }

      const lead = Object.fromEntries(EXTRACTED_FIELDS.map((f) => [f, null])) as ExtractedLead;
      cells.forEach((cell, i) => {
        const field = columns![i];
        if (field && cell && !/^[-–—]+$/.test(cell) && !/^n\/?a$/i.test(cell)) lead[field] = cell;
      });
      if (lead.brand_name) leads.push(lead);
    }
    return leads;
  }
}

const COLUMN_PATTERNS: [RegExp, ExtractedField][] = [
  [/^(brand|brand name|business|business name|company|shop|store|name of business)$/i, "brand_name"],
  [/^(owner|owner name|contact person|founder|contact name|person)$/i, "owner_name"],
  [/^(phone|mobile|phone no\.?|mobile no\.?|contact|contact no\.?|number)$/i, "phone"],
  [/^(whatsapp|whatsapp no\.?|wa)$/i, "whatsapp"],
  [/^(email|e-mail|mail)$/i, "email"],
  [/^(instagram|insta|ig|instagram handle)$/i, "instagram"],
  [/^(website|web|site|url)$/i, "website"],
  [/^(city|town|location)$/i, "city"],
  [/^(state|state code|region)$/i, "state"],
  [/^(country)$/i, "country"],
  [/^(niche|category|industry|type|segment)$/i, "niche"],
  [/^(notes|remarks|comments)$/i, "notes"],
];

function matchColumn(cell: string): ExtractedField | null {
  const c = cell.trim();
  for (const [re, field] of COLUMN_PATTERNS) if (re.test(c)) return field;
  return null;
}
