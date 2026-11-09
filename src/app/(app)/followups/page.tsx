import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { endOfToday } from "@/lib/time";
import { listOpenFollowups } from "@/services";
import { FollowupItem } from "@/components/pipeline/FollowupItem";

export const metadata: Metadata = { title: "Follow-ups" };

export default async function FollowupsPage() {
  const db = await createClient();
  const res = await listOpenFollowups(db);
  if (!res.ok) return <p className="card p-4 text-sm text-red-700">Could not load follow-ups: {res.message}</p>;

  const now = Date.now();
  const todayEnd = endOfToday().getTime();
  const groups = [
    { title: "Overdue", cls: "text-red-700", items: res.data.filter((f) => new Date(f.due_at).getTime() < now) },
    { title: "Later today", cls: "text-slate-900", items: res.data.filter((f) => { const t = new Date(f.due_at).getTime(); return t >= now && t < todayEnd; }) },
    { title: "Upcoming", cls: "text-slate-900", items: res.data.filter((f) => new Date(f.due_at).getTime() >= todayEnd) },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">Follow-ups</h1>
        <p className="mt-1 text-sm text-slate-500">
          Set a follow-up from any lead’s profile. Enable notifications in{" "}
          <Link href="/settings" className="font-semibold text-brand-700">Settings</Link> to get a reminder on your phone.
        </p>
      </div>
      {res.data.length === 0 && (
        <div className="card p-8 text-center">
          <p className="font-medium">No open follow-ups 🎉</p>
          <Link href="/" className="btn-primary mt-4">Go to leads</Link>
        </div>
      )}
      {groups.map(
        (g) =>
          g.items.length > 0 && (
            <section key={g.title} className="space-y-2">
              <h2 className={`text-sm font-bold uppercase tracking-wide ${g.cls}`}>
                {g.title} <span className="font-medium text-slate-400">({g.items.length})</span>
              </h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {g.items.map((f) => (
                  <FollowupItem key={`${f.id}-${f.due_at}`} f={f} />
                ))}
              </div>
            </section>
          ),
      )}
    </div>
  );
}
