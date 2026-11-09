"use client";

import { useEffect, useState, useTransition } from "react";
import { sendTestPushAction, subscribePushAction, unsubscribePushAction } from "@/app/(app)/settings/actions";
import { Spinner } from "@/components/Spinner";

type State = "loading" | "unsupported" | "denied" | "off" | "on";

/** Convert a base64url VAPID public key to the Uint8Array the Push API needs. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function NotificationSettings({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [state, setState] = useState<State>("loading");
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  const [pending, start] = useTransition();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      return setState("unsupported");
    }
    if (Notification.permission === "denied") return setState("denied");
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? "on" : "off"))
      .catch(() => setState("off"));
  }, []);

  async function enable() {
    setMessage(undefined);
    if (!vapidPublicKey) return setMessage({ text: "Push keys are not set up on the server yet (see README).", error: true });
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return setMessage({ text: "Permission was not granted.", error: true });
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      start(async () => {
        const r = await subscribePushAction(sub.toJSON() as unknown as { endpoint: string; keys: { p256dh: string; auth: string } });
        if (r.error) {
          await sub.unsubscribe().catch(() => {});
          return setMessage({ text: r.error, error: true });
        }
        setState("on");
        setMessage({ text: "Notifications are on for this device." });
      });
    } catch (e) {
      setMessage({ text: `Could not enable notifications: ${e instanceof Error ? e.message : e}`, error: true });
    }
  }

  async function disable() {
    setMessage(undefined);
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await unsubscribePushAction(sub.endpoint);
      await sub.unsubscribe().catch(() => {});
    }
    setState("off");
    setMessage({ text: "Notifications turned off for this device." });
  }

  return (
    <section className="card space-y-3 p-4">
      <div>
        <h2 className="font-semibold">Follow-up notifications</h2>
        <p className="mt-1 text-sm text-slate-500">
          Get a reminder on this phone when a follow-up is due. Add the app to your home screen first, then turn this on.
        </p>
      </div>

      {state === "loading" && <Spinner className="h-5 w-5 text-brand-600" />}
      {state === "unsupported" && (
        <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          This browser can’t show notifications. On iPhone, add the app to your home screen (Share → Add to Home Screen) and open it from there.
        </p>
      )}
      {state === "denied" && (
        <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          Notifications are blocked for this site. Allow them in your browser settings, then reload.
        </p>
      )}

      {(state === "off" || state === "on") && (
        <div className="flex flex-wrap gap-2">
          {state === "off" ? (
            <button onClick={enable} disabled={pending} className="btn-primary">
              {pending && <Spinner />} Enable notifications
            </button>
          ) : (
            <>
              <button
                onClick={() => start(async () => {
                  const r = await sendTestPushAction();
                  setMessage(r.error ? { text: r.error, error: true } : { text: `Test sent to ${r.sent} device(s). Check your notifications.` });
                })}
                disabled={pending}
                className="btn-primary"
              >
                {pending && <Spinner />} Send test notification
              </button>
              <button onClick={disable} disabled={pending} className="btn-secondary">Turn off</button>
            </>
          )}
        </div>
      )}
      {message && <p className={`text-sm ${message.error ? "text-red-700" : "text-emerald-700"}`}>{message.text}</p>}
    </section>
  );
}
