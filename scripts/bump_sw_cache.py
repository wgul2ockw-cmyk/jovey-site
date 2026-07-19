#!/usr/bin/env python3
"""
bump_sw_cache.py — increment the service-worker cache generation in attention/sw.js.

HANDOFF.md's hard invariant: "whenever an asset changes, bump the cache name in sw.js" or
installed PWAs serve stale code. That bump is pure discipline and easy to forget — this
automates it (see the pre-commit hook in .githooks/pre-commit, which calls this).

    attention-switch-v50  ->  attention-switch-v51

Usage:
    python3 scripts/bump_sw_cache.py [path/to/sw.js]   # default: attention/sw.js
    python3 scripts/bump_sw_cache.py --check           # show current + next, no write
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAT = re.compile(r'(attention-switch-v)(\d+)')


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    check = '--check' in sys.argv
    path = args[0] if args else os.path.join(ROOT, "attention", "sw.js")
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()
    m = PAT.search(text)
    if not m:
        print(f"✗ no 'attention-switch-vN' found in {path}", file=sys.stderr)
        sys.exit(1)
    cur = int(m.group(2))
    nxt = cur + 1
    if check:
        print(f"current: v{cur}  →  next: v{nxt}  ({path})")
        return
    new = PAT.sub(lambda mm: f"{mm.group(1)}{nxt}", text, count=0)
    with open(path, "w", encoding="utf-8") as f:
        f.write(new)
    print(f"✓ cache bumped v{cur} → v{nxt}")


if __name__ == "__main__":
    main()
