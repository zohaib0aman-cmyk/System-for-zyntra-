// Pure normalisation helpers. Shared by the UI, the service layer and
// (later) the API / MCP server, so every entry point stores data the same way.

const DIAL_CODES: Record<string, string> = { IN: "91" };

export type NormalizeResult = { ok: true; value: string } | { ok: false; error: string };

/**
 * Normalise a phone number to E.164 (e.g. "+919876543210").
 * Accepts "98765 43210", "098765-43210", "+91 98765 43210", "0091...", "(+91) ...".
 * Numbers without a "+" are assumed to belong to `country` (default India).
 */
export function normalizePhone(input: string, country = "IN"): NormalizeResult {
  let s = input.trim().replace(/[\s\-().]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);

  if (!/^\+?\d+$/.test(s)) {
    return { ok: false, error: "Use digits only (spaces, dashes and + are fine)." };
  }

  const dial = DIAL_CODES[country];
  if (!s.startsWith("+")) {
    if (dial === "91") {
      if (s.length === 11 && s.startsWith("0")) s = s.slice(1);
      if (s.length === 12 && s.startsWith("91")) s = s.slice(2);
      if (s.length !== 10) return { ok: false, error: "Indian numbers need 10 digits." };
      s = "+91" + s;
    } else {
      return { ok: false, error: "Add the country code, e.g. +44..." };
    }
  }

  if (s.startsWith("+91")) {
    const local = s.slice(3);
    if (!/^[6-9]\d{9}$/.test(local)) {
      return { ok: false, error: "Indian mobile numbers are 10 digits starting with 6–9." };
    }
  } else if (!/^\+[1-9]\d{7,14}$/.test(s)) {
    return { ok: false, error: "Enter a valid international number." };
  }
  return { ok: true, value: s };
}

/** "@Brand.Name", "instagram.com/brand.name/", "https://www.instagram.com/brand.name?igsh=…" → "brand.name" */
export function normalizeInstagram(input: string): NormalizeResult {
  let s = input.trim();
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am)\/([^/?#]+)/i);
  if (m) s = m[1];
  s = s.replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(s)) {
    return { ok: false, error: "Use a valid Instagram handle (letters, numbers, . and _)." };
  }
  return { ok: true, value: s };
}

/** "Example.com/shop" → "https://example.com/shop" */
export function normalizeWebsite(input: string): NormalizeResult {
  let s = input.trim();
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try {
    const url = new URL(s);
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url.hostname)) throw new Error("bad host");
    url.hostname = url.hostname.toLowerCase();
    let out = url.toString();
    if (url.pathname === "/" && !url.search && !url.hash) out = out.replace(/\/$/, "");
    return { ok: true, value: out };
  } catch {
    return { ok: false, error: "Enter a valid website, e.g. example.com" };
  }
}

/** Digits of a phone number for wa.me links. */
export function whatsappLink(e164: string): string {
  return `https://wa.me/${e164.replace(/\D/g, "")}`;
}

/** "+919876543210" → "+91 98765 43210" */
export function formatPhone(e164: string | null): string {
  if (!e164) return "";
  const m = e164.match(/^\+91(\d{5})(\d{5})$/);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
