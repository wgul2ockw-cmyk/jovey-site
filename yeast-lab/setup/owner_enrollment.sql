-- Optional enrollment migration used by Jovey's hosted project.
-- Run only after schema.sql; store the intended owner email in the private table
-- from an administrator session. Never let a public client choose its owner email.
alter table public.yeast_devices alter column owner_id drop not null;
create table yeast_private.enrollment (
 device_id uuid primary key references public.yeast_devices(id),
 owner_email text not null, claimed_at timestamptz
);
alter table yeast_private.enrollment enable row level security;
revoke all on yeast_private.enrollment from public,anon,authenticated;
create function public.yeast_claim_owner() returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); em text; did uuid;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select lower(email) into em from auth.users where id=uid and email_confirmed_at is not null;
 if em is null then raise exception 'Verified owner email required' using errcode='42501'; end if;
 select d.id into did from public.yeast_devices d
 join yeast_private.enrollment e on e.device_id=d.id
 where e.owner_email=em and (d.owner_id is null or d.owner_id=uid)
 for update of d limit 1;
 if did is null then raise exception 'This account is not the registered owner' using errcode='42501'; end if;
 update public.yeast_devices set owner_id=uid where id=did and owner_id is null;
 update yeast_private.enrollment set claimed_at=coalesce(claimed_at,now()) where device_id=did;
 return did;
end $$;
revoke all on function public.yeast_claim_owner() from public,anon,authenticated;
grant execute on function public.yeast_claim_owner() to authenticated;
