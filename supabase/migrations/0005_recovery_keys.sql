-- A printed recovery code, so the dorm survives every phone that holds its key being lost
-- at once.
--
-- The server never held the dorm key, so when the last phone holding it is gone the ciphertext
-- is unreadable forever. A dean can make a recovery code: 160 random bits that exist only on a
-- sheet of paper. The dorm key is sealed under a key derived from that code (PBKDF2-SHA256),
-- and this table keeps the seal and its salt. It holds nothing that opens anything without the
-- paper. One row per dorm: making a new code replaces the old one, and the old printout stops
-- working.

create table if not exists public.recovery_keys (
  dorm_id uuid primary key references public.dorms(id) on delete cascade,
  -- Which dorm key version the seal opens. Rotation re-seals when a device holding the
  -- code's key is present; otherwise the app warns that the printout is out of date.
  key_version int not null,
  salt text not null,
  sealed_key text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.recovery_keys enable row level security;

-- Deans only, in every direction. A dean signing in on a brand-new phone is still an active
-- dean, which is exactly who needs to read this; a removed dean is not.
create policy recovery_select on public.recovery_keys for select to authenticated
  using (public.is_dean(dorm_id));

create policy recovery_insert on public.recovery_keys for insert to authenticated
  with check (public.is_dean(dorm_id) and created_by = auth.uid());

create policy recovery_update on public.recovery_keys for update to authenticated
  using (public.is_dean(dorm_id))
  with check (public.is_dean(dorm_id));

create policy recovery_delete on public.recovery_keys for delete to authenticated
  using (public.is_dean(dorm_id));
