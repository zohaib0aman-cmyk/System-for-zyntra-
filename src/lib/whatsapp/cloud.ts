import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/** Minimal client for the Meta WhatsApp Cloud API. */
const GRAPH = "https://graph.facebook.com/v21.0";

export type WaConfig = { phoneNumberId: string; accessToken: string };
export type WaSendResult = { ok: true; id: string | null } | { ok: false; error: string };

/** "+91 98765-43210" → "919876543210" */
export function waDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

async function post(cfg: WaConfig, payload: Record<string, unknown>): Promise<WaSendResult> {
  try {
    const res = await fetch(`${GRAPH}/${encodeURIComponent(cfg.phoneNumberId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...payload }),
      signal: AbortSignal.timeout(15000),
    });
    const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
    if (!res.ok) return { ok: false, error: json.error?.message ?? `HTTP ${res.status}` };
    return { ok: true, id: json.messages?.[0]?.id ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Free-form text: only allowed within 24 hours of the customer's last message. */
export function sendText(cfg: WaConfig, to: string, body: string) {
  return post(cfg, { to: waDigits(to), type: "text", text: { preview_url: true, body: body.slice(0, 4000) } });
}

/** Approved template message (works any time, e.g. the first message to a new lead). */
export function sendTemplate(cfg: WaConfig, to: string, name: string, lang: string, bodyParams: string[]) {
  return post(cfg, {
    to: waDigits(to),
    type: "template",
    template: {
      name,
      language: { code: lang },
      components: bodyParams.length
        ? [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text: text.slice(0, 1000) || "-" })) }]
        : [],
    },
  });
}

/** Checks Meta's X-Hub-Signature-256 header against the raw request body. */
export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(header.slice(7), "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type InboundMessage = { from: string; id: string; text: string; name: string | null; timestamp: number };

/** Pulls the text messages out of a webhook payload (status updates and media are ignored). */
export function parseInbound(payload: unknown): InboundMessage[] {
  const out: InboundMessage[] = [];
  const entries = (payload as { entry?: unknown[] })?.entry ?? [];
  for (const entry of entries as { changes?: { value?: Record<string, unknown> }[] }[]) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const contacts = (value.contacts as { wa_id?: string; profile?: { name?: string } }[] | undefined) ?? [];
      for (const m of (value.messages as Record<string, unknown>[] | undefined) ?? []) {
        const from = String(m.from ?? "");
        const id = String(m.id ?? "");
        if (!from || !id) continue;
        let text = "";
        if (m.type === "text") text = String((m.text as { body?: string })?.body ?? "");
        else if (m.type === "button") text = String((m.button as { text?: string })?.text ?? "");
        else if (m.type === "interactive") {
          const i = m.interactive as { button_reply?: { title?: string }; list_reply?: { title?: string } };
          text = i?.button_reply?.title ?? i?.list_reply?.title ?? "";
        } else text = `[${String(m.type)}]`;
        out.push({
          from,
          id,
          text: text.slice(0, 4000),
          name: contacts.find((c) => c.wa_id === from)?.profile?.name ?? null,
          timestamp: Number(m.timestamp ?? 0) * 1000 || Date.now(),
        });
      }
    }
  }
  return out;
}
