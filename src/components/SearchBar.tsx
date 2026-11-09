"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Spinner } from "./Spinner";

export function SearchBar({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initialQuery);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastPushed = useRef(initialQuery);

  useEffect(() => () => clearTimeout(timer.current), []);

  // The query changed from outside (e.g. "Clear all" or browser back): show it.
  useEffect(() => {
    if (initialQuery !== lastPushed.current) {
      lastPushed.current = initialQuery;
      setValue(initialQuery);
    }
  }, [initialQuery]);

  function push(q: string) {
    const trimmed = q.trim();
    if (trimmed === lastPushed.current) return;
    lastPushed.current = trimmed;
    // Keep the active filters and sort; only replace the search text.
    const params = new URLSearchParams(searchParams.toString());
    if (trimmed) params.set("q", trimmed);
    else params.delete("q");
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  function onChange(q: string) {
    setValue(q);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => push(q), 250);
  }

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        clearTimeout(timer.current);
        push(value);
      }}
      className="relative"
    >
      <svg className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 3.47 9.77l3.13 3.13a.75.75 0 1 0 1.06-1.06l-3.13-3.13A5.5 5.5 0 0 0 9 3.5ZM5 9a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z" clipRule="evenodd" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search ID, brand, owner, phone, Instagram…"
        aria-label="Search leads"
        autoComplete="off"
        enterKeyHint="search"
        className="input pl-11 pr-11 shadow-sm"
      />
      {pending && (
        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brand-600">
          <Spinner className="h-5 w-5" />
        </span>
      )}
    </form>
  );
}
