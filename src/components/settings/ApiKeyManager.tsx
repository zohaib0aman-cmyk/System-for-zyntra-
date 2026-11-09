"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createApiKeyAction, revokeApiKeyAction } from "@/app/(app)/settings/api-actions";
import type { ApiKeyRow, ApiScope } from "@/lib/database.types";
import { formatDateTime, relativeTime } from "@/lib/time";
import { Spinner } from "@/components/Spinner";
import { CopyButton } from "./CopyField";

export function ApiKeyManager({ keys }: { keys: ApiKeyRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [write, setWrite] = useState(true);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [justCreated, setJustCreated] = useState<{ name: string; plainKey: string } | null>(null);

  function create() {
    setError(undefined);
    const scopes: ApiScope[] = write ? ["read", "write"] : ["read"];
    start(async () => {
      const r = await createApiKeyAction(name.trim(), scopes);
      if (r.error || !r.key) return setError(r.error ?? "Could not create key.");
      setJustCreated({ name: r.key.name, plainKey: r.key.plainKey });
      setName("");
      router.refresh();
    });
  }

  const active = keys.filter((k) => !k.revoked_at);
  const revoked = keys.filter((k) => k.revoked_at);

  return (
    <section className="card space-y-4 p-4">
      <div>
        <h2 className="font-semibold">AI connections (API keys)</h2>
        <p className="mt-1 text-sm text-slate-500">
          Create a key for each AI (Claude, ChatGPT…). The key is shown once. Its name appears in the timeline for everything that AI does.
        </p>
      </div>

      {justCreated && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3">
          <p className="text-sm font-semibold text-emerald-800">Key for “{justCreated.name}” created — copy it now, it won’t be shown again.</p>
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-white p-2 ring-1 ring-inset ring-emerald-200">
            <code className="min-w-0 flex-1 break-all font-mono text-xs">{justCreated.plainKey}</code>
            <CopyButton text={justCreated.plainKey} label="Copy key" />
          </div>
          <button onClick={() => setJustCreated(null)} className="mt-2 text-xs font-semibold text-emerald-700">Done</button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 p-3">
        <label className="label" htmlFor="key-name">New key name</label>
        <input id="key-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Claude, ChatGPT" className="input py-2.5" />
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} className="h-4 w-4 accent-brand-600" />
          Allow writing (add & edit leads). Uncheck for read-only.
        </label>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        <button onClick={create} disabled={pending || !name.trim()} className="btn-primary mt-3 py-2">
          {pending && <Spinner />} Create key
        </button>
      </div>

      {active.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {active.map((k) => (
            <li key={k.id} className="flex items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {k.name}
                  <span className="ml-2 rounded bg-slate-100 px-1.5 text-xs font-normal text-slate-500">{k.scopes.join(" + ")}</span>
                </p>
                <p className="font-mono text-xs text-slate-400">{k.key_prefix}… · {k.last_used_at ? `used ${relativeTime(k.last_used_at)}` : "never used"}</p>
              </div>
              <RevokeButton id={k.id} name={k.name} onDone={() => router.refresh()} />
            </li>
          ))}
        </ul>
      )}

      {revoked.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-500">Revoked keys ({revoked.length})</summary>
          <ul className="mt-2 space-y-1">
            {revoked.map((k) => (
              <li key={k.id} className="text-xs text-slate-400">
                {k.name} — {k.key_prefix}… · revoked {k.revoked_at ? formatDateTime(k.revoked_at) : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function RevokeButton({ id, name, onDone }: { id: string; name: string; onDone: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  if (!confirm) {
    return (
      <button onClick={() => setConfirm(true)} className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50">
        Revoke
      </button>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-1">
      <span className="text-xs text-slate-500">Revoke {name}?</span>
      <button
        onClick={() => start(async () => { await revokeApiKeyAction(id); onDone(); })}
        disabled={pending}
        className="rounded-lg bg-red-600 px-2 py-1 text-xs font-semibold text-white"
      >
        {pending ? "…" : "Yes"}
      </button>
      <button onClick={() => setConfirm(false)} className="rounded-lg px-2 py-1 text-xs text-slate-500">No</button>
    </div>
  );
}
