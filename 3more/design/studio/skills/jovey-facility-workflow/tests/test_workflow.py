import copy,json,struct,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import workflow as w
from jsonschema import ValidationError
CAT=json.loads((w.ROOT/'references/catalog.json').read_text())
CTX={'subject':'owner-a','teams':['team-1']}
REQ={'schema_version':1,'idempotency_key':'job-1','workspace':{'kind':'personal','id':'owner-a'},'plan_id':'p1','plan_revision':1,'mode':'generate-new','source_asset_id':None,'adaptation':None,'brief':'A fermentation pilot module','style_id':'jovey-faceted-facilities-v1','provider':None,'budget':{'currency':'USD','maximum':0}}
PLAN={'schema_version':1,'id':'p1','workspace':REQ['workspace'],'brief':REQ['brief'],'author':'test agent','origin':'agent-proposal','status':'proposed','steps':[{'id':'s1','title':'Explore requirements','depends_on':[],'status':'proposed','evidence':[]}],'modules':[{'id':'m1','description':'Pilot module','step_ids':['s1'],'mode':'generate-new','reason':'No matching layout','source_asset_id':None}],'unknowns':['Capacity'],'validation_class':'concept-only'}
class Tests(unittest.TestCase):
 def test_seed_catalog_bytes(self):self.assertEqual(w.catalog_check()['assets'],4)
 def test_schema_rejects_unexpected_secret(self):
  r=copy.deepcopy(REQ);r['api_key']='not-real'
  with self.assertRaises(ValidationError):w.validate('request',r)
 def test_source_mode(self):
  r=copy.deepcopy(REQ);r['mode']='reuse'
  with self.assertRaises(ValueError):w.validate('request',r)
 def test_plan_valid(self):w.validate('plan',PLAN)
 def test_plan_cycle(self):
  p=copy.deepcopy(PLAN);p['steps'][0]['depends_on']=['s1']
  with self.assertRaises(ValueError):w.validate('plan',p)
 def test_module_mapping(self):
  p=copy.deepcopy(PLAN);p['modules'][0]['step_ids']=['missing']
  with self.assertRaises(ValueError):w.validate('plan',p)
 def test_foreign_personal_denied(self):
  r=copy.deepcopy(REQ);r['workspace']['id']='owner-b'
  with self.assertRaises(PermissionError):w.authorize_request(r,CTX,CAT)
 def test_team_not_member(self):
  r=copy.deepcopy(REQ);r['workspace']={'kind':'team','id':'other'}
  with self.assertRaises(PermissionError):w.authorize_request(r,CTX,CAT)
 def test_catalog_separation(self):
  private=copy.deepcopy(CAT[0]);private['id']='private';private['scope']=REQ['workspace'];team={'kind':'team','id':'team-1'}
  found=w.search([private,*CAT],'research',team,CTX)
  self.assertEqual([a['id'] for a in found],['jovey-template-research'])
 def test_cross_scope_source_denied(self):
  private=copy.deepcopy(CAT[0]);private['scope']=REQ['workspace'];r=copy.deepcopy(REQ);r.update(mode='reuse',source_asset_id=private['id'],workspace={'kind':'team','id':'team-1'})
  with self.assertRaises(PermissionError):w.authorize_request(r,CTX,[private])
 def test_generation_missing_grants_blocks(self):
  result=w.provider_gate(REQ,CTX,CAT,{})
  self.assertEqual(result['status'],'blocked');self.assertFalse(result['executed']);self.assertIn('spending cap',result['missing'])
 def test_grant_payload_bound(self):
  r=copy.deepcopy(REQ);r['provider']='candidate';r['budget']['maximum']=1
  grant={'subject':'owner-a','workspace':r['workspace'],'provider':'candidate','request_sha256':w.digest(json.dumps(r,sort_keys=True,separators=(',',':')).encode()),'credentials_ready':True,'data_sharing_approved':True,'spending_cap':2}
  self.assertEqual(w.provider_gate(r,CTX,CAT,grant)['status'],'ready-for-server-dispatch')
  r['brief']='Different confidential input';self.assertEqual(w.provider_gate(r,CTX,CAT,grant)['status'],'blocked')
 def test_nan_budget_rejected(self):
  r=copy.deepcopy(REQ);r['provider']='candidate';r['budget']['maximum']=float('nan')
  with self.assertRaises(ValueError):w.validate('request',r)
 def test_outcome_unknown_cannot_resubmit(self):
  self.assertEqual(w.transition('submitting','outcome-unknown'),'outcome-unknown')
  with self.assertRaises(ValueError):w.transition('outcome-unknown','submitting')
 def test_poll_error_keeps_job(self):self.assertEqual(w.transition('running','poll-error'),'running')
 def test_stale_workspace_and_revision(self):
  job={'subject':'owner-a','workspace':REQ['workspace'],'plan_revision':1,'request_id':'r1'}
  self.assertTrue(w.result_matches(job,'owner-a',REQ['workspace'],1,'r1'))
  self.assertFalse(w.result_matches(job,'owner-a',{'kind':'team','id':'team-1'},1,'r1'))
  self.assertFalse(w.result_matches(job,'owner-a',REQ['workspace'],2,'r1'))
 def test_recolour_not_new_geometry(self):
  a=copy.deepcopy(CAT[0]);original=w.STUDIO/a['path'];b=original.read_bytes();n,t=struct.unpack_from('<II',b,12);j=json.loads(b[20:20+n]);j['materials'][0]['pbrMetallicRoughness']['baseColorFactor']=[1,0,0,1]
  js=json.dumps(j,separators=(',',':')).encode();js+=b' '*((-len(js))%4);tail=b[20+n:];out=struct.pack('<III',0x46546c67,2,20+len(js)+len(tail))+struct.pack('<II',len(js),t)+js+tail
  with tempfile.TemporaryDirectory() as d:
   path=Path(d)/'recolour.glb';path.write_bytes(out);info=w.inspect_glb(path)
   self.assertEqual(info['geometry_sha256'],a['geometry_sha256']);self.assertNotEqual(info['file_sha256'],a['file_sha256'])
   a.update({k:info[k] for k in ('file_sha256','geometry_sha256')});a.update(mode='adapt',adaptation='material-only',parent_id=CAT[0]['id']);w.validate_result(a,path,CAT)
   a.update(mode='generate-new',source_kind='provider-ai',adaptation=None,parent_id=None)
   with self.assertRaisesRegex(ValueError,'known geometry'):w.validate_result(a,path,CAT)
 def test_real_new_geometry_requires_receipt(self):
  a=copy.deepcopy(CAT[0]);a.update(mode='generate-new',source_kind='procedural-new',parent_id=None)
  with self.assertRaisesRegex(ValueError,'receipt'):w.validate_result(a,w.STUDIO/a['path'],[])
 def test_invalid_glb(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'bad.glb';p.write_bytes(b'not a GLB')
   with self.assertRaises(ValueError):w.inspect_glb(p)
 def test_template_not_ai_generation(self):
  a=copy.deepcopy(CAT[0]);a['mode']='generate-new'
  with self.assertRaisesRegex(ValueError,'templates'):w.validate_result(a,w.STUDIO/a['path'],[])
if __name__=='__main__':unittest.main()
