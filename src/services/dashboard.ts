import type { ActivityRow, LeadSource, LeadStatus } from "@/lib/database.types";
import { dbError, type DB, type ServiceResult } from "./types";

export type DashboardRange = "7d" | "30d" | "90d" | "all" | "custom";

export type DashboardCards = {
  total: number;
  new_this_week: number;
  new_this_month: number;
  hot: number;
  due_today: number;
  deals_closed: number;
  contacted_plus: number;
  new_in_range: number;
};

export type Bar = { key: string; count: number };
export type FunnelStage = { status: LeadStatus; count: number };
export type TimePoint = { date: string; count: number };

export type DashboardStats = {
  cards: DashboardCards;
  funnel: FunnelStage[];
  by_state: Bar[];
  by_niche: Bar[];
  by_source: { key: LeadSource; count: number }[];
  over_time: TimePoint[];
  range: { from: string | null; to: string | null; bucket: "day" | "week" };
  conversionRate: number; // Deal Closed ÷ (Contacted+Interested+Deal Closed+Rejected)
};

export type RecentActivity = ActivityRow & { tracking_id: string; brand_name: string; logo_url: string | null };

/** Resolve a named range to from/to instants and a sensible chart bucket. */
export function resolveRange(range: DashboardRange, from?: string, to?: string): { from: string | null; to: string | null; bucket: "day" | "week" } {
  const now = Date.now();
  const days = (n: number) => new Date(now - n * 86_400_000).toISOString();
  switch (range) {
    case "7d":
      return { from: days(7), to: new Date(now).toISOString(), bucket: "day" };
    case "30d":
      return { from: days(30), to: new Date(now).toISOString(), bucket: "day" };
    case "90d":
      return { from: days(90), to: new Date(now).toISOString(), bucket: "week" };
    case "custom": {
      const f = from ? new Date(from) : null;
      const t = to ? new Date(to) : null;
      const span = f && t ? (t.getTime() - f.getTime()) / 86_400_000 : 30;
      return {
        from: f && !Number.isNaN(f.getTime()) ? f.toISOString() : days(30),
        to: t && !Number.isNaN(t.getTime()) ? new Date(t.getTime() + 86_400_000).toISOString() : new Date(now).toISOString(),
        bucket: span > 70 ? "week" : "day",
      };
    }
    default:
      return { from: null, to: null, bucket: "week" };
  }
}

/** All dashboard numbers in one DB round-trip (fast even with 50,000+ leads). */
export async function getDashboardStats(
  db: DB,
  range: DashboardRange = "30d",
  opts: { from?: string; to?: string } = {},
): Promise<ServiceResult<DashboardStats>> {
  const r = resolveRange(range, opts.from, opts.to);
  const { data, error } = await db.rpc("dashboard_stats", { p_from: r.from, p_to: r.to, p_bucket: r.bucket });
  if (error) return dbError(error);
  const d = data as unknown as Omit<DashboardStats, "range" | "conversionRate">;
  const deals = d.cards.deals_closed;
  const contacted = d.cards.contacted_plus;
  return {
    ok: true,
    data: { ...d, range: r, conversionRate: contacted > 0 ? Math.round((deals / contacted) * 1000) / 10 : 0 },
  };
}

export async function getRecentActivity(db: DB, limit = 10): Promise<ServiceResult<RecentActivity[]>> {
  const { data, error } = await db.rpc("recent_activity", { p_limit: limit });
  if (error) return dbError(error);
  return { ok: true, data: (data as unknown as RecentActivity[]) ?? [] };
}
