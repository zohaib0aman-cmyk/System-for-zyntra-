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
