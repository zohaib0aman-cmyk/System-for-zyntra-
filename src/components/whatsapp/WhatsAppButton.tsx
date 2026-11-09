"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  getWhatsAppLinkAction,
  logWhatsAppOpenedAction,
  markContactedAction,
} from "@/app/(app)/phase4-actions";
import type { LeadStatus, MessageTemplateRow } from "@/lib/database.types";
import { Spinner } from "@/components/Spinner";
import { BottomSheet } from "@/components/pipeline/BottomSheet";

type Props = {
  leadId: string;
  hasContact: boolean;
  status: LeadStatus;
  templates: Pick<MessageTemplateRow, "id" | "name">[];
  variant?: "full" | "icon";
  className?: string;
};

/**
 * One-tap WhatsApp. Opens a template picker (with preview), then wa.me.
 * Logs the open, and offers "Mark as Contacted" if the lead is still New.
 */
export function WhatsAppButton({ leadId, hasContact, status, templates, variant = "full", className }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [askContacted, setAskContacted] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(templates[0]?.id ?? null);
  const [preview, setPreview] = useState<{ message: string; url: string; channel: string; number: string } | null>(null);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const [loadingPreview, setLoadingPreview] = useState(false);

  async function loadPreview(tid: string | null) {
    setLoadingPreview(true);
    setError(undefined);
    const r = await getWhatsAppLinkAction(leadId, tid);
    setLoadingPreview(false);
    if (r.error) return setError(r.error);
    setPreview({ message: r.message ?? "", url: r.url!, channel: r.channel!, number: r.number! });
  }

  function openPicker() {
    if (!hasContact) return;
    setOpen(true);
    loadPreview(templateId);
  }

  function send() {
    if (!preview) return;
    // Open WhatsApp in a new tab (app on phone, web on desktop).
    window.open(preview.url, "_blank", "noopener,noreferrer");
    const tpl = templates.find((t) => t.id === templateId);
    start(async () => {
      await logWhatsAppOpenedAction(leadId, tpl?.name ?? null, preview.number);
      router.refresh();
    });
    setOpen(false);
    if (status === "New") setAskContacted(true);
  }

  const label = "WhatsApp";
  const btn =
    variant === "icon" ? (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openPicker();
        }}
        disabled={!hasContact}
        aria-label={hasContact ? "Message on WhatsApp" : "No phone number"}
        title={hasContact ? "WhatsApp" : "No phone / WhatsApp number"}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-green-600 ring-1 ring-inset ring-green-200 hover:bg-green-50 disabled:opacity-30 ${className ?? ""}`}
      >
        <WaIcon />
      </button>
    ) : (
      <button
        type="button"
        onClick={openPicker}
        disabled={!hasContact}
        className={`btn inline-flex items-center justify-center gap-2 bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 ${className ?? ""}`}
        title={hasContact ? undefined : "This lead has no phone or WhatsApp number"}
      >
        <WaIcon /> {label}
      </button>
    );

  return (
    <>
      {btn}

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Send on WhatsApp">
        <div className="space-y-3">
          {templates.length > 0 ? (
            <div>
              <p className="label">Template</p>
              <div className="flex flex-wrap gap-1.5">
                <TemplateChip active={templateId === null} onClick={() => { setTemplateId(null); loadPreview(null); }}>
                  No message
                </TemplateChip>
                {templates.map((t) => (
                  <TemplateChip key={t.id} active={templateId === t.id} onClick={() => { setTemplateId(t.id); loadPreview(t.id); }}>
                    {t.name}
                  </TemplateChip>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">No templates yet — WhatsApp will open with no preset message. Create templates in Settings.</p>
          )}

          <div>
            <p className="label">Preview</p>
            <div className="min-h-[72px] rounded-xl bg-green-50 p-3 text-sm text-slate-800 ring-1 ring-inset ring-green-100">
              {loadingPreview ? <Spinner className="h-4 w-4 text-green-600" /> : preview?.message ? (
                <span className="whitespace-pre-wrap">{preview.message}</span>
              ) : (
                <span className="text-slate-400">No preset message — opens a blank chat.</span>
              )}
            </div>
            {preview && (
              <p className="mt-1 text-xs text-slate-500">
                {preview.channel === "phone" ? "No WhatsApp number on file — using the phone number. " : ""}
                To {preview.number}
              </p>
            )}
          </div>

          {error && <p className="text-sm text-red-700">{error}</p>}
          <button onClick={send} disabled={!preview || loadingPreview} className="btn w-full bg-green-600 text-white hover:bg-green-700">
            <WaIcon /> Open WhatsApp
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={askContacted} onClose={() => setAskContacted(false)} title="Mark as Contacted?">
        <div className="space-y-3">
          <p className="text-sm text-slate-600">You just messaged this lead. Move it from <b>New</b> to <b>Contacted</b>?</p>
          <div className="flex gap-2">
            <button onClick={() => setAskContacted(false)} className="btn-secondary flex-1">Not now</button>
            <button
              onClick={() =>
                start(async () => {
                  await markContactedAction(leadId);
                  setAskContacted(false);
                  router.refresh();
                })
              }
              disabled={pending}
              className="btn-primary flex-1"
            >
              {pending && <Spinner />} Yes, Contacted
            </button>
          </div>
        </div>
      </BottomSheet>
    </>
  );
}

function TemplateChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1.5 text-sm ring-1 ring-inset ${active ? "bg-green-600 font-semibold text-white ring-green-600" : "bg-white text-slate-700 ring-slate-200"}`}
    >
      {children}
    </button>
  );
}

function WaIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path d="M17.5 14.4c-.3-.1-1.7-.8-1.9-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.4-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.5-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.1c-.2-.5-.4-.5-.6-.5H7c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9.6.3 1.1.4 1.5.5.6.2 1.2.2 1.6.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.2-.2-.5-.3z" />
      <path d="M12 2a10 10 0 0 0-8.5 15.3L2 22l4.8-1.5A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-2.9.9.9-2.8-.2-.3A8.2 8.2 0 1 1 12 20.2z" />
    </svg>
  );
}
