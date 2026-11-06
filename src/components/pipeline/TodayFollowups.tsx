import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getDueFollowups } from "@/services";
import { FollowupItem } from "./FollowupItem";

/** "Aaj ke follow-ups": today's and overdue follow-ups, shown at the top of the home screen. */
export async function TodayFollowups() {
  const db = await createClient();
  const res = await getDueFollowups(db, { limit: 50 });
  if (!res.ok || res.data.length === 0) return null;
  const items = res.data;
  const overdue = items.filter((f) => new Date(f.due_at).getTime() < Date.now()).length;
  return (
    <section id="followups" aria-label="Today's follow-ups" className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-bold">
          Aaj ke follow-ups <span className="text-sm font-medium text-slate-500">({items.length})</span>
        </h2>
        {overdue > 0 && <span className="text-xs font-semibold text-red-700">{overdue} overdue</span>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.slice(0, 4).map((f) => (
          <FollowupItem key={`${f.id}-${f.due_at}`} f={f} />
        ))}
      </div>
      {items.length > 4 && (
        <Link href="/followups" className="block text-center text-sm font-semibold text-brand-700">
          See all {items.length} →
        </Link>
      )}
    </section>
  );
}
