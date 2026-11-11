import "server-only";

/**
 * Chat completion through any OpenAI-compatible API. Defaults to NVIDIA's
 * free endpoint (build.nvidia.com): set NVIDIA_API_KEY, optionally NVIDIA_MODEL.
 */
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export function chatConfigured(): boolean {
  return Boolean(process.env.NVIDIA_API_KEY || process.env.CHAT_API_KEY);
}

export async function chat(messages: ChatMessage[], options: { maxTokens?: number } = {}): Promise<string | null> {
  const key = process.env.CHAT_API_KEY || process.env.NVIDIA_API_KEY;
  if (!key) return null;
  const base = (process.env.CHAT_BASE_URL || "https://integrate.api.nvidia.com/v1").replace(/\/$/, "");
  const model = process.env.CHAT_MODEL || process.env.NVIDIA_MODEL || "meta/llama-3.3-70b-instruct";
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, temperature: 0.4, max_tokens: options.maxTokens ?? 300 }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) {
      console.error(`[ai] chat HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return json.choices?.[0]?.message?.content?.trim() || null;
  } catch (e) {
    console.error(`[ai] chat failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
