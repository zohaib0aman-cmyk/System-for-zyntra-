import { INDIAN_STATES } from "@/lib/constants";
import type { ExtractContext } from "./types";

export const SYSTEM_PROMPT = `You extract business leads from text that was pulled out of a PDF for Zyntra, an Indian company.
The text may be a table (cells separated by " | ", one row per line), a list, or free-form cards. Page markers look like "--- Page N ---".

Return every distinct business you can find as one lead object. For each field return the value exactly as written in the text (light cleanup only), or null if it is not present. Never invent data.

Fields:
- brand_name: business / brand / shop name (required — skip rows that have no business name at all, such as headers, totals or page titles)
- owner_name: person's name (owner, founder, contact person)
- phone: main phone/mobile number as written
- whatsapp: WhatsApp number if listed separately; if the text says the phone is on WhatsApp, repeat the phone
- email
- instagram: handle or profile URL as written
- website: domain or URL as written (not Instagram/Facebook links)
- city
- state: the Indian state as a 2-letter code from this list (infer it from the city only when you are confident): ${INDIAN_STATES.map((s) => `${s.code}=${s.name}`).join(", ")}
- country: 2-letter ISO code, "IN" for India
- niche: type of business. Prefer one of the existing niches listed below when it fits; otherwise a short Title Case name (e.g. "Ethnic Wear")
- notes: any other useful details for this lead (address, GST, product lines, remarks) in one short line, or null

If the same business appears twice in this text, return it once and merge the details.`;

export function userPrompt(chunk: string, ctx: ExtractContext): string {
  return [
    `Existing niches: ${ctx.niches.length ? ctx.niches.join(", ") : "(none yet)"}`,
    ctx.position ? `This is ${ctx.position} of the document.` : "",
    "Extract all leads from this text:",
    "<pdf_text>",
    chunk,
    "</pdf_text>",
  ]
    .filter(Boolean)
    .join("\n");
}
