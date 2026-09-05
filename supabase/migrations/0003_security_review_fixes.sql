-- Fixes from a security review of the sync design.

-- 1. Join codes from a CSPRNG rather than the session PRNG. 32 characters divides
--    256 evenly, so no modulo bias.
create or replace function public.new_join_code() returns text
language plpgsql set search_path = '' as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  b bytea;
  i int;
begin
  b := extensions.gen_random_bytes(6);
  for i in 0..5 loop
    code := code || substr(alphabet, 1 + (get_byte(b, i) % 32), 1);
  end loop;
  return code;
end;
$$;
revoke execute on function public.new_join_code() from public, anon, authenticated;

-- 2. Re-granting a key to a device that already has a row for that version is an
--    UPDATE. Without this policy the upsert fails outright.
create policy grants_update on public.key_grants for update to authenticated
  using (public.is_dean(dorm_id) and public.owns_device(granter_device_id))
  with check (public.is_dean(dorm_id) and public.owns_device(granter_device_id));

-- 3. A member could delete their own membership row, erasing the record of their
--    removal, or (as the only dean) leave a dorm nobody can ever administer again.
--    Cancelling your own request that has not been decided yet is still fine.
drop policy memberships_delete on public.memberships;
create policy memberships_delete on public.memberships for delete to authenticated
  using (public.is_dean(dorm_id) or (user_id = auth.uid() and status = 'pending'));

-- 4. Names and the account-to-device graph were readable by every account on the
--    deployment. Scope them to people who actually share a dorm with the caller.
create or replace function public.shares_dorm(other uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.dorm_id = mine.dorm_id
    where mine.user_id = auth.uid() and theirs.user_id = other
  );
$$;
revoke execute on function public.shares_dorm(uuid) from public, anon;
grant execute on function public.shares_dorm(uuid) to authenticated;

drop policy profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_dorm(id));

drop policy devices_read on public.devices;
create policy devices_read on public.devices for select to authenticated
  using (user_id = auth.uid() or public.shares_dorm(user_id));

-- 5. The join code is a secret you lose when you are removed. Only deans read it now;
--    everyone with a membership row still sees the dorm's name.
drop policy dorms_read on public.dorms;
create policy dorms_read on public.dorms for select to authenticated
  using (public.has_membership(id));

create or replace function public.dorm_join_code(p_dorm uuid) returns text
language sql security definer stable set search_path = public as $$
  select case when public.is_dean(p_dorm) then d.join_code end from public.dorms d where d.id = p_dorm;
$$;
revoke execute on function public.dorm_join_code(uuid) from public, anon;
grant execute on function public.dorm_join_code(uuid) to authenticated;

-- 6. A device that misses a key rotation must not be able to keep writing under the
--    old key, which a removed member still holds.
create or replace function public.check_event_key_version() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.key_version <> (select key_version from public.dorms where id = new.dorm_id) then
    raise exception 'stale key version' using errcode = '55000';
  end if;
  return new;
end;
$$;
drop trigger if exists events_key_version on public.events;
create trigger events_key_version before insert on public.events
  for each row execute function public.check_event_key_version();

-- 7. A sealed key must not depend on the granting device's row surviving, and
--    deleting an account or a device must not be blocked by these references.
alter table public.key_grants add column if not exists granter_public_key jsonb;
alter table public.key_grants drop constraint key_grants_granter_device_id_fkey;
alter table public.key_grants alter column granter_device_id drop not null;
alter table public.key_grants add constraint key_grants_granter_device_id_fkey
  foreign key (granter_device_id) references public.devices(id) on delete set null;

alter table public.dorms alter column created_by drop not null;
alter table public.dorms drop constraint dorms_created_by_fkey;
alter table public.dorms add constraint dorms_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table public.memberships drop constraint memberships_decided_by_fkey;
alter table public.memberships add constraint memberships_decided_by_fkey
  foreign key (decided_by) references auth.users(id) on delete set null;
