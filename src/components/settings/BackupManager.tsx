"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  backupNowAction,
  backupUrlAction,
  previewRestoreAction,
  restoreBackupAction,
} from "@/app/(app)/settings/backup-actions";
import type { BackupRow } from "@/lib/database.types";
import type { RestoreMode, RestorePreview } from "@/services/backup";
import { formatDateTime } from "@/lib/time";
import { Spinner } from "@/components/Spinner";
import { BottomSheet } from "@/components/pipeline/BottomSheet";

function sizeKB(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function BackupManager({ backups }: { backups: BackupRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();

  function backupNow() {
    setMessage(undefined);
    start(async () => {
      const r = await backupNowAction();
      setMessage(r.error ? { text: r.error, error: true } : { text: `Backup created (${r.leadCount} leads).` });
      router.refresh();
    });
  }

  async function download(id: string, which: "json" | "xlsx") {
    const r = await backupUrlAction(id, which);
    if (r.error || !r.url) return setMessage({ text: r.error ?? "Could not create link.", error: true });
    window.open(r.url, "_blank", "noopener");
  }

  return (
    <section className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Backups</h2>
          <p className="mt-1 text-sm text-slate-500">
            A full copy of your data (JSON + Excel) saved privately. The last 30 are kept. A daily backup runs automatically.
          </p>
        </div>
        <button onClick={backupNow} disabled={pending} className="btn-primary py-2 shrink-0">
          {pending && <Spinner />} Backup now
        </button>
      </div>

      <RestoreBox onDone={() => router.refresh()} onMessage={setMessage} />

      {message && <p className={`text-sm ${message.error ? "text-red-700" : "text-emerald-700"}`}>{message.text}</p>}

      <ul className="divide-y divide-slate-100">
        {backups.map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-2 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {formatDateTime(b.created_at)}
                {b.kind === "auto" && <span className="ml-2 rounded bg-slate-100 px-1.5 text-xs text-slate-500">auto</span>}
              </p>
              <p className="text-xs text-slate-500">{b.lead_count} leads · {sizeKB(b.size_bytes)}</p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button onClick={() => download(b.id, "json")} className="rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-slate-100">JSON</button>
              {b.xlsx_path && (
                <button onClick={() => download(b.id, "xlsx")} className="rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-slate-100">Excel</button>
              )}
            </div>
          </li>
        ))}
        {backups.length === 0 && <li className="py-6 text-center text-sm text-slate-400">No backups yet. Tap “Backup now”.</li>}
      </ul>
    </section>
  );
}

function RestoreBox({ onDone, onMessage }: { onDone: () => void; onMessage: (m: { text: string; error?: boolean }) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [mode, setMode] = useState<RestoreMode>("merge");
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  async function pick(file: File | undefined) {
    if (!file) return;
    if (file.size > 200 * 1024 * 1024) return onMessage({ text: "That file is too large.", error: true });
    const content = await file.text();
    setText(content);
    setFileName(file.name);
    const r = await previewRestoreAction(content);
    if (r.error || !r.preview) return onMessage({ text: r.error ?? "Could not read file.", error: true });
    setPreview(r.preview);
    setMode("merge");
    setConfirmReplace(false);
    setOpen(true);
  }

  function doRestore() {
    if (!text) return;
    if (mode === "replace" && !confirmReplace) return;
    start(async () => {
      const r = await restoreBackupAction(text, mode);
      if (r.error) return onMessage({ text: r.error, error: true });
      const total = r.restored ? Object.values(r.restored).reduce((a, b) => a + b, 0) : 0;
      onMessage({ text: `Restore complete (${mode}). ${total} rows written.` });
      setOpen(false);
      setText(null);
      setPreview(null);
      onDone();
    });
  }

  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-3">
      <p className="text-sm font-medium">Restore from a backup</p>
      <p className="mt-0.5 text-xs text-slate-500">Upload a Zyntra backup .json file. Default mode merges (nothing is deleted).</p>
      <button onClick={() => fileRef.current?.click()} className="btn-secondary mt-2 py-2">Choose backup file</button>
      <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Restore backup">
        {preview && (
          <div className="space-y-4">
            {!preview.valid ? (
              <p className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">{preview.error}</p>
            ) : (
              <>
                <div className="rounded-xl bg-slate-50 p-3 text-sm">
                  <p className="font-medium">{fileName}</p>
                  {preview.created_at && <p className="text-xs text-slate-500">Backup from {formatDateTime(preview.created_at)}</p>}
                  <p className="mt-2">
                    <b>{preview.counts.leads ?? 0}</b> leads in this file:
                    <span className="text-emerald-700"> {preview.leadsNew} new</span>,
                    <span className="text-slate-600"> {preview.leadsExisting} already here</span>.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className={`flex items-start gap-3 rounded-xl border p-3 ${mode === "merge" ? "border-brand-500 bg-brand-50" : "border-slate-200"}`}>
                    <input type="radio" name="mode" checked={mode === "merge"} onChange={() => setMode("merge")} className="mt-0.5 accent-brand-600" />
                    <span>
                      <span className="font-semibold">Merge (safe)</span>
                      <span className="block text-xs text-slate-500">Adds new leads and updates existing ones. Nothing is deleted.</span>
                    </span>
                  </label>
                  <label className={`flex items-start gap-3 rounded-xl border p-3 ${mode === "replace" ? "border-red-400 bg-red-50" : "border-slate-200"}`}>
                    <input type="radio" name="mode" checked={mode === "replace"} onChange={() => setMode("replace")} className="mt-0.5 accent-red-600" />
                    <span>
                      <span className="font-semibold text-red-700">Replace everything</span>
                      <span className="block text-xs text-red-600">⚠️ Deletes ALL current leads, tags, follow-ups and activity first, then restores this backup. This cannot be undone.</span>
                    </span>
                  </label>
                </div>

                {mode === "replace" && (
                  <label className="flex items-center gap-2 text-sm text-red-700">
                    <input type="checkbox" checked={confirmReplace} onChange={(e) => setConfirmReplace(e.target.checked)} className="h-4 w-4 accent-red-600" />
                    I understand this deletes my current data.
                  </label>
                )}

                <button
                  onClick={doRestore}
                  disabled={pending || (mode === "replace" && !confirmReplace)}
                  className={`btn w-full text-white ${mode === "replace" ? "bg-red-600 hover:bg-red-700" : "bg-brand-600 hover:bg-brand-700"}`}
                >
                  {pending && <Spinner />} {mode === "replace" ? "Delete all and restore" : "Merge this backup"}
                </button>
              </>
            )}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
