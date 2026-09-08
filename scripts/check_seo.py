#!/usr/bin/env python3
"""Dependency-free crawl of public HTML, metadata, graph identity, and sitemap.

Run: python3 scripts/check_seo.py
This validates deployment inputs, not search rankings or Google eligibility.
"""
from collections import deque
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit, unquote
import json
import re
import struct
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
BASE = 'https://jovey.co'

class Page(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.tags = []
        self.source = source
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))

    def meta(self, key, attr='name'):
        return [a.get('content', '') for t, a in self.tags if t == 'meta' and a.get(attr) == key]

    def canonical(self):
        return [a.get('href') for t, a in self.tags if t == 'link' and a.get('rel') == 'canonical']

    def indexable(self):
        return not any('noindex' in x.lower() for x in self.meta('robots') + self.meta('googlebot'))

def path_for(url):
    path = unquote(urlsplit(url).path).lstrip('/')
    return ROOT / (path + 'index.html' if not path or path.endswith('/') else path)

def check():
    pages = {}
    for path in ROOT.rglob('index.html'):
        if any(part.startswith('.') for part in path.relative_to(ROOT).parts):
            continue
        rel = str(path.relative_to(ROOT))
        url = BASE + '/' + ('' if rel == 'index.html' else rel.removesuffix('index.html'))
        pages[url] = Page(path.read_text())
    public = {u: p for u, p in pages.items() if p.indexable()}
    titles, descriptions, edges = set(), set(), {}
    errors = []
    def require(ok, message):
        if not ok:
            errors.append(message)

    for url, p in public.items():
        require(p.canonical() == [url], f'{url}: expected one self canonical')
        title = re.findall(r'<title>(.*?)</title>', p.source, re.S)
        require(len(title) == 1 and bool(title[0].strip()), f'{url}: missing/duplicate title')
        if title:
            require(title[0] not in titles, f'{url}: duplicate title')
            titles.add(title[0])
        require(sum(t == 'h1' for t, _ in p.tags) == 1, f'{url}: needs one source H1')
        for attr, key in [('name', 'description'), ('name', 'robots'), ('name', 'viewport'),
                          ('property', 'og:title'), ('property', 'og:description'),
                          ('property', 'og:url'), ('property', 'og:image'),
                          ('property', 'og:site_name'), ('property', 'og:locale'),
                          ('name', 'twitter:card'), ('name', 'twitter:title'),
                          ('name', 'twitter:description'), ('name', 'twitter:image')]:
            values = p.meta(key, attr)
            require(len(values) == 1 and bool(values[0].strip()), f'{url}: {key} missing or repeated')
        require(p.meta('og:url', 'property') == [url], f'{url}: social URL disagrees with canonical')
        desc = p.meta('description')
        if desc:
            require(desc[0] not in descriptions, f'{url}: duplicate description')
            descriptions.add(desc[0])
        blocks = re.findall(r'<script\s+type="application/ld\+json">(.*?)</script>', p.source, re.S)
        require(bool(blocks), f'{url}: missing structured data')
        for block in blocks:
            try:
                graph = json.loads(block)
                require(graph.get('@context') == 'https://schema.org', f'{url}: schema context')
                for node in graph.get('@graph', [graph]):
                    require(bool(node.get('@type')), f'{url}: untyped schema node')
                    if node.get('@type') in ('WebApplication', 'MobileApplication'):
                        require(not any(k in node for k in ('aggregateRating', 'review')), f'{url}: unverified app ratings')
            except (ValueError, TypeError) as e:
                errors.append(f'{url}: invalid JSON-LD: {e}')
        edges[url] = set()
        for tag, a in p.tags:
            if tag == 'img':
                require('alt' in a, f'{url}: image has no alt attribute')
            ref = a.get('href') or a.get('src')
            if tag == 'meta' and (a.get('property') == 'og:image' or a.get('name') == 'twitter:image'):
                ref = a.get('content')
            if not ref:
                continue
            dest = urlsplit(urljoin(url, ref))
            if dest.netloc != 'jovey.co':
                continue
            target = dest._replace(query='', fragment='').geturl()
            require(path_for(target).is_file(), f'{url}: missing local target {ref}')
            if tag == 'a':
                edges[url].add(target)
                if dest.fragment and target in public:
                    ids = {at.get('id') for _, at in public[target].tags}
                    require(unquote(dest.fragment) in ids, f'{url}: missing anchor {ref}')

    sitemap = [n.text for n in ET.parse(ROOT / 'sitemap.xml').findall('.//{*}loc')]
    require(len(sitemap) == len(set(sitemap)), 'Sitemap duplicates URLs')
    require(set(sitemap) == set(public), f'Sitemap differs from public canonical pages: {set(sitemap) ^ set(public)}')
    seen, queue = set(), deque([BASE + '/'])
    while queue:
        u = queue.popleft()
        if u in seen:
            continue
        seen.add(u)
        queue.extend(v for v in edges.get(u, ()) if v in public)
    require(set(public) <= seen, f'Pages orphaned from homepage: {set(public) - seen}')
    robots = (ROOT / 'robots.txt').read_text()
    require('Sitemap: https://jovey.co/sitemap.xml' in robots, 'robots.txt must declare sitemap')
    require(not re.search(r'^Disallow:\s*/\s*$', robots, re.M), 'robots.txt blocks all crawling')
    require((ROOT / 'CNAME').read_text().strip() == 'jovey.co', 'Unexpected production domain')
    redirect = pages[BASE + '/enneagame/']
    require(not redirect.indexable(), 'Legacy ENNEAGAME redirect should remain noindex')
    require(redirect.canonical() == ['https://enneagame.app/'], 'ENNEAGAME must retain its domain')
    require('window.location.search' in redirect.source and 'window.location.hash' in redirect.source, 'Legacy redirect must preserve referral query and hash')
    home_graph = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', public[BASE + '/'].source, re.S)[1])['@graph']
    sites = [n for n in home_graph if n.get('@type') == 'WebSite']
    require(len(sites) == 1 and sites[0]['name'] == 'Jovey' and sites[0]['url'] == BASE + '/', 'Home must identify one Jovey WebSite')
    app_urls = {n['url'] for n in home_graph if n.get('@type') in ('WebApplication', 'MobileApplication')}
    require(app_urls == {'https://enneagame.app/', BASE + '/attention/', 'https://mindspend.co/'}, 'Home app entities must identify all three real destinations')
    social = ROOT / 'assets/jovey-projects-og.png'
    if social.is_file():
        data = social.read_bytes()
        require(data[:8] == b'\x89PNG\r\n\x1a\n' and struct.unpack('>II', data[16:24]) == (1200, 630), 'Social card must be a 1200 x 630 PNG')
    else:
        errors.append('Missing Jovey social card')
    if errors:
        raise SystemExit('\n'.join('FAIL: ' + e for e in errors))
    print(f'PASS: {len(public)} indexable pages, {len(sitemap)} sitemap URLs, unique metadata, valid JSON-LD, local links, anchor targets, home reachability, app destinations and social card.')

if __name__ == '__main__':
    check()
