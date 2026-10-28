# Jovey.co

Landing page for **Jovey** — *Every Journey's Companion, Every Soul's Completion.*

Single-page static site (`index.html` + `assets/`) with an interactive HTML5-canvas
cursor background. Hosted on GitHub Pages at **https://jovey.co**.

No build step — edit `index.html` and push to `main` to publish.

The site includes articles, growth hubs, a project directory at `/projects/`,
project guides, and the Attention Go app at `/attention/`.

Pulse Lab's research scanner is hosted at `/pulse-lab/`. See
[port documentation](pulse-lab/README.md).

Before publishing public-page changes, run:

```sh
python3 scripts/gen_sitemap.py
python3 scripts/check_seo.py
python3 scripts/check_mindspend.py
node --check attention/app.js
```

See [the search coverage map](docs/seo-search-map.md) for keyword destinations,
structured-data decisions, and post-deployment Search Console measurement.

## Yeast Lab

`/yeast-lab/` is an ESP32 experiment dashboard for DS18B20 temperature and
uncalibrated MQ3/MQ135 ADC counts, with five-minute baseline captures and CSV export.
The page is public; data requires Supabase authentication and owner-scoped RLS.
No backend or device credentials are embedded. Open `/yeast-lab/setup.html` for
setup and the downloadable firmware/SQL kit. A Supabase project and physical
board configuration are required before live data can arrive.

Validate dashboard behavior:

```sh
node --input-type=module --check < yeast-lab/app.js
node scripts/test_yeast_model.mjs
node scripts/test_yeast_dashboard.mjs
```

`yeast-lab/setup/Yeast_Cloud/secrets.h` is a placeholder template. Never commit real
Wi-Fi passwords or device tokens. If changing kit sources, rebuild
`yeast-lab/downloads/Yeast_Cloud_Kit.zip` before publishing.
