#!/usr/bin/env python3
"""
gen_sitemap.py — rebuild sitemap.xml from what actually exists in the repo.

The hand-maintained sitemap had drifted badly: it listed the section pages but none of
the individual blog posts and not /attention/. This scans the tree and regenerates the
whole file, so a new post is in the sitemap the moment its folder exists (or the moment
you run `scripts/new_post.py`, which calls this).

lastmod is the file's last git-commit date, falling back to filesystem mtime.
Dependency-free; run from anywhere.

    python3 scripts/gen_sitemap.py            # write sitemap.xml
    python3 scripts/gen_sitemap.py --check    # print, don't write
"""
import os
import sys
import subprocess
import datetime
from html.parser import HTMLParser

BASE = "https://jovey.co"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (url path, changefreq, priority). Blog posts + growth are discovered dynamically.
SECTIONS = [
    ("/projects/", "monthly", "0.9", "projects/index.html"),
    ("/mindspend/", "monthly", "0.7", "mindspend/index.html"),
    ("/", "monthly", "1.0", "index.html"),
    ("/about/", "monthly", "0.8", "about/index.html"),
    ("/blog/", "weekly", "0.9", "blog/index.html"),
    ("/map/", "weekly", "0.7", "map/index.html"),
    ("/attention/", "monthly", "0.7", "attention/index.html"),
]


def git_date(relpath):
    try:
        dirty = subprocess.run(
            ["git", "-C", ROOT, "status", "--porcelain", "--", relpath],
            capture_output=True, text=True, timeout=10)
        if dirty.stdout.strip():
            return datetime.date.today().isoformat()
        out = subprocess.run(
            ["git", "-C", ROOT, "log", "-1", "--format=%cs", "--", relpath],
            capture_output=True, text=True, timeout=10)
        s = out.stdout.strip()
        if s:
            return s
    except Exception:
        pass
    try:
        return datetime.date.fromtimestamp(
            os.path.getmtime(os.path.join(ROOT, relpath))).isoformat()
    except Exception:
        return datetime.date.today().isoformat()


def discover(subdir, changefreq, priority):
    out = []
    d = os.path.join(ROOT, subdir)
    if not os.path.isdir(d):
        return out
    for name in sorted(os.listdir(d)):
        idx = os.path.join(subdir, name, "index.html")
        if os.path.isfile(os.path.join(ROOT, idx)):
            out.append((f"/{subdir}/{name}/", changefreq, priority, idx))
    return out


def build():
    urls = list(SECTIONS)
    urls += discover("growth", "monthly", "0.8")
    urls += discover("blog", "monthly", "0.7")  # individual posts
    urls += discover("projects", "monthly", "0.8")
    # de-dupe keeping first (SECTIONS win over discovery, e.g. /blog/)
    seen, ordered = set(), []
    for u in urls:
        if u[0] in seen:
            continue
        page = os.path.join(ROOT, u[3])
        if not os.path.isfile(page):
            continue
        parser = Indexability()
        with open(page, encoding="utf-8") as f:
            parser.feed(f.read())
        if parser.noindex or parser.redirect or parser.canonical != BASE + u[0]:
            continue
        seen.add(u[0])
        ordered.append(u)

    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for path, cf, pri, rel in ordered:
        lines += [
            "  <url>",
            f"    <loc>{BASE}{path}</loc>",
            f"    <lastmod>{git_date(rel)}</lastmod>",
            f"    <changefreq>{cf}</changefreq>",
            f"    <priority>{pri}</priority>",
            "  </url>",
        ]
    lines.append("</urlset>")
    return "\n".join(lines) + "\n", len(ordered)


class Indexability(HTMLParser):
    def __init__(self):
        super().__init__()
        self.noindex = False
        self.redirect = False
        self.canonical = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'meta':
            if a.get('name', '').lower() in ('robots', 'googlebot'):
                self.noindex |= 'noindex' in a.get('content', '').lower()
            self.redirect |= a.get('http-equiv', '').lower() == 'refresh'
        if tag == 'link' and a.get('rel') == 'canonical':
            self.canonical = a.get('href')


def main():
    xml, n = build()
    if "--check" in sys.argv:
        sys.stdout.write(xml)
        print(f"\n# {n} URLs", file=sys.stderr)
        return
    with open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write(xml)
    print(f"✓ sitemap.xml rebuilt — {n} URLs")


if __name__ == "__main__":
    main()
