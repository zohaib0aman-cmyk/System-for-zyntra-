import { after, NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseInbound, verifySignature } from "@/lib/whatsapp/cloud";
import { getAutomationSettings, handleInbound } from "@/services/automation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Meta calls this once with hub.challenge when you save the webhook URL. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const s = await getAutomationSettings(createAdminClient());
  if (p.get("hub.mode") === "subscribe" && s && p.get("hub.verify_token") === s.wa_verify_token) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new NextResponse("forbidden", { status: 403 });
}

/** Incoming WhatsApp messages. Answered with 200 right away; the reply is sent after. */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const db = createAdminClient();
  const s = await getAutomationSettings(db);
  if (!s?.wa_app_secret || !verifySignature(raw, req.headers.get("x-hub-signature-256"), s.wa_app_secret)) {
    return new NextResponse("invalid signature", { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse("bad json", { status: 400 });
  }
  const messages = parseInbound(payload);
  if (messages.length) {
    after(async () => {
      for (const m of messages) {
        try {
          await handleInbound(db, m);
        } catch (e) {
          console.error(`[whatsapp] inbound ${m.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    });
  }
  return NextResponse.json({ ok: true });
}
