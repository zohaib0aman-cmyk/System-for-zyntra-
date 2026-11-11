-- COPY ALL of this into Supabase → SQL Editor → Run (one time). Same as migrations/20261111000000_phase6_automation.sql
-- =====================================================================
-- Zyntra Lead ID System — Phase 6: automatic demo + WhatsApp workflow
--   new lead → WhatsApp demo link → lead opens demo → 15 min later:
--     high-value lead: owner gets a "call now" notification
--     other leads:     AI sends a WhatsApp follow-up
--   incoming WhatsApp replies: AI answers (other leads) or hands over to
--   the owner (high-value leads).
-- Run AFTER the Phase 1–5 migrations. Safe to run more than once.
-- =====================================================================

-- 1. New timeline event types ------------------------------------------
do $$
declare v text;
begin
  foreach v in array array['demo_sent','demo_viewed','whatsapp_in','whatsapp_out','handoff'] loop
    if not exists (select 1 from pg_enum where enumtypid = 'public.activity_type'::regtype and enumlabel = v) then
      execute format('alter type public.activity_type add value %L', v);
    end if;
  end loop;
end $$;

-- 2. Lead automation columns -------------------------------------------
alter table public.leads
  add column if not exists auto_demo      boolean not null default true,  -- send the demo automatically
  add column if not exists demo_sent_at   timestamptz,
  add column if not exists demo_viewed_at timestamptz,
  add column if not exists wa_opt_out     boolean not null default false, -- replied STOP
  add column if not exists handoff_at     timestamptz;                    -- owner must take over

-- Leads that existed before this migration are not messaged automatically
-- (only on the first run: later runs leave the flag alone).
do $$ begin
  if not exists (select 1 from public.leads where demo_sent_at is not null)
     and not exists (select 1 from pg_class where relname = 'automation_jobs') then
    update public.leads set auto_demo = false;
  end if;
end $$;

create index if not exists leads_auto_demo_idx on public.leads (created_at)
  where auto_demo and demo_sent_at is null and not wa_opt_out;

-- 3. Settings (one row). Secrets are readable only by the owner / service role.
create table if not exists public.automation_settings (
  id                    boolean primary key default true check (id),
  enabled               boolean not null default false,
  wa_phone_number_id    text,
  wa_access_token       text,
  wa_app_secret         text,
  wa_verify_token       text not null default replace(gen_random_uuid()::text, '-', ''),
  wa_template_name      text not null default 'zyntra_demo',      -- first message (approved template)
  wa_followup_template  text not null default 'zyntra_followup',  -- follow-up outside the 24h window
  wa_template_lang      text not null default 'hi',
  demo_base_url         text,                                     -- e.g. https://my-demo.vercel.app
  app_url               text,                                     -- set by the app when settings are saved
  cron_secret           text not null default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  high_score            integer not null default 60 check (high_score between 0 and 100),
  followup_minutes      integer not null default 15 check (followup_minutes between 1 and 1440),
  business_name         text not null default 'Zyntra',
  updated_at            timestamptz not null default now()
);
insert into public.automation_settings (id) values (true) on conflict (id) do nothing;
alter table public.automation_settings
  add column if not exists wa_followup_template text not null default 'zyntra_followup',
  add column if not exists demo_base_url text,
  add column if not exists app_url text,
  add column if not exists cron_secret text not null default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

-- 4. WhatsApp message log ------------------------------------------------
create table if not exists public.wa_messages (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid references public.leads (id) on delete cascade,
  wa_from       text,
  direction     text not null check (direction in ('in','out')),
  body          text not null default '',
  wa_message_id text unique,
  by_ai         boolean not null default false,
  status        text,
  created_at    timestamptz not null default now()
);
create index if not exists wa_messages_lead_idx on public.wa_messages (lead_id, created_at desc);

-- 5. Scheduled automation jobs (run by /api/cron/automation every few minutes)
create table if not exists public.automation_jobs (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads (id) on delete cascade,
  kind       text not null check (kind in ('demo_followup')),
  run_at     timestamptz not null,
  done_at    timestamptz,
  result     text,
  created_at timestamptz not null default now(),
  unique (lead_id, kind)
);
create index if not exists automation_jobs_due_idx on public.automation_jobs (run_at) where done_at is null;

-- 6. RLS: owner can see everything in the app; the service role runs the jobs.
alter table public.automation_settings enable row level security;
alter table public.wa_messages         enable row level security;
alter table public.automation_jobs     enable row level security;

drop policy if exists "owner full access" on public.automation_settings;
create policy "owner full access" on public.automation_settings for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
drop policy if exists "owner full access" on public.wa_messages;
create policy "owner full access" on public.wa_messages for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
drop policy if exists "owner reads jobs" on public.automation_jobs;
create policy "owner reads jobs" on public.automation_jobs for select to authenticated
  using ((select public.is_owner()));

revoke all on public.automation_settings, public.wa_messages, public.automation_jobs from anon;
grant select, insert, update, delete on public.automation_settings, public.wa_messages to authenticated;
grant select on public.automation_jobs to authenticated;

-- 7. Scheduler: every 5 minutes Supabase calls the app's automation endpoint.
--    The URL and secret are read from automation_settings at run time, so
--    nothing needs to be pasted here. app_url is filled in automatically the
--    first time you open Settings → Automation in the app.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.automation_tick()
returns void language plpgsql security definer set search_path = '' as $$
declare s record;
begin
  select app_url, cron_secret into s from public.automation_settings where id;
  if s.app_url is null then return; end if;
  perform net.http_post(
    url     := s.app_url || '/api/cron/automation',
    headers := jsonb_build_object('Authorization', 'Bearer ' || s.cron_secret, 'Content-Type', 'application/json'),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end; $$;
revoke all on function public.automation_tick() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule('zyntra-automation');
exception when others then null; end $$;
select cron.schedule('zyntra-automation', '*/5 * * * *', 'select public.automation_tick();');
