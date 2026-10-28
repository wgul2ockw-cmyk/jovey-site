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
