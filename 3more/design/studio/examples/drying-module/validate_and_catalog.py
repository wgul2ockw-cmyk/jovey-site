"""Validate the local run and retain source/derivative provenance; never calls providers."""
import sys,json,copy,struct
from pathlib import Path
out=Path(__file__).resolve().parent;studio=out.parents[1]
skill=studio/'skills/jovey-facility-workflow';sys.path.insert(0,str(skill/'scripts'));import workflow as w
catalog=json.loads((skill/'references/catalog.json').read_text())
receipt=json.loads((out/'receipt.json').read_text())
def asset(id,name,file,mode,kind,parent=None,adaptation=None):
 info=w.inspect_glb(out/file)
 return {'schema_version':1,'id':id,'version':1,'name':name,'scope':{'kind':'public','id':'jovey-concepts'},'path':'examples/drying-module/'+file,'tags':['drying','pilot','concept'],'source_kind':kind,'mode':mode,'adaptation':adaptation,'parent_id':parent,**{k:info[k] for k in ('file_sha256','geometry_sha256')},'style_id':'jovey-faceted-facilities-v1' if adaptation else None,'provenance':{'creator':'AI agent authored plan and Blender script; Blender executed locally','license':'Original project-generated geometry; reuse within this project','source':'generate.py: newly authored concept; not a fixed template or CAD-validated design','receipt_id':receipt['job_id']},'validation_class':'concept-only','review':'pending'}
source=asset('jovey-drying-source-v1','New drying module concept','source.glb','generate-new','procedural-new')
w.validate_result(source,out/'source.glb',catalog,receipt)
styled=asset('jovey-drying-styled-v1','Jovey drying concept','jovey-styled.glb','adapt','procedural-new',source['id'],'material-only')
w.validate_result(styled,out/'jovey-styled.glb',[source])
# A genuine material-only adaptation of the existing production asset, retaining BIN bytes.
parent=next(a for a in catalog if a['id']=='jovey-template-production')
b=(studio/parent['path']).read_bytes();n,t=struct.unpack_from('<II',b,12);j=json.loads(b[20:20+n]);palette=[[.18,.48,.50,1],[.47,.70,.67,1],[.16,.30,.32,1]]
for i,m in enumerate(j['materials']):m['pbrMetallicRoughness'].update(baseColorFactor=palette[i%3],metallicFactor=0,roughnessFactor=.95)
js=json.dumps(j,separators=(',',':')).encode();js+=b' '*((-len(js))%4);tail=b[20+n:]
(out/'adapted-production.glb').write_bytes(struct.pack('<III',0x46546c67,2,20+len(js)+len(tail))+struct.pack('<II',len(js),t)+js+tail)
adapted=asset('jovey-production-adapt-v1','Production template with Jovey materials','adapted-production.glb','adapt','procedural-template',parent['id'],'material-only');adapted['provenance']=dict(parent['provenance']);adapted['provenance']['source']='Existing production template; JSON materials changed, original BIN retained'
w.validate_result(adapted,out/'adapted-production.glb',[parent])
reuse=copy.deepcopy(next(a for a in catalog if a['id']=='jovey-template-research'));reuse.update(id='jovey-research-reuse-example',mode='reuse',parent_id='jovey-template-research');w.validate_result(reuse,studio/reuse['path'],catalog)
(out/'assets.json').write_text(json.dumps([reuse,adapted,source,styled],indent=2)+'\n')
plan=json.loads((skill/'references/example-plan.json').read_text());plan['modules'][2]['reason']='No dryer matches the catalog; the agent authored new local Blender geometry for this illustrative proposal. No remote provider used.';plan['unknowns'].remove('Provider authorization');w.validate('plan',plan);(out/'plan.json').write_text(json.dumps(plan,indent=2)+'\n')
report={'reuse':'exact source hash retained','adapt':'same geometry as original production; different file/materials','new_geometry':'different geometry fingerprint from every seed asset','style':'same geometry as new neutral source','validation':'concept-only; visual review required; no engineering dimensions','provider_calls':0}
(out/'validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
