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
