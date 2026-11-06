"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { recalculateAllScoresAction } from "@/app/(app)/settings/actions";
import { Spinner } from "@/components/Spinner";

export function RecalculateScores() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string>();
  return (
    <section className="card space-y-3 p-4">
      <div>
        <h2 className="font-semibold">Lead scores</h2>
        <p className="mt-1 text-sm text-slate-500">
          Scores update automatically. Run this after you change the rules in <code className="text-xs">src/config/scoring.ts</code>.
        </p>
      </div>
      <button
        onClick={() => start(async () => {
          const r = await recalculateAllScoresAction();
          setMessage(r.error ? r.error : `Checked ${r.checked}, updated ${r.changed}.`);
          router.refresh();
        })}
        disabled={pending}
        className="btn-secondary"
      >
        {pending && <Spinner />} Recalculate all scores
      </button>
      {message && <p className="text-sm text-slate-600">{message}</p>}
    </section>
  );
}
