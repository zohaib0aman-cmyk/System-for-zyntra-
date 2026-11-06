import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Fetches a public URL from the server with protection against SSRF:
 * only http(s), no private / loopback / link-local addresses (checked on
 * every redirect), a size cap and a timeout.
 *
 * LOGO_ALLOW_PRIVATE_HOSTS=1 disables the private-address check — only for
 * local testing, never in production.
 */
export type SafeFetchResult = { url: string; status: number; contentType: string; body: Uint8Array };

export class SafeFetchError extends Error {}

const USER_AGENT = "Mozilla/5.0 (compatible; ZyntraLeadID/1.0; logo-finder)";

export async function safeFetch(
  input: string,
  { maxBytes = 2_000_000, timeoutMs = 8000, accept = "*/*", maxRedirects = 4 } = {},
): Promise<SafeFetchResult> {
  let url = new URL(input);
  const deadline = AbortSignal.timeout(timeoutMs);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicUrl(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal: deadline,
      headers: { "user-agent": USER_AGENT, accept },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      await res.body?.cancel();
      continue;
    }
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > maxBytes) {
      await res.body?.cancel();
      throw new SafeFetchError(`Response too large (${declared} bytes)`);
    }
    const body = await readCapped(res, maxBytes);
    return { url: url.toString(), status: res.status, contentType: res.headers.get("content-type") ?? "", body };
  }
  throw new SafeFetchError("Too many redirects");
}

async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new SafeFetchError("Response too large");
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.byteLength;
  }
  return out;
}

async function assertPublicUrl(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new SafeFetchError("Only http(s) URLs are allowed");
  if (url.username || url.password) throw new SafeFetchError("URLs with credentials are not allowed");
  if (process.env.LOGO_ALLOW_PRIVATE_HOSTS === "1") return;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw new SafeFetchError("Private host");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) throw new SafeFetchError("Private address");
  }
}

export function isPrivateAddress(ip: string): boolean {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;
    if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")) return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateAddress(mapped[1]) : false;
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}
