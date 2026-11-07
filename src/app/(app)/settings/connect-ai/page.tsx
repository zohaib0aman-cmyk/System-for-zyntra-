import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { ConnectGuide } from "@/components/settings/ConnectGuide";

export const metadata: Metadata = { title: "How to connect AI" };

export default async function ConnectAiPage() {
  const h = await headers();
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "your-app.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const base = (envUrl || `${proto}://${host}`).replace(/\/$/, "");

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/settings/connections" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Back">←</Link>
        <h1 className="text-xl font-bold">How to connect AI</h1>
      </div>
      <ConnectGuide baseUrl={base} />
    </div>
  );
}
