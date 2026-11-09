import { NextResponse } from "next/server";
import { withApi, fromService, apiError, MAX_BODY_BYTES } from "@/lib/api/handler";
import { opImportPdf } from "@/lib/api/operations";
import { safeFetch } from "@/lib/net/safeFetch";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Import a PDF of leads (Phase 2 pipeline). Accepts:
 *  - multipart/form-data with a "file" field (+ optional "review")
 *  - JSON { file_base64 | url, file_name?, review? }
 * review=false (default) adds the leads directly; review=true leaves them for
 * the owner to review in the app.
 */
export const POST = withApi("write", async ({ db, actor, req }) => {
  const ct = req.headers.get("content-type") ?? "";
  let bytes: Uint8Array | null = null;
  let fileName = "import.pdf";
  let review = false;

  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return apiError(400, "validation_error", "Attach a PDF in the 'file' field.");
    if (file.size > MAX_BODY_BYTES) return apiError(413, "too_large", "PDF is larger than the 25 MB limit.");
    bytes = new Uint8Array(await file.arrayBuffer());
    fileName = file.name || fileName;
    review = form.get("review") === "true";
  } else {
    const body = (await req.json().catch(() => ({}))) as { file_base64?: string; url?: string; file_name?: string; review?: boolean };
    review = body.review === true;
    fileName = body.file_name?.slice(0, 200) || fileName;
    if (body.file_base64) {
      bytes = new Uint8Array(Buffer.from(body.file_base64.replace(/^data:[^,]*,/, ""), "base64"));
    } else if (body.url) {
      const r = await safeFetch(body.url, { maxBytes: MAX_BODY_BYTES, accept: "application/pdf" });
      if (r.status >= 400) return apiError(400, "fetch_failed", `Could not download the PDF (HTTP ${r.status}).`);
      bytes = r.body;
    } else {
      return apiError(400, "validation_error", "Provide a file (multipart), file_base64 or url.");
    }
  }

  if (!bytes || bytes.byteLength === 0) return apiError(400, "validation_error", "The PDF is empty.");
  if (bytes.byteLength > MAX_BODY_BYTES) return apiError(413, "too_large", "PDF is larger than the 25 MB limit.");

  const res = await opImportPdf(db, actor, bytes, fileName, review);
  return fromService(res, res.ok ? 201 : 200);
});

export function GET() {
  return NextResponse.json({ error: { code: "method_not_allowed", message: "POST a PDF to this endpoint." } }, { status: 405 });
}
