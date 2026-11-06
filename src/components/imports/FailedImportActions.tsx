"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteImportAction, retryImportAction } from "@/app/(app)/imports/actions";
import { Spinner } from "@/components/Spinner";

export function FailedImportActions({ id, canRetry }: { id: string; canRetry: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {canRetry && (
          <button
            className="btn-primary flex-1"
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
        )}
        <button
          className="btn-secondary flex-1"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await deleteImportAction(id);
              if (r.error) return setError(r.error);
              router.push("/imports");
            })
          }
        >
          Delete import
        </button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
