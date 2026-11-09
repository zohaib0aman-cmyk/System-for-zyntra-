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
