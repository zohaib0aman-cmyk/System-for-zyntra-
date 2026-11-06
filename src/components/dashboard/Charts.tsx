"use client";

import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { STATUS_STYLES, stateName } from "@/lib/constants";
import type { Bar as BarData, FunnelStage, TimePoint } from "@/services/dashboard";
import type { LeadSource } from "@/lib/database.types";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Reads the datum from a Recharts bar click (v3 puts it on .payload). */
function barPayload<T>(e: unknown): T | undefined {
  return (e as { payload?: T } | undefined)?.payload;
}

const BRAND = "#4f46e5";
const STATUS_HEX: Record<string, string> = {
  New: "#0ea5e9",
  Contacted: "#f59e0b",
  Interested: "#8b5cf6",
  "Deal Closed": "#10b981",
  Rejected: "#94a3b8",
};
const SOURCE_HEX: Record<string, string> = { pdf: "#ef4444", claude: "#8b5cf6", gpt: "#10b981", manual: "#4f46e5" };

function ChartCard({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="card p-4">
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      {hint && <p className="mb-2 text-xs text-slate-400">{hint}</p>}
      {children}
    </div>
  );
}

const tooltipStyle = { fontSize: 12, borderRadius: 12, border: "1px solid #e2e8f0" };

/** Pipeline funnel as a horizontal bar chart (tap a bar → that status). */
export function FunnelChart({ data }: { data: FunnelStage[] }) {
  const router = useRouter();
  return (
    <ChartCard title="Pipeline" hint="Tap a stage to see those leads">
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="status" width={78} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f1f5f9" }} />
          <Bar dataKey="count" radius={[0, 6, 6, 0]} onClick={((e: any) => { const d = barPayload<{ status?: string }>(e); if (d?.status) router.push(`/leads?status=${encodeURIComponent(d.status)}`); }) as any} cursor="pointer">
            {data.map((d) => (
              <Cell key={d.status} fill={STATUS_HEX[d.status] ?? BRAND} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** Generic "by X" bar chart; clicking a bar filters the list by `param`. */
export function CategoryBarChart({
  title,
  data,
  param,
  labelFor,
}: {
  title: string;
  data: BarData[];
  param: "state" | "niche";
  labelFor?: (key: string) => string;
}) {
  const router = useRouter();
  if (data.length === 0) return <ChartCard title={title}><p className="py-8 text-center text-sm text-slate-400">No data in this range.</p></ChartCard>;
  const height = Math.max(160, data.length * 26 + 20);
  return (
    <ChartCard title={title} hint="Tap a bar to filter the leads">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="key"
            width={92}
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(k: string) => (labelFor ? labelFor(k) : k)}
          />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f1f5f9" }} formatter={(v) => [v as number, "Leads"]} labelFormatter={(k) => (labelFor ? labelFor(k as string) : (k as string))} />
          <Bar dataKey="count" fill={BRAND} radius={[0, 6, 6, 0]} cursor="pointer"
            onClick={((e: any) => { const d = barPayload<{ key?: string }>(e); if (d?.key) router.push(`/leads?${param}=${encodeURIComponent(d.key)}`); }) as any} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function StateChart({ data }: { data: BarData[] }) {
  return <CategoryBarChart title="Leads by state" data={data} param="state" labelFor={(k) => stateName(k)} />;
}
export function NicheChart({ data }: { data: BarData[] }) {
  return <CategoryBarChart title="Leads by niche" data={data} param="niche" />;
}

/** Leads added over time (line). */
export function OverTimeChart({ data, bucket }: { data: TimePoint[]; bucket: "day" | "week" }) {
  if (data.length === 0) return <ChartCard title="Leads added"><p className="py-8 text-center text-sm text-slate-400">No leads in this range.</p></ChartCard>;
  return (
    <ChartCard title={`Leads added (${bucket === "week" ? "weekly" : "daily"})`}>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ left: -16, right: 12, top: 6 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false}
            tickFormatter={(d: string) => d.slice(5)} minTickGap={24} />
          <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v as number, "Leads"]} />
          <Line type="monotone" dataKey="count" stroke={BRAND} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** Leads by source (bar; tap filters). */
export function SourceChart({ data }: { data: { key: LeadSource; count: number }[] }) {
  const router = useRouter();
  if (data.length === 0) return <ChartCard title="Leads by source"><p className="py-8 text-center text-sm text-slate-400">No data.</p></ChartCard>;
  const LABEL: Record<string, string> = { pdf: "PDF", claude: "Claude", gpt: "GPT", manual: "Manual" };
  return (
    <ChartCard title="Leads by source" hint="Tap a bar to filter">
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
          <XAxis dataKey="key" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(k: string) => LABEL[k] ?? k} />
          <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f1f5f9" }} formatter={(v) => [v as number, "Leads"]} labelFormatter={(k) => LABEL[k as string] ?? (k as string)} />
          <Bar dataKey="count" radius={[6, 6, 0, 0]} cursor="pointer"
            onClick={((e: any) => { const d = barPayload<{ key?: string }>(e); if (d?.key) router.push(`/leads?source=${encodeURIComponent(d.key)}`); }) as any}>
            {data.map((d) => (
              <Cell key={d.key} fill={SOURCE_HEX[d.key] ?? BRAND} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

void STATUS_STYLES;
