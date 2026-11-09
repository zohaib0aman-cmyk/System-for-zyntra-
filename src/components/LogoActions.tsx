"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { findLogoAction, uploadLogoAction } from "@/app/(app)/leads/actions";
import type { LogoStatus } from "@/lib/database.types";
import { Spinner } from "./Spinner";

export function LogoActions({ leadId, status, hasWebsite }: { leadId: string; status: LogoStatus; hasWebsite: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"find" | "upload" | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  const [, start] = useTransition();
  const autoTried = useRef(false);

  // Leads that were never checked (e.g. added before Phase 2) are looked up once when opened.
  useEffect(() => {
    if (status !== "pending" || !hasWebsite || autoTried.current) return;
    autoTried.current = true;
    start(async () => {
      await findLogoAction(leadId);
      router.refresh();
    });
  }, [status, hasWebsite, leadId, router]);

  function find() {
    setBusy("find");
    setMessage(undefined);
    start(async () => {
      const r = await findLogoAction(leadId);
      setBusy(null);
      if (r.error) setMessage({ text: r.error, error: true });
      else setMessage({ text: r.status === "found" ? "Logo found." : "No logo found on the website. You can upload one." });
      router.refresh();
    });
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setMessage({ text: "Choose an image file.", error: true });
    setBusy("upload");
    setMessage(undefined);
    try {
      const blob = await resizeImage(file, 512);
      const fd = new FormData();
      fd.append("file", blob, "logo");
      const r = await uploadLogoAction(leadId, fd);
      if (r.error) setMessage({ text: r.error, error: true });
      else setMessage({ text: "Logo updated." });
      router.refresh();
    } catch {
      setMessage({ text: "Could not read this image. Try a JPG or PNG.", error: true });
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Logo</h2>
        <span className="text-xs text-slate-500">
          {status === "pending" && hasWebsite ? "Looking for logo…" : status === "found" ? "Saved" : "Not found — using initials"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={find} disabled={!!busy || !hasWebsite} className="btn-secondary py-2.5"
          title={hasWebsite ? undefined : "Add a website first"}>
          {busy === "find" && <Spinner />} Find logo again
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy} className="btn-secondary py-2.5">
          {busy === "upload" && <Spinner />} Upload logo / photo
        </button>
      </div>
      {!hasWebsite && <p className="text-xs text-slate-500">Automatic search needs a website. Instagram photos can be uploaded manually.</p>}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
      {message && <p role="status" className={`text-sm ${message.error ? "text-red-700" : "text-emerald-700"}`}>{message.text}</p>}
    </div>
  );
}

/** Shrinks big phone photos before upload (max side `max` px). */
async function resizeImage(file: File, max: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const toBlob = (type: string, q?: number) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, q));
  const webp = await toBlob("image/webp", 0.9);
  if (webp && webp.type === "image/webp") return webp;
  const png = await toBlob("image/png");
  if (!png) throw new Error("encode failed");
  return png;
}
