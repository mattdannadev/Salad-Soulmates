-- `work_packages` is introduced after the base worker projection.  Keep the
-- base function migration independent, then decorate its assignment-scoped
-- items here so a clean database can apply the migration chain in order.
begin;

alter function public.get_my_worker_work(jsonb)
  rename to get_my_worker_work_base;

create function public.get_my_worker_work(payload jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select base.result || jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(
        item.value || jsonb_build_object(
          'work_package', case when package.id is null then null else jsonb_build_object(
            'id', package.id,
            'type', package.package_type,
            'title', package.title
          ) end
        )
        order by item.ordinality
      )
      from jsonb_array_elements(base.result->'items') with ordinality as item(value, ordinality)
      join public.workforce_work_queue_items work
        on work.id = nullif(item.value->>'id', '')::uuid
        and work.organization_id = public.current_org()
        and work.facility_id = public.current_facility()
      left join public.work_packages package
        on package.id = work.work_package_id
        and package.organization_id = work.organization_id
        and package.facility_id = work.facility_id
    ), '[]'::jsonb)
  )
  from (select public.get_my_worker_work_base(payload) as result) base;
$$;

revoke all on function public.get_my_worker_work_base(jsonb) from public, anon, authenticated;
revoke all on function public.get_my_worker_work(jsonb) from public, anon, authenticated;
grant execute on function public.get_my_worker_work(jsonb) to authenticated;

comment on function public.get_my_worker_work(jsonb) is
  'Assignment-scoped worker calendar/list projection enriched with non-executable work-package context.';

notify pgrst, 'reload schema';
commit;
