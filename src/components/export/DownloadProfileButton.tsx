"use client";

import { useState } from "react";
import { Spinner } from "@/components/Spinner";

/** Downloads a one-page ID-card style PDF of this lead. */
export function DownloadProfileButton({ leadId }: { leadId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        setBusy(true);
        const a = document.createElement("a");
        a.href = `/api/export/profile?id=${leadId}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => setBusy(false), 1500);
      }}
      className="btn-secondary py-2"
    >
      {busy ? <Spinner /> : null} Download PDF
    </button>
  );
}
