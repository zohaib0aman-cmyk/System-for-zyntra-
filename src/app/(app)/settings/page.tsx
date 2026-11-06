import type { Metadata } from "next";
import { logout } from "@/app/login/actions";
import { NotificationSettings } from "@/components/settings/NotificationSettings";
import { RecalculateScores } from "@/components/settings/RecalculateScores";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">Settings</h1>
      <NotificationSettings vapidPublicKey={vapid} />
      <RecalculateScores />
      <section className="card p-4">
        <h2 className="font-semibold">Account</h2>
        <form action={logout} className="mt-3">
          <button type="submit" className="btn-secondary">Log out</button>
        </form>
      </section>
      <p className="px-1 text-center text-xs text-slate-400">Zyntra Lead ID System</p>
    </div>
  );
}
