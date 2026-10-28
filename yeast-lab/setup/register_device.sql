-- First create your dashboard user in Supabase Authentication > Users > Add user.
-- Replace OWNER_UUID with that user's ID. Run this block ONCE and store result privately.
-- The generated token is for ESP32 only. Do not put it in the dashboard.
with d as (
 insert into public.yeast_devices(owner_id,name) values('OWNER_UUID'::uuid,'Yeast bench 01') returning id
), secret as (select id,encode(extensions.gen_random_bytes(32),'hex') token from d),
saved as (
 insert into yeast_private.tokens(device_id,token_hash) select id,extensions.digest(token,'sha256') from secret
)
select id as device_id,token as device_token from secret;
