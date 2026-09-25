-- Phase: per-caller rate limits for the public edge functions.
--
-- Edge functions are stateless, so hit counts live here. Buckets are
-- "<function>:<sha256 of caller IP>" (raw IPs are never stored) and use
-- fixed windows: one row per bucket per window, incremented atomically.
--
-- Only the service role (edge functions) can touch any of this.

create table rate_limits (
  bucket       text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (bucket, window_start)
);

alter table rate_limits enable row level security;
revoke all on rate_limits from anon, authenticated;

-- Records one hit and returns true while the bucket is within p_limit
-- hits for the current p_window_seconds window. Roughly 1 call in 100
-- also sweeps windows older than a day, which is longer than any window
-- the functions use.
create function hit_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz :=
    to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into rate_limits (bucket, window_start, hits)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update set hits = rate_limits.hits + 1
  returning hits into v_hits;

  if random() < 0.01 then
    delete from rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_limit;
end;
$$;

revoke execute on function hit_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function hit_rate_limit(text, integer, integer) to service_role;
