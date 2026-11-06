"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { createImportAction, startImportAction, uploadFailedAction } from "@/app/(app)/imports/actions";
import { getBrowserClient } from "@/lib/supabase/browser";
import { Spinner } from "@/components/Spinner";

const MAX_BYTES = 20 * 1024 * 1024;

type Phase = { step: "idle" } | { step: "uploading"; pct: number } | { step: "starting" };

export function PdfUploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [autoSave, setAutoSave] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string>();
  const [phase, setPhase] = useState<Phase>({ step: "idle" });
  const busy = phase.step !== "idle";

  function pick(f: File | undefined | null) {
    setError(undefined);
    if (!f) return;
    if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) return setError("Please choose a PDF file.");
    if (f.size > MAX_BYTES) return setError(`This PDF is ${(f.size / 1048576).toFixed(1)} MB. The limit is 20 MB.`);
    if (f.size === 0) return setError("This file is empty.");
    setFile(f);
  }

  async function start() {
    if (!file) return;
    setError(undefined);
    setPhase({ step: "uploading", pct: 0 });
    const created = await createImportAction({ fileName: file.name, fileSize: file.size, autoSave });
    if (created.error || !created.id || !created.path) {
      setPhase({ step: "idle" });
      return setError(created.error ?? "Could not start the import.");
    }
    try {
      await uploadWithProgress(file, created.path, (pct) => setPhase({ step: "uploading", pct }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await uploadFailedAction(created.id, msg);
      setPhase({ step: "idle" });
      return setError(`Upload failed: ${msg}. Check your connection and try again.`);
    }
    setPhase({ step: "starting" });
    const started = await startImportAction(created.id);
    if (started.error) {
      setPhase({ step: "idle" });
      return setError(started.error);
    }
    router.push(`/imports/${created.id}`);
  }

  return (
    <div className="card space-y-4 p-4">
      <div
        role="button"
        tabIndex={0}
        aria-label="Choose a PDF to import"
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !busy && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!busy) pick(e.dataTransfer.files?.[0]);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 text-center transition ${
          dragging ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-slate-50 hover:border-brand-300"
        }`}
      >
        <svg className="mb-2 h-10 w-10 text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5M12 18v-6m-3 3 3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {file ? (
          <>
            <p className="max-w-full truncate font-semibold">{file.name}</p>
            <p className="text-xs text-slate-500">{formatSize(file.size)} · tap to change</p>
          </>
        ) : (
          <>
            <p className="font-semibold">Tap to choose a PDF</p>
            <p className="text-xs text-slate-500">or drag and drop it here · max 20 MB</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={autoSave}
          onChange={(e) => setAutoSave(e.target.checked)}
          disabled={busy}
          className="mt-0.5 h-4 w-4 accent-brand-600"
        />
        <span>
          <span className="font-medium">Add everything directly</span>
          <span className="block text-xs text-slate-500">
            Skip the review step. Duplicates are still merged, and rows with problems are listed in the summary.
          </span>
        </span>
      </label>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}

      {phase.step === "uploading" && (
        <div aria-live="polite">
          <div className="mb-1 flex justify-between text-xs font-medium text-slate-600">
            <span>Uploading…</span>
            <span>{phase.pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${phase.pct}%` }} />
          </div>
        </div>
      )}

      <button type="button" onClick={start} disabled={!file || busy} className="btn-primary w-full">
        {busy && <Spinner />}
        {phase.step === "uploading" ? "Uploading…" : phase.step === "starting" ? "Starting…" : "Import leads"}
      </button>
    </div>
  );
}

/** Uploads straight to Supabase Storage (bypasses the 4.5 MB server request limit) with a progress bar. */
async function uploadWithProgress(file: File, path: string, onProgress: (pct: number) => void) {
  const supabase = getBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session has expired — please log in again");
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/imports/${encodeURIComponent(path)}`;
  const apiKey = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", apiKey);
    xhr.setRequestHeader("x-upsert", "true");
    xhr.setRequestHeader("content-type", "application/pdf");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let msg = `HTTP ${xhr.status}`;
      try {
        msg = JSON.parse(xhr.responseText).message ?? msg;
      } catch {}
      reject(new Error(msg));
    };
    xhr.onerror = () => reject(new Error("network error"));
    xhr.send(file);
  });
  onProgress(100);
}

function formatSize(bytes: number) {
  return bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}
