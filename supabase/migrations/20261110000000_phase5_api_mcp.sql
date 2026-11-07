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
