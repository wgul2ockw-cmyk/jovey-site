#!/usr/bin/env python3
"""
new_post.py — scaffold a new Jovey blog post in one command.

Replaces the ~5 manual steps from the jovey-site skill (copy a post, hand-edit ~45 lines
of <head> title/description/canonical/OG/JSON-LD/dates, make the assets folder, add a card
to blog/index.html, add a sitemap entry) with a single generator that fills all of them
consistently. You then drop in the cover image and write the prose.

    python3 scripts/new_post.py \
      --slug sleep-inertia \
      --title "งีบหลับอย่างไรไม่ให้เพลีย" \
      --desc "คู่มือจัดการ sleep inertia …" \
      --cats personal \
      --eyebrow "Theory behind Action · Sleep" \
      --excerpt "การ์ดสรุปสั้น ๆ ที่จะโชว์ในหน้า /blog/" \
      [--date 2026-07-19] [--cover-ext jpg] [--lead "ย่อหน้านำ"]

Categories: personal | spiritual | vitality (comma-separate for more than one).
"""
import os
import re
import sys
import argparse
import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAT = {'personal': 'Personal Growth', 'spiritual': 'Spiritual Growth', 'vitality': 'Vitality Growth'}
TH_MON = {1: 'ม.ค.', 2: 'ก.พ.', 3: 'มี.ค.', 4: 'เม.ย.', 5: 'พ.ค.', 6: 'มิ.ย.',
          7: 'ก.ค.', 8: 'ส.ค.', 9: 'ก.ย.', 10: 'ต.ค.', 11: 'พ.ย.', 12: 'ธ.ค.'}

PAGE = r'''<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>%%TITLE%% — Jovey</title>
<meta name="description" content="%%DESC%%">
<meta name="robots" content="index, follow">
<link rel="canonical" href="https://jovey.co/blog/%%SLUG%%/">
<link rel="icon" href="/assets/logo.png" type="image/png">
<link rel="apple-touch-icon" href="/assets/logo.png">

<!-- Open Graph / social share -->
<meta property="og:type" content="article">
<meta property="og:site_name" content="Jovey">
<meta property="og:title" content="%%OGTITLE%%">
<meta property="og:description" content="%%OGDESC%%">
<meta property="og:url" content="https://jovey.co/blog/%%SLUG%%/">
<meta property="og:image" content="https://jovey.co/assets/blog/%%SLUG%%/cover.%%EXT%%">
<meta property="article:published_time" content="%%DATE%%">
<meta property="article:section" content="%%SECTION%%">
<meta name="twitter:card" content="summary_large_image">

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "%%OGTITLE%%",
  "datePublished": "%%DATE%%",
  "author": { "@type": "Organization", "name": "Jovey" },
  "publisher": { "@type": "Organization", "name": "Jovey", "logo": { "@type": "ImageObject", "url": "https://jovey.co/assets/logo.png" } },
  "image": "https://jovey.co/assets/blog/%%SLUG%%/cover.%%EXT%%",
  "mainEntityOfPage": "https://jovey.co/blog/%%SLUG%%/",
  "articleSection": [%%JSONLD_SECTIONS%%]
}
</script>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Prata&family=Anuphan:wght@400;500;600&family=Quicksand:wght@600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/blog.css">
</head>
<body>

<canvas id="field"></canvas>

<main>
  <nav>
    <a class="brand" href="/">
      <img src="/assets/logo.png" alt="Jovey logo">
      <span class="wordmark">Jovey</span>
    </a>
    <div class="links">
      <a class="plain" href="/#growth">Growth</a>
      <a class="plain" href="/about/">About</a>
      <a class="plain active" href="/blog/">Blog</a>
      <a class="plain" href="/map/">Map</a>
      <a class="pill small" href="https://wgul2ockw-cmyk.github.io/-mindspend-site/" target="_blank" rel="noopener">MindSpend <svg class="link-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></a>
    </div>
  </nav>

  <article class="post">
    <a class="back" href="/blog/">← บทความทั้งหมด</a>

    <header class="post-hero">
      <span class="post-eyebrow">%%EYEBROW%%</span>
      <h1 class="post-title">%%TITLE%%</h1>
      <div class="post-meta">
        <span class="by">โดย Jovey</span>
        <span class="dot">·</span>
        <span>%%THAIDATE%%</span>
        <span class="dot">·</span>
        <span class="chips">
%%HERO_CHIPS%%
        </span>
      </div>
    </header>

    <figure class="post-cover">
      <img src="/assets/blog/%%SLUG%%/cover.%%EXT%%"
           alt="%%TITLE%%"
           onerror="this.remove()">
    </figure>

    <div class="post-body">
      <div class="prose">
        <p class="lead">%%LEAD%%</p>

        <!-- TODO: write the post body here. -->

        <p class="post-sign">Jovey <span>|</span> Ultimate from within</p>
      </div>
    </div>

    <div class="post-foot">
      <a class="back" href="/blog/">← กลับไปหน้าบทความทั้งหมด</a>
    </div>
  </article>

  <footer>
    <img src="/assets/logo.png" alt="Jovey logo">
    <div class="tagline">Every Journey's Companion, Every Soul's Completion.</div>
    <div class="foot-links">
      <a href="/">Home</a>
      <a href="/#growth">Growth</a>
      <a href="/about/">About</a>
      <a href="/blog/">Blog</a>
      <a href="/map/">Map</a>
      <a href="https://wgul2ockw-cmyk.github.io/-mindspend-site/" target="_blank" rel="noopener">MindSpend <svg class="link-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></a>
    </div>
    <div class="copy">© 2026 Jovey Co.</div>
  </footer>
</main>

<script src="/assets/field.js"></script>
<script src="/assets/read-progress.js"></script>

</body>
</html>
'''


def card_html(slug, cats, title, excerpt, thaidate, ext):
    chips = "\n".join(
        f'            <span class="chip {c}">{CAT[c]}</span>' for c in cats)
    return (
        f'      <a class="post-card" href="/blog/{slug}/" data-cats="{" ".join(cats)}">\n'
        f'        <img class="post-card__cover" src="/assets/blog/{slug}/cover.{ext}" alt=""\n'
        f'             onerror="this.replaceWith(Object.assign(document.createElement(\'div\'),{{className:\'post-card__cover\'}}))">\n'
        f'        <div class="post-card__body">\n'
        f'          <div class="post-card__cats">\n{chips}\n          </div>\n'
        f'          <h2>{title}</h2>\n'
        f'          <p class="post-card__excerpt">{excerpt}</p>\n'
        f'          <div class="post-card__foot">\n'
        f'            <span>{thaidate}</span>\n'
        f'            <span class="post-card__read">อ่านต่อ →</span>\n'
        f'          </div>\n'
        f'        </div>\n'
        f'      </a>\n')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--slug', required=True)
    ap.add_argument('--title', required=True)
    ap.add_argument('--desc', required=True)
    ap.add_argument('--cats', required=True, help='comma-separated: personal,spiritual,vitality')
    ap.add_argument('--excerpt', default=None, help='card excerpt (defaults to --desc)')
    ap.add_argument('--eyebrow', default=None)
    ap.add_argument('--lead', default=None)
    ap.add_argument('--date', default=datetime.date.today().isoformat())
    ap.add_argument('--cover-ext', default='jpg', dest='ext')
    ap.add_argument('--og-title', default=None)
    ap.add_argument('--og-desc', default=None)
    a = ap.parse_args()

    cats = [c.strip() for c in a.cats.replace(',', ' ').split() if c.strip()]
    bad = [c for c in cats if c not in CAT]
    if bad:
        sys.exit(f"unknown category {bad}; choose from {list(CAT)}")
    slug = a.slug.strip('/')
    postdir = os.path.join(ROOT, 'blog', slug)
    if os.path.exists(postdir):
        sys.exit(f"✗ blog/{slug}/ already exists — refusing to overwrite")
    y, m, d = map(int, a.date.split('-'))
    thaidate = f"{TH_MON[m]} {d}, {y}"
    excerpt = a.excerpt or a.desc
    eyebrow = a.eyebrow or " · ".join(CAT[c] for c in cats)
    lead = a.lead or a.desc

    page = PAGE
    repl = {
        'TITLE': a.title, 'DESC': a.desc, 'SLUG': slug, 'EXT': a.ext,
        'OGTITLE': a.og_title or a.title, 'OGDESC': a.og_desc or a.desc,
        'DATE': a.date, 'SECTION': CAT[cats[0]],
        'JSONLD_SECTIONS': ", ".join(f'"{CAT[c]}"' for c in cats),
        'EYEBROW': eyebrow, 'THAIDATE': thaidate, 'LEAD': lead,
        'HERO_CHIPS': "\n".join(
            f'          <a class="chip {c}" href="/blog/">{CAT[c]}</a>' for c in cats),
    }
    for k, v in repl.items():
        page = page.replace(f'%%{k}%%', v)

    # 1) write the post + assets dir
    os.makedirs(os.path.join(ROOT, 'assets', 'blog', slug), exist_ok=True)
    os.makedirs(postdir)
    with open(os.path.join(postdir, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(page)

    # 2) insert a newest-first card into blog/index.html
    idx = os.path.join(ROOT, 'blog', 'index.html')
    with open(idx, 'r', encoding='utf-8') as f:
        html = f.read()
    anchor = '<div class="post-grid">\n'
    if anchor in html and f'href="/blog/{slug}/"' not in html:
        card = card_html(slug, cats, a.title, excerpt, thaidate, a.ext)
        html = html.replace(anchor, anchor + '\n' + card, 1)
        with open(idx, 'w', encoding='utf-8') as f:
            f.write(html)
        card_note = "inserted (newest-first)"
    else:
        card_note = "SKIPPED (anchor missing or slug already present)"

    # 3) rebuild the sitemap
    os.system(f'python3 "{os.path.join(ROOT, "scripts", "gen_sitemap.py")}" >/dev/null')

    print(f"✓ blog/{slug}/index.html")
    print(f"✓ assets/blog/{slug}/  (drop cover.{a.ext} here — {a.ext.upper()} 1200×630 for OG)")
    print(f"✓ blog/index.html card: {card_note}")
    print(f"✓ sitemap.xml rebuilt")
    print(f"\nNext: add the cover image, then write the body in blog/{slug}/index.html "
          f"(replace the TODO).")


if __name__ == '__main__':
    main()
