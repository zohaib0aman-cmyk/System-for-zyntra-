import { chunkText } from "@/lib/pdf/extractText";
import { AnthropicExtractor } from "./providers/anthropic";
import { BasicTableExtractor } from "./providers/basic";
import { OpenAIExtractor } from "./providers/openai";
import { AiConfigError, OutputTooLongError, type ExtractedLead, type LeadExtractor } from "./types";

export * from "./types";

/**
 * Picks the AI provider from the AI_PROVIDER env variable:
 *   anthropic (default) | openai | basic (no AI, tables only)
 */
export function getExtractor(provider = process.env.AI_PROVIDER || "anthropic"): LeadExtractor {
  switch (provider.toLowerCase()) {
    case "anthropic":
    case "claude":
      return new AnthropicExtractor();
    case "openai":
    case "gpt":
      return new OpenAIExtractor();
    case "basic":
      return new BasicTableExtractor();
    default:
      throw new AiConfigError(`Unknown AI_PROVIDER "${provider}". Use anthropic, openai or basic.`);
  }
}

export type ChunkFailure = { chunk: number; error: string; preview: string };

export type ExtractionOutcome = {
  leads: ExtractedLead[];
  chunks: number;
  /** Chunks that failed even after retries — reported to the user, never dropped silently. */
  failures: ChunkFailure[];
  provider: string;
};

export type ExtractOptions = {
  niches: string[];
  extractor?: LeadExtractor;
  maxChunkChars?: number;
  concurrency?: number;
  onProgress?: (done: number, total: number) => void | Promise<void>;
};

/**
 * Splits long PDF text into chunks, sends them to the AI provider (a few at
 * a time), and returns all leads in document order. If a response is cut
 * off, the chunk is split in half and retried.
 */
export async function extractLeads(text: string, opts: ExtractOptions): Promise<ExtractionOutcome> {
  const extractor = opts.extractor ?? getExtractor();
  const chunks = chunkText(text, opts.maxChunkChars ?? 12000);
  const results: ExtractedLead[][] = new Array(chunks.length);
  const failures: ChunkFailure[] = [];
  let done = 0;

  const run = async (i: number) => {
    try {
      results[i] = await extractWithSplit(extractor, chunks[i], opts.niches, `part ${i + 1} of ${chunks.length}`, 0);
    } catch (e) {
      if (e instanceof AiConfigError) throw e;
      results[i] = [];
      failures.push({
        chunk: i + 1,
        error: e instanceof Error ? e.message : String(e),
        preview: chunks[i].replace(/\s+/g, " ").slice(0, 160),
      });
    }
    done++;
    await opts.onProgress?.(done, chunks.length);
  };

  const limit = Math.max(1, opts.concurrency ?? 3);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, chunks.length) }, async () => {
      while (next < chunks.length) await run(next++);
    }),
  );

  return { leads: results.flat(), chunks: chunks.length, failures, provider: extractor.name };
}

async function extractWithSplit(
  extractor: LeadExtractor,
  chunk: string,
  niches: string[],
  position: string,
  depth: number,
): Promise<ExtractedLead[]> {
  try {
    return await extractor.extract(chunk, { niches, position });
  } catch (e) {
    if (e instanceof OutputTooLongError && depth < 3 && chunk.length > 500) {
      const lines = chunk.split("\n");
      const mid = Math.ceil(lines.length / 2);
      const [a, b] = [lines.slice(0, mid).join("\n"), lines.slice(mid).join("\n")];
      return [
        ...(await extractWithSplit(extractor, a, niches, position, depth + 1)),
        ...(await extractWithSplit(extractor, b, niches, position, depth + 1)),
      ];
    }
    throw e;
  }
}
