"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";
import { Spinner } from "@/components/Spinner";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next ?? "/"} />
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required
          defaultValue={state.email} className="input" placeholder="you@zyntra.in" />
      </div>
      <div>
        <label htmlFor="password" className="label">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required
          className="input" placeholder="••••••••" />
      </div>
      {state.error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">{state.error}</p>
      )}
      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending && <Spinner />} {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
