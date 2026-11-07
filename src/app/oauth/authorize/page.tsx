import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClient } from "@/services/oauth";
import { decideAuthorization } from "./actions";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

/** OAuth consent screen. The owner must be logged in (reuses the app login). */
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { client_id, redirect_uri, state = "", scope = "read write", code_challenge = "", code_challenge_method = "", response_type } = sp;

  const selfUrl = "/oauth/authorize?" + new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();

  // Require login.
  const ssr = await createClient();
  const { data: claims } = await ssr.auth.getClaims();
  if (!claims?.claims?.sub) redirect(`/login?next=${encodeURIComponent(selfUrl)}`);

  if (response_type !== "code" || !client_id || !redirect_uri) {
    return <Shell title="Invalid request">The authorization request is missing required parameters.</Shell>;
  }

  const admin = createAdminClient();
  const client = await getClient(admin, client_id);
  if (!client || !client.redirect_uris.includes(redirect_uri)) {
    return <Shell title="Unknown app">This application is not registered, or its redirect URL doesn’t match.</Shell>;
  }

  const scopes = scope.split(/\s+/).filter(Boolean);

  return (
    <Shell title="Connect to Zyntra">
      <p className="text-sm text-slate-600">
        <b>{client.client_name || "An application"}</b> wants to connect to your Zyntra Lead ID account.
      </p>
      <ul className="my-4 space-y-1.5 text-sm">
        {scopes.includes("read") && <li className="flex gap-2"><span>✅</span> Read your leads, follow-ups and stats</li>}
        {scopes.includes("write") && <li className="flex gap-2"><span>✅</span> Add and update leads, notes, tags and follow-ups</li>}
        <li className="flex gap-2 text-slate-500"><span>🚫</span> It cannot delete leads, restore backups or manage API keys</li>
      </ul>
      <p className="mb-4 text-xs text-slate-400">Actions will appear in your timeline as “{client.client_name || "the app"}”.</p>
      <form action={decideAuthorization} className="flex gap-2">
        <input type="hidden" name="client_id" value={client_id} />
        <input type="hidden" name="redirect_uri" value={redirect_uri} />
        <input type="hidden" name="state" value={state} />
        <input type="hidden" name="scope" value={scope} />
        <input type="hidden" name="code_challenge" value={code_challenge} />
        <input type="hidden" name="code_challenge_method" value={code_challenge_method} />
        <button name="decision" value="deny" className="btn-secondary flex-1">Deny</button>
        <button name="decision" value="approve" className="btn-primary flex-1">Allow</button>
      </form>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2 font-bold">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-black text-white">Z</span>
          Zyntra Lead ID
        </div>
        <div className="card p-5">
          <h1 className="mb-3 text-lg font-bold">{title}</h1>
          {children}
        </div>
      </div>
    </main>
  );
}
