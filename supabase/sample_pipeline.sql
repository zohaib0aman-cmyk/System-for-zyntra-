-- =====================================================================
-- Zyntra Lead ID System — Phase 3 SAMPLE pipeline data (FAKE)
-- Run AFTER supabase/seed.sql. Gives the 5 seed leads different statuses,
-- tags, scores and follow-ups (some due today, some overdue) so you can
-- see the pipeline, the "Aaj ke follow-ups" list and notifications working.
-- Re-running it resets these leads' pipeline state.
-- =====================================================================

-- Tags
insert into public.tags (name, color) values
  ('Gujarat', 'amber'), ('Diwali offer', 'rose'), ('Called twice', 'orange'),
  ('High budget', 'emerald'), ('Metro city', 'sky')
on conflict do nothing;

-- Statuses + priority (scores are recomputed below)
update public.leads set status = 'Interested',  priority = true,  last_contacted_at = now() - interval '2 days'  where tracking_id = 'ZYN-IN-GJ-000001';
update public.leads set status = 'Contacted',    priority = false, last_contacted_at = now() - interval '1 day'   where tracking_id = 'ZYN-IN-GJ-000002';
update public.leads set status = 'New',          priority = false                                                 where tracking_id = 'ZYN-IN-MH-000001';
update public.leads set status = 'Deal Closed',  priority = false, last_contacted_at = now() - interval '5 days'   where tracking_id = 'ZYN-IN-RJ-000001';
update public.leads set status = 'Rejected',     priority = false                                                 where tracking_id = 'ZYN-IN-TN-000001';

-- Tags on leads
insert into public.lead_tags (lead_id, tag_id)
select l.id, t.id from public.leads l, public.tags t
where (l.tracking_id = 'ZYN-IN-GJ-000001' and t.name in ('Gujarat', 'Diwali offer', 'High budget'))
   or (l.tracking_id = 'ZYN-IN-GJ-000002' and t.name in ('Gujarat', 'Called twice'))
   or (l.tracking_id = 'ZYN-IN-MH-000001' and t.name in ('Metro city'))
   or (l.tracking_id = 'ZYN-IN-RJ-000001' and t.name in ('High budget'))
on conflict do nothing;

-- Clear any existing follow-ups on these leads, then add fresh ones
delete from public.followups
where lead_id in (select id from public.leads where tracking_id in
  ('ZYN-IN-GJ-000001','ZYN-IN-GJ-000002','ZYN-IN-MH-000001','ZYN-IN-RJ-000001'));

insert into public.followups (lead_id, due_at, note)
select id, now() - interval '3 hours', 'Send Diwali catalogue (overdue)' from public.leads where tracking_id = 'ZYN-IN-GJ-000001'
union all
select id, now() - interval '1 day',   'Call back about bulk order'        from public.leads where tracking_id = 'ZYN-IN-GJ-000002'
union all
select id, now() + interval '4 hours', 'WhatsApp the price list (today)'   from public.leads where tracking_id = 'ZYN-IN-MH-000001'
union all
select id, now() + interval '3 days',  'Check if reorder needed'           from public.leads where tracking_id = 'ZYN-IN-RJ-000001';

-- Some timeline activity
insert into public.lead_activities (lead_id, type, details, actor, created_at)
select id, 'note_added', jsonb_build_object('text', 'Owner is keen, wants festive collection pricing.'), 'owner', now() - interval '2 days'
from public.leads where tracking_id = 'ZYN-IN-GJ-000001';

-- Recompute scores for the changed leads (same formula the app uses)
update public.leads l set
  score = s.score,
  score_label = case when s.score >= 70 then 'hot' when s.score >= 40 then 'warm' else 'cold' end,
  score_updated_at = now()
from (
  select id,
    case when status = 'Rejected' then 0 else least(100,
      (case when phone is not null then 8 else 0 end) +
      (case when whatsapp is not null then 7 else 0 end) +
      (case when instagram is not null then 5 else 0 end) +
      (case when website is not null then 5 else 0 end) +
      (case when logo_url is not null then 3 else 0 end) +
      (case when email is not null then 2 else 0 end) +
      (case status when 'New' then 5 when 'Contacted' then 15 when 'Interested' then 35 when 'Deal Closed' then 40 else 0 end) +
      (case when last_contacted_at is not null and last_contacted_at >= now() - interval '7 days' then 15 else 0 end) +
      (case when priority then 20 else 0 end)
    ) end as score
  from public.leads
  where tracking_id in ('ZYN-IN-GJ-000001','ZYN-IN-GJ-000002','ZYN-IN-MH-000001','ZYN-IN-RJ-000001','ZYN-IN-TN-000001')
) s
where l.id = s.id;

-- Backfill timeline "created" events for the sample leads (real leads get this
-- automatically from addLead; the Phase 3 backfill runs before seed.sql).
insert into public.lead_activities (lead_id, type, details, actor, created_at)
select l.id, 'created', jsonb_build_object('source', l.source, 'tracking_id', l.tracking_id), 'owner', l.created_at
from public.leads l
where not exists (select 1 from public.lead_activities a where a.lead_id = l.id and a.type = 'created');

-- A couple of status-change events so "Recent activity" looks alive
insert into public.lead_activities (lead_id, type, details, actor, created_at)
select id, 'status_changed', jsonb_build_object('old','New','new',status::text), 'owner', now() - interval '1 day'
from public.leads l where l.tracking_id in ('ZYN-IN-GJ-000001','ZYN-IN-RJ-000001')
and not exists (select 1 from public.lead_activities a where a.lead_id = l.id and a.type='status_changed');
