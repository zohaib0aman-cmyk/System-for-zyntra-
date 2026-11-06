"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { addTagAction, removeTagAction } from "@/app/(app)/pipeline-actions";
import type { TagRow } from "@/lib/database.types";
import { TagChip } from "./Chips";

/** Tag chips with remove buttons + an input with autocomplete; Enter creates a new tag. */
export function TagEditor({ leadId, tags, allTags }: { leadId: string; tags: TagRow[]; allTags: TagRow[] }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const have = new Set(tags.map((t) => t.id));

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    return allTags.filter((t) => !have.has(t.id) && (!q || t.name.toLowerCase().includes(q))).slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, allTags, tags]);
  const exact = allTags.some((t) => t.name.toLowerCase() === value.trim().toLowerCase());

  const add = (name: string) => {
    if (!name.trim()) return;
    setError(undefined);
    start(async () => {
      const r = await addTagAction([leadId], name);
      if (r.error) return setError(r.error);
      setValue("");
      router.refresh();
    });
  };

  return (
    <section className="card p-4" aria-label="Tags">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Tags</h2>
      <div className="flex flex-wrap gap-1.5">
        {tags.length === 0 && <p className="text-sm text-slate-400">No tags yet.</p>}
        {tags.map((t) => (
          <TagChip key={t.id} name={t.name} color={t.color}>
            <button
              aria-label={`Remove tag ${t.name}`}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await removeTagAction(leadId, t.id);
                  if (r.error) setError(r.error);
                  router.refresh();
                })
              }
              className="-mr-1 rounded-full px-1 leading-none opacity-60 hover:opacity-100"
            >
              ×
            </button>
          </TagChip>
        ))}
      </div>
      <form
        className="mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          add(value);
        }}
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Add a tag — e.g. Diwali offer"
          maxLength={40}
          className="input py-2.5"
          aria-label="Add tag"
          enterKeyHint="done"
        />
      </form>
      {(suggestions.length > 0 || (value.trim() && !exact)) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.map((t) => (
            <button key={t.id} onClick={() => add(t.name)} disabled={pending} className="rounded-full">
              <TagChip name={t.name} color={t.color}>
                <span aria-hidden="true">+</span>
              </TagChip>
            </button>
          ))}
          {value.trim() && !exact && (
            <button
              onClick={() => add(value)}
              disabled={pending}
              className="rounded-full border border-dashed border-brand-300 px-2 py-0.5 text-xs font-semibold text-brand-700"
            >
              + Create “{value.trim()}”
            </button>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}
