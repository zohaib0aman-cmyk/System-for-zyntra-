/**
 * LEAD SCORE RULES — tune the numbers here.
 *
 * Score = completeness + status + recent activity + priority boost, capped at 100.
 * A Rejected lead always scores 0.
 * After changing these numbers, open Settings → "Recalculate all scores".
 */
import type { LeadStatus, ScoreLabel } from "@/lib/database.types";

export const SCORING = {
  /** Points for each piece of contact info / branding the lead has (max 30). */
  completeness: {
    phone: 8,
    whatsapp: 7,
    instagram: 5,
    website: 5,
    logo: 3,
    email: 2,
  },
  /** Points for the pipeline stage. */
  status: {
    New: 5,
    Contacted: 15,
    Interested: 35,
    "Deal Closed": 40,
    Rejected: 0,
  } satisfies Record<LeadStatus, number>,
  /** Rejected leads are not worth chasing: score is forced to 0. */
  rejectedScoresZero: true,
  /** Contacted (status moved forward or follow-up done) within this many days. */
  recentActivity: { withinDays: 7, points: 15 },
  /** Extra points when you mark a lead as priority (★). */
  priorityBoost: 20,
  /** Label thresholds: Hot ≥ hot, Warm ≥ warm, otherwise Cold. */
  labels: { hot: 70, warm: 40 },
} as const;

export const SCORE_LABEL_TEXT: Record<ScoreLabel, string> = { hot: "Hot", warm: "Warm", cold: "Cold" };

export type ScoreInput = {
  phone: string | null;
  whatsapp: string | null;
  instagram: string | null;
  website: string | null;
  logo_url: string | null;
  email: string | null;
  status: LeadStatus;
  priority: boolean;
  last_contacted_at: string | null;
};

export type ScoreLine = { label: string; points: number; max: number };
export type ScoreResult = { score: number; label: ScoreLabel; breakdown: ScoreLine[]; note?: string };

const FIELD_NAMES: Record<keyof typeof SCORING.completeness, string> = {
  phone: "Phone",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  website: "Website",
  logo: "Logo",
  email: "Email",
};

export function labelFor(score: number): ScoreLabel {
  if (score >= SCORING.labels.hot) return "hot";
  if (score >= SCORING.labels.warm) return "warm";
  return "cold";
}

/** Pure function: same input → same score. Used by the server and to show the breakdown. */
export function computeScore(lead: ScoreInput, now: Date = new Date()): ScoreResult {
  const c = SCORING.completeness;
  const present: Record<keyof typeof c, boolean> = {
    phone: !!lead.phone,
    whatsapp: !!lead.whatsapp,
    instagram: !!lead.instagram,
    website: !!lead.website,
    logo: !!lead.logo_url,
    email: !!lead.email,
  };
  const completenessMax = Object.values(c).reduce((a, b) => a + b, 0);
  const completeness = (Object.keys(c) as (keyof typeof c)[]).reduce((sum, k) => sum + (present[k] ? c[k] : 0), 0);
  const missing = (Object.keys(c) as (keyof typeof c)[]).filter((k) => !present[k]).map((k) => FIELD_NAMES[k]);

  const statusMax = Math.max(...Object.values(SCORING.status));
  const statusPts = SCORING.status[lead.status] ?? 0;

  const days = lead.last_contacted_at ? (now.getTime() - new Date(lead.last_contacted_at).getTime()) / 86_400_000 : Infinity;
  const recent = days <= SCORING.recentActivity.withinDays ? SCORING.recentActivity.points : 0;
  const boost = lead.priority ? SCORING.priorityBoost : 0;

  const breakdown: ScoreLine[] = [
    {
      label: missing.length ? `Profile details (missing: ${missing.join(", ")})` : "Profile details (complete)",
      points: completeness,
      max: completenessMax,
    },
    { label: `Status: ${lead.status}`, points: statusPts, max: statusMax },
    {
      label: recent
        ? `Contacted in the last ${SCORING.recentActivity.withinDays} days`
        : `No contact in the last ${SCORING.recentActivity.withinDays} days`,
      points: recent,
      max: SCORING.recentActivity.points,
    },
    { label: lead.priority ? "Marked as priority ★" : "Not marked as priority", points: boost, max: SCORING.priorityBoost },
  ];

  if (lead.status === "Rejected" && SCORING.rejectedScoresZero) {
    return { score: 0, label: "cold", breakdown, note: "Rejected leads always score 0." };
  }
  const score = Math.max(0, Math.min(100, completeness + statusPts + recent + boost));
  return { score, label: labelFor(score), breakdown };
}
