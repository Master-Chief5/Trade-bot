-- Fixes from a second security review.

-- 1. The join code was readable by anyone with a membership row of any status, straight off
--    the dorms table, because the default table grant covers every column. It is a secret you
--    lose when you are removed, so it now leaves the readable columns entirely: the only way
--    to read it is dorm_join_code(), which checks for an active dean.
revoke select on public.dorms from anon, authenticated;
grant select (id, name, key_version, created_by, created_at) on public.dorms to authenticated;

-- 2. shares_dorm() decided who may read names and phone records, and it counted pending and
--    revoked memberships on both sides. Anyone who had ever typed a join code could list the
--    staff and every phone. Now the reader must be active; an active dean may still see the
--    people waiting to be approved and the people just removed, because approving one and
--    cleaning up after the other both read their phones.
create or replace function public.shares_dorm(other uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.dorm_id = mine.dorm_id
    where mine.user_id = auth.uid()
      and mine.status = 'active'
      and theirs.user_id = other
      and (theirs.status = 'active' or mine.role = 'dean')
  );
$$;

-- 3. A handoff result could be sent before the cover started. The dorm's own devices check the
--    date inside each result against the cover; this is the coarse server-side bound. It is a
--    day wide on each side because the server's calendar is UTC and a room check at ten at
--    night in Ontario is already tomorrow in UTC.
create or replace function public.open_handoff(p_id uuid, p_token text)
returns table (payload text, covers_from date, covers_to date)
language sql
security definer
set search_path = public, extensions
as $$
  select h.payload, h.covers_from, h.covers_to
    from public.handoffs h
   where h.id = p_id
     and h.revoked_at is null
     and h.token_hash is not null
     and h.token_hash = extensions.digest(p_token, 'sha256')
     and current_date <= h.covers_to + 1;
$$;

create or replace function public.submit_handoff_result(p_id uuid, p_token text, p_payload text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_dorm uuid;
begin
  if p_payload is null or length(p_payload) > 400000 then
    raise exception 'bad payload';
  end if;
  select h.dorm_id into v_dorm
    from public.handoffs h
   where h.id = p_id
     and h.revoked_at is null
     and h.token_hash is not null
     and h.token_hash = extensions.digest(p_token, 'sha256')
     and current_date >= h.covers_from - 1
     and current_date <= h.covers_to + 1;
  if v_dorm is null then
    return false;
  end if;
  if (select count(*) from public.handoff_results r where r.handoff_id = p_id) >= 100 then
    return false;
  end if;
  insert into public.handoff_results (handoff_id, dorm_id, payload) values (p_id, v_dorm, p_payload);
  return true;
end;
$$;
