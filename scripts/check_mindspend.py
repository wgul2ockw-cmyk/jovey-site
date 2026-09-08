#!/usr/bin/env python3
"""Validate the MindSpend project story, cross-links, and sitemap entry."""
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import urljoin, urlsplit
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
URL = 'https://jovey.co/mindspend/'

class Page(HTMLParser):
    def __init__(self, source):
        super().__init__(); self.tags=[]; self.feed(source)
    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))

source=(ROOT/'mindspend/index.html').read_text()
page=Page(source)
assert sum(t=='h1' for t,a in page.tags)==1, 'Project page needs one H1'
assert [(t,a['href']) for t,a in page.tags if t=='link' and a.get('rel')=='canonical']==[('link',URL)]
for attr, name in [('name','description'),('name','robots'),('property','og:title'),('property','og:description'),('property','og:url'),('property','og:image'),('name','twitter:card')]:
    tags=[a for t,a in page.tags if t=='meta' and a.get(attr)==name]
    assert len(tags)==1 and tags[0].get('content'), name
assert 'noindex' not in source
for t,a in page.tags:
    if t=='img': assert 'alt' in a
    ref=a.get('href') or a.get('src')
    if not ref: continue
    u=urlsplit(urljoin(URL,ref))
    if u.netloc!='jovey.co': continue
    path=u.path.lstrip('/')
    if not path or path.endswith('/'): path+='index.html'
    assert (ROOT/path).is_file(), 'Broken project-page target: '+ref

blocks=re.findall(r'<script type="application/ld\+json">(.*?)</script>',source,re.S)
assert len(blocks)==1
graph=json.loads(blocks[0])['@graph']
assert any(n.get('@type')=='MobileApplication' and n['url']=='https://mindspend.co/' for n in graph)
assert any(n.get('@type')=='BreadcrumbList' for n in graph)
assert 'href="/mindspend/"' in (ROOT/'index.html').read_text(), 'Project story must be linked from home'
for f in ROOT.rglob('*.html'):
    assert 'https://wgul2ockw-cmyk.github.io/-mindspend-site/' not in f.read_text(), str(f)
urls=[n.text for n in ET.parse(ROOT/'sitemap.xml').findall('.//{*}loc')]
assert len(urls)==len(set(urls)) and urls.count(URL)==1
assert 'Sitemap: https://jovey.co/sitemap.xml' in (ROOT/'robots.txt').read_text()
assert (ROOT/'CNAME').read_text().strip()=='jovey.co'
print('PASS: MindSpend story metadata, schema, images, local links, homepage discovery, production cross-links and sitemap.')
