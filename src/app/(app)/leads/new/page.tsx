import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EMPTY_LEAD_FORM } from "@/lib/validation";
import { listNiches } from "@/services";
import { LeadForm } from "@/components/LeadForm";

export const metadata: Metadata = { title: "Add lead" };

export default async function NewLeadPage() {
  const db = await createClient();
  const niches = await listNiches(db);
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Link href="/" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Back">←</Link>
        <h1 className="text-xl font-bold">Add lead</h1>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        A tracking ID like <span className="font-mono">ZYN-IN-GJ-000123</span> is created automatically when you save.
      </p>
      <LeadForm
        mode="create"
        initialValues={EMPTY_LEAD_FORM}
        niches={niches.ok ? niches.data.map((n) => n.name) : []}
      />
    </div>
  );
}
