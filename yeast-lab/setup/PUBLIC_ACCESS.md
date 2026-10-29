# Jovey public dashboard

The dashboard opens without login. Anonymous reads are restricted by RLS to bench 8e773858-b689-4a0c-ba45-9bc0b139ab43. Device credentials, owner records, and private enrollment remain inaccessible. Sensor writes still require the device token through yeast_ingest. No anonymous INSERT, UPDATE, or DELETE grant was added.

Baseline labels and five-minute windows are stored in localStorage in the browser that starts them (latest 100). Raw points remain on Supabase; baseline statistics are computed from those server points. Clearing browser storage or switching browsers removes the local baseline list. Export baseline CSV for a portable snapshot. Previous authenticated baseline endpoints remain restricted to their existing owners.

Validation: JavaScript parse and mocked HTTP/DOM tests passed for automatic startup, no auth requests, read-only API, live values, local baseline capture, insufficient data, and offline status. SQL under anon successfully reads samples; INSERT/DELETE, owner table and private schema access remain denied. No device samples were present during validation. Physical board power and Wi-Fi delivery have not been verified.

Existing advisor notices: token-protected ingest is intentionally callable without a user session; owner claim/baseline functions retain owner checks. See https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable and https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable . Private schemas intentionally have deny-by-default RLS. Auth password-leak protection is disabled; the public dashboard does not use password login.
