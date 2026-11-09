import { z } from "zod";

/** Fields the AI must return for every lead (null when not present in the text). */
export const EXTRACTED_FIELDS = [
  "brand_name",
  "owner_name",
  "phone",
  "whatsapp",
  "email",
  "instagram",
  "website",
  "city",
  "state",
  "country",
  "niche",
  "notes",
] as const;

export type ExtractedField = (typeof EXTRACTED_FIELDS)[number];
export type ExtractedLead = Record<ExtractedField, string | null>;

const nullableString = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v) => (v === undefined || v === null ? null : String(v).trim() || null));

/** Validates (and coerces) whatever a provider returned. */
export const extractedLeadSchema = z.object(
  Object.fromEntries(EXTRACTED_FIELDS.map((f) => [f, nullableString])) as Record<ExtractedField, typeof nullableString>,
);
export const extractionResultSchema = z.object({ leads: z.array(extractedLeadSchema) });

/** JSON Schema used for structured output (all fields required, nullable, no extras). */
export const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  properties: {
    leads: {
      type: "array",
      items: {
        type: "object",
        properties: Object.fromEntries(EXTRACTED_FIELDS.map((f) => [f, { type: ["string", "null"] }])),
        required: [...EXTRACTED_FIELDS],
        additionalProperties: false,
      },
    },
  },
  required: ["leads"],
  additionalProperties: false,
} as const;

export type ExtractContext = {
  /** Existing niche names, so the model can reuse them. */
  niches: string[];
  /** e.g. "chunk 2 of 5" — for the prompt. */
  position?: string;
};

/**
 * One AI provider. Add a new provider by implementing this interface and
 * registering it in extractLeads.ts.
 */
export interface LeadExtractor {
  readonly name: string;
  extract(chunk: string, ctx: ExtractContext): Promise<ExtractedLead[]>;
}

/** Thrown when the model's output was cut off — the caller splits the chunk and retries. */
export class OutputTooLongError extends Error {}

export class AiConfigError extends Error {}
