import Link from "next/link";
import type { DashboardStats } from "@/services/dashboard";

type Card = { label: string; value: string | number; href?: string; accent?: string; sub?: string };

export function StatCards({ stats }: { stats: DashboardStats }) {
  const c = stats.cards;
  const cards: Card[] = [
    { label: "Total leads", value: c.total.toLocaleString("en-IN"), href: "/leads" },
    { label: "New this week", value: c.new_this_week, href: "/leads?sort=newest" },
    { label: "New this month", value: c.new_this_month },
    { label: "Hot leads", value: c.hot, href: "/leads?score=hot", accent: "text-rose-600" },
    { label: "Due today", value: c.due_today, href: "/followups", accent: c.due_today > 0 ? "text-red-600" : "text-slate-400" },
    { label: "Deals closed", value: c.deals_closed, href: "/leads?status=Deal+Closed", accent: "text-emerald-600" },
    { label: "Conversion", value: `${stats.conversionRate}%`, sub: "closed ÷ contacted", accent: "text-brand-700" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-7">
      {cards.map((card) => {
        const inner = (
          <>
            <p className={`text-2xl font-bold ${card.accent ?? "text-slate-900"}`}>{card.value}</p>
            <p className="mt-0.5 text-xs font-medium text-slate-500">{card.label}</p>
            {card.sub && <p className="text-[10px] text-slate-400">{card.sub}</p>}
          </>
        );
        return card.href ? (
          <Link key={card.label} href={card.href} className="card p-3 transition hover:border-brand-200 hover:shadow-md active:scale-[0.98]">
            {inner}
          </Link>
        ) : (
          <div key={card.label} className="card p-3">{inner}</div>
        );
      })}
    </div>
  );
}
