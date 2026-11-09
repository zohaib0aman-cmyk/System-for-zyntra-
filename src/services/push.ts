import "server-only";
import * as webpush from "web-push";
import { dbError, type DB, type ServiceResult } from "./types";

export type PushPayload = { title: string; body: string; url?: string; tag?: string };
export type PushResult = { sent: number; failed: number; removed: number };

let configured = false;
function configure(): string | null {
  if (configured) return null;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:owner@example.com";
  if (!pub || !priv) return "Push notifications are not set up: add NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.";
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return null;
}

export type BrowserSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };

export async function savePushSubscription(db: DB, sub: BrowserSubscription, userAgent?: string | null): Promise<ServiceResult<null>> {
  if (!sub?.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) {
    return { ok: false, code: "validation", message: "Invalid push subscription.", fieldErrors: {} };
  }
  const { error } = await db
    .from("push_subscriptions")
    .upsert(
      { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, user_agent: userAgent?.slice(0, 300) ?? null },
      { onConflict: "endpoint" },
    );
  if (error) return dbError(error);
  return { ok: true, data: null };
}

export async function removePushSubscription(db: DB, endpoint: string): Promise<ServiceResult<null>> {
  const { error } = await db.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) return dbError(error);
  return { ok: true, data: null };
}

/** Sends one notification to every saved device. Expired subscriptions are deleted. */
export async function sendPushToAll(db: DB, payload: PushPayload): Promise<ServiceResult<PushResult>> {
  const err = configure();
  if (err) return { ok: false, code: "validation", message: err, fieldErrors: {} };
  const { data: subs, error } = await db.from("push_subscriptions").select("*");
  if (error) return dbError(error);
  const result: PushResult = { sent: 0, failed: 0, removed: 0 };
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 12, urgency: "high", topic: payload.tag?.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined },
        );
        result.sent++;
        await db.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("id", s.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.from("push_subscriptions").delete().eq("id", s.id);
          result.removed++;
        } else {
          result.failed++;
          console.error(`[push] ${s.endpoint.slice(0, 60)}…: ${status ?? ""} ${(e as Error).message}`);
        }
      }
    }),
  );
  return { ok: true, data: result };
}

/**
 * Sends a notification for every open follow-up that is due and not yet notified
 * (called every 15 minutes by the cron job). Up to 3 individual notifications,
 * otherwise one summary.
 */
export async function notifyDueFollowups(db: DB): Promise<ServiceResult<{ due: number } & PushResult>> {
  const { data, error } = await db
    .from("followups")
    .select("id, due_at, note, lead:leads!inner(tracking_id, brand_name)")
    .eq("done", false)
    .is("notified_at", null)
    .lte("due_at", new Date().toISOString())
    .order("due_at")
    .limit(100);
  if (error) return dbError(error);
  const due = (data ?? []) as unknown as { id: string; due_at: string; note: string | null; lead: { tracking_id: string; brand_name: string } }[];
  const total: PushResult = { sent: 0, failed: 0, removed: 0 };
  if (due.length === 0) return { ok: true, data: { due: 0, ...total } };

  const payloads: PushPayload[] =
    due.length <= 3
      ? due.map((f) => ({
          title: `Follow up: ${f.lead.brand_name}`,
          body: f.note || `${f.lead.tracking_id} — tap to open`,
          url: `/leads/${f.lead.tracking_id}`,
          tag: `followup-${f.id}`,
        }))
      : [{
          title: `${due.length} follow-ups due`,
          body: due.slice(0, 4).map((f) => f.lead.brand_name).join(", ") + (due.length > 4 ? "…" : ""),
          url: "/followups",
          tag: "followups-summary",
        }];

  for (const p of payloads) {
    const r = await sendPushToAll(db, p);
    if (!r.ok) return r;
    total.sent += r.data.sent;
    total.failed += r.data.failed;
    total.removed += r.data.removed;
  }
  // Mark as notified even when no device is registered, so enabling notifications later
  // does not replay old reminders. Snoozing resets notified_at.
  await db.from("followups").update({ notified_at: new Date().toISOString() }).in("id", due.map((f) => f.id));
  return { ok: true, data: { due: due.length, ...total } };
}
