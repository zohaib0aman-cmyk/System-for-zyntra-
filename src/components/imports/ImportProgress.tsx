"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { retryImportAction } from "@/app/(app)/imports/actions";
import { Spinner } from "@/components/Spinner";

/** Shown while an import is processing; refreshes the page every 2 s until it finishes. */
export function ImportProgress({ id, progress, updatedAt }: { id: string; progress: string | null; updatedAt: string }) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      router.refresh();
    }, 2000);
    return () => clearInterval(t);
  }, [router]);

  const stuck = now - new Date(updatedAt).getTime() > 6 * 60 * 1000;

  return (
    <div className="card p-6 text-center" aria-live="polite">
      <Spinner className="mx-auto h-8 w-8 text-brand-600" />
      <p className="mt-4 font-semibold">{progress ?? "Working…"}</p>
      <p className="mt-1 text-sm text-slate-500">
        Large PDFs can take a minute or two. You can leave this page — the import keeps running.
      </p>
      {stuck && (
        <div className="mt-5 space-y-2">
          <p className="text-sm text-amber-700">This seems stuck.</p>
          <button
            className="btn-secondary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await retryImportAction(id);
                if (r.error) setError(r.error);
                router.refresh();
              })
            }
          >
            {pending && <Spinner />} Try again
          </button>
          {error && <p className="text-sm text-red-700">{error}</p>}
        </div>
      )}
    </div>
  );
}
