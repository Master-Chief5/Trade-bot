-- Temporary handoffs: an RA passing a night's check to someone outside the dorm.
--
-- The person covering is not a member and never becomes one. They scan a QR code that
-- carries a one-time key in the URL *fragment*, which browsers do not send to servers, so
-- everything below is ciphertext this database cannot read:
--
--   payload      the roster for that one floor and those dates, sealed under the one-time key K
--   wrapped_key  K sealed under the dorm key, so a dean's device can read the claim and result
--   claim        the coverer's typed name, sealed under K
--   results      each completed check, sealed under K
--
-- The server enforces only what must be enforced centrally and needs no plaintext to do it:
-- a code may be claimed once, within its window, and results may arrive only from the device
-- that claimed it, only for the dates it covers.

create table if not exists public.handoffs (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  created_by_device uuid references public.devices(id) on delete set null,
  key_version int not null,
  -- Sealed under the one-time key in the QR code.
  payload text not null,
  -- The one-time key, sealed under the dorm key, for the dorm's own devices.
  wrapped_key text not null,
  covers_from date not null,
  covers_to date not null,
  -- The QR code stops working after this. Short by design: it is scanned face to face.
  expires_at timestamptz not null,
  claimed_at timestamptz,
  claim text,
  -- sha256 of the access token handed to the claimer, so the token itself is never stored.
  token_hash bytea,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists handoffs_dorm_idx on public.handoffs (dorm_id, created_at desc);

create table if not exists public.handoff_results (
  id bigint generated always as identity primary key,
  handoff_id uuid not null references public.handoffs(id) on delete cascade,
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  -- One completed check, sealed under the same one-time key.
  payload text not null,
  created_at timestamptz not null default now()
);

create index if not exists handoff_results_idx on public.handoff_results (dorm_id, id);

alter table public.handoffs enable row level security;
alter table public.handoff_results enable row level security;

-- Members of the dorm see and manage their own handoffs. Nobody else reaches these tables
-- directly; the person covering goes through the three functions below and nothing else.
create policy handoffs_select on public.handoffs for select to authenticated
  using (public.is_active_member(dorm_id));

create policy handoffs_insert on public.handoffs for insert to authenticated
  with check (public.is_active_member(dorm_id) and public.owns_device(created_by_device));

create policy handoffs_update on public.handoffs for update to authenticated
  using (public.is_active_member(dorm_id) and (public.is_dean(dorm_id) or public.owns_device(created_by_device)))
  with check (public.is_active_member(dorm_id));

create policy handoffs_delete on public.handoffs for delete to authenticated
  using (public.is_active_member(dorm_id) and (public.is_dean(dorm_id) or public.owns_device(created_by_device)));

create policy handoff_results_select on public.handoff_results for select to authenticated
  using (public.is_active_member(dorm_id));

create policy handoff_results_delete on public.handoff_results for delete to authenticated
  using (public.is_dean(dorm_id));

-- ---------------------------------------------------------------------------
-- The three things an unauthenticated coverer may do, and nothing else.
-- ---------------------------------------------------------------------------

-- Claim a code. Succeeds once, inside the window, and returns an access token that is
-- shown to nobody again: only its hash is kept. Racing scanners are settled by the
-- conditional update, so exactly one of them wins.
create or replace function public.claim_handoff(p_id uuid, p_claim text)
returns table (payload text, covers_from date, covers_to date, access_token text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text;
begin
  if p_claim is null or length(p_claim) = 0 or length(p_claim) > 4000 then
    raise exception 'bad claim';
  end if;
  v_token := encode(extensions.gen_random_bytes(32), 'base64');

  return query
  update public.handoffs h
     set claimed_at = now(),
         claim = p_claim,
         token_hash = extensions.digest(v_token, 'sha256')
   where h.id = p_id
     and h.claimed_at is null
     and h.revoked_at is null
     and h.expires_at > now()
  returning h.payload, h.covers_from, h.covers_to, v_token;
end;
$$;

-- Re-open a handoff already claimed on this device, for a multi-night cover.
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
     and current_date <= h.covers_to;
$$;

-- Hand back one completed check. Only the claimer's token opens this, only while the
-- cover still runs, and only up to a sane number of results per handoff.
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
     and current_date <= h.covers_to;
  if v_dorm is null then
    return false;
  end if;
  -- A cover runs for a bounded number of nights; this caps a runaway or malicious client.
  if (select count(*) from public.handoff_results r where r.handoff_id = p_id) >= 100 then
    return false;
  end if;
  insert into public.handoff_results (handoff_id, dorm_id, payload) values (p_id, v_dorm, p_payload);
  return true;
end;
$$;

revoke all on function public.claim_handoff(uuid, text) from public;
revoke all on function public.open_handoff(uuid, text) from public;
revoke all on function public.submit_handoff_result(uuid, text, text) from public;
grant execute on function public.claim_handoff(uuid, text) to anon, authenticated;
grant execute on function public.open_handoff(uuid, text) to anon, authenticated;
grant execute on function public.submit_handoff_result(uuid, text, text) to anon, authenticated;

alter publication supabase_realtime add table public.handoff_results;
