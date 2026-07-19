#!/usr/bin/env bash
# sync_attention.sh — bridge the standalone Attention Switch working copy into the repo.
#
# The app currently lives in two byte-identical places, kept in sync BY HAND:
#   source:  ~/Downloads/Attention switch/   (not even a git repo)
#   deploy:  jovey-site/attention/            (served at jovey.co/attention/)
#
# Going forward, prefer editing jovey-site/attention/ directly — the pre-commit hook then
# handles the cache bump for you. Use this script only while the standalone copy is still
# your working folder. It copies the code across, then bumps the repo cache version.
#
# NOTE: sw.js's cache counter is owned by the repo (it must only ever INCREMENT, or
# installed PWAs serve stale code), so sw.js is NOT copied from the standalone — edit its
# logic directly in attention/sw.js if you ever need to.
#
#   ./scripts/sync_attention.sh ["/path/to/Attention switch"]
set -euo pipefail
SRC="${1:-$HOME/Downloads/Attention switch}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DST="$ROOT/attention"

[ -d "$SRC" ] || { echo "✗ standalone not found: $SRC" >&2; exit 1; }

echo "→ syncing $SRC  →  $DST"
before="$(cat "$DST/app.js" "$DST/styles.css" "$DST/index.html" "$DST/manifest.json" "$DST/icon.svg" 2>/dev/null | shasum | cut -d' ' -f1)"
rsync -a \
  --exclude 'sw.js' --exclude 'README.md' --exclude 'logo-prompt.md' \
  --exclude '.claude' --exclude '.DS_Store' --exclude '.git' \
  "$SRC"/ "$DST"/
after="$(cat "$DST/app.js" "$DST/styles.css" "$DST/index.html" "$DST/manifest.json" "$DST/icon.svg" 2>/dev/null | shasum | cut -d' ' -f1)"

if [ "$before" != "$after" ]; then
  python3 "$ROOT/scripts/bump_sw_cache.py"
else
  echo "· no asset changes — cache left as-is"
fi
node --check "$DST/app.js"
node --check "$DST/sw.js"
echo "✓ done. Scoped diff:"
git -C "$ROOT" status --short attention/ || true
