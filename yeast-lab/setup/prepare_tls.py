#!/usr/bin/env python3
"""Select a trusted root from the computer's CA store after chain + hostname validation.
Run on the computer: python3 prepare_tls.py https://PROJECT.supabase.co
Requires Python 3 and openssl on PATH. Never downloads or trusts an unverified root.
"""
import re,ssl,subprocess,sys,tempfile
from pathlib import Path
from urllib.parse import urlparse
u=urlparse(sys.argv[1] if len(sys.argv)>1 else '')
if u.scheme!='https' or not u.hostname or not u.hostname.endswith('.supabase.co') or u.username:
 raise SystemExit('Usage: python3 prepare_tls.py https://PROJECT.supabase.co')
def run(args,**kw):return subprocess.run(['openssl',*args],capture_output=True,text=True,timeout=20,**kw)
with tempfile.TemporaryDirectory() as t:
 d=Path(t);roots=ssl.create_default_context().get_ca_certs(binary_form=True)
 if not roots:raise SystemExit('No trusted CA store found; configure Python system certificates first.')
 pems=[ssl.DER_cert_to_PEM_cert(x) for x in roots]
 (d/'trusted.pem').write_text(''.join(pems))
 chain=run(['s_client','-connect',u.hostname+':443','-servername',u.hostname,'-showcerts','-verify_return_error','-verify_hostname',u.hostname,'-CAfile',str(d/'trusted.pem')],input='')
 if chain.returncode:raise SystemExit('TLS validation failed. Use an internet connection without a login wall. No file changed.')
 certs=re.findall(r'-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----',chain.stdout,re.S)
 if not certs:raise SystemExit('Server returned no certificates')
 (d/'leaf.pem').write_text(certs[0]);(d/'chain.pem').write_text('\n'.join(certs[1:]))
 selected=None
 (d/'empty-ca').mkdir()
 openssl3=run(['version']).stdout.startswith('OpenSSL 3')
 for root in pems:
  (d/'root.pem').write_text(root)
  args=['verify','-CAfile',str(d/'root.pem'),'-CApath',str(d/'empty-ca'),'-verify_hostname',u.hostname]
  if openssl3:args+=['-no-CAstore']
  if len(certs)>1:args+=['-untrusted',str(d/'chain.pem')]
  if run(args+[str(d/'leaf.pem')]).returncode==0:selected=root;break
 if not selected:raise SystemExit('No matching trusted root; no file changed.')
 target=Path(__file__).parent/'Yeast_Cloud'/'secrets.h'
 text=target.read_text();text,n=re.subn(r'R"PEM\(.*?\)PEM"','R"PEM(\n'+selected+')PEM"',text,flags=re.S)
 if n!=1:raise SystemExit('Unexpected secrets.h format; no file changed.')
 target.write_text(text);print('Verified root saved into Yeast_Cloud/secrets.h. Upload firmware after configuration.')
