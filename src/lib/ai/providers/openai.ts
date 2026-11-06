import { SYSTEM_PROMPT, userPrompt } from "../prompt";
import {
  AiConfigError,
  EXTRACTION_JSON_SCHEMA,
  extractionResultSchema,
  OutputTooLongError,
  type ExtractContext,
  type ExtractedLead,
  type LeadExtractor,
} from "../types";

/** OpenAI Chat Completions with a strict JSON schema (no SDK dependency). */
export class OpenAIExtractor implements LeadExtractor {
  readonly name = "openai";
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor() {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new AiConfigError("OPENAI_API_KEY is not set. Add it to your environment variables.");
    this.apiKey = key;
    this.model = process.env.OPENAI_MODEL || "gpt-5-mini";
    this.baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  }

  async extract(chunk: string, ctx: ExtractContext): Promise<ExtractedLead[]> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt(chunk, ctx) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "leads", strict: true, schema: EXTRACTION_JSON_SCHEMA },
        },
      }),
      signal: AbortSignal.timeout(240_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`OpenAI error ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      choices: { finish_reason: string; message: { content: string | null; refusal?: string | null } }[];
    };
    const choice = data.choices[0];
    if (choice.finish_reason === "length") throw new OutputTooLongError("AI output was cut off");
    if (choice.message.refusal) throw new Error("The AI declined to process this part of the PDF.");
    return extractionResultSchema.parse(JSON.parse(choice.message.content ?? "{}")).leads;
  }
}
