import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-2xl font-black text-white shadow-lg shadow-brand-600/30">Z</div>
          <h1 className="text-2xl font-bold tracking-tight">Zyntra Lead ID</h1>
          <p className="mt-1 text-sm text-slate-500">Owner sign-in</p>
        </div>
        <div className="card p-5 sm:p-6">
          <LoginForm next={next} />
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">Private system. No public sign-up.</p>
      </div>
    </main>
  );
}
