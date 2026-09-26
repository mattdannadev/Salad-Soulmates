-- The directory reads the organization-scoped profile copy rather than auth.users,
-- which is intentionally not exposed through RLS.  Populate it for accounts that
-- existed before the user-management email backfill was deployed, and correct any
-- stale copy after an authentication email address changes.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'auth' and table_name = 'users' and column_name = 'email'
  ) then
    execute $sync$
      update public.profiles profile
      set work_email = lower(auth_user.email)
      from auth.users auth_user
      where profile.id = auth_user.id
        and auth_user.email is not null
        and profile.work_email is distinct from lower(auth_user.email)
    $sync$;
  end if;
end
$$;
