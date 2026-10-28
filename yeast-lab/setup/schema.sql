-- Run once in a NEW Supabase project's SQL Editor. No service-role key on devices.
begin;
create schema if not exists yeast_private;
revoke all on schema yeast_private from public, anon, authenticated;
create extension if not exists pgcrypto with schema extensions;
create table public.yeast_devices (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 name text not null, created_at timestamptz not null default now());
create table yeast_private.tokens (
 device_id uuid primary key references public.yeast_devices(id), token_hash bytea not null);
create table public.yeast_samples (
 id bigint generated always as identity primary key,
 device_id uuid not null references public.yeast_devices(id), boot_id text not null,
 seq bigint not null check(seq>0), uptime_ms bigint not null check(uptime_ms>=0),
 sampled_at timestamptz, received_at timestamptz not null default now(),
 temp_c real check(temp_c between -55 and 125),
 mq3_raw integer not null check(mq3_raw between 0 and 4095),
 mq135_raw integer not null check(mq135_raw between 0 and 4095),
 dropped_total integer not null default 0 check(dropped_total>=0),
 unique(device_id,boot_id,seq));
create index on public.yeast_samples(device_id,id);
create index on public.yeast_samples(device_id,sampled_at);
create table public.yeast_baselines (
 id uuid primary key default gen_random_uuid(), device_id uuid not null references public.yeast_devices(id),
 label text not null, start_at timestamptz not null default now(), end_at timestamptz not null,
 check(end_at>start_at));
alter table public.yeast_devices enable row level security;
alter table public.yeast_samples enable row level security;
alter table public.yeast_baselines enable row level security;
revoke all on public.yeast_devices,public.yeast_samples,public.yeast_baselines from anon,authenticated;
grant select on public.yeast_devices,public.yeast_samples,public.yeast_baselines to authenticated;
create policy own_device on public.yeast_devices for select to authenticated using(owner_id=(select auth.uid()));
create policy own_samples on public.yeast_samples for select to authenticated using(exists(select 1 from public.yeast_devices d where d.id=device_id and d.owner_id=(select auth.uid())));
create policy own_baselines on public.yeast_baselines for select to authenticated using(exists(select 1 from public.yeast_devices d where d.id=device_id and d.owner_id=(select auth.uid())));

create function public.yeast_ingest(p_device uuid,p_token text,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; n integer:=0; changed integer; ts timestamptz;
begin
 if p_token is null or not exists(select 1 from yeast_private.tokens t where t.device_id=p_device and t.token_hash=extensions.digest(p_token,'sha256')) then
  raise exception 'Invalid device credential' using errcode='28000';
 end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception 'Expected array'; end if;
 if jsonb_array_length(p_rows) not between 1 and 20 then raise exception 'Batch size 1..20'; end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  if coalesce(r->>'boot','') !~ '^[a-f0-9]{16}$' then raise exception 'Invalid boot ID'; end if;
  ts:=case when (r->>'epoch')::bigint>1700000000 then to_timestamp((r->>'epoch')::double precision) else null end;
  if ts>now()+interval '2 minutes' then ts:=null; end if;
  insert into public.yeast_samples(device_id,boot_id,seq,uptime_ms,sampled_at,temp_c,mq3_raw,mq135_raw,dropped_total)
  values(p_device,r->>'boot',(r->>'seq')::bigint,(r->>'ms')::bigint,ts,(r->>'temp')::real,
   (r->>'mq3')::integer,(r->>'mq135')::integer,coalesce((r->>'dropped')::integer,0))
  on conflict(device_id,boot_id,seq) do nothing;
  get diagnostics changed=row_count; n:=n+changed;
 end loop;
 return jsonb_build_object('ok',true,'inserted',n);
end $$;
revoke all on function public.yeast_ingest(uuid,text,jsonb) from public;
grant execute on function public.yeast_ingest(uuid,text,jsonb) to anon;

create function public.yeast_start_baseline(p_device uuid,p_label text)
returns uuid language plpgsql security definer set search_path='' as $$
declare bid uuid;
begin
 perform 1 from public.yeast_devices where id=p_device and owner_id=auth.uid() for update;
 if not found then raise exception 'Not authorized' using errcode='42501'; end if;
 if exists(select 1 from public.yeast_baselines where device_id=p_device and end_at>now()) then raise exception 'Baseline already recording'; end if;
 insert into public.yeast_baselines(device_id,label,end_at) values(p_device,left(coalesce(nullif(p_label,''),'Baseline'),100),now()+interval '5 minutes') returning id into bid;
 return bid;
end $$;
revoke all on function public.yeast_start_baseline(uuid,text) from public;
grant execute on function public.yeast_start_baseline(uuid,text) to authenticated;

create function public.yeast_baseline_stats(p_baseline uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare b public.yeast_baselines; result jsonb;
begin
 select * into b from public.yeast_baselines where id=p_baseline;
 if not found then raise exception 'Baseline unavailable'; end if;
 select jsonb_build_object('n',count(*),'temp',percentile_cont(0.5) within group(order by temp_c),
 'mq3',percentile_cont(0.5) within group(order by mq3_raw),'mq135',percentile_cont(0.5) within group(order by mq135_raw),
 'mq3_min',min(mq3_raw),'mq3_max',max(mq3_raw),'mq135_min',min(mq135_raw),'mq135_max',max(mq135_raw),
 'first_at',min(sampled_at),'last_at',max(sampled_at)) into result
 from public.yeast_samples where device_id=b.device_id and sampled_at>=b.start_at and sampled_at<b.end_at
 and mq3_raw between 1 and 4094 and mq135_raw between 1 and 4094;
 return result;
end $$;
revoke all on function public.yeast_baseline_stats(uuid) from public;
grant execute on function public.yeast_baseline_stats(uuid) to authenticated;
commit;
