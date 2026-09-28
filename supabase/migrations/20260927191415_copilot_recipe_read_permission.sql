-- Operations Copilot's recipe lookup is permission-gated. Align the database
-- policy with its `products.read` authorization check instead of the legacy
-- administrator/reviewer role gate so custom access profiles behave consistently.
drop policy if exists ss_read on public.recipes;

create policy ss_read on public.recipes
  for select
  to authenticated
  using (
    organization_id = (select public.current_org())
    and (select public.has_permission('products.read'))
  );
