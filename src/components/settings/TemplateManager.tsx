"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createTemplateAction, deleteTemplateAction, updateTemplateAction } from "@/app/(app)/phase4-actions";
import { renderTemplate, TEMPLATE_VARS } from "@/services/templates";
import type { MessageTemplateRow } from "@/lib/database.types";
import { Spinner } from "@/components/Spinner";

const SAMPLE = {
  brand_name: "Kesariya Threads",
  owner_name: "Riya",
  city: "Ahmedabad",
  state: "GJ",
  niche: "Clothing Brand",
  tracking_id: "ZYN-IN-GJ-000001",
};

export function TemplateManager({ templates }: { templates: MessageTemplateRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<MessageTemplateRow | "new" | null>(null);

  return (
    <section className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">WhatsApp templates</h2>
          <p className="mt-1 text-sm text-slate-500">
            Variables: {TEMPLATE_VARS.map((v) => `{${v}}`).join(" ")}
          </p>
        </div>
        <button onClick={() => setEditing("new")} className="btn-primary py-2">+ New</button>
      </div>

      <ul className="divide-y divide-slate-100">
        {templates.map((t) => (
          <li key={t.id} className="py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold">{t.name}</p>
                <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{t.body}</p>
              </div>
              <button onClick={() => setEditing(t)} className="shrink-0 text-sm font-semibold text-brand-700">Edit</button>
            </div>
          </li>
        ))}
        {templates.length === 0 && <li className="py-6 text-center text-sm text-slate-400">No templates yet.</li>}
      </ul>

      {editing && (
        <TemplateEditor
          template={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

function TemplateEditor({
  template,
  onClose,
  onSaved,
}: {
  template: MessageTemplateRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  function save() {
    setError(undefined);
    start(async () => {
      const r = template
        ? await updateTemplateAction(template.id, name, body)
        : await createTemplateAction(name, body);
      if (r.error) return setError(r.error);
      onSaved();
    });
  }

  function remove() {
    if (!template) return;
    start(async () => {
      const r = await deleteTemplateAction(template.id);
      if (r.error) return setError(r.error);
      onSaved();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-slate-900/40" aria-label="Close" onClick={onClose} />
      <div className="relative flex max-h-[88dvh] w-full max-w-lg flex-col overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl md:rounded-3xl">
        <h3 className="mb-3 text-base font-bold">{template ? "Edit template" : "New template"}</h3>
        <label className="label" htmlFor="tpl-name">Name</label>
        <input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="input" placeholder="e.g. First intro" />
        <label className="label mt-3" htmlFor="tpl-body">Message</label>
        <textarea id="tpl-body" value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={2000} className="input" placeholder="Hello {owner_name}! …" />
        <div className="mt-2 flex flex-wrap gap-1">
          {TEMPLATE_VARS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setBody((b) => b + `{${v}}`)}
              className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-200"
            >
              + {`{${v}}`}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <p className="label">Preview (sample lead)</p>
          <div className="rounded-xl bg-green-50 p-3 text-sm ring-1 ring-inset ring-green-100">
            {body.trim() ? renderTemplate(body, SAMPLE) : <span className="text-slate-400">Type a message…</span>}
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        <div className="mt-4 flex gap-2">
          {template && (
            <button onClick={remove} disabled={pending} className="btn-secondary text-red-700">Delete</button>
          )}
          <button onClick={onClose} className="btn-secondary ml-auto">Cancel</button>
          <button onClick={save} disabled={pending || !name.trim() || !body.trim()} className="btn-primary">
            {pending && <Spinner />} Save
          </button>
        </div>
      </div>
    </div>
  );
}
