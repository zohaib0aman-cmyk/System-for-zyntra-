"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; icon: React.ReactNode; badge?: number; match: (p: string) => boolean };

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
    <path d={d} />
  </svg>
);

function items(dueCount: number): Item[] {
  return [
    { href: "/", label: "Home", icon: icon("M3 11l9-8 9 8M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"), match: (p) => p === "/" },
    { href: "/leads", label: "Leads", icon: icon("M4 6h16M4 12h16M4 18h10"), match: (p) => p.startsWith("/leads") },
    { href: "/followups", label: "Follow-ups", icon: icon("M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"), badge: dueCount, match: (p) => p.startsWith("/followups") },
    { href: "/imports", label: "Import", icon: icon("M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"), match: (p) => p.startsWith("/imports") },
    { href: "/settings", label: "Settings", icon: icon("M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z"), match: (p) => p.startsWith("/settings") },
  ];
}

function Badge({ n }: { n?: number }) {
  if (!n) return null;
  return (
    <span className="absolute -right-2 -top-1 min-w-[1.25rem] rounded-full bg-red-600 px-1 text-center text-[11px] font-bold leading-5 text-white" aria-label={`${n} due`}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

/** Bottom tab bar on phones (one-hand friendly). */
export function BottomNav({ dueCount }: { dueCount: number }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid h-16 grid-cols-5">
        {items(dueCount).map((it) => {
          const active = it.match(pathname);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${active ? "text-brand-700" : "text-slate-500"}`}
              >
                <span className="relative">
                  {it.icon}
                  <Badge n={it.badge} />
                </span>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Links in the header on tablets / desktop. */
export function HeaderNav({ dueCount }: { dueCount: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 text-sm font-medium md:flex">
      {items(dueCount).map((it) => (
        <Link
          key={it.href}
          href={it.href}
          aria-current={it.match(pathname) ? "page" : undefined}
          className={`relative rounded-lg px-3 py-2 ${it.match(pathname) ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-100"}`}
        >
          {it.label}
          {it.badge ? <span className="ml-1.5 rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">{it.badge}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

/** Small bell with the due count, top-right on phones. */
export function MobileBell({ dueCount }: { dueCount: number }) {
  return (
    <Link href="/followups" className="relative rounded-lg p-2 text-slate-600 md:hidden" aria-label={`Follow-ups: ${dueCount} due`}>
      {icon("M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 0 0-4-5.7V5a2 2 0 1 0-4 0v.3A6 6 0 0 0 6 11v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9")}
      <Badge n={dueCount} />
    </Link>
  );
}
