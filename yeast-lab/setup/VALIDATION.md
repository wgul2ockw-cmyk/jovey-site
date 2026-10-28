# Validation — 2026-10-28

Passed:
- Dashboard JavaScript syntax.
- Pure model tests: median baseline eligibility by elapsed time, minimum count and sample coverage; raw delta math; zero denominator; null values; delayed arrival sorting; deduplication; CSV escaping.
- Dashboard integration using mocked HTTP and DOM: login, REST paths, live readings, baseline confirmation and start, incomplete baseline, network failure while preserving last readings, logout.
- PostgreSQL engine (PGlite WASM + pgcrypto): schema creation; successful ingest; duplicate ingest creates no new rows; wrong token rejected; out-of-range raw rejected; anonymous reads denied; other users cannot read device data or baseline stats; owner can read and start baseline; overlapping active baseline rejected; median calculation.
- Native C++ with mocked Arduino/ESP32 APIs: complete firmware syntax, original local ring buffer and CSV/event behavior, invalid temperature, reboot cursor. Additional enabled-cloud test: 10-second sampling, bounded 180-point queue, preservation of oldest records, drop count propagation.
- Browser visual review of configuration/login screen.
- This package is integrated with the Jovey static website. See the repository commit and Pages deployment for publication status.

Not yet verified:
- Actual Arduino ESP32 compilation: this environment cannot retrieve the ESP32 board packages. Native C++ mock checks are not a substitute for an Arduino build.
- HTTPS/NTP and cloud upload on the physical board; USB/V5 power capacity.
- User's Supabase hosted project, gateway settings, auth configuration and CA chain. No project credentials were supplied and no Supabase project was created.
- Browser plots with live device data. UI integration was mocked, not live cloud hardware.
- TLS helper against the user's real project; it requires that project's URL and internet access and fails closed.

No synthetic data is populated into the production page. No CO2, ethanol concentration or harvest inference is made.

## Jovey hosted backend — 2026-10-28

Provisioned project `jovey-yeast-lab` in Singapore on a quoted $0/month plan.
The dashboard embeds only its URL and publishable key. One physical device is
registered with a SHA-256-hashed device token; the token is delivered privately.
The verified owner's first login claims the pending device. The owner's email
is stored in a private schema, not in public JavaScript or source files.

Hosted verification passed:
- SQL transaction: valid ingest, duplicate suppression, bad token rejection,
  owner-scoped reads and baseline creation; test records rolled back.
- SQL transaction: unverified/wrong-owner claims rejected, verified owner claim
  succeeds, repeated claim is idempotent; test users rolled back.
- HTTPS: anonymous sample read denied; incorrect device token rejected; correct
  token reaches batch validation. No synthetic sensor rows remain.
- Explicit grants: anonymous baseline execution denied; authenticated direct
  sample writes and authenticated device ingest denied.
- Configurator test: Wi-Fi escaping; cloud stays disabled when TLS setup fails.

Security Advisor notes (intentional, reviewed):
- Private token/enrollment tables have RLS and no client policies (deny all).
- Three deliberately exposed SECURITY DEFINER RPCs validate either the device
  credential (ingest), current owner (baseline), or verified registered owner
  email (claim). EXECUTE is revoked from PUBLIC, anon and authenticated first,
  then granted only to the intended caller. Search paths are empty.
  https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
  https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

Still pending: create the owner's Auth account using Supabase Dashboard; prepare
TLS on the user's Mac; compile/upload firmware and verify the physical board.
The cloud environment's HTTPS inspection does not supply a suitable root CA for
the board, so no cloud-environment CA was placed in the firmware. The Mac helper
validates the real project's certificate chain locally and fails closed.
