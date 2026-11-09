"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  recalculateAllScoresAction,
} from "@/app/(app)/pipeline-actions";
import {
  removePushSubscription,
  savePushSubscription,
  sendPushToAll,
  type BrowserSubscription,
} from "@/services/push";

export async function subscribePushAction(sub: BrowserSubscription): Promise<{ error?: string }> {
  const ua = (await headers()).get("user-agent");
  const r = await savePushSubscription(await createClient(), sub, ua);
  return r.ok ? {} : { error: r.message };
}

export async function unsubscribePushAction(endpoint: string): Promise<{ error?: string }> {
  const r = await removePushSubscription(await createClient(), endpoint);
  return r.ok ? {} : { error: r.message };
}

export async function sendTestPushAction(): Promise<{ error?: string; sent?: number }> {
  const r = await sendPushToAll(await createClient(), {
    title: "Zyntra test notification ✅",
    body: "Notifications are working. You'll be reminded when a follow-up is due.",
    url: "/followups",
    tag: "test",
  });
  if (!r.ok) return { error: r.message };
  if (r.data.sent === 0) return { error: "No device is subscribed yet. Enable notifications first." };
  return { sent: r.data.sent };
}

export { recalculateAllScoresAction };
