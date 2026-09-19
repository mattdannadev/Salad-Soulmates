-- Route account requests through an administrator before granting application access.
alter table public.access_requests
  add column requested_role text not null default 'worker'
    check (requested_role in ('reviewer','worker','receiver')),
  add column auth_user_id uuid references auth.users;

alter table public.access_requests drop constraint access_requests_status_check;
alter table public.access_requests add constraint access_requests_status_check
  check(status in ('New','Contacted','Invited','Approved','Declined'));
drop index public.one_open_access_request_per_contact;
create unique index one_open_access_request_per_contact
  on public.access_requests(lower(trim(contact_value)))
  where status in ('New','Contacted','Invited');
create unique index one_access_request_per_auth_user
  on public.access_requests(auth_user_id) where auth_user_id is not null;

create or replace function public.approve_access_request(
  request_id uuid, invited_user_id uuid, assigned_facility_id uuid, assigned_role text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare requester public.access_requests%rowtype;
declare admin_profile public.profiles%rowtype;
begin
  select * into admin_profile from public.profiles where id = auth.uid() and active;
  if admin_profile.role is distinct from 'admin' then raise exception 'Administrator required'; end if;
  if assigned_role not in ('reviewer','worker','receiver') then raise exception 'Invalid role'; end if;
  if not exists(select 1 from public.facilities where id=assigned_facility_id and organization_id=admin_profile.organization_id and active) then
    raise exception 'Invalid facility';
  end if;
  select * into requester from public.access_requests where id=request_id for update;
  if requester.id is null or requester.contact_kind <> 'email' or requester.status not in ('New','Invited') then
    raise exception 'Request cannot be approved';
  end if;
  if requester.auth_user_id is not null and requester.auth_user_id <> invited_user_id then
    raise exception 'Invitation does not match request';
  end if;
  insert into public.profiles(id,organization_id,facility_id,display_name,role,preferred_locale,active)
  values(invited_user_id,admin_profile.organization_id,assigned_facility_id,requester.display_name,assigned_role,requester.preferred_locale,true)
  on conflict(id) do nothing;
  update public.access_requests set status='Approved',auth_user_id=invited_user_id,
    reviewed_at=now(),reviewed_by=auth.uid(),review_note='Approved as ' || assigned_role
    where id=request_id;
  insert into public.audit_events(organization_id,actor_user_id,entity_type,entity_id,event_type,after_data)
    values(admin_profile.organization_id,auth.uid(),'profiles',invited_user_id,'ACCESS_APPROVED',
      jsonb_build_object('role',assigned_role,'facility_id',assigned_facility_id,'request_id',request_id));
  return invited_user_id;
end $$;

create policy profile_locale_update on public.profiles for update to authenticated
  using(id=(select auth.uid())) with check(id=(select auth.uid()));
grant update(preferred_locale) on public.profiles to authenticated;
grant insert on public.access_requests to anon,authenticated;
grant select,update on public.access_requests to authenticated;
revoke all on function public.approve_access_request(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.approve_access_request(uuid,uuid,uuid,text) to authenticated;
