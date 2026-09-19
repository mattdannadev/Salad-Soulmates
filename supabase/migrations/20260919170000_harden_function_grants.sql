-- Remove PostgreSQL's default PUBLIC execute grant from security-definer helpers.
-- Policy helpers remain callable by signed-in users; trigger functions are not callable directly.
revoke execute on function public.current_org() from public, anon;
revoke execute on function public.current_facility() from public, anon;
revoke execute on function public.current_role() from public, anon;
grant execute on function public.current_org() to authenticated;
grant execute on function public.current_facility() to authenticated;
grant execute on function public.current_role() to authenticated;

revoke execute on function public.audit_change() from public, anon, authenticated;
revoke execute on function public.guard_ingredient_unit() from public, anon, authenticated;
