import { sniffImage } from "@/lib/images";
import { safeFetch } from "@/lib/net/safeFetch";
import type { LeadUpdate, LogoStatus } from "@/lib/database.types";
import { dbError, type DB, type Lead, type ServiceResult } from "./types";

export const LOGO_BUCKET = "logos";
const MIN_LOGO_PX = 32;
const MAX_LOGO_BYTES = 3_000_000;

export type LogoResult = { status: LogoStatus; logo_url: string | null; source: string | null; tried: string[] };

type Candidate = { url: string; source: "apple_touch_icon" | "og_image" | "favicon" };

/**
 * Finds a logo for a lead and stores a copy in Supabase Storage, so it keeps
 * working if the website changes. Tries, in order:
 *   1. apple-touch-icon / og:image from the lead's website
 *   2. high-resolution favicon (Google favicon service, 128px)
 * Instagram is never scraped. If nothing works the lead keeps its initials
 * avatar (logo_status = not_found), and an existing logo is never removed.
 */
export async function findLogo(db: DB, leadId: string): Promise<ServiceResult<LogoResult>> {
  const { data: lead, error } = await db.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (error) return dbError(error);
  if (!lead) return { ok: false, code: "not_found", message: "Lead not found." };

  const tried: string[] = [];
  const host = lead.website_host;
  if (host) {
    for await (const candidate of candidates(lead.website!, host, tried)) {
      tried.push(candidate.url);
      const image = await downloadImage(candidate.url);
      if (!image) continue;
      const saved = await storeLogo(db, lead, image, candidate.source);
      if (!saved.ok) return saved;
      return { ok: true, data: { status: "found", logo_url: saved.data, source: candidate.source, tried } };
    }
  }

  // Nothing found: keep any logo the lead already has (e.g. a manual upload).
  const status: LogoStatus = lead.logo_url ? "found" : "not_found";
  const upd = await db
    .from("leads")
    .update({ logo_status: status, logo_checked_at: new Date().toISOString() })
    .eq("id", lead.id);
  if (upd.error) return dbError(upd.error);
  return { ok: true, data: { status, logo_url: lead.logo_url, source: lead.logo_source, tried } };
}

/** Runs findLogo for several leads (a few at a time). Errors are logged, never thrown. */
export async function findLogos(db: DB, leadIds: string[], concurrency = 4): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, leadIds.length) }, async () => {
      while (next < leadIds.length) {
        const id = leadIds[next++];
        try {
          const r = await findLogo(db, id);
          if (!r.ok) console.error(`[logos] ${id}: ${r.message}`);
        } catch (e) {
          console.error(`[logos] ${id}:`, e);
        }
      }
    }),
  );
}

/** Manual logo / photo upload from the profile page. */
export async function uploadLeadLogo(
  db: DB,
  leadId: string,
  bytes: Uint8Array,
): Promise<ServiceResult<string>> {
  if (bytes.byteLength > 5_000_000) {
    return { ok: false, code: "validation", message: "Image is too large (max 5 MB).", fieldErrors: {} };
  }
  const info = sniffImage(bytes);
  if (!info) {
    return { ok: false, code: "validation", message: "Use a PNG, JPG, WEBP or GIF image.", fieldErrors: {} };
  }
  const { data: lead, error } = await db.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (error) return dbError(error);
  if (!lead) return { ok: false, code: "not_found", message: "Lead not found." };
  return storeLogo(db, lead, { bytes, mime: info.mime, ext: info.ext }, "upload");
}

async function* candidates(website: string, host: string, tried: string[]): AsyncGenerator<Candidate> {
  // 1. The website's own icons.
  try {
    const page = await safeFetch(website, { maxBytes: 1_500_000, accept: "text/html,*/*;q=0.5" });
    if (page.status < 400 && /html/i.test(page.contentType || "text/html")) {
      const html = new TextDecoder().decode(page.body.subarray(0, 600_000));
      for (const c of parseIconLinks(html, page.url)) yield c;
    }
    const origin = new URL(page.url).origin;
    yield { url: `${origin}/apple-touch-icon.png`, source: "apple_touch_icon" };
  } catch (e) {
    tried.push(`${website} (unreachable: ${e instanceof Error ? e.message : e})`);
  }
  // 2. High-resolution favicon.
  yield { url: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`, source: "favicon" };
}

/** Pulls apple-touch-icon (largest first) and og:image URLs out of a page's <head>. */
export function parseIconLinks(html: string, baseUrl: string): Candidate[] {
  const head = html.split(/<\/head>/i)[0];
  const attrs = (tag: string) => {
    const out: Record<string, string> = {};
    for (const m of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      out[m[1].toLowerCase()] = (m[3] ?? m[4] ?? m[5] ?? "").trim();
    }
    return out;
  };
  const abs = (u: string) => {
    try {
      return new URL(u.replace(/&amp;/g, "&"), baseUrl).toString();
    } catch {
      return null;
    }
  };

  const touch: { url: string; size: number }[] = [];
  const og: string[] = [];
  for (const [tag] of head.matchAll(/<link\b[^>]*>/gi)) {
    const a = attrs(tag);
    if (!/apple-touch-icon/i.test(a.rel ?? "") || !a.href) continue;
    const url = abs(a.href);
    if (url) touch.push({ url, size: Number(a.sizes?.split("x")[0]) || 180 });
  }
  for (const [tag] of head.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(tag);
    const key = (a.property ?? a.name ?? "").toLowerCase();
    if ((key === "og:image" || key === "og:image:secure_url") && a.content) {
      const url = abs(a.content);
      if (url) og.push(url);
    }
  }
  touch.sort((x, y) => y.size - x.size);
  return [
    ...touch.map((t) => ({ url: t.url, source: "apple_touch_icon" as const })),
    ...og.map((url) => ({ url, source: "og_image" as const })),
  ];
}

type Image = { bytes: Uint8Array; mime: string; ext: string };

async function downloadImage(url: string): Promise<Image | null> {
  try {
    const res = await safeFetch(url, { maxBytes: MAX_LOGO_BYTES, accept: "image/*" });
    if (res.status !== 200) return null;
    const info = sniffImage(res.body);
    if (!info) return null;
    if (info.width !== null && info.height !== null && (info.width < MIN_LOGO_PX || info.height < MIN_LOGO_PX)) return null;
    return { bytes: res.body, mime: info.mime, ext: info.ext };
  } catch {
    return null;
  }
}

async function storeLogo(db: DB, lead: Lead, image: Image, source: string): Promise<ServiceResult<string>> {
  const path = `${lead.id}/${source}-${Date.now()}.${image.ext}`;
  const up = await db.storage.from(LOGO_BUCKET).upload(path, image.bytes, {
    contentType: image.mime,
    upsert: true,
    cacheControl: "31536000",
  });
  if (up.error) return { ok: false, code: "db_error", message: `Could not store logo: ${up.error.message}` };
  const url = db.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl;
  const patch: LeadUpdate = {
    logo_url: url,
    logo_status: "found",
    logo_source: source,
    logo_checked_at: new Date().toISOString(),
  };
  const { error } = await db.from("leads").update(patch).eq("id", lead.id);
  if (error) return dbError(error);
  return { ok: true, data: url };
}
