"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { sendWhatsAppAction, setAutoDemoAction, setHandoffAction } from "@/app/(app)/leads/[trackingId]/wa-actions";
import { CopyButton } from "@/components/settings/CopyField";
import { Spinner } from "@/components/Spinner";

export type ChatItem = { id: string; direction: "in" | "out"; body: string; by_ai: boolean; status: string | null; created_at: string };

export function WhatsAppChat(props: {
  leadId: string;
  messages: ChatItem[];
  demoLink: string | null;
  demoSentAt: string | null;
  demoViewedAt: string | null;
  handoffAt: string | null;
  autoDemo: boolean;
  highValue: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string }>, after?: () => void) =>
    start(async () => {
      setError(undefined);
      const r = await fn();
      if (r.error) return setError(r.error);
      after?.();
      router.refresh();
    });
  const t = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  return (
    <section className="card space-y-3 p-4" aria-label="WhatsApp">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">WhatsApp &amp; demo</h2>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${props.highValue ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
          {props.highValue ? "High-value: you talk" : "AI handles"}
        </span>
      </div>

      {props.demoLink && (
        <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-2 text-xs">
          <a href={props.demoLink} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium text-brand-700">{props.demoLink}</a>
          <CopyButton text={props.demoLink} />
        </div>
      )}
      <p className="text-xs text-slate-500">
        Demo: {props.demoSentAt ? `sent ${t(props.demoSentAt)}` : props.autoDemo ? "will be sent automatically" : "auto-send off"}
        {props.demoViewedAt ? ` · opened ${t(props.demoViewedAt)} 👁` : ""}
      </p>

      <div className="max-h-80 space-y-2 overflow-y-auto">
        {props.messages.length === 0 && <p className="text-sm text-slate-400">No WhatsApp messages yet.</p>}
        {props.messages.map((m) => (
          <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${m.direction === "out" ? "bg-green-100 text-slate-800" : "bg-slate-100 text-slate-800"}`}>
              {m.body}
              <p className="mt-1 text-[10px] text-slate-500">
                {m.direction === "out" ? (m.by_ai ? "AI · " : "You · ") : ""}{t(m.created_at)}
                {m.status?.startsWith("failed") ? <span className="text-red-600"> · not delivered</span> : null}
              </p>
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => sendWhatsAppAction(props.leadId, text), () => setText(""));
        }}
        className="flex gap-2"
      >
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} placeholder="Type a WhatsApp reply…" className="input" aria-label="WhatsApp message" />
        <button type="submit" disabled={pending || !text.trim()} className="btn-primary py-2">{pending ? <Spinner /> : "Send"}</button>
      </form>
      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap gap-2 text-xs">
        {!props.highValue && (
          <button type="button" className="btn-secondary py-1.5 text-xs" disabled={pending}
            onClick={() => run(() => setHandoffAction(props.leadId, !props.handoffAt))}>
            {props.handoffAt ? "Hand back to AI" : "I'll handle this lead"}
          </button>
        )}
        {!props.demoSentAt && (
          <button type="button" className="btn-secondary py-1.5 text-xs" disabled={pending}
            onClick={() => run(() => setAutoDemoAction(props.leadId, !props.autoDemo))}>
            {props.autoDemo ? "Don't auto-send demo" : "Auto-send demo"}
          </button>
        )}
      </div>
    </section>
  );
}
