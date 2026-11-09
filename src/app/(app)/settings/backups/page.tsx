import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listBackups } from "@/services";
import { BackupManager } from "@/components/settings/BackupManager";

export const metadata: Metadata = { title: "Backups" };
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export default async function BackupsPage() {
  const db = await createClient();
  const backups = await listBackups(db);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/settings" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Back">←</Link>
        <h1 className="text-xl font-bold">Backups &amp; restore</h1>
      </div>
      <div className="card bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
        Supabase’s own backups depend on your plan (point-in-time recovery is a paid feature). This app keeps its own daily
        backups here so your leads are safe regardless of plan.
      </div>
      {backups.ok ? (
        <BackupManager backups={backups.data} />
      ) : (
        <p className="card p-4 text-sm text-red-700">{backups.message}</p>
      )}
    </div>
  );
}
