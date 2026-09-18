-- Administrative setup only. No sample operational data is inserted.
insert into public.organizations(name,slug)
values('Salad Soulmates','salad-soulmates');

insert into public.facilities(organization_id,name,timezone)
select id,'Main facility','America/Chicago'
from public.organizations where slug='salad-soulmates';
