import Anthropic from "@anthropic-ai/sdk";
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

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/** Claude via the official Anthropic SDK, using structured JSON output. */
export class AnthropicExtractor implements LeadExtractor {
  readonly name = "anthropic";
  private client: Anthropic;
  private model: string;
  private effort: Effort;

  constructor() {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new AiConfigError("ANTHROPIC_API_KEY is not set. Add it to your environment variables (see README).");
    }
    this.client = new Anthropic({ timeout: 240_000, maxRetries: 2 });
    this.model = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
    this.effort = (process.env.ANTHROPIC_EFFORT as Effort) || "medium";
  }

  async extract(chunk: string, ctx: ExtractContext): Promise<ExtractedLead[]> {
    const stream = this.client.beta.messages.stream({
      model: this.model,
      max_tokens: 32000,
      // If a safety classifier declines, retry on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: this.effort,
        format: { type: "json_schema", schema: EXTRACTION_JSON_SCHEMA as unknown as Record<string, unknown> },
      },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt(chunk, ctx) }],
    });
    const message = await stream.finalMessage();

    if (message.stop_reason === "max_tokens") throw new OutputTooLongError("AI output was cut off");
    if (message.stop_reason === "refusal") {
      throw new Error("The AI declined to process this part of the PDF.");
    }
    const text = message.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error("The AI returned invalid JSON.");
    }
    return extractionResultSchema.parse(json).leads;
  }
}
