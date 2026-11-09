import { SCORE_LABEL_TEXT } from "@/config/scoring";
import { TAG_COLORS } from "@/lib/constants";
import type { ScoreLabel } from "@/lib/database.types";

const SCORE_STYLES: Record<ScoreLabel, string> = {
  hot: "bg-rose-50 text-rose-700 ring-rose-200",
  warm: "bg-amber-50 text-amber-800 ring-amber-200",
  cold: "bg-slate-100 text-slate-600 ring-slate-200",
};
const SCORE_ICON: Record<ScoreLabel, string> = { hot: "🔥", warm: "☀️", cold: "❄️" };

export function ScoreChip({ score, label, compact }: { score: number; label: ScoreLabel; compact?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${SCORE_STYLES[label]}`}
      title={`Score ${score}/100`}
    >
      <span aria-hidden="true">{SCORE_ICON[label]}</span>
      {compact ? score : `${SCORE_LABEL_TEXT[label]} · ${score}`}
    </span>
  );
}

export function TagChip({ name, color, children }: { name: string; color: string; children?: React.ReactNode }) {
  return (
    <span className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TAG_COLORS[color] ?? TAG_COLORS.slate}`}>
      <span className="truncate">#{name}</span>
      {children}
    </span>
  );
}
