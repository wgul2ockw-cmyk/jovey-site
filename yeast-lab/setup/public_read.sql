-- Public read access requested for the Jovey bench; ingestion remains token-protected.
alter table public.yeast_samples enable row level security;
grant select on public.yeast_samples to anon;
create policy jovey_public_bench_samples on public.yeast_samples
for select to anon
using (device_id = '8e773858-b689-4a0c-ba45-9bc0b139ab43'::uuid);
