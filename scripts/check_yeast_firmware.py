#!/usr/bin/env python3
"""Host regression tests; ESP32 APIs are mocked, not an Arduino target build."""
from pathlib import Path
import shutil,subprocess,tempfile
root=Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory() as tmp:
 d=Path(tmp);shutil.copytree(root/'scripts/yeast_firmware_mocks',d,dirs_exist_ok=True)
 shutil.copytree(root/'yeast-lab/setup/Yeast_Cloud',d/'firmware')
 p=d/'firmware/secrets.h';p.write_text(p.read_text().replace('#define CLOUD_ENABLED false','#define CLOUD_ENABLED true'))
 for test in ['startup','ring','queue']:
  exe=d/('test_'+test)
  subprocess.run(['g++','-std=c++17','-I',str(d),str(d/('test_'+test+'.cpp')),'-o',str(exe)],check=True)
  for args in (['unset','password-placeholder','mode-fail','connect'] if test=='startup' else [None]):
   subprocess.run([str(exe)]+([args] if args else []),cwd=d,check=True)
