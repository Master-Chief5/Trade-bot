-- Security hardening from the database linter.

-- 1. Pin the search path on the one function that lacked it.
create or replace function public.new_join_code() returns text
language plpgsql set search_path = '' as $$
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

-- 2. This helper is only ever called from inside a SECURITY DEFINER function.
revoke execute on function public.new_join_code() from public, anon, authenticated;

-- 3. The predicates exist for row-level security, which only ever runs for signed-in
--    users. Nobody should be able to call them over the REST API as anon.
revoke execute on function public.is_active_member(uuid) from public, anon;
revoke execute on function public.is_dean(uuid) from public, anon;
revoke execute on function public.has_membership(uuid) from public, anon;
revoke execute on function public.owns_device(uuid) from public, anon;
grant execute on function public.is_active_member(uuid) to authenticated;
grant execute on function public.is_dean(uuid) to authenticated;
grant execute on function public.has_membership(uuid) to authenticated;
grant execute on function public.owns_device(uuid) to authenticated;

-- 4. These already refuse a signed-out caller; take away the ability to try.
revoke execute on function public.create_dorm(text) from public, anon;
revoke execute on function public.request_membership(text) from public, anon;
revoke execute on function public.regenerate_join_code(uuid) from public, anon;
grant execute on function public.create_dorm(text) to authenticated;
grant execute on function public.request_membership(text) to authenticated;
grant execute on function public.regenerate_join_code(uuid) to authenticated;

-- 5. Unused by the app: drop it rather than leave API surface behind.
drop function if exists public.latest_seq(uuid);
