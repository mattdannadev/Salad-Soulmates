-- Public account requests are reviewed before any organization role is granted.
create table public.access_requests (
 id uuid primary key default gen_random_uuid(),
 display_name text not null check(length(trim(display_name)) between 2 and 120),
 contact_kind text not null check(contact_kind in ('email','phone')),
 contact_value text not null check(length(trim(contact_value)) between 5 and 254),
 preferred_locale text not null default 'en' check(preferred_locale in ('en','es')),
 status text not null default 'New' check(status in ('New','Contacted','Approved','Declined')),
 review_note text not null default '', created_at timestamptz not null default now(),
 reviewed_at timestamptz, reviewed_by uuid references auth.users,
 check(status = 'New' or (reviewed_at is not null and reviewed_by is not null))
);
create unique index one_open_access_request_per_contact
 on public.access_requests(lower(trim(contact_value))) where status = 'New';
alter table public.access_requests enable row level security;
create policy access_request_submit on public.access_requests for insert to anon,authenticated
 with check(status='New' and review_note='' and reviewed_at is null and reviewed_by is null);
create policy access_request_admin_read on public.access_requests for select to authenticated
 using(public.current_role()='admin');
create policy access_request_admin_review on public.access_requests for update to authenticated
 using(public.current_role()='admin') with check(public.current_role()='admin');
revoke all on public.access_requests from anon,authenticated;
grant insert on public.access_requests to anon,authenticated;
grant select,update on public.access_requests to authenticated;
