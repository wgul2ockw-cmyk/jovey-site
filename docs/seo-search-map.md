# Jovey search coverage

Implemented September 8, 2026. Scope: jovey.co, with canonical links to enneagame.app and mindspend.co. The other applications are referenced, not moved or duplicated.

## Findings and changes

The homepage previously led with a slogan and had Organization markup but no WebSite name entity. Attention had no canonical, social metadata, or source H1; its main content depended entirely on JavaScript. There was no consolidated project directory or explanation of the ENNEAGAME and Attention products. Blog and growth pages already had useful content and self canonicals, but social metadata and shared publisher identity were inconsistent.

This release adds a useful project directory and two guides, makes Jovey and its three applications explicit in visible copy and structured data, completes metadata on every indexable page, and links the projects from existing hubs. The existing MindSpend story is retained and connected. The ENNEAGAME redirect and encrypted noindex page remain excluded from the sitemap. The sitemap generator now excludes missing, noindex, redirect, and noncanonical pages; checks in CI catch broken links and orphan pages.

## Keyword-to-page map

Priority is based on product relevance and intent, not measured search volume. At planning time no Search Console, Ahrefs, or Semrush dataset was connected; the query families below are editorial targets, not a list of measured rankings. The owner’s Search Console property was subsequently accessed in the browser during release verification. Search volume and keyword difficulty remain unmeasured. Query variants in a row share one destination; they do not need separate near-duplicate pages.

| Search query / family | Intent | Priority | Primary Jovey destination |
| --- | --- | --- | --- |
| Jovey | Brand navigation | High | / |
| Jovey.co / Jovey Co | Brand navigation | High | / |
| Jovey คืออะไร | Brand information | High | / |
| Jovey apps / Jovey projects | Product discovery | High | /projects/ |
| แอปของ Jovey | Product discovery | High | /projects/ |
| Jovey ENNEAGAME | Product navigation | High | /projects/enneagame/ |
| ENNEAGAME by Jovey | Product information | High | /projects/enneagame/ |
| Enneagame คืออะไร | Product information | High | /projects/enneagame/ |
| แบบทดสอบนพลักษณ์ Jovey | Product discovery | High | /projects/enneagame/ |
| วิธีอ่านผล ENNEAGAME | Product help | High | /projects/enneagame/ |
| Jovey Attention | Product navigation | High | /projects/attention-switch/ |
| Attention Switch by Jovey | Product navigation | High | /attention/ |
| Attention Switch วิธีใช้ | Product help | High | /projects/attention-switch/ |
| แอปจับเวลาความสนใจ | Tool discovery | High | /projects/attention-switch/ |
| จับเวลารายโปรเจกต์ | Tool discovery | High | /projects/attention-switch/ |
| บันทึกการสลับงาน | Tool discovery | High | /projects/attention-switch/ |
| Attention Switch time tracker | Tool use | High | /attention/ |
| Jovey MindSpend | Product navigation | High | /mindspend/ |
| MindSpend by Jovey | Product information | High | /mindspend/ |
| MindSpend พฤติกรรมการใช้เงิน | Product information | High | /mindspend/ |
| ผู้สร้าง Jovey / Aznr Jovey / Thitipong Nonnoi | Creator information | High | /about/ |
| Jovey พัฒนาตัวเอง / personal growth | Topic discovery | Medium | /growth/personal/ |
| Jovey เข้าใจตัวเอง / spiritual growth | Topic discovery | Medium | /growth/spiritual/ |
| Jovey สุขภาพและการพักผ่อน / vitality growth | Topic discovery | Medium | /growth/vitality/ |
| บทความ Jovey / Jovey blog | Reading | High | /blog/ |

Broad Enneagram tests belong primarily on enneagame.app. Broad budget tracking and money guides belong primarily on mindspend.co. Jovey supplies brand context, project selection, and practical project-specific guidance. The existing specific article URLs remain the destinations for queries about Transformative Learning, Three-part Structure, The Power of Now, and the other published articles.

## Technical decisions

- Use visible, descriptive text, ordinary HTML links, one self canonical per indexable page, and unique titles/descriptions. No hidden keyword lists, meta keywords, or pages generated for spelling variants.
- Home has one WebSite identity, an Organization, its creator, and three application entities linked by creator references. Separate products are not asserted to be `sameAs` the Jovey organization. No invented ratings, customer counts, or product offers.
- Product guides use WebPage, application, and BreadcrumbList markup. FAQ text helps readers; it does not assert eligibility for FAQ rich results.
- The Attention shell includes an initial explanation that its renderer replaces. A short explanation and guide links remain visible in the footer after JavaScript loads. Storage keys and timing behavior are unchanged.
- Social sharing uses an actual 1200 × 630 PNG. Existing article images remain on their articles.
- Changes to cached Attention assets require a service-worker cache bump; the existing pre-commit hook performs this. Sitemap `lastmod` uses git dates, with today's date for files being edited; an unchanged file does not acquire a new date on every generation.
- Test with `python3 scripts/check_seo.py`, `python3 scripts/check_mindspend.py`, and `node --check attention/app.js`. These validate source quality, not rankings or field Core Web Vitals.

## Measurement and remaining work

Release verification: the update was published through PR #15, and all 18 public pages plus six supporting resources returned HTTP 200 with contents matching the tested release. The updated `https://jovey.co/sitemap.xml` was submitted through the verified jovey.co domain property on September 8, 2026. Search Console reported **Success**, a last-read date of September 8, and **18 discovered pages**. Inspect the homepage, project hub, both new guides, MindSpend story, and Attention app as Google processes the update. A sitemap submission is not guaranteed indexing. Ownership credentials must come from the actual Search Console property; do not invent verification tokens or submit guessed credentials.

Save the prior 28 days of clicks, impressions, CTR and average position, then compare subsequent 28-day periods by page, brand queries, project queries, language and device. Filter brand queries with a case-insensitive expression such as `jovey|enneagame|attention switch|mindspend|aznr|thitipong`. Separate the Attention app from its guide because their intents differ. Changes in impressions may reflect demand or indexing rather than a ranking improvement.

Next content investments should follow actual query data: expand the thin Vitality hub when real articles are available; add independently authored project examples; only add English pages when they contain a complete translation and can have reciprocal hreflang. Search result samples included an unrelated mindspend.app product, so preserve mindspend.co as the explicitly named Jovey destination.

Access observed before implementation: Jovey and MindSpend returned HTTP 200 directly. ENNEAGAME returned HTTP 403 from this environment, so its live app and unverified deep links were not claimed as tested. The Jovey production homepage and existing project descriptions support the ENNEAGAME relationship. A private aggregate performance baseline was read from Search Console during release verification; it is not published in this repository. Per-target keyword rankings, backlink profiles, competitor traffic and field performance were not established by this work.

## Primary guidance

- [Google Search Essentials](https://developers.google.com/search/docs/essentials): helpful content, prominent descriptive wording and crawlable links.
- [SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide): language matching handles variants; meta keywords are not used by Google.
- [Site names](https://developers.google.com/search/docs/appearance/site-names): identify the site consistently through homepage WebSite markup.
- [Organization markup](https://developers.google.com/search/docs/appearance/structured-data/organization): describe the real entity with applicable facts.
- [Spam policies](https://developers.google.com/search/docs/essentials/spam-policies): avoid keyword stuffing and doorway pages.

No implementation guarantees ranking for every keyword. The intended result is clearer coverage of relevant queries and a stronger path from discovery to the appropriate product.
