"use client";

import { useEffect } from "react";

/** Bottom sheet on phones, centred dialog on larger screens. */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-slate-900/40" aria-label="Close" onClick={onClose} />
      <div className="relative flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-2xl md:rounded-3xl">
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-slate-300 md:hidden" aria-hidden="true" />
        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <h2 className="text-base font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-full px-3 py-1 text-sm font-medium text-slate-500 hover:bg-slate-100">Close</button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
        {footer && <div className="border-t border-slate-200 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}
