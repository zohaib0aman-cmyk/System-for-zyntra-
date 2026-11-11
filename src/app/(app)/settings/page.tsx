import type { Metadata } from "next";
import Link from "next/link";
import { logout } from "@/app/login/actions";
import { NotificationSettings } from "@/components/settings/NotificationSettings";
import { RecalculateScores } from "@/components/settings/RecalculateScores";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">Settings</h1>

      <div className="grid grid-cols-2 gap-2.5">
        <Link href="/settings/automation" className="card col-span-2 border-brand-200 p-4 transition hover:shadow-md">
          <p className="font-semibold">⚡ Automation (WhatsApp + AI)</p>
          <p className="mt-0.5 text-xs text-slate-500">Auto demo link, AI replies, follow-up after demo view</p>
        </Link>
        <Link href="/settings/templates" className="card p-4 transition hover:border-brand-200 hover:shadow-md">
          <p className="font-semibold">Message templates</p>
          <p className="mt-0.5 text-xs text-slate-500">WhatsApp message presets with variables</p>
        </Link>
        <Link href="/settings/backups" className="card p-4 transition hover:border-brand-200 hover:shadow-md">
          <p className="font-semibold">Backups &amp; restore</p>
          <p className="mt-0.5 text-xs text-slate-500">Download or restore a full data backup</p>
        </Link>
        <Link href="/settings/connections" className="card p-4 transition hover:border-brand-200 hover:shadow-md">
          <p className="font-semibold">AI Connections</p>
          <p className="mt-0.5 text-xs text-slate-500">API keys for Claude, ChatGPT &amp; others</p>
        </Link>
        <Link href="/settings/connect-ai" className="card p-4 transition hover:border-brand-200 hover:shadow-md">
          <p className="font-semibold">How to connect AI</p>
          <p className="mt-0.5 text-xs text-slate-500">Step-by-step setup for each AI</p>
        </Link>
      </div>

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
