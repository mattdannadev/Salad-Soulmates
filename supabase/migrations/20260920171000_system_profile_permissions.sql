-- System profiles have a fixed identity, but administrators can tailor their allowed actions.
create or replace function public.save_access_profile(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare result uuid; permission text; existing public.access_profiles%rowtype;
begin
 if not public.has_permission('settings.manage') then raise exception 'Settings permission required'; end if;
 result:=coalesce(nullif(payload->>'id','')::uuid,gen_random_uuid());
 select * into existing from public.access_profiles where id=result;
 if existing.id is not null and existing.organization_id<>public.current_org() then raise exception 'Invalid access profile'; end if;
 if existing.id is null then
   insert into public.access_profiles(id,organization_id,name,description,base_role,is_system,active)
   values(result,public.current_org(),trim(payload->>'name'),trim(coalesce(payload->>'description','')),payload->>'base_role',false,coalesce((payload->>'active')::boolean,true));
 elsif not existing.is_system then
   update public.access_profiles set name=trim(payload->>'name'),description=trim(coalesce(payload->>'description','')),base_role=payload->>'base_role',active=coalesce((payload->>'active')::boolean,true) where id=result;
 end if;
 delete from public.access_profile_permissions where access_profile_id=result;
 for permission in select jsonb_array_elements_text(coalesce(payload->'permission_codes','[]'::jsonb)) loop
   insert into public.access_profile_permissions(organization_id,access_profile_id,permission_code) values(public.current_org(),result,permission);
 end loop;
 return result;
end $$;
