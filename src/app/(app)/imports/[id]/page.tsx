import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getImport, importItems, importResults, listNiches } from "@/services";
import { ImportStatusBadge } from "@/components/imports/ImportStatusBadge";
import { ImportProgress } from "@/components/imports/ImportProgress";
import { ImportReview } from "@/components/imports/ImportReview";
import { ImportSummaryView } from "@/components/imports/ImportSummaryView";
import { FailedImportActions } from "@/components/imports/FailedImportActions";

export const metadata: Metadata = { title: "Import" };
export const maxDuration = 300;

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await createClient();
  const res = await getImport(db, id);
  if (!res.ok) {
    if (res.code === "not_found") notFound();
    throw new Error(res.message);
  }
  const imp = res.data;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-start gap-2">
        <Link href="/imports" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Back">←</Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-lg font-bold">{imp.file_name}</h1>
            <ImportStatusBadge status={imp.status} />
          </div>
          <p className="text-xs text-slate-500">
            {imp.page_count ? `${imp.page_count} page${imp.page_count === 1 ? "" : "s"} · ` : ""}
            {imp.total_found ? `${imp.total_found} leads found` : ""}
          </p>
        </div>
      </div>

      {imp.status === "processing" && <ImportProgress id={imp.id} progress={imp.progress} updatedAt={imp.updated_at} />}

      {imp.status === "review" && (
        <>
          <p className="text-sm text-slate-600">
            Check the leads below. Edit or remove anything, then tap <b>Add all</b>.
          </p>
          <ReviewLoader id={imp.id} items={importItems(imp)} failures={importResults(imp)} />
        </>
      )}

      {imp.status === "done" && (
        <ImportSummaryView added={imp.added} merged={imp.merged} skipped={imp.skipped} results={importResults(imp)} />
      )}

      {imp.status === "failed" && (
        <div className="card space-y-4 border-red-200 p-4">
          <div>
            <p className="font-semibold text-red-800">This import did not work</p>
            <p className="mt-1 text-sm text-red-700">{imp.error ?? "Unknown error."}</p>
          </div>
          <FailedImportActions
            id={imp.id}
            canRetry={imp.added + imp.merged === 0 && !/^(No text was found|This file could not be read|This PDF is password)/.test(imp.error ?? "")}
          />
        </div>
      )}
    </div>
  );
}

async function ReviewLoader({
  id,
  items,
  failures,
}: {
  id: string;
  items: ReturnType<typeof importItems>;
  failures: ReturnType<typeof importResults>;
}) {
  const db = await createClient();
  const niches = await listNiches(db);
  return (
    <ImportReview
      importId={id}
      initialItems={items}
      niches={niches.ok ? niches.data.map((n) => n.name) : []}
      failures={failures.filter((f) => f.outcome === "failed")}
    />
  );
}
