import Link from "next/link";
import { logout } from "@/app/login/actions";
import { createClient } from "@/lib/supabase/server";
import { countDueFollowups } from "@/services";
import { BottomNav, HeaderNav, MobileBell } from "@/components/nav/AppNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const dueCount = await countDueFollowups(await createClient());
  return (
    <div className="min-h-dvh pb-[calc(7rem+env(safe-area-inset-bottom))] md:pb-24">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4">
          <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-black text-white">Z</span>
            <span>Zyntra <span className="font-medium text-slate-500">Lead ID</span></span>
          </Link>
          <div className="flex items-center gap-1">
            <HeaderNav dueCount={dueCount} />
            <MobileBell dueCount={dueCount} />
            <form action={logout}>
              <button type="submit" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">Log out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-4">{children}</main>
      <BottomNav dueCount={dueCount} />
    </div>
  );
}
