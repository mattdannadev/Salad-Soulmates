begin;

-- Extend the lookup signature without changing its invoker/RLS view or barcode precedence.
drop function public.find_serialized_units(text,uuid,uuid);
create function public.find_serialized_units(
  search_text text default '',
  receipt_filter uuid default null,
  unit_filter uuid default null,
  ingredient_filter uuid default null,
  supplier_filter uuid default null,
  availability_filter text default null,
  expiry_filter text default null,
  balance_filter text default null,
  sort_order text default 'newest'
) returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(result)),'[]'::jsonb)
  from (
    select balance.*
    from public.serialized_unit_balances balance
    join public.facilities facility on facility.id=balance.facility_id
    where (receipt_filter is null or balance.receipt_id=receipt_filter)
      and (unit_filter is null or balance.id=unit_filter)
      and (ingredient_filter is null or balance.ingredient_id=ingredient_filter)
      and (supplier_filter is null or balance.supplier_id=supplier_filter)
      and (availability_filter is null or balance.availability=availability_filter)
      and (balance_filter is null
        or (balance_filter='positive' and balance.remaining_quantity>0)
        or (balance_filter='partial' and balance.remaining_quantity>0
          and balance.remaining_quantity<balance.initial_quantity)
        or (balance_filter='empty' and balance.remaining_quantity=0))
      and (expiry_filter is null
        or (expiry_filter='expired' and balance.expiration_date<(now() at time zone facility.timezone)::date)
        or (expiry_filter='soon' and balance.expiration_date>=(now() at time zone facility.timezone)::date
          and balance.expiration_date<=(now() at time zone facility.timezone)::date+30)
        or (expiry_filter='later' and balance.expiration_date>(now() at time zone facility.timezone)::date+30)
        or (expiry_filter='undated' and balance.expiration_date is null))
      and (trim(search_text)=''
        or balance.internal_code=upper(trim(search_text))
        or balance.supplier_barcode=trim(search_text)
        or (not exists(
          select 1 from public.serialized_units exact
          where exact.internal_code=upper(trim(search_text))
            or exact.supplier_barcode=trim(search_text)
        ) and (
          position(lower(trim(search_text)) in lower(balance.source_lot))>0
          or position(lower(trim(search_text)) in lower(balance.supplier_lot))>0
          or position(lower(trim(search_text)) in lower(balance.ingredient_name))>0
        )))
    order by
      case when sort_order='oldest' then balance.created_at end asc,
      case when sort_order='ingredient' then lower(balance.ingredient_name) end asc,
      case when sort_order='expiry' then balance.expiration_date end asc nulls last,
      case when sort_order='balance' then balance.remaining_quantity end asc,
      case when sort_order is null or sort_order not in ('oldest','ingredient','expiry','balance')
        then balance.created_at end desc,
      balance.id
    limit 200
  ) result
$$;

revoke all on function public.find_serialized_units(text,uuid,uuid,uuid,uuid,text,text,text,text)
  from public,anon;
grant execute on function public.find_serialized_units(text,uuid,uuid,uuid,uuid,text,text,text,text)
  to authenticated;

commit;
