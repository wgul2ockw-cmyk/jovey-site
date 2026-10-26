#!/usr/bin/env python3
"""Build the portable S15 HTML without third-party build dependencies.

This deliberately supports only the named imports and declaration exports used
by the checked-in Pulse Lab modules. Unsupported syntax and cycles fail closed.
Model JSON is embedded byte-for-value; acquisition and prediction code is shared
with the hosted release. Camera access still depends on a secure browser context.
"""
from pathlib import Path
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / 'pulse-lab'
RELEASE = APP / 'releases' / 'S15-JOVEY-20261026'
OUTPUT = APP / 'Pulse_Lab_S15_Jovey.html'
IMPORT = re.compile(r"^import\s*\{([^}]+)\}\s*from\s*['\"](\./[^'\"]+)['\"];?\s*$", re.M)
EXPORT = re.compile(r'^export\s+(?:async\s+)?(?:const|function|class)\s+(\w+)', re.M)
ASSETS = ['model.json', 'benchmark.json', 'examples.json',
          'spo2/S2-20261005/model.json', 'spo2/S2-20261005/examples.json']


def build():
    compiled, visiting = {}, set()
    def module(name):
        if name in compiled:
            return
        if name in visiting:
            raise ValueError(f'Cyclic imports: {name}')
        visiting.add(name)
        path = RELEASE / name
        source = path.read_text()
        def import_binding(match):
            names, relative = match.groups()
            if not all(re.fullmatch(r'\s*\w+\s*', n) for n in names.split(',')):
                raise ValueError(f'Unsupported import: {name}')
            dependency = relative.removeprefix('./')
            if Path(dependency).name != dependency:
                raise ValueError(f'Unexpected import path: {relative}')
            module(dependency)
            return f'const {{{names}}}=__pulseModules[{json.dumps(dependency)}];'
        rewritten = IMPORT.sub(import_binding, source)
        exports = EXPORT.findall(rewritten)
        rewritten = re.sub(r'^export\s+', '', rewritten, flags=re.M)
        if re.search(r'^\s*(?:import|export)\b', rewritten, re.M):
            raise ValueError(f'Unsupported module syntax: {name}')
        compiled[name] = (f'__pulseModules[{json.dumps(name)}]=(()=>{{\n'
                          + rewritten + '\nreturn {' + ','.join(exports) + '};\n})();')
        visiting.remove(name)
    module('app.mjs')
    assets = {'./' + name: json.loads((APP / name).read_text()) for name in ASSETS}
    payload = json.dumps(assets, ensure_ascii=True, separators=(',', ':'))
    payload = payload.replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
    bundle = ('"use strict";\n(()=>{\nconst __pulseModules=Object.create(null);\n'
              'globalThis.__PULSE_LAB_ASSETS__=' + payload + ';\n'
              + '\n'.join(compiled.values()) + '\n})();')
    bundle = re.sub(r'</script', r'<\\/script', bundle, flags=re.I)
    html = (APP / 'index.html').read_text()
    html, replaced = re.subn(r'<script type="module" src="\./releases/S15-JOVEY-20261026/app\.mjs"></script>',
                            lambda _: '<script id="pulse-lab-portable">\n' + bundle + '\n</script>', html)
    assert replaced == 1, 'Expected exactly one hosted module entrypoint'
    # Documentation links work when the export is copied to any directory.
    html = re.sub(r'href="\./([^"#]+)"', lambda m: 'href="https://jovey.co/pulse-lab/' + m[1] + '"', html)
    license_text = (APP / 'spo2/S2-20261005/hoffman-LICENSE.txt').read_text()
    html = html.replace('</head>', '<!-- Dataset attribution\n' + license_text + '\n-->\n</head>')
    OUTPUT.write_text(html)
    manifest = {
        'build': 'S15-JOVEY-20261026',
        'source_commit': '4e171d16dfc4c52e8dd178729d134f82f80b467d',
        'source_build': 'S15-20261005',
        'models_retrained': False,
        'standalone': OUTPUT.name,
        'module_count': len(compiled),
        'assets': {name: hashlib.sha256((APP / name).read_bytes()).hexdigest() for name in ASSETS},
        'portable_sha256': hashlib.sha256(OUTPUT.read_bytes()).hexdigest(),
    }
    (APP / 'export-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'Exported {OUTPUT.name}: {len(compiled)} modules, {OUTPUT.stat().st_size:,} bytes')


if __name__ == '__main__':
    build()
