-- Ryan Hall Room Check: end-to-end encrypted sync.
-- The server stores accounts, device public keys, memberships and ciphertext.
-- It never sees a dorm key, a boy's name, a status or a note.

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Device',
  public_key jsonb not null,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index devices_user_idx on public.devices(user_id);

create table public.dorms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text not null unique,
  key_version int not null default 1,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.memberships (
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'ra' check (role in ('dean', 'headra', 'ra')),
  status text not null default 'pending' check (status in ('pending', 'active', 'revoked')),
  requested_at timestamptz not null default now(),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  primary key (dorm_id, user_id)
);

create table public.key_grants (
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  key_version int not null,
  wrapped_key text not null,
  granter_device_id uuid not null references public.devices(id),
  created_at timestamptz not null default now(),
  primary key (dorm_id, device_id, key_version)
);

create table public.events (
  seq bigserial primary key,
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  key_version int not null,
  author_device uuid not null references public.devices(id),
  client_id text not null,
  payload text not null,
  created_at timestamptz not null default now(),
  unique (dorm_id, client_id)
);
create index events_dorm_seq_idx on public.events(dorm_id, seq);

create table public.snapshots (
  id bigserial primary key,
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  key_version int not null,
  upto_seq bigint not null,
  payload text not null,
  created_at timestamptz not null default now()
);
create index snapshots_dorm_idx on public.snapshots(dorm_id, upto_seq desc);

-- ---------- helpers (security definer so policies do not recurse) ----------

create or replace function public.is_active_member(d uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.memberships m where m.dorm_id = d and m.user_id = auth.uid() and m.status = 'active');
$$;

create or replace function public.is_dean(d uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.memberships m where m.dorm_id = d and m.user_id = auth.uid() and m.status = 'active' and m.role = 'dean');
$$;

create or replace function public.has_membership(d uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.memberships m where m.dorm_id = d and m.user_id = auth.uid());
$$;

create or replace function public.owns_device(dev uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.devices x where x.id = dev and x.user_id = auth.uid());
$$;

create or replace function public.new_join_code() returns text
language plpgsql as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  i int;
begin
  for i in 1..6 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return code;
end;
$$;

-- ---------- RPCs ----------

-- A signed-in user creates a dorm and becomes its first active dean.
create or replace function public.create_dorm(p_name text) returns public.dorms
language plpgsql security definer set search_path = public as $$
declare
  d public.dorms;
  code text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  loop
    code := public.new_join_code();
    exit when not exists (select 1 from public.dorms where join_code = code);
  end loop;
  insert into public.dorms (name, join_code, created_by) values (coalesce(nullif(trim(p_name), ''), 'Dorm'), code, auth.uid()) returning * into d;
  insert into public.memberships (dorm_id, user_id, role, status, decided_by, decided_at) values (d.id, auth.uid(), 'dean', 'active', auth.uid(), now());
  return d;
end;
$$;

-- A signed-in user asks to join the dorm behind a join code. Deans approve.
create or replace function public.request_membership(p_code text) returns public.memberships
language plpgsql security definer set search_path = public as $$
declare
  d public.dorms;
  m public.memberships;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into d from public.dorms where join_code = upper(trim(p_code));
  if d.id is null then raise exception 'no dorm has that code'; end if;
  insert into public.memberships (dorm_id, user_id, role, status)
    values (d.id, auth.uid(), 'ra', 'pending')
    on conflict (dorm_id, user_id) do update set status = case when public.memberships.status = 'revoked' then 'pending' else public.memberships.status end, requested_at = now()
    returning * into m;
  return m;
end;
$$;

-- A dean rotates the join code so old codes stop working.
create or replace function public.regenerate_join_code(p_dorm uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  code text;
begin
  if not public.is_dean(p_dorm) then raise exception 'deans only'; end if;
  loop
    code := public.new_join_code();
    exit when not exists (select 1 from public.dorms where join_code = code);
  end loop;
  update public.dorms set join_code = code where id = p_dorm;
  return code;
end;
$$;

-- ---------- row level security ----------

alter table public.profiles enable row level security;
alter table public.devices enable row level security;
alter table public.dorms enable row level security;
alter table public.memberships enable row level security;
alter table public.key_grants enable row level security;
alter table public.events enable row level security;
alter table public.snapshots enable row level security;

-- Display names are visible to every signed-in user (deans need to see who is asking to join).
create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Public keys are public. Only the owner registers or renames a device.
create policy devices_read on public.devices for select to authenticated using (true);
create policy devices_insert on public.devices for insert to authenticated with check (user_id = auth.uid());
create policy devices_update on public.devices for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy devices_delete on public.devices for delete to authenticated using (user_id = auth.uid());

-- Anyone with a membership row (even pending) may see the dorm's name; only deans change it.
create policy dorms_read on public.dorms for select to authenticated using (public.has_membership(id));
create policy dorms_update on public.dorms for update to authenticated using (public.is_dean(id)) with check (public.is_dean(id));

-- Members see their own row; deans see and decide every row in their dorm.
create policy memberships_read on public.memberships for select to authenticated using (user_id = auth.uid() or public.is_dean(dorm_id));
create policy memberships_update on public.memberships for update to authenticated using (public.is_dean(dorm_id)) with check (public.is_dean(dorm_id));
create policy memberships_delete on public.memberships for delete to authenticated using (public.is_dean(dorm_id) or user_id = auth.uid());

-- A device reads its own sealed keys; deans manage all grants in their dorm.
create policy grants_read on public.key_grants for select to authenticated using (public.owns_device(device_id) or public.is_dean(dorm_id));
create policy grants_insert on public.key_grants for insert to authenticated with check (public.is_dean(dorm_id) and public.owns_device(granter_device_id));
create policy grants_delete on public.key_grants for delete to authenticated using (public.is_dean(dorm_id));

-- Active members exchange ciphertext. Nothing is ever updated or deleted by clients.
create policy events_read on public.events for select to authenticated using (public.is_active_member(dorm_id));
create policy events_insert on public.events for insert to authenticated with check (public.is_active_member(dorm_id) and public.owns_device(author_device));

create policy snapshots_read on public.snapshots for select to authenticated using (public.is_active_member(dorm_id));
create policy snapshots_insert on public.snapshots for insert to authenticated with check (public.is_dean(dorm_id));

-- Live updates for approvals, key grants and new events.
alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.memberships;
alter publication supabase_realtime add table public.key_grants;
