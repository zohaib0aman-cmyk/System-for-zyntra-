import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listTemplates } from "@/services";
import { TemplateManager } from "@/components/settings/TemplateManager";

export const metadata: Metadata = { title: "Message templates" };

export default async function TemplatesPage() {
  const db = await createClient();
  const templates = await listTemplates(db);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/settings" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Back">←</Link>
        <h1 className="text-xl font-bold">Message templates</h1>
      </div>
      {templates.ok ? (
        <TemplateManager templates={templates.data} />
      ) : (
        <p className="card p-4 text-sm text-red-700">{templates.message}</p>
      )}
    </div>
  );
}
