-- =====================================================================
-- OPTIONAL: run the follow-up notification job from Supabase every 15 min
-- (instead of Vercel Cron). Run this once in Supabase → SQL Editor.
--
-- Replace the two placeholders first:
--   <YOUR-APP-URL>   e.g. https://zyntra-leads.vercel.app
--   <YOUR-CRON-SECRET>  the same value as the CRON_SECRET env variable
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove an earlier version of the job if you are re-running this.
select cron.unschedule('zyntra-followups')
where exists (select 1 from cron.job where jobname = 'zyntra-followups');

select cron.schedule(
  'zyntra-followups',
  '*/15 * * * *',
  $$
    select net.http_post(
      url     := '<YOUR-APP-URL>/api/cron/followups',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <YOUR-CRON-SECRET>'
      ),
      timeout_milliseconds := 55000
    );
  $$
);

-- Check it:   select * from cron.job;
-- Recent runs: select * from cron.job_run_details order by start_time desc limit 10;

-- =====================================================================
-- OPTIONAL: daily automatic backup at 02:30 (server time)
-- =====================================================================
select cron.unschedule('zyntra-backup')
where exists (select 1 from cron.job where jobname = 'zyntra-backup');

select cron.schedule(
  'zyntra-backup',
  '30 2 * * *',
  $$
    select net.http_post(
      url     := '<YOUR-APP-URL>/api/cron/backup',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <YOUR-CRON-SECRET>'),
      timeout_milliseconds := 290000
    );
  $$
);
