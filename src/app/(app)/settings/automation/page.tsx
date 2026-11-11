import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { CopyField } from "@/components/settings/CopyField";
import { saveAutomationSettings } from "./actions";

export const metadata: Metadata = { title: "Automation" };
export const dynamic = "force-dynamic";

const DEMO_TEMPLATE = "Namaste {{1}}! 🙏 Maine ya meri team ne {{2}} ke liye ek free demo website banayi hai. Ek baar zaroor dekhiye: {{3}}\n\nPasand na aaye toh STOP likh dijiye.";
const FOLLOWUP_TEMPLATE = "Namaste {{1}}, aapne hamari banayi demo website dekhi — kaisi lagi? Koi bhi sawaal ho toh yahin reply kariye 🙂";

export default async function AutomationPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const sp = await searchParams;
  const db = await createClient();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const origin = host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : null;

  let { data: s, error } = await db.from("automation_settings").select("*").eq("id", true).maybeSingle();
  // Remember this app's public URL so the Supabase scheduler knows where to call.
  if (s && origin && !origin.includes("localhost") && s.app_url !== origin) {
    await db.from("automation_settings").update({ app_url: origin }).eq("id", true);
    s = { ...s, app_url: origin };
  }

  if (error || !s) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-xl font-bold">Automation</h1>
        <p className="card p-4 text-sm text-red-700">
          Database setup missing. Run <code>supabase/migrations/20261111000000_phase6_automation.sql</code> in Supabase → SQL Editor.
          {error ? ` (${error.message})` : ""}
        </p>
      </div>
    );
  }

  const { count: jobsPending } = await db.from("automation_jobs").select("id", { count: "exact", head: true }).is("done_at", null);
  const webhook = origin ? `${origin}/api/whatsapp/webhook` : "/api/whatsapp/webhook";
  const ai = Boolean(process.env.NVIDIA_API_KEY || process.env.CHAT_API_KEY);
  const waReady = Boolean(s.wa_phone_number_id && s.wa_access_token && s.wa_app_secret);
  const demoUrl = s.demo_base_url || process.env.DEMO_BASE_URL || "";

  const Check = ({ ok, label }: { ok: boolean; label: string }) => (
    <li className="flex items-center gap-2 text-sm"><span className={ok ? "text-emerald-600" : "text-amber-600"}>{ok ? "✓" : "○"}</span>{label}</li>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/settings" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Back">←</Link>
        <h1 className="text-xl font-bold">Automation</h1>
      </div>
      {sp.saved && <p className="card border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Saved ✓</p>}
      {sp.error && <p className="card border-red-200 bg-red-50 p-3 text-sm text-red-700">{sp.error}</p>}

      <section className="card p-4">
        <h2 className="font-semibold">Status</h2>
        <ul className="mt-2 space-y-1">
          <Check ok={s.enabled} label={s.enabled ? "Automation is ON" : "Automation is OFF"} />
          <Check ok={waReady} label="WhatsApp Cloud API connected" />
          <Check ok={ai} label="AI (NVIDIA) key set" />
          <Check ok={Boolean(demoUrl)} label={demoUrl ? `Demo site: ${demoUrl}` : "Demo website URL"} />
          <Check ok={Boolean(s.app_url)} label="Scheduler runs every 5 minutes" />
        </ul>
        <p className="mt-2 text-xs text-slate-500">Follow-ups waiting: {jobsPending ?? 0}</p>
      </section>

      <form action={saveAutomationSettings} className="card space-y-3 p-4">
        <label className="flex items-center gap-2 font-semibold">
          <input type="checkbox" name="enabled" defaultChecked={s.enabled} className="h-5 w-5" /> Run automatically
        </label>
        <p className="text-xs text-slate-500">
          New leads get the demo link on WhatsApp. When they open it, {s.followup_minutes} min later: high-value leads → you get a
          &quot;call now&quot; notification; others → AI follows up on WhatsApp. Leads added before this was set up are not messaged.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="high_score">High-value from score</label>
            <input className="input" id="high_score" name="high_score" type="number" min={0} max={100} defaultValue={s.high_score} />
          </div>
          <div>
            <label className="label" htmlFor="followup_minutes">Follow-up after (min)</label>
            <input className="input" id="followup_minutes" name="followup_minutes" type="number" min={1} max={1440} defaultValue={s.followup_minutes} />
          </div>
        </div>
        <p className="-mt-1 text-xs text-slate-500">Priority ★ leads are always high-value: only you talk to them.</p>
        <div>
          <label className="label" htmlFor="demo_base_url">Demo website URL</label>
          <input className="input" id="demo_base_url" name="demo_base_url" placeholder="https://your-demo.vercel.app" defaultValue={s.demo_base_url ?? process.env.DEMO_BASE_URL ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="business_name">Your business name (used by the AI)</label>
          <input className="input" id="business_name" name="business_name" defaultValue={s.business_name} />
        </div>

        <h3 className="pt-2 font-semibold">WhatsApp Cloud API</h3>
        <div>
          <label className="label" htmlFor="wa_phone_number_id">Phone number ID</label>
          <input className="input" id="wa_phone_number_id" name="wa_phone_number_id" inputMode="numeric" defaultValue={s.wa_phone_number_id ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="wa_access_token">Access token {s.wa_access_token ? "(saved — leave empty to keep)" : ""}</label>
          <input className="input" id="wa_access_token" name="wa_access_token" type="password" autoComplete="off" placeholder={s.wa_access_token ? "••••••••" : "EAAG…"} />
        </div>
        <div>
          <label className="label" htmlFor="wa_app_secret">App secret {s.wa_app_secret ? "(saved — leave empty to keep)" : ""}</label>
          <input className="input" id="wa_app_secret" name="wa_app_secret" type="password" autoComplete="off" placeholder={s.wa_app_secret ? "••••••••" : "App settings → Basic → App secret"} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-1">
            <label className="label" htmlFor="wa_template_name">Demo template</label>
            <input className="input" id="wa_template_name" name="wa_template_name" defaultValue={s.wa_template_name} />
          </div>
          <div className="col-span-1">
            <label className="label" htmlFor="wa_followup_template">Follow-up template</label>
            <input className="input" id="wa_followup_template" name="wa_followup_template" defaultValue={s.wa_followup_template} />
          </div>
          <div className="col-span-1">
            <label className="label" htmlFor="wa_template_lang">Language</label>
            <input className="input" id="wa_template_lang" name="wa_template_lang" defaultValue={s.wa_template_lang} />
          </div>
        </div>
        <button type="submit" className="btn-primary w-full">Save</button>
      </form>

      <section className="card space-y-3 p-4 text-sm">
        <h2 className="font-semibold">Meta setup (one time)</h2>
        <ol className="list-decimal space-y-2 pl-5 text-slate-700">
          <li>developers.facebook.com → your app → WhatsApp → <b>Configuration</b> → Webhook → Edit. Paste:
            <div className="mt-1 space-y-1"><CopyField value={webhook} /><CopyField value={s.wa_verify_token} /></div>
            Then subscribe to the <b>messages</b> field.</li>
          <li>WhatsApp Manager → <b>Message templates</b> → create <code>{s.wa_template_name}</code> (Marketing, language {s.wa_template_lang}) with this body:
            <div className="mt-1"><CopyField value={DEMO_TEMPLATE} mono={false} /></div></li>
          <li>Create <code>{s.wa_followup_template}</code> with:
            <div className="mt-1"><CopyField value={FOLLOWUP_TEMPLATE} mono={false} /></div></li>
          <li>Use a <b>permanent</b> access token (Business settings → System users), not the 24-hour test token.</li>
        </ol>
      </section>
    </div>
  );
}
