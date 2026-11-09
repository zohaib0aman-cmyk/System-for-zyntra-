"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addNoteAction } from "@/app/(app)/pipeline-actions";
import { Spinner } from "@/components/Spinner";

export function NoteBox({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(undefined);
        start(async () => {
          const r = await addNoteAction(leadId, text);
          if (r.error) return setError(r.error);
          setText("");
          router.refresh();
        });
      }}
      className="space-y-2"
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        maxLength={2000}
        placeholder="Add a note — e.g. Spoke to Riya, wants a quote by Friday"
        className="input"
        aria-label="Add note"
      />
      <div className="flex items-center justify-between">
        {error ? <p className="text-sm text-red-700">{error}</p> : <span />}
        <button type="submit" disabled={pending || !text.trim()} className="btn-primary py-2">
          {pending && <Spinner />} Add note
        </button>
      </div>
    </form>
  );
}
