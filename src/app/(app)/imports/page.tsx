import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listImports } from "@/services";
import { PdfUploader } from "@/components/imports/PdfUploader";
import { ImportStatusBadge } from "@/components/imports/ImportStatusBadge";

export const metadata: Metadata = { title: "Import PDF" };
export const maxDuration = 300;

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

export default async function ImportsPage() {
  const db = await createClient();
  const imports = await listImports(db);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">Import leads from PDF</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every business in the PDF becomes a lead with its own tracking ID. Existing leads are merged, not duplicated.
        </p>
      </div>
      <PdfUploader />

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Recent imports</h2>
        {!imports.ok ? (
          <p className="card p-4 text-sm text-red-700">Could not load imports: {imports.message}</p>
        ) : imports.data.length === 0 ? (
          <p className="card p-4 text-sm text-slate-500">No imports yet.</p>
        ) : (
          <ul className="space-y-2">
            {imports.data.map((imp) => (
              <li key={imp.id}>
                <Link href={`/imports/${imp.id}`} className="card flex items-center gap-3 p-3 hover:border-brand-200">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-xs font-bold text-red-600">PDF</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold">{imp.file_name}</p>
                      <ImportStatusBadge status={imp.status} />
                    </div>
                    <p className="text-xs text-slate-500">
                      {dateFmt.format(new Date(imp.uploaded_at))}
                      {imp.status === "done" && ` · ${imp.added} added · ${imp.merged} merged · ${imp.skipped} skipped`}
                      {imp.status === "review" && ` · ${imp.total_found} found`}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
