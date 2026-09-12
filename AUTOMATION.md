# Automation — the plot

Portfolio-wide automation to scale six solo projects. This is the durable version of the
plan; it lives here because this is the versioned repo. Built 2026-07-19.

The six projects are **three families**, each with a reference implementation that was
being hand-cloned. The automation removes the two taxes: **repeating mechanical loops** and
**copy-pasting conventions between projects**.

## ✅ Built

### Family A — the three llm-wiki vaults (Fammed · VOCs-TB · Hindgut)
Shared toolkit at **`~/llm-wiki-kit/`** (scripts central → one fix upgrades all three vaults):
- `dashboard.py` — regenerates each `Dashboard.md` as **real tables from frontmatter**, no
  Dataview plugin needed. *The dashboards were dead code in all three vaults; now live.*
- `lint.py` — schema health-check; `--fix` applies safe repairs (backs up `*.lwk-bak` first).
- `srs.py` — Fammed spaced-repetition scheduler (`--due`, `grade`), so interval math is never
  hand-done. *(Fammed had silently drifted 3 days overdue.)*
- Slash commands installed into every vault's `.claude/commands/`:
  **/dashboard /lint /ingest /review**, plus **/recall** in Fammed.
- Run across all: `python3 ~/llm-wiki-kit/scripts/dashboard.py --all` · `… lint.py --all`

### Family C — jovey-site + Attention Go (this repo)
- `scripts/gen_sitemap.py` — rebuilds `sitemap.xml` from the tree (**was 7 URLs → now 14**,
  all 6 posts + `/attention/`, git `lastmod`).
- `scripts/new_post.py` — one-command new post (page + OG/JSON-LD + blog card + sitemap).
- `scripts/bump_sw_cache.py` + `scripts/sync_attention.sh` — cache-version discipline and the
  standalone→repo bridge.
- `.githooks/pre-commit` — auto-bumps the sw.js cache and rebuilds the sitemap on commit, and
  `node --check`s the app. Enable once: `git config core.hooksPath .githooks`.

## ⏳ Deferred (chosen not to build yet)

### Family B — MindSpend (iOS) — the bigger pipeline
- **GitHub Actions CI**: build + test + `audit_dark_theme.py`, run `mindai_eval` when the
  prompt changes. (Biggest gap — no CI today.)
- **Atomic release numbering** (`/reserve-release`) to kill the `Rxx` collisions.
- **Real release pipeline**: git tags + GitHub Releases + fastlane→TestFlight; retire the
  `_Rxx_*.zip` snapshots (~60 MB dead weight).

### Cross-cutting capstone
- A scheduled **morning briefing** that reads all six projects' logs and reports "what's due /
  what drifted" across the whole portfolio.

## Notes
- The vaults are not git repos (Hindgut is on Google Drive) → every writing tool makes a
  one-time `*.lwk-bak` backup and defaults to dry-run/report.
- Full detail + rationale: `~/llm-wiki-kit/README.md` and `scripts/README.md`.
