import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listApiKeys } from "@/services";
import { ApiKeyManager } from "@/components/settings/ApiKeyManager";

export const metadata: Metadata = { title: "AI Connections" };

export default async function ConnectionsPage() {
  const db = await createClient();
  const keys = await listApiKeys(db);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/settings" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Back">←</Link>
        <h1 className="text-xl font-bold">AI Connections</h1>
      </div>
      {keys.ok ? <ApiKeyManager keys={keys.data} /> : <p className="card p-4 text-sm text-red-700">{keys.message}</p>}
      <Link href="/settings/connect-ai" className="card block p-4 text-center font-semibold text-brand-700 hover:border-brand-200">
        How to connect Claude, ChatGPT &amp; others →
      </Link>
    </div>
  );
}
