# Jovey.co

Landing page for **Jovey** — *Every Journey's Companion, Every Soul's Completion.*

Single-page static site (`index.html` + `assets/`) with an interactive HTML5-canvas
cursor background. Hosted on GitHub Pages at **https://jovey.co**.

No build step — edit `index.html` and push to `main` to publish.

The site includes articles, growth hubs, a project directory at `/projects/`,
project guides, and the Attention Switch app at `/attention/`.

Before publishing public-page changes, run:

```sh
python3 scripts/gen_sitemap.py
python3 scripts/check_seo.py
python3 scripts/check_mindspend.py
node --check attention/app.js
```

See [the search coverage map](docs/seo-search-map.md) for keyword destinations,
structured-data decisions, and post-deployment Search Console measurement.
