import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getDashboardStats, getRecentActivity, latestBackup, type DashboardRange } from "@/services";
import { relativeTime } from "@/lib/time";
import { StatCards } from "@/components/dashboard/StatCards";
import { RangePicker } from "@/components/dashboard/RangePicker";
import { FunnelChart, NicheChart, OverTimeChart, SourceChart, StateChart } from "@/components/dashboard/Charts";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { TodayFollowups } from "@/components/pipeline/TodayFollowups";

const RANGES = new Set(["7d", "30d", "90d", "all", "custom"]);

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const range = (RANGES.has(sp.range ?? "") ? sp.range : "30d") as DashboardRange;
  const db = await createClient();
  const [statsRes, recentRes, backup] = await Promise.all([
    getDashboardStats(db, range, { from: sp.from, to: sp.to }),
    getRecentActivity(db, 10),
    latestBackup(db),
  ]);

  if (!statsRes.ok) {
    return <p className="card border-red-200 bg-red-50 p-4 text-sm text-red-700">Could not load the dashboard: {statsRes.message}</p>;
  }
  const stats = statsRes.data;
  const backupAgeDays = backup ? (Date.now() - new Date(backup.created_at).getTime()) / 86_400_000 : Infinity;
  const backupStale = backupAgeDays > 2;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Dashboard</h1>
        <Link
          href="/settings/backups"
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ${
            backupStale ? "bg-red-50 text-red-700 ring-red-200" : "bg-slate-50 text-slate-600 ring-slate-200"
          }`}
        >
          {backup ? `Last backup: ${relativeTime(backup.created_at)}` : "No backup yet — tap to create"}
        </Link>
      </div>

      <RangePicker current={range} from={sp.from} to={sp.to} />
      <StatCards stats={stats} />

      <div className="grid gap-3 lg:grid-cols-2">
        <FunnelChart data={stats.funnel} />
        <SourceChart data={stats.by_source} />
        <StateChart data={stats.by_state} />
        <NicheChart data={stats.by_niche} />
        <div className="lg:col-span-2">
          <OverTimeChart data={stats.over_time} bucket={stats.range.bucket} />
        </div>
      </div>

      <Suspense fallback={null}>
        <TodayFollowups />
      </Suspense>

      <section className="card p-4">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-bold">Recent activity</h2>
          <Link href="/leads" className="text-sm font-semibold text-brand-700">All leads →</Link>
        </div>
        <RecentActivity items={recentRes.ok ? recentRes.data : []} />
      </section>
    </div>
  );
}
