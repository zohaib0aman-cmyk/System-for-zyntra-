import "server-only";
import type { AutomationSettingsRow, LeadRow } from "@/lib/database.types";
import { chat, chatConfigured, type ChatMessage } from "@/lib/ai/chat";
import { sendTemplate, sendText, type WaConfig, type InboundMessage } from "@/lib/whatsapp/cloud";
import { logActivity } from "./activities";
import { setFollowup } from "./followups";
import { sendPushToAll } from "./push";
import { dbError, type DB, type ServiceResult } from "./types";

/**
 * The automatic workflow:
 *   1. New lead            → WhatsApp demo link (approved template). High-value → owner is notified to call.
 *   2. Lead opens the demo → a job runs `followup_minutes` later:
 *        high-value: owner gets "call now" + a follow-up; other: AI sends a WhatsApp follow-up.
 *   3. Lead replies        → high-value: one short "sending your request to the team" + owner notified;
 *                            other: the AI answers (and hands over when the lead wants a person / price / deal).
 * Everything here runs with the service-role client (cron + webhook).
 */

const AI_ACTOR = "ai";
const STOP_RE = /^\s*(stop|unsubscribe|band karo|mat bhejo|no more|remove me)\b/i;
const WINDOW_MS = 24 * 60 * 60 * 1000;

export type AutomationSettings = AutomationSettingsRow;

export async function getAutomationSettings(db: DB): Promise<AutomationSettings | null> {
  const { data } = await db.from("automation_settings").select("*").eq("id", true).maybeSingle();
  return data ?? null;
}

function waConfig(s: AutomationSettings | null): WaConfig | null {
  if (!s?.enabled || !s.wa_phone_number_id || !s.wa_access_token) return null;
  return { phoneNumberId: s.wa_phone_number_id, accessToken: s.wa_access_token };
}

export function isHighValue(lead: Pick<LeadRow, "score" | "priority">, s: Pick<AutomationSettings, "high_score">): boolean {
  return lead.priority || lead.score >= s.high_score;
}

export function demoLink(trackingId: string, s?: Pick<AutomationSettings, "demo_base_url"> | null): string | null {
  const base = (s?.demo_base_url || process.env.DEMO_BASE_URL || "").replace(/\/+$/, "");
  return base ? `${base}/?id=${encodeURIComponent(trackingId)}` : null;
}

function contactNumber(lead: Pick<LeadRow, "whatsapp" | "phone">): string | null {
  return lead.whatsapp || lead.phone || null;
}

function firstName(lead: Pick<LeadRow, "owner_name" | "brand_name">): string {
  return lead.owner_name?.trim().split(/\s+/)[0] || lead.brand_name;
}

function appUrl(path: string): string {
  const base = (process.env.APP_URL || "").replace(/\/+$/, "");
  return `${base}${path}`;
}

async function logOut(db: DB, leadId: string, body: string, res: { ok: true; id: string | null } | { ok: false; error: string }, ai: boolean) {
  await db.from("wa_messages").insert({
    lead_id: leadId,
    direction: "out",
    body,
    wa_message_id: res.ok ? res.id : null,
    by_ai: ai,
    status: res.ok ? "sent" : `failed: ${res.error}`.slice(0, 300),
  });
  if (res.ok) await logActivity(db, leadId, "whatsapp_out", { text: body.slice(0, 500), ai }, ai ? AI_ACTOR : "system");
  else console.error(`[automation] WhatsApp send failed for ${leadId}: ${res.error}`);
}

async function notifyOwner(title: string, body: string, trackingId: string, db: DB) {
  const r = await sendPushToAll(db, { title, body, url: appUrl(`/leads/${trackingId}`), tag: `lead-${trackingId}` });
  if (!r.ok) console.error(`[automation] push: ${r.message}`);
}

async function handoff(db: DB, lead: LeadRow, reason: string) {
  await db.from("leads").update({ handoff_at: new Date().toISOString() }).eq("id", lead.id);
  await logActivity(db, lead.id, "handoff", { reason }, "system");
  await notifyOwner(`📞 Call: ${lead.brand_name}`, reason, lead.tracking_id, db);
}

// ---------------------------------------------------------------------------
// 1. New leads → demo link
// ---------------------------------------------------------------------------

export async function sendDemo(db: DB, lead: LeadRow, s: AutomationSettings): Promise<string> {
  const cfg = waConfig(s);
  const to = contactNumber(lead);
  const link = demoLink(lead.tracking_id, s);
  if (!cfg) return "whatsapp_not_configured";
  if (!to) return "no_number";
  if (!link) return "no_demo_url";

  const params = [firstName(lead), lead.brand_name, link];
  const res = await sendTemplate(cfg, to, s.wa_template_name, s.wa_template_lang, params);
  const body = `Namaste ${params[0]}! Maine/meri team ne ${params[1]} ke liye ek free demo website banayi hai. Ek baar dekhiye: ${link}`;
  await logOut(db, lead.id, body, res, false);
  // Mark as sent even on failure so a bad number is not retried every 5 minutes.
  await db.from("leads").update({ demo_sent_at: new Date().toISOString() }).eq("id", lead.id);
  if (!res.ok) return `failed: ${res.error}`;

  await logActivity(db, lead.id, "demo_sent", { link }, "system");
  if (isHighValue(lead, s)) {
    await notifyOwner(`⭐ High-value lead: ${lead.brand_name}`, "Demo link sent on WhatsApp. Give them a call.", lead.tracking_id, db);
  }
  return "sent";
}

export async function processNewLeads(db: DB, s: AutomationSettings, limit = 10): Promise<{ sent: number; skipped: number }> {
  const { data } = await db
    .from("leads")
    .select("*")
    .eq("auto_demo", true)
    .is("demo_sent_at", null)
    .eq("wa_opt_out", false)
    .order("created_at", { ascending: true })
    .limit(limit);
  let sent = 0;
  let skipped = 0;
  for (const lead of data ?? []) {
    const r = await sendDemo(db, lead, s);
    if (r === "sent") sent++;
    else {
      skipped++;
      if (r === "no_number") await db.from("leads").update({ auto_demo: false }).eq("id", lead.id);
      if (r === "whatsapp_not_configured" || r === "no_demo_url") break; // nothing will work until settings are fixed
    }
  }
  return { sent, skipped };
}

// ---------------------------------------------------------------------------
// 2. Demo viewed → schedule the follow-up
// ---------------------------------------------------------------------------

export async function recordDemoView(db: DB, trackingId: string): Promise<ServiceResult<{ first: boolean }>> {
  const { data: lead, error } = await db.from("leads").select("id,demo_viewed_at").eq("tracking_id", trackingId).maybeSingle();
  if (error) return dbError(error);
  if (!lead) return { ok: false, code: "not_found", message: "Lead not found." };
  if (lead.demo_viewed_at) return { ok: true, data: { first: false } };

  const now = new Date();
  const s = await getAutomationSettings(db);
  const minutes = s?.followup_minutes ?? 15;
  await db.from("leads").update({ demo_viewed_at: now.toISOString() }).eq("id", lead.id).is("demo_viewed_at", null);
  await logActivity(db, lead.id, "demo_viewed", {}, "system");
  await db
    .from("automation_jobs")
    .upsert(
      { lead_id: lead.id, kind: "demo_followup", run_at: new Date(now.getTime() + minutes * 60_000).toISOString() },
      { onConflict: "lead_id,kind", ignoreDuplicates: true },
    );
  return { ok: true, data: { first: true } };
}

async function lastInboundAt(db: DB, leadId: string): Promise<number | null> {
  const { data } = await db
    .from("wa_messages")
    .select("created_at")
    .eq("lead_id", leadId)
    .eq("direction", "in")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? new Date(data.created_at).getTime() : null;
}

async function runDemoFollowup(db: DB, lead: LeadRow, s: AutomationSettings): Promise<string> {
  if (isHighValue(lead, s)) {
    await setFollowup(db, lead.id, { dueAt: new Date(), note: "Demo dekh liya — ab call karein" }, { actor: "system" });
    await handoff(db, lead, `${lead.brand_name} ne ${s.followup_minutes} min pehle demo dekha. Abhi call karein.`);
    return "owner_notified";
  }
  if (lead.wa_opt_out) return "opted_out";
  const cfg = waConfig(s);
  const to = contactNumber(lead);
  if (!cfg || !to) return "whatsapp_not_configured";

  const last = await lastInboundAt(db, lead.id);
  if (last && Date.now() - last < WINDOW_MS) {
    const text = (await aiReply(db, lead, s, "(System: the lead opened the demo website a few minutes ago. Send a short, friendly follow-up asking how they liked it.)"))?.reply
      ?? `Namaste ${firstName(lead)}! Aapne demo dekha — kaisa laga? Koi sawaal ho toh yahin reply kariye 🙂`;
    await logOut(db, lead.id, text, await sendText(cfg, to, text), true);
  } else {
    const params = [firstName(lead)];
    const res = await sendTemplate(cfg, to, s.wa_followup_template, s.wa_template_lang, params);
    await logOut(db, lead.id, `Namaste ${params[0]}, aapne demo dekha — kaisa laga? Koi sawaal ho toh yahin reply kariye.`, res, true);
  }
  return "ai_followup_sent";
}

export async function runDueJobs(db: DB, s: AutomationSettings, limit = 20): Promise<{ ran: number }> {
  const { data: jobs } = await db
    .from("automation_jobs")
    .select("*")
    .is("done_at", null)
    .lte("run_at", new Date().toISOString())
    .order("run_at")
    .limit(limit);
  let ran = 0;
  for (const job of jobs ?? []) {
    // Claim the job first so two overlapping runs never both send.
    const { data: claimed } = await db
      .from("automation_jobs")
      .update({ done_at: new Date().toISOString(), result: "running" })
      .eq("id", job.id)
      .is("done_at", null)
      .select("id");
    if (!claimed?.length) continue;
    const { data: lead } = await db.from("leads").select("*").eq("id", job.lead_id).maybeSingle();
    const result = lead ? await runDemoFollowup(db, lead, s) : "lead_deleted";
    await db.from("automation_jobs").update({ result }).eq("id", job.id);
    ran++;
  }
  return { ran };
}

// ---------------------------------------------------------------------------
// 3. Incoming WhatsApp messages
// ---------------------------------------------------------------------------

function systemPrompt(lead: LeadRow, s: AutomationSettings, link: string | null): string {
  return [
    `You are the WhatsApp assistant of ${s.business_name}, a team that builds online stores (e-commerce websites) for clothing brands in India.`,
    `You are chatting with ${lead.owner_name || "the owner"} of "${lead.brand_name}"${lead.city ? ` from ${lead.city}` : ""}.`,
    `The team already made a FREE demo website for their brand${link ? `: ${link}` : ""}. Your goal: get them to look at the demo and agree to a short call with the team.`,
    "Rules:",
    "- Reply in the same language the customer uses (Hinglish / Hindi / English / Gujarati). Be warm, short (max 3 sentences), no jargon.",
    "- Never invent prices, discounts, delivery times or promises. For price/payment/deal questions say the team will share details on a call.",
    "- Never ask for passwords, OTPs or payments.",
    "- If they ask for a person, a call, price, want to buy/order, are angry, or you are unsure: reply politely that you are passing their request to the team, and end your reply with the exact token [HANDOFF].",
    "- If they say they are not interested, thank them politely and end with [HANDOFF].",
  ].join("\n");
}

async function aiReply(db: DB, lead: LeadRow, s: AutomationSettings, extraUser?: string): Promise<{ reply: string; handoff: boolean } | null> {
  if (!chatConfigured()) return null;
  const { data: history } = await db
    .from("wa_messages")
    .select("direction,body")
    .eq("lead_id", lead.id)
    .order("created_at", { ascending: false })
    .limit(12);
  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt(lead, s, demoLink(lead.tracking_id, s)) }];
  for (const m of (history ?? []).reverse()) {
    messages.push({ role: m.direction === "in" ? "user" : "assistant", content: m.body });
  }
  if (extraUser) messages.push({ role: "user", content: extraUser });
  const raw = await chat(messages);
  if (!raw) return null;
  const handoffFlag = raw.includes("[HANDOFF]");
  const reply = raw.replace(/\[HANDOFF\]/g, "").trim();
  return reply ? { reply, handoff: handoffFlag } : null;
}

const HIGH_VALUE_REPLY = "Dhanyavaad! 🙏 Main aapki request team ko send kar raha hoon — woh aapse jaldi hi baat karenge.";

export async function handleInbound(db: DB, msg: InboundMessage): Promise<string> {
  const { data: existing } = await db.from("wa_messages").select("id").eq("wa_message_id", msg.id).maybeSingle();
  if (existing) return "duplicate";

  const e164 = `+${msg.from}`;
  const { data: lead } = await db
    .from("leads")
    .select("*")
    .or(`whatsapp.eq.${e164},phone.eq.${e164}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  await db.from("wa_messages").insert({ lead_id: lead?.id ?? null, wa_from: e164, direction: "in", body: msg.text, wa_message_id: msg.id });
  if (!lead) {
    await sendPushToAll(db, { title: `WhatsApp: ${msg.name ?? e164}`, body: msg.text.slice(0, 140), url: appUrl("/leads"), tag: `wa-${msg.from}` });
    return "unknown_sender";
  }
  await logActivity(db, lead.id, "whatsapp_in", { text: msg.text.slice(0, 500) }, "system");
  await db.from("leads").update({ last_contacted_at: new Date().toISOString() }).eq("id", lead.id);

  const s = await getAutomationSettings(db);
  const cfg = waConfig(s);
  if (!s || !cfg) return "whatsapp_not_configured";

  if (STOP_RE.test(msg.text)) {
    await db.from("leads").update({ wa_opt_out: true }).eq("id", lead.id);
    const bye = "Theek hai, ab aapko aur messages nahi aayenge. Dhanyavaad! 🙏";
    await logOut(db, lead.id, bye, await sendText(cfg, e164, bye), true);
    return "opted_out";
  }

  if (isHighValue(lead, s)) {
    // The owner talks to high-value leads. The AI only acknowledges, at most once every 6 hours.
    const { data: lastAck } = await db
      .from("wa_messages")
      .select("created_at")
      .eq("lead_id", lead.id)
      .eq("direction", "out")
      .eq("body", HIGH_VALUE_REPLY)
      .gte("created_at", new Date(Date.now() - 6 * 3600_000).toISOString())
      .limit(1)
      .maybeSingle();
    if (!lastAck) await logOut(db, lead.id, HIGH_VALUE_REPLY, await sendText(cfg, e164, HIGH_VALUE_REPLY), true);
    await handoff(db, lead, `WhatsApp: "${msg.text.slice(0, 120)}"`);
    return "handoff";
  }

  if (lead.handoff_at) {
    // Already with the owner: keep them informed, don't let the AI talk over them.
    await notifyOwner(`💬 ${lead.brand_name}`, msg.text.slice(0, 140), lead.tracking_id, db);
    return "owner_handling";
  }

  const ai = await aiReply(db, lead, s);
  if (!ai) {
    await handoff(db, lead, `AI unavailable. WhatsApp: "${msg.text.slice(0, 120)}"`);
    return "ai_unavailable";
  }
  await logOut(db, lead.id, ai.reply, await sendText(cfg, e164, ai.reply), true);
  if (ai.handoff) await handoff(db, lead, `AI handed over. Lead said: "${msg.text.slice(0, 120)}"`);
  return ai.handoff ? "ai_replied_handoff" : "ai_replied";
}

/** Owner sends a message from the lead page (inside the 24h window). */
export async function sendOwnerMessage(db: DB, leadId: string, text: string): Promise<ServiceResult<null>> {
  const body = text.trim().slice(0, 4000);
  if (!body) return { ok: false, code: "validation", message: "Write a message.", fieldErrors: {} };
  const s = await getAutomationSettings(db);
  const cfg = waConfig(s);
  if (!cfg) return { ok: false, code: "validation", message: "WhatsApp is not set up (Settings → Automation).", fieldErrors: {} };
  const { data: lead } = await db.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (!lead) return { ok: false, code: "not_found", message: "Lead not found." };
  const to = contactNumber(lead);
  if (!to) return { ok: false, code: "validation", message: "This lead has no WhatsApp number.", fieldErrors: {} };
  const res = await sendText(cfg, to, body);
  await db.from("wa_messages").insert({
    lead_id: lead.id, direction: "out", body, wa_message_id: res.ok ? res.id : null, by_ai: false,
    status: res.ok ? "sent" : `failed: ${res.error}`.slice(0, 300),
  });
  if (!res.ok) {
    return {
      ok: false, code: "validation", fieldErrors: {},
      message: /24|window|re-engage/i.test(res.error)
        ? "WhatsApp allows free messages only within 24 hours of the lead's last reply. Call them instead."
        : `WhatsApp error: ${res.error}`,
    };
  }
  await logActivity(db, lead.id, "whatsapp_out", { text: body.slice(0, 500), ai: false }, "owner");
  await db.from("leads").update({ last_contacted_at: new Date().toISOString() }).eq("id", lead.id);
  return { ok: true, data: null };
}

/** One scheduler tick: new leads, due follow-ups. */
export async function runAutomation(db: DB): Promise<Record<string, unknown>> {
  const s = await getAutomationSettings(db);
  if (!s) return { skipped: "run the Phase 6 SQL first" };
  if (!s.enabled) return { skipped: "automation is turned off" };
  const jobs = await runDueJobs(db, s);
  const leads = await processNewLeads(db, s);
  return { jobs, leads };
}
