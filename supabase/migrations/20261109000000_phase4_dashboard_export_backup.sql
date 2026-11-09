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
