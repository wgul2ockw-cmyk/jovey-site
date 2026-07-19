# jovey-site scripts

Maintenance automation for the static site. All dependency-free (`python3` / `node` only),
matching the repo's "no build step" rule — nothing here is required to serve the site; it
just removes hand-work.

| Script | Does |
|---|---|
| `new_post.py` | Scaffold a blog post in one command: `blog/<slug>/index.html` (full head + Open Graph + JSON-LD), the `assets/blog/<slug>/` folder, a newest-first card in `blog/index.html`, and a sitemap entry. You add the cover image and write the body. |
| `gen_sitemap.py` | Rebuild `sitemap.xml` from what actually exists (all posts + sections + `/attention/`), with `lastmod` from git. Fixes hand-maintained drift. |
| `bump_sw_cache.py` | Increment the `attention-switch-vN` cache in `attention/sw.js` (HANDOFF.md's "bump on every asset change" invariant). |
| `sync_attention.sh` | Bridge the standalone `~/Downloads/Attention switch/` working copy into `attention/` and bump the cache. Prefer editing `attention/` directly going forward. |

## Examples

```bash
python3 scripts/new_post.py --slug my-post --title "…" --desc "…" \
        --cats personal --eyebrow "Theory behind Action · …" --excerpt "…"
python3 scripts/gen_sitemap.py
```

## Pre-commit hook (`.githooks/pre-commit`)

Enable once: `git config core.hooksPath .githooks`. On every commit it automatically
(1) bumps the sw.js cache when an `attention/` asset changed, (2) rebuilds `sitemap.xml`
when pages change, and (3) runs `node --check` on the app. So the two things easiest to
forget — the cache bump and the sitemap — can't be forgotten.
