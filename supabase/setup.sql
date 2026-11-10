-- Zyntra Lead ID — full database setup (all migrations). Run once in Supabase SQL Editor.

-- ===== 20261106000000_init.sql =====
-- =====================================================================
-- Zyntra Lead ID System — Phase 1 schema
-- Run this whole file once in Supabase → SQL Editor (or `supabase db push`).
-- =====================================================================

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
do $$ begin
  create type public.lead_source as enum ('pdf', 'claude', 'gpt', 'manual');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Owners allow-list (only these auth users can read/write data)
-- ---------------------------------------------------------------------
create table if not exists public.app_owners (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_owners enable row level security;
-- No policies on app_owners: it is only readable through is_owner().

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_owners where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------
-- Niches
-- ---------------------------------------------------------------------
create table if not exists public.niches (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now(),
  constraint niches_name_not_blank check (length(trim(name)) > 0)
);
create unique index if not exists niches_name_unique_ci on public.niches (lower(name));

-- ---------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------
create table if not exists public.leads (
  id           uuid primary key default gen_random_uuid(),
  tracking_id  text not null unique,
  brand_name   text not null,
  owner_name   text,
  phone        text,           -- E.164, e.g. +919876543210
  whatsapp     text,           -- E.164
  email        text,
  instagram    text,           -- handle only, lowercase, no "@"
  website      text,           -- full URL, e.g. https://example.com
  city         text,
  state        text not null,  -- 2-letter code, e.g. GJ
  country      text not null default 'IN',  -- ISO 3166-1 alpha-2
  niche        text,
  logo_url     text,
  source       public.lead_source not null default 'manual',
  status       text not null default 'New',
  notes        text,
  -- Normalised website host used for duplicate detection (no scheme / www / path).
  website_host text generated always as (
    nullif(lower(regexp_replace(coalesce(website, ''), '^(https?://)?(www\.)?([^/?#:]+).*$', '\3')), '')
  ) stored,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint leads_brand_not_blank check (length(trim(brand_name)) > 0),
  constraint leads_state_format    check (state ~ '^[A-Z]{2}$'),
  constraint leads_country_format  check (country ~ '^[A-Z]{2}$'),
  constraint leads_phone_format    check (phone    is null or phone    ~ '^\+[1-9][0-9]{7,14}$'),
  constraint leads_whatsapp_format check (whatsapp is null or whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  constraint leads_tracking_format check (tracking_id ~ '^ZYN-[A-Z]{2}-[A-Z]{2}-[0-9]{6,}$')
);

create index if not exists leads_phone_idx        on public.leads (phone);
create index if not exists leads_whatsapp_idx     on public.leads (whatsapp);
create index if not exists leads_instagram_idx    on public.leads (instagram);
create index if not exists leads_brand_name_idx   on public.leads (brand_name);
create index if not exists leads_niche_idx        on public.leads (niche);
create index if not exists leads_state_idx        on public.leads (state);
create index if not exists leads_website_host_idx on public.leads (website_host);
create index if not exists leads_created_at_idx   on public.leads (created_at desc);
create index if not exists leads_brand_city_ci_idx on public.leads (lower(trim(brand_name)), lower(trim(coalesce(city, ''))));
-- Trigram indexes make the "search by anything" ILIKE queries fast.
create index if not exists leads_brand_name_trgm  on public.leads using gin (brand_name gin_trgm_ops);
create index if not exists leads_owner_name_trgm  on public.leads using gin (owner_name gin_trgm_ops);
create index if not exists leads_tracking_id_trgm on public.leads using gin (tracking_id gin_trgm_ops);
-- (tracking_id already has a unique b-tree index from the UNIQUE constraint.)

-- ---------------------------------------------------------------------
-- Tracking ID counters: one row per (country, state)
-- ---------------------------------------------------------------------
create table if not exists public.tracking_counters (
  country     text not null,
  state       text not null,
  last_serial integer not null default 0,
  primary key (country, state)
);
alter table public.tracking_counters enable row level security;
-- No policies: only the security-definer function below touches it.

-- Atomically reserves the next serial for a country/state.
-- INSERT ... ON CONFLICT DO UPDATE takes a row lock, so concurrent inserts
-- are serialised per (country, state) and can never get the same number.
create or replace function public.next_tracking_id(p_country text, p_state text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_serial integer;
begin
  insert into public.tracking_counters as c (country, state, last_serial)
  values (upper(p_country), upper(p_state), 1)
  on conflict (country, state)
  do update set last_serial = c.last_serial + 1
  returning c.last_serial into v_serial;

  return format('ZYN-%s-%s-%s', upper(p_country), upper(p_state), lpad(v_serial::text, 6, '0'));
end;
$$;
revoke all on function public.next_tracking_id(text, text) from public, anon, authenticated;

create or replace function public.leads_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.country := upper(coalesce(nullif(trim(new.country), ''), 'IN'));
  new.state   := upper(trim(new.state));
  -- Always generated by the database; any client-supplied value is ignored.
  new.tracking_id := public.next_tracking_id(new.country, new.state);
  new.created_at  := now();
  new.updated_at  := now();
  return new;
end;
$$;

create or replace function public.leads_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tracking_id is distinct from old.tracking_id then
    raise exception 'tracking_id is immutable (lead %)', old.tracking_id
      using errcode = 'check_violation';
  end if;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists leads_set_tracking_id on public.leads;
create trigger leads_set_tracking_id
  before insert on public.leads
  for each row execute function public.leads_before_insert();

drop trigger if exists leads_protect_and_touch on public.leads;
create trigger leads_protect_and_touch
  before update on public.leads
  for each row execute function public.leads_before_update();

-- ---------------------------------------------------------------------
-- Duplicate detection
-- Returns existing leads matching ANY of: phone, whatsapp (cross-checked
-- against both columns), instagram, website host, or brand name + city.
-- ---------------------------------------------------------------------
create or replace function public.find_duplicate_leads(
  p_phone      text default null,
  p_whatsapp   text default null,
  p_instagram  text default null,
  p_website    text default null,
  p_brand_name text default null,
  p_city       text default null,
  p_exclude_id uuid default null
)
returns setof public.leads
language sql
stable
security invoker
set search_path = ''
as $$
  with input as (
    select
      nullif(trim(p_phone), '')                       as phone,
      nullif(trim(p_whatsapp), '')                    as whatsapp,
      nullif(lower(ltrim(trim(p_instagram), '@')), '') as instagram,
      nullif(lower(regexp_replace(coalesce(trim(p_website), ''), '^(https?://)?(www\.)?([^/?#:]+).*$', '\3')), '') as website_host,
      nullif(lower(trim(p_brand_name)), '')           as brand,
      nullif(lower(trim(p_city)), '')                 as city
  )
  select l.*
  from public.leads l, input i
  where (p_exclude_id is null or l.id <> p_exclude_id)
    and (
         (i.phone     is not null and (l.phone = i.phone     or l.whatsapp = i.phone))
      or (i.whatsapp  is not null and (l.phone = i.whatsapp  or l.whatsapp = i.whatsapp))
      or (i.instagram is not null and l.instagram = i.instagram)
      or (i.website_host is not null and l.website_host = i.website_host)
      or (i.brand is not null and i.city is not null
          and lower(trim(l.brand_name)) = i.brand
          and lower(trim(coalesce(l.city, ''))) = i.city)
    )
  order by l.created_at asc
  limit 10;
$$;

-- ---------------------------------------------------------------------
-- Smart search: one query string, matches tracking ID, brand, owner,
-- phone / WhatsApp (digits only, with or without +91, spaces, dashes),
-- Instagram and website.
-- ---------------------------------------------------------------------
create or replace function public.search_leads(p_query text default '', p_limit integer default 50)
returns setof public.leads
language sql
stable
security invoker
set search_path = ''
as $$
  with raw as (
    select coalesce(trim(p_query), '') as t
  ), input as (
    select
      t,
      -- escape LIKE wildcards in user input
      replace(replace(replace(t, '\', '\\'), '%', '\%'), '_', '\_') as esc,
      replace(replace(replace(lower(ltrim(t, '@')), '\', '\\'), '%', '\%'), '_', '\_') as esc_ig,
      ltrim(regexp_replace(t, '\D', '', 'g'), '0') as digits
    from raw
  )
  select l.*
  from public.leads l, input i
  where i.t = ''
     or l.tracking_id ilike '%' || i.esc || '%'
     or l.brand_name  ilike '%' || i.esc || '%'
     or l.owner_name  ilike '%' || i.esc || '%'
     or l.instagram   ilike '%' || i.esc_ig || '%'
     or l.website     ilike '%' || i.esc || '%'
     or l.email       ilike '%' || i.esc || '%'
     or (length(i.digits) >= 4 and (
            ltrim(l.phone, '+')    like '%' || i.digits || '%'
         or ltrim(l.whatsapp, '+') like '%' || i.digits || '%'
        ))
  order by
    (upper(l.tracking_id) = upper(i.t)) desc,
    l.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

-- ---------------------------------------------------------------------
-- Row Level Security: only owners listed in app_owners
-- ---------------------------------------------------------------------
alter table public.leads  enable row level security;
alter table public.niches enable row level security;

drop policy if exists "owner full access" on public.leads;
create policy "owner full access" on public.leads
  for all to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

drop policy if exists "owner full access" on public.niches;
create policy "owner full access" on public.niches
  for all to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

revoke all on public.leads, public.niches from anon;
grant select, insert, update, delete on public.leads, public.niches to authenticated;
grant execute on function public.search_leads(text, integer) to authenticated;
grant execute on function public.find_duplicate_leads(text, text, text, text, text, text, uuid) to authenticated;
grant execute on function public.is_owner() to authenticated;
revoke execute on function public.search_leads(text, integer) from anon;
revoke execute on function public.find_duplicate_leads(text, text, text, text, text, text, uuid) from anon;

-- ---------------------------------------------------------------------
-- Default niches
-- ---------------------------------------------------------------------
insert into public.niches (name) values
  ('Clothing Brand'), ('Jewellery'), ('Footwear'), ('Cosmetics & Skincare'),
  ('Home Decor'), ('Restaurant / Cafe'), ('Fitness'), ('Electronics')
on conflict do nothing;

-- ===== 20261107000000_phase2_pdf_import_logos.sql =====
-- =====================================================================
-- Zyntra Lead ID System — Phase 2: PDF import + automatic logos
-- Run AFTER 20261106000000_init.sql (Supabase → SQL Editor → Run).
-- Safe to run more than once.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Imports
-- ---------------------------------------------------------------------
do $$ begin
  create type public.import_status as enum ('processing', 'review', 'done', 'failed');
exception when duplicate_object then null; end $$;

create table if not exists public.imports (
  id          uuid primary key default gen_random_uuid(),
  file_name   text not null,
  file_path   text,                 -- path inside the private "imports" bucket
  file_size   bigint,
  page_count  integer,
  uploaded_at timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  status      public.import_status not null default 'processing',
  progress    text,                 -- human readable step, shown while processing
  auto_save   boolean not null default false,
  total_found integer not null default 0,
  added       integer not null default 0,
  merged      integer not null default 0,
  skipped     integer not null default 0,
  error       text,
  items       jsonb not null default '[]'::jsonb,  -- extracted leads awaiting review
  results     jsonb not null default '[]'::jsonb   -- per-row outcome after saving
);
create index if not exists imports_uploaded_at_idx on public.imports (uploaded_at desc);

create or replace function public.imports_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists imports_touch on public.imports;
create trigger imports_touch before update on public.imports
  for each row execute function public.imports_touch();

alter table public.imports enable row level security;
drop policy if exists "owner full access" on public.imports;
create policy "owner full access" on public.imports
  for all to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));
revoke all on public.imports from anon;
grant select, insert, update, delete on public.imports to authenticated;

-- ---------------------------------------------------------------------
-- Leads: import link + logo status
-- ---------------------------------------------------------------------
alter table public.leads
  add column if not exists import_id uuid references public.imports (id) on delete set null,
  add column if not exists logo_status text not null default 'pending',
  add column if not exists logo_source text,           -- apple_touch_icon | og_image | favicon | upload
  add column if not exists logo_checked_at timestamptz;

do $$ begin
  alter table public.leads add constraint leads_logo_status_check
    check (logo_status in ('pending', 'found', 'not_found'));
exception when duplicate_object then null; end $$;

create index if not exists leads_import_id_idx   on public.leads (import_id);
create index if not exists leads_logo_status_idx on public.leads (logo_status) where logo_status = 'pending';

-- Existing leads: anything with a logo is "found", the rest will be looked up.
update public.leads set logo_status = 'found' where logo_url is not null and logo_status = 'pending';
update public.leads set logo_status = 'not_found' where logo_url is null and website is null and logo_status = 'pending';

-- ---------------------------------------------------------------------
-- Storage buckets
--   imports: PRIVATE, PDFs only, 20 MB
--   logos:   PUBLIC read (logo images are not secret; paths are random UUIDs), 5 MB
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('imports', 'imports', false, 20971520, array['application/pdf']),
  ('logos',   'logos',   true,  5242880,
     array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/x-icon', 'image/vnd.microsoft.icon'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "owner reads imports"   on storage.objects;
drop policy if exists "owner uploads imports" on storage.objects;
drop policy if exists "owner updates imports" on storage.objects;
drop policy if exists "owner deletes imports" on storage.objects;
drop policy if exists "owner reads logos"     on storage.objects;
drop policy if exists "owner uploads logos"   on storage.objects;
drop policy if exists "owner updates logos"   on storage.objects;
drop policy if exists "owner deletes logos"   on storage.objects;

create policy "owner reads imports" on storage.objects for select to authenticated
  using (bucket_id = 'imports' and (select public.is_owner()));
create policy "owner uploads imports" on storage.objects for insert to authenticated
  with check (bucket_id = 'imports' and (select public.is_owner()));
create policy "owner updates imports" on storage.objects for update to authenticated
  using (bucket_id = 'imports' and (select public.is_owner()));
create policy "owner deletes imports" on storage.objects for delete to authenticated
  using (bucket_id = 'imports' and (select public.is_owner()));

-- Public bucket: anyone can GET a logo by URL; only the owner can write.
create policy "owner reads logos" on storage.objects for select to authenticated
  using (bucket_id = 'logos' and (select public.is_owner()));
create policy "owner uploads logos" on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and (select public.is_owner()));
create policy "owner updates logos" on storage.objects for update to authenticated
  using (bucket_id = 'logos' and (select public.is_owner()));
create policy "owner deletes logos" on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and (select public.is_owner()));

-- ===== 20261108000000_phase3_pipeline.sql =====
-- =====================================================================
-- Zyntra Lead ID System — Phase 3: sales pipeline
-- status enum, timeline, follow-ups, score, tags, filters, web push.
-- Run AFTER the Phase 1 and Phase 2 migrations. Safe to run more than once.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Status as an enum
--    Add stages later with:  alter type public.lead_status add value 'Negotiation' before 'Deal Closed';
-- ---------------------------------------------------------------------
do $$ begin
  create type public.lead_status as enum ('New', 'Contacted', 'Interested', 'Deal Closed', 'Rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'leads' and column_name = 'status') = 'text' then
    alter table public.leads alter column status drop default;
    alter table public.leads alter column status type public.lead_status using (
      case status
        when 'Contacted'      then 'Contacted'
        when 'Follow-up'      then 'Contacted'
        when 'Interested'     then 'Interested'
        when 'Converted'      then 'Deal Closed'
        when 'Deal Closed'    then 'Deal Closed'
        when 'Not Interested' then 'Rejected'
        when 'Rejected'       then 'Rejected'
        else 'New'
      end
    )::public.lead_status;
    alter table public.leads alter column status set default 'New';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. New lead columns: score, priority, contact + follow-up dates
-- ---------------------------------------------------------------------
alter table public.leads
  add column if not exists score             smallint not null default 0,
  add column if not exists score_label       text not null default 'cold',
  add column if not exists score_updated_at  timestamptz,
  add column if not exists priority          boolean not null default false,
  add column if not exists last_contacted_at timestamptz,
  add column if not exists next_followup_at  timestamptz;

do $$ begin
  alter table public.leads add constraint leads_score_range check (score between 0 and 100);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.leads add constraint leads_score_label_check check (score_label in ('hot', 'warm', 'cold'));
exception when duplicate_object then null; end $$;

-- "Last updated" should only move for real edits, not for score / follow-up bookkeeping.
create or replace function public.leads_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  bookkeeping constant text[] := array['score', 'score_label', 'score_updated_at', 'next_followup_at',
                                       'logo_status', 'logo_checked_at', 'updated_at',
                                       'website_host'];  -- generated column: NULL inside BEFORE triggers
begin
  if new.tracking_id is distinct from old.tracking_id then
    raise exception 'tracking_id is immutable (lead %)', old.tracking_id
      using errcode = 'check_violation';
  end if;
  new.created_at := old.created_at;
  if (to_jsonb(new) - bookkeeping) is distinct from (to_jsonb(old) - bookkeeping) then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Timeline
-- ---------------------------------------------------------------------
do $$ begin
  create type public.activity_type as enum (
    'created', 'updated', 'status_changed', 'note_added', 'followup_set', 'followup_done',
    'imported', 'logo_found', 'merged',
    'followup_snoozed', 'tag_added', 'tag_removed', 'priority_changed'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.lead_activities (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads (id) on delete cascade,
  type       public.activity_type not null,
  details    jsonb not null default '{}'::jsonb,
  -- owner | claude | gpt | system | any other AI name
  actor      text not null default 'owner' check (length(actor) between 1 and 40),
  created_at timestamptz not null default now()
);
create index if not exists lead_activities_lead_idx on public.lead_activities (lead_id, created_at desc);

-- ---------------------------------------------------------------------
-- 4. Follow-ups
-- ---------------------------------------------------------------------
create table if not exists public.followups (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads (id) on delete cascade,
  due_at      timestamptz not null,
  note        text check (note is null or length(note) <= 500),
  done        boolean not null default false,
  done_at     timestamptz,
  notified_at timestamptz,            -- push notification sent (reset on snooze)
  actor       text not null default 'owner',
  created_at  timestamptz not null default now()
);
create index if not exists followups_due_idx  on public.followups (due_at) where not done;
create index if not exists followups_lead_idx on public.followups (lead_id, due_at);

-- Keep leads.next_followup_at = earliest open follow-up (used for sorting / "due" filter).
create or replace function public.followups_sync_lead()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids uuid[];
begin
  if tg_op = 'DELETE' then ids := array[old.lead_id];
  elsif tg_op = 'UPDATE' then ids := array[old.lead_id, new.lead_id];
  else ids := array[new.lead_id];
  end if;
  update public.leads l
     set next_followup_at = (select min(f.due_at) from public.followups f where f.lead_id = l.id and not f.done)
   where l.id = any(ids);
  return null;
end;
$$;

drop trigger if exists followups_sync_lead on public.followups;
create trigger followups_sync_lead
  after insert or update of due_at, done, lead_id or delete on public.followups
  for each row execute function public.followups_sync_lead();

-- ---------------------------------------------------------------------
-- 5. Tags
-- ---------------------------------------------------------------------
create table if not exists public.tags (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) between 1 and 40),
  color      text not null default 'slate',
  created_at timestamptz not null default now()
);
create unique index if not exists tags_name_unique_ci on public.tags (lower(name));

create table if not exists public.lead_tags (
  lead_id    uuid not null references public.leads (id) on delete cascade,
  tag_id     uuid not null references public.tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (lead_id, tag_id)
);
create index if not exists lead_tags_tag_idx on public.lead_tags (tag_id, lead_id);

-- ---------------------------------------------------------------------
-- 6. Web push subscriptions
-- ---------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users (id) on delete cascade default auth.uid(),
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

-- ---------------------------------------------------------------------
-- 7. Indexes for filters / sorting (fast with 50,000+ leads)
-- ---------------------------------------------------------------------
create index if not exists leads_status_idx      on public.leads (status);
create index if not exists leads_score_idx       on public.leads (score desc, created_at desc);
create index if not exists leads_score_label_idx on public.leads (score_label);
create index if not exists leads_country_idx     on public.leads (country);
create index if not exists leads_city_ci_idx     on public.leads (lower(city));
create index if not exists leads_source_idx      on public.leads (source);
create index if not exists leads_next_followup_idx on public.leads (next_followup_at) where next_followup_at is not null;
create index if not exists leads_niche_state_idx on public.leads (niche, state);
create index if not exists leads_brand_lower_idx on public.leads (lower(brand_name));
create index if not exists leads_score_stale_idx on public.leads (last_contacted_at) where last_contacted_at is not null;
create index if not exists leads_email_trgm      on public.leads using gin (email gin_trgm_ops);
create index if not exists leads_instagram_trgm  on public.leads using gin (instagram gin_trgm_ops);
create index if not exists leads_website_trgm    on public.leads using gin (website gin_trgm_ops);
create index if not exists leads_phone_trgm      on public.leads using gin (phone gin_trgm_ops);
create index if not exists leads_whatsapp_trgm   on public.leads using gin (whatsapp gin_trgm_ops);

-- ---------------------------------------------------------------------
-- 8. list_leads: smart search + filters + sort + pagination in one call.
--    Returns {"total": n, "rows": [lead + "tags": [...]]}
-- ---------------------------------------------------------------------
create or replace function public.list_leads(
  p_query        text default '',
  p_niches       text[] default null,
  p_countries    text[] default null,
  p_states       text[] default null,
  p_cities       text[] default null,
  p_statuses     public.lead_status[] default null,
  p_score_labels text[] default null,
  p_tag_ids      uuid[] default null,      -- lead must have ALL of these tags
  p_sources      public.lead_source[] default null,
  p_created_from timestamptz default null,
  p_created_to   timestamptz default null,
  p_due_before   timestamptz default null, -- has an open follow-up due before this time
  p_priority     boolean default null,
  p_sort         text default 'newest',    -- newest | score | followup | name
  p_limit        integer default 30,
  p_offset       integer default 0
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with input as (
    select
      coalesce(trim(p_query), '') as t,
      replace(replace(replace(coalesce(trim(p_query), ''), '\', '\\'), '%', '\%'), '_', '\_') as esc,
      replace(replace(replace(lower(ltrim(coalesce(trim(p_query), ''), '@')), '\', '\\'), '%', '\%'), '_', '\_') as esc_ig,
      ltrim(regexp_replace(coalesce(p_query, ''), '\D', '', 'g'), '0') as digits,
      (select array_agg(lower(c)) from unnest(p_cities) c) as cities
  ),
  filtered as (
    select l.*
    from public.leads l, input i
    where (i.t = ''
        or l.tracking_id ilike '%' || i.esc || '%'
        or l.brand_name  ilike '%' || i.esc || '%'
        or l.owner_name  ilike '%' || i.esc || '%'
        or l.instagram   ilike '%' || i.esc_ig || '%'
        or l.website     ilike '%' || i.esc || '%'
        or l.email       ilike '%' || i.esc || '%'
        or (length(i.digits) >= 4 and (l.phone like '%' || i.digits || '%' or l.whatsapp like '%' || i.digits || '%')))
      and (p_niches       is null or l.niche = any(p_niches))
      and (p_countries    is null or l.country = any(p_countries))
      and (p_states       is null or l.state = any(p_states))
      and (i.cities       is null or lower(l.city) = any(i.cities))
      and (p_statuses     is null or l.status = any(p_statuses))
      and (p_score_labels is null or l.score_label = any(p_score_labels))
      and (p_sources      is null or l.source = any(p_sources))
      and (p_created_from is null or l.created_at >= p_created_from)
      and (p_created_to   is null or l.created_at <  p_created_to)
      and (p_due_before   is null or l.next_followup_at < p_due_before)
      and (p_priority     is null or l.priority = p_priority)
      and (p_tag_ids is null or (
            select count(*) from public.lead_tags lt
            where lt.lead_id = l.id and lt.tag_id = any(p_tag_ids)
          ) = cardinality(p_tag_ids))
  ),
  ordered as (
    select f.*, row_number() over (
      order by
        (i.t <> '' and upper(f.tracking_id) = upper(i.t)) desc,
        case when p_sort = 'score'    then f.score end desc nulls last,
        case when p_sort = 'followup' then f.next_followup_at end asc nulls last,
        case when p_sort = 'name'     then lower(f.brand_name) end asc,
        f.created_at desc,
        f.id
    ) as ord
    from filtered f, input i
  ),
  page as (
    select * from ordered
    order by ord
    limit greatest(1, least(coalesce(p_limit, 30), 200))
    offset greatest(0, coalesce(p_offset, 0))
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', coalesce((
      select jsonb_agg(
        (to_jsonb(p) - 'ord') || jsonb_build_object('tags', coalesce((
          select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color) order by t.name)
          from public.lead_tags lt join public.tags t on t.id = lt.tag_id
          where lt.lead_id = p.id), '[]'::jsonb))
        order by p.ord)
      from page p
    ), '[]'::jsonb)
  );
$$;

-- Counts for the filter panel (niche first).
create or replace function public.lead_filter_options()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'total', (select count(*) from public.leads),
    'niches', coalesce((select jsonb_agg(jsonb_build_object('value', niche, 'count', n) order by n desc, niche)
                        from (select niche, count(*) n from public.leads where niche is not null group by niche) x), '[]'),
    'countries', coalesce((select jsonb_agg(jsonb_build_object('value', country, 'count', n) order by n desc)
                        from (select country, count(*) n from public.leads group by country) x), '[]'),
    'states', coalesce((select jsonb_agg(jsonb_build_object('value', state, 'count', n) order by n desc, state)
                        from (select state, count(*) n from public.leads group by state) x), '[]'),
    'cities', coalesce((select jsonb_agg(jsonb_build_object('value', city, 'state', state, 'count', n) order by n desc, city)
                        from (select min(city) city, state, count(*) n from public.leads
                              where city is not null group by lower(city), state
                              order by count(*) desc limit 300) x), '[]'),
    'tags', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'value', t.name, 'color', t.color, 'count',
                              (select count(*) from public.lead_tags lt where lt.tag_id = t.id)) order by t.name)
                        from public.tags t), '[]')
  );
$$;

-- ---------------------------------------------------------------------
-- 9. Row Level Security + grants
-- ---------------------------------------------------------------------
alter table public.lead_activities   enable row level security;
alter table public.followups          enable row level security;
alter table public.tags               enable row level security;
alter table public.lead_tags          enable row level security;
alter table public.push_subscriptions enable row level security;

do $$
declare t text;
begin
  foreach t in array array['lead_activities', 'followups', 'tags', 'lead_tags', 'push_subscriptions'] loop
    execute format('drop policy if exists "owner full access" on public.%I', t);
    execute format('create policy "owner full access" on public.%I for all to authenticated
                    using ((select public.is_owner())) with check ((select public.is_owner()))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

grant execute on function public.list_leads(text, text[], text[], text[], text[], public.lead_status[], text[], uuid[], public.lead_source[], timestamptz, timestamptz, timestamptz, boolean, text, integer, integer) to authenticated;
grant execute on function public.lead_filter_options() to authenticated;
revoke execute on function public.list_leads(text, text[], text[], text[], text[], public.lead_status[], text[], uuid[], public.lead_source[], timestamptz, timestamptz, timestamptz, boolean, text, integer, integer) from anon;
revoke execute on function public.lead_filter_options() from anon;

-- ---------------------------------------------------------------------
-- 10. Backfill: a "created" event for leads that existed before Phase 3
-- ---------------------------------------------------------------------
insert into public.lead_activities (lead_id, type, details, actor, created_at)
select l.id, 'created', jsonb_build_object('source', l.source, 'backfilled', true), 'system', l.created_at
from public.leads l
where not exists (select 1 from public.lead_activities a where a.lead_id = l.id);

-- ===== 20261109000000_phase4_dashboard_export_backup.sql =====
-- =====================================================================
-- Zyntra Lead ID System — Phase 4: dashboard, WhatsApp, export, backup
-- Run AFTER the Phase 1–3 migrations. Safe to run more than once.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Make tracking_id generation restore-friendly:
--    keep auto-generating for new leads, but preserve an id that is
--    supplied explicitly (so a backup restore keeps the original IDs).
-- ---------------------------------------------------------------------
create or replace function public.leads_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.country := upper(coalesce(nullif(trim(new.country), ''), 'IN'));
  new.state   := upper(trim(new.state));
  if new.tracking_id is null or new.tracking_id = '' then
    new.tracking_id := public.next_tracking_id(new.country, new.state);
  end if;
  new.created_at  := coalesce(new.created_at, now());
  new.updated_at  := now();
  return new;
end;
$$;

-- Recompute the per-country/state counters from the leads that exist, so IDs
-- generated after a restore never collide with restored ones.
create or replace function public.resync_tracking_counters()
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.tracking_counters (country, state, last_serial)
  select split_part(tracking_id, '-', 2), split_part(tracking_id, '-', 3),
         max((split_part(tracking_id, '-', 4))::int)
  from public.leads
  where tracking_id ~ '^ZYN-[A-Z]{2}-[A-Z]{2}-[0-9]+$'
  group by 1, 2
  on conflict (country, state)
  do update set last_serial = greatest(public.tracking_counters.last_serial, excluded.last_serial);
$$;
grant execute on function public.resync_tracking_counters() to authenticated;
revoke execute on function public.resync_tracking_counters() from anon;

-- ---------------------------------------------------------------------
-- 1. New activity types (WhatsApp, export, backup, restore)
-- ---------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_enum where enumtypid = 'public.activity_type'::regtype and enumlabel = 'whatsapp_opened') then
    alter type public.activity_type add value 'whatsapp_opened';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. WhatsApp message templates
--    Body supports {brand_name} {owner_name} {city} {niche} {tracking_id} {state}
-- ---------------------------------------------------------------------
create table if not exists public.message_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) between 1 and 60),
  body       text not null check (length(body) between 1 and 2000),
  sort       integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists message_templates_touch on public.message_templates;
create trigger message_templates_touch before update on public.message_templates
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 3. Export log
-- ---------------------------------------------------------------------
create table if not exists public.exports (
  id         uuid primary key default gen_random_uuid(),
  format     text not null check (format in ('xlsx', 'pdf', 'profile_pdf')),
  lead_count integer not null default 0,
  filters    jsonb not null default '{}'::jsonb,
  columns    jsonb,
  actor      text not null default 'owner',
  created_at timestamptz not null default now()
);
create index if not exists exports_created_idx on public.exports (created_at desc);

-- ---------------------------------------------------------------------
-- 4. Backups log (the files live in the private "backups" storage bucket)
-- ---------------------------------------------------------------------
create table if not exists public.backups (
  id          uuid primary key default gen_random_uuid(),
  json_path   text not null,
  xlsx_path   text,
  size_bytes  bigint not null default 0,
  lead_count  integer not null default 0,
  table_counts jsonb not null default '{}'::jsonb,
  kind        text not null default 'manual' check (kind in ('manual', 'auto')),
  actor       text not null default 'owner',
  created_at  timestamptz not null default now()
);
create index if not exists backups_created_idx on public.backups (created_at desc);

-- ---------------------------------------------------------------------
-- 5. Private storage bucket for backups
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('backups', 'backups', false, 209715200, null)   -- 200 MB
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

do $$
declare op text;
begin
  foreach op in array array['select', 'insert', 'update', 'delete'] loop
    execute format('drop policy if exists "owner %s backups" on storage.objects', op);
    if op = 'insert' then
      execute 'create policy "owner insert backups" on storage.objects for insert to authenticated with check (bucket_id = ''backups'' and (select public.is_owner()))';
    else
      execute format('create policy "owner %1$s backups" on storage.objects for %1$s to authenticated using (bucket_id = ''backups'' and (select public.is_owner()))', op);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 6. RLS + grants for the new tables
-- ---------------------------------------------------------------------
alter table public.message_templates enable row level security;
alter table public.exports           enable row level security;
alter table public.backups           enable row level security;

do $$
declare t text;
begin
  foreach t in array array['message_templates', 'exports', 'backups'] loop
    execute format('drop policy if exists "owner full access" on public.%I', t);
    execute format('create policy "owner full access" on public.%I for all to authenticated
                    using ((select public.is_owner())) with check ((select public.is_owner()))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 7. Starter templates (only if the table is empty)
-- ---------------------------------------------------------------------
insert into public.message_templates (name, body, sort)
select * from (values
  ('First intro',
   E'Hello {owner_name}! This is Zyntra. We loved {brand_name}''s work in {city}. We help {niche} businesses grow their sales. Could we share a few ideas with you?',
   1),
  ('Follow-up',
   E'Hi {owner_name}, just following up about {brand_name}. Did you get a chance to look at what we shared? Happy to answer any questions. — Zyntra',
   2),
  ('Special offer',
   E'Hi {owner_name}! For {brand_name} we have a special festive offer this month. Shall I send you the details? — Zyntra (ref {tracking_id})',
   3)
) as v(name, body, sort)
where not exists (select 1 from public.message_templates);

-- ---------------------------------------------------------------------
-- 8. Dashboard stats — one fast call for cards + charts over a date range.
--    p_from / p_to bound the "new leads", charts and activity; the headline
--    totals (total leads, hot, due today, deals) are always all-time / today.
-- ---------------------------------------------------------------------
create or replace function public.dashboard_stats(
  p_from timestamptz default null,
  p_to   timestamptz default null,
  p_bucket text default 'day'          -- 'day' | 'week'
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select coalesce(p_from, '-infinity'::timestamptz) as f,
           coalesce(p_to, now()) as t,
           case when p_bucket = 'week' then 'week' else 'day' end as g
  ),
  ranged as (
    select l.* from public.leads l, bounds b where l.created_at >= b.f and l.created_at < b.t
  ),
  week_start as (select date_trunc('week', (now() at time zone 'Asia/Kolkata'))),
  month_start as (select date_trunc('month', (now() at time zone 'Asia/Kolkata')))
  select jsonb_build_object(
    'cards', jsonb_build_object(
      'total', (select count(*) from public.leads),
      'new_this_week', (select count(*) from public.leads where (created_at at time zone 'Asia/Kolkata') >= (select * from week_start)),
      'new_this_month', (select count(*) from public.leads where (created_at at time zone 'Asia/Kolkata') >= (select * from month_start)),
      'hot', (select count(*) from public.leads where score_label = 'hot'),
      'due_today', (select count(*) from public.followups f where not f.done
                    and f.due_at < date_trunc('day', (now() at time zone 'Asia/Kolkata') + interval '1 day') at time zone 'Asia/Kolkata'),
      'deals_closed', (select count(*) from public.leads where status = 'Deal Closed'),
      'contacted_plus', (select count(*) from public.leads where status in ('Contacted','Interested','Deal Closed','Rejected')),
      'new_in_range', (select count(*) from ranged)
    ),
    'funnel', (
      select jsonb_agg(jsonb_build_object('status', s.status, 'count', coalesce(c.n, 0)) order by s.ord)
      from (values ('New'::public.lead_status,1),('Contacted',2),('Interested',3),('Deal Closed',4),('Rejected',5)) s(status, ord)
      left join (select status, count(*) n from public.leads group by status) c on c.status = s.status
    ),
    'by_state', (
      select coalesce(jsonb_agg(jsonb_build_object('key', state, 'count', n) order by n desc, state), '[]')
      from (select state, count(*) n from ranged group by state order by n desc limit 15) x
    ),
    'by_niche', (
      select coalesce(jsonb_agg(jsonb_build_object('key', niche, 'count', n) order by n desc, niche), '[]')
      from (select niche, count(*) n from ranged where niche is not null group by niche order by n desc limit 12) x
    ),
    'by_source', (
      select coalesce(jsonb_agg(jsonb_build_object('key', source, 'count', n) order by n desc), '[]')
      from (select source::text, count(*) n from ranged group by source) x
    ),
    'over_time', (
      select coalesce(jsonb_agg(jsonb_build_object('date', d, 'count', n) order by d), '[]')
      from (
        select to_char(date_trunc((select g from bounds), (created_at at time zone 'Asia/Kolkata')), 'YYYY-MM-DD') d, count(*) n
        from ranged group by 1 order by 1
      ) x
    )
  );
$$;

-- Recent activity across all leads (for the dashboard feed).
create or replace function public.recent_activity(p_limit integer default 10)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(row_to_json(a) order by a.created_at desc), '[]')
  from (
    select act.id, act.type, act.details, act.actor, act.created_at,
           l.tracking_id, l.brand_name, l.logo_url
    from public.lead_activities act
    join public.leads l on l.id = act.lead_id
    order by act.created_at desc
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  ) a;
$$;

grant execute on function public.dashboard_stats(timestamptz, timestamptz, text) to authenticated;
grant execute on function public.recent_activity(integer) to authenticated;
revoke execute on function public.dashboard_stats(timestamptz, timestamptz, text) from anon;
revoke execute on function public.recent_activity(integer) from anon;

-- ===== 20261110000000_phase5_api_mcp.sql =====
-- =====================================================================
-- Zyntra Lead ID System — Phase 5: REST API + MCP server
-- API keys, request log, rate limiting, and OAuth 2.1 for the MCP connector.
-- Run AFTER the Phase 1–4 migrations. Safe to run more than once.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. API keys
--    Only the SHA-256 hash is stored; the plain key is shown once at
--    creation. The key's `name` is used as the timeline actor.
-- ---------------------------------------------------------------------
create table if not exists public.api_keys (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) between 1 and 40),
  key_hash     text not null unique,
  key_prefix   text not null,                 -- e.g. "zyn_live_ab12cd34" for display
  scopes       text[] not null default array['read']::text[],
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz,
  constraint api_keys_scopes_valid check (scopes <@ array['read','write']::text[])
);
create index if not exists api_keys_hash_idx on public.api_keys (key_hash) where revoked_at is null;

-- ---------------------------------------------------------------------
-- 2. API request log
-- ---------------------------------------------------------------------
create table if not exists public.api_logs (
  id          bigint generated always as identity primary key,
  key_id      uuid references public.api_keys (id) on delete set null,
  surface     text not null default 'rest' check (surface in ('rest','mcp')),
  route       text not null,
  method      text not null,
  status      integer not null,
  duration_ms integer,
  created_at  timestamptz not null default now()
);
create index if not exists api_logs_created_idx on public.api_logs (created_at desc);
create index if not exists api_logs_key_idx on public.api_logs (key_id, created_at desc);

-- ---------------------------------------------------------------------
-- 3. Rate limiting — fixed window counter per key.
--    Returns a row: allowed (bool), remaining (int), reset_at (timestamptz).
-- ---------------------------------------------------------------------
create table if not exists public.api_rate_counters (
  key_id       uuid not null references public.api_keys (id) on delete cascade,
  window_start timestamptz not null,
  count        integer not null default 0,
  primary key (key_id, window_start)
);

create or replace function public.api_rate_hit(p_key uuid, p_limit integer, p_window_seconds integer default 60)
returns table(allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count  integer;
begin
  insert into public.api_rate_counters (key_id, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key_id, window_start)
  do update set count = public.api_rate_counters.count + 1
  returning count into v_count;

  -- Opportunistic cleanup of old windows for this key.
  delete from public.api_rate_counters
  where key_id = p_key and window_start < v_window - make_interval(secs => p_window_seconds * 5);

  return query select v_count <= p_limit, greatest(0, p_limit - v_count), v_window + make_interval(secs => p_window_seconds);
end;
$$;
revoke all on function public.api_rate_hit(uuid, integer, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. OAuth 2.1 (for adding the MCP server as a connector in claude.ai)
--    Dynamic Client Registration + authorization code + PKCE.
-- ---------------------------------------------------------------------
create table if not exists public.oauth_clients (
  id               uuid primary key default gen_random_uuid(),
  client_id        text not null unique,
  client_secret    text,                       -- null for public (PKCE) clients
  client_name      text,
  redirect_uris    text[] not null default '{}',
  grant_types      text[] not null default array['authorization_code','refresh_token'],
  scopes           text[] not null default array['read','write'],
  created_at       timestamptz not null default now()
);

create table if not exists public.oauth_auth_codes (
  code                  text primary key,
  client_id             text not null,
  user_id               uuid not null references auth.users (id) on delete cascade,
  redirect_uri          text not null,
  scopes                text[] not null default array['read'],
  code_challenge        text,
  code_challenge_method text,
  expires_at            timestamptz not null,
  created_at            timestamptz not null default now()
);

create table if not exists public.oauth_tokens (
  id             uuid primary key default gen_random_uuid(),
  access_hash    text not null unique,
  refresh_hash   text unique,
  client_id      text not null,
  user_id        uuid references auth.users (id) on delete cascade,
  scopes         text[] not null default array['read'],
  expires_at     timestamptz not null,
  revoked_at     timestamptz,
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz
);
create index if not exists oauth_tokens_access_idx on public.oauth_tokens (access_hash) where revoked_at is null;

-- ---------------------------------------------------------------------
-- 5. RLS
--    api_keys: the owner manages keys in the app (never exposed to the API).
--    api_logs: owner can read. Everything else is touched only by the
--    service-role client (API/MCP) or security-definer functions.
-- ---------------------------------------------------------------------
alter table public.api_keys          enable row level security;
alter table public.api_logs          enable row level security;
alter table public.api_rate_counters enable row level security;
alter table public.oauth_clients     enable row level security;
alter table public.oauth_auth_codes  enable row level security;
alter table public.oauth_tokens      enable row level security;

drop policy if exists "owner manages api keys" on public.api_keys;
create policy "owner manages api keys" on public.api_keys for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

drop policy if exists "owner reads api logs" on public.api_logs;
create policy "owner reads api logs" on public.api_logs for select to authenticated
  using ((select public.is_owner()));

revoke all on public.api_keys, public.api_logs from anon;
grant select, insert, update, delete on public.api_keys to authenticated;
grant select on public.api_logs to authenticated;
-- No policies on api_rate_counters / oauth_* : only service-role + definer functions use them.

grant execute on function public.api_rate_hit(uuid, integer, integer) to service_role;

-- ---------------------------------------------------------------------
-- 6. Maintenance: drop expired auth codes / tokens (call from cron)
-- ---------------------------------------------------------------------
create or replace function public.oauth_cleanup()
returns void language sql security definer set search_path = '' as $$
  delete from public.oauth_auth_codes where expires_at < now();
  delete from public.oauth_tokens where expires_at < now() - interval '30 days';
$$;
