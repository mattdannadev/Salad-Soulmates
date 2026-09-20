begin;
alter table public.customers
  add column contact_name text not null default '' check(length(contact_name)<=120),
  add column email text not null default '' check(length(email)<=254),
  add column phone text not null default '' check(length(phone)<=40),
  add column address text not null default '' check(length(address)<=1000),
  add column notes text not null default '' check(length(notes)<=2000),
  add column revision integer not null default 0 check(revision>=0);

grant update(contact_name,email,phone,address,notes) on public.customers to authenticated;
create policy customers_update on public.customers for update to authenticated
  using(organization_id=(select public.current_org()) and (select public.has_permission('orders.read')) and (select public.has_permission('orders.write')))
  with check(organization_id=(select public.current_org()) and (select public.has_permission('orders.read')) and (select public.has_permission('orders.write')));

create function public.guard_customer_revision() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='INSERT' then new.revision:=0;
  else new.revision:=old.revision+1;
  end if;
  return new;
end $$;
create trigger customer_revision before insert or update on public.customers for each row execute function public.guard_customer_revision();
create trigger audit_update after update on public.customers for each row execute function public.audit_change();

-- Names and IDs remain stable; edits change contact details, never saved order terms.
create function public.save_customer_master(payload jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare requested_id uuid:=(payload->>'id')::uuid;
  expected integer:=(payload->>'revision')::integer;
  prior public.customers%rowtype;
begin
  if auth.uid() is null or not public.has_permission('orders.read') or not public.has_permission('orders.write') then
    raise exception 'Customer write permission required'; end if;
  if requested_id is null or expected is null or expected<0 or jsonb_typeof(payload)<>'object' then
    raise exception 'Invalid customer details'; end if;
  perform pg_advisory_xact_lock(hashtextextended(requested_id::text,0));
  select * into prior from public.customers where id=requested_id for update;
  if not found then
    if expected<>0 then raise exception 'Customer changed; reload before saving'; end if;
    insert into public.customers(id,name,contact_name,email,phone,address,notes)
      values(requested_id,btrim(payload->>'name'),btrim(payload->>'contact_name'),btrim(payload->>'email'),
        btrim(payload->>'phone'),btrim(payload->>'address'),btrim(payload->>'notes'));
    return requested_id;
  end if;
  if prior.name is distinct from btrim(payload->>'name') then raise exception 'Customer name cannot be changed here'; end if;
  if prior.revision in (expected,expected+1) and prior.contact_name=btrim(payload->>'contact_name')
    and prior.email=btrim(payload->>'email') and prior.phone=btrim(payload->>'phone')
    and prior.address=btrim(payload->>'address') and prior.notes=btrim(payload->>'notes') then return prior.id; end if;
  if prior.revision<>expected then raise exception 'Customer changed; reload before saving'; end if;
  update public.customers set contact_name=btrim(payload->>'contact_name'),email=btrim(payload->>'email'),
    phone=btrim(payload->>'phone'),address=btrim(payload->>'address'),notes=btrim(payload->>'notes') where id=requested_id;
  return requested_id;
end $$;
revoke all on function public.guard_customer_revision() from public,anon,authenticated;
revoke all on function public.save_customer_master(jsonb) from public,anon,authenticated;
grant execute on function public.save_customer_master(jsonb) to authenticated;
commit;
