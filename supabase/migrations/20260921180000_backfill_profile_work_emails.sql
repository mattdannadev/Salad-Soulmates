-- Retain the email recorded for each existing authentication account in its application profile.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'auth' and table_name = 'users' and column_name = 'email'
  ) then
    execute $backfill$
      update public.profiles profile
      set work_email = lower(auth_user.email)
      from auth.users auth_user
      where profile.id = auth_user.id
        and auth_user.email is not null
        and profile.work_email is null
    $backfill$;
  end if;
end
$$;

-- New approved email requests should record the same address when the profile is created.
create or replace function public.approve_access_request(
  request_id uuid, invited_user_id uuid, assigned_facility_id uuid, assigned_access_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare requester public.access_requests%rowtype; admin_profile public.profiles%rowtype; assigned public.access_profiles%rowtype;
begin
 select * into admin_profile from public.profiles where id=auth.uid() and active;
 if not public.has_permission('access.manage') then raise exception 'Access management permission required'; end if;
 select * into assigned from public.access_profiles where id=assigned_access_profile_id and organization_id=admin_profile.organization_id and active;
 if assigned.id is null then raise exception 'Invalid access profile'; end if;
 if not exists(select 1 from public.facilities where id=assigned_facility_id and organization_id=admin_profile.organization_id and active) then raise exception 'Invalid facility'; end if;
 select * into requester from public.access_requests where id=request_id for update;
 if requester.id is null or requester.contact_kind<>'email' or requester.status not in ('New','Invited') then raise exception 'Request cannot be approved'; end if;
 if requester.auth_user_id is not null and requester.auth_user_id<>invited_user_id then raise exception 'Invitation does not match request'; end if;
 insert into public.profiles(id,organization_id,facility_id,display_name,work_email,role,preferred_locale,active,access_profile_id)
 values(invited_user_id,admin_profile.organization_id,assigned_facility_id,requester.display_name,lower(trim(requester.contact_value)),assigned.base_role,requester.preferred_locale,true,assigned.id) on conflict(id) do nothing;
 update public.access_requests set status='Approved',auth_user_id=invited_user_id,reviewed_at=now(),reviewed_by=auth.uid(),review_note='Approved with profile '||assigned.name where id=request_id;
 insert into public.audit_events(organization_id,actor_user_id,entity_type,entity_id,event_type,after_data) values(admin_profile.organization_id,auth.uid(),'profiles',invited_user_id,'ACCESS_APPROVED',jsonb_build_object('access_profile_id',assigned.id,'facility_id',assigned_facility_id,'request_id',request_id));
 return invited_user_id;
end $$;
