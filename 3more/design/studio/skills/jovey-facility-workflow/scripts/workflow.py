"""Offline validation and catalog helpers. No networking or provider execution."""
import argparse, copy, hashlib, json, math, struct
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker
ROOT=Path(__file__).resolve().parents[1]
STUDIO=ROOT.parents[1]
SCHEMA=json.loads((ROOT/'references/workflow.schema.json').read_text())

def digest(data): return hashlib.sha256(data).hexdigest()
def validate(kind,value):
    schema={**SCHEMA,'$ref':'#/$defs/'+kind}
    Draft202012Validator(schema,format_checker=FormatChecker()).validate(value)
    if kind=='plan':
        ids=[s['id'] for s in value['steps']]
        if len(ids)!=len(set(ids)): raise ValueError('duplicate step IDs')
        graph={s['id']:s['depends_on'] for s in value['steps']}
        visited=set()
        def visit(k,path):
            if k not in graph: raise ValueError('unknown dependency')
            if k in path: raise ValueError('dependency cycle')
            if k in visited:return
            for d in graph[k]:visit(d,path|{k})
            visited.add(k)
        for k in graph:visit(k,set())
        mids=[m['id'] for m in value['modules']]
        if len(mids)!=len(set(mids)): raise ValueError('duplicate module IDs')
        for m in value['modules']:
            if not m['step_ids'] or not set(m['step_ids'])<=set(ids):raise ValueError('invalid module step mapping')
            if (m['mode'] in ('reuse','adapt')) != bool(m['source_asset_id']):raise ValueError('source does not match module mode')
    if kind=='request':
        if not math.isfinite(value['budget']['maximum']):raise ValueError('finite budget required')
        if value['workspace']['kind']=='public':raise ValueError('public workspace is read-only')
        if (value['mode'] in ('reuse','adapt')) != bool(value['source_asset_id']):raise ValueError('source does not match request mode')
        if (value['mode']=='adapt') != bool(value['adaptation']):raise ValueError('adaptation does not match mode')
        if value['mode']!='generate-new' and value['provider'] is not None:raise ValueError('provider only valid for new geometry')
    return value

def inspect_glb(path):
    b=Path(path).read_bytes()
    if not 20<=len(b)<=30*1024*1024:raise ValueError('invalid GLB size')
    if struct.unpack_from('<III',b)!= (0x46546c67,2,len(b)):raise ValueError('invalid GLB header')
    chunks=[];off=12
    while off<len(b):
        if off+8>len(b):raise ValueError('truncated chunk')
        n,t=struct.unpack_from('<II',b,off);off+=8
        if n%4 or off+n>len(b):raise ValueError('invalid chunk size')
        chunks.append((t,b[off:off+n]));off+=n
    if len(chunks)!=2 or chunks[0][0]!=0x4e4f534a or chunks[1][0]!=0x004e4942:raise ValueError('require JSON and BIN chunks')
    j=json.loads(chunks[0][1]);binary=chunks[1][1]
    if j.get('asset',{}).get('version')!='2.0':raise ValueError('require glTF 2.0')
    if j.get('extensionsRequired') or j.get('skins') or j.get('animations'):raise ValueError('unsupported compressed/animated model; use static uncompressed GLB')
    for x in j.get('buffers',[])+j.get('images',[]):
        if 'uri' in x:raise ValueError('require embedded buffers and textures')
    if len(j.get('buffers',[]))!=1 or j['buffers'][0]['byteLength']>len(binary):raise ValueError('invalid buffer')
    formats={5120:('b',1),5121:('B',1),5122:('h',2),5123:('H',2),5125:('I',4),5126:('f',4)}
    widths={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
    def accessor(idx):
        a=j['accessors'][idx]
        if 'sparse' in a:raise ValueError('sparse accessors unsupported')
        v=j['bufferViews'][a['bufferView']]
        if v.get('buffer',0)!=0:raise ValueError('external buffer')
        fmt,size=formats[a['componentType']];width=widths[a['type']];packed=size*width;stride=v.get('byteStride',packed)
        start=v.get('byteOffset',0)+a.get('byteOffset',0);count=a['count'];end=start+(count-1)*stride+packed
        if count<=0 or count>2_000_000 or stride<packed or end>v.get('byteOffset',0)+v['byteLength'] or end>len(binary):raise ValueError('invalid accessor bounds')
        rows=[struct.unpack_from('<'+fmt*width,binary,start+i*stride) for i in range(count)]
        if any(not math.isfinite(x) for row in rows for x in row):raise ValueError('nonfinite geometry')
        return rows
    meshes=[];vertices=0
    for mesh in j.get('meshes',[]):
        primitives=[]
        for p in mesh['primitives']:
            if p.get('extensions') or p.get('targets'):raise ValueError('unsupported geometry encoding')
            if p.get('mode',4)!=4:raise ValueError('only triangle meshes supported')
            position=accessor(p['attributes']['POSITION'])
            if any(len(row)!=3 for row in position):raise ValueError('positions must be VEC3')
            indices=accessor(p['indices']) if 'indices' in p else [(i,) for i in range(len(position))]
            if len(indices)%3 or any(len(i)!=1 or not isinstance(i[0],int) or not 0<=i[0]<len(position) for i in indices):raise ValueError('invalid triangles')
            vertices+=len(position);primitives.append({'positions':position,'indices':indices})
        meshes.append(primitives)
    if not vertices:raise ValueError('empty geometry')
    # Include placement/scale, exclude names/materials/textures so recolour is not new geometry.
    nodes=[{k:v for k,v in n.items() if k in ('mesh','matrix','translation','rotation','scale','children')} for n in j.get('nodes',[])]
    geometry={'meshes':meshes,'nodes':nodes,'scenes':[{'nodes':x.get('nodes',[])} for x in j.get('scenes',[])],'scene':j.get('scene',0)}
    return {'file_sha256':digest(b),'geometry_sha256':digest(json.dumps(geometry,sort_keys=True,separators=(',',':')).encode()),'vertices':vertices,'meshes':len(meshes)}

def authorized(scope,context):
    # context must be created by verified server authentication, NEVER request JSON.
    return scope['kind']=='public' or (scope['kind']=='personal' and scope['id']==context['subject']) or (scope['kind']=='team' and scope['id'] in context['teams'])

def search(catalog,query,workspace,context):
    if not authorized(workspace,context):raise PermissionError('workspace access denied')
    tokens=set(query.lower().split());results=[]
    for a in catalog:
        if not authorized(a['scope'],context):continue
        # Personal and Team are separate even when caller belongs to both.
        if a['scope']['kind']!='public' and a['scope']!=workspace:continue
        score=len(tokens & set((' '.join(a['tags'])+' '+a['name']).lower().split()))
        if score:results.append((score,a))
    return [copy.deepcopy(a) for _,a in sorted(results,key=lambda p:(-p[0],p[1]['id']))]

def authorize_request(request,context,catalog):
    validate('request',request)
    if not authorized(request['workspace'],context):raise PermissionError('workspace access denied')
    if request['source_asset_id']:
        source=next((a for a in catalog if a['id']==request['source_asset_id']),None)
        if not source or not authorized(source['scope'],context):raise PermissionError('source unavailable')
        if source['scope']['kind']!='public' and source['scope']!=request['workspace']:raise PermissionError('explicit cross-workspace share required')
    return True

def provider_gate(request,context,catalog,grant):
    authorize_request(request,context,catalog)
    if request['mode']!='generate-new':raise ValueError('not a generation request')
    missing=[]
    # grant is server-owned and binds exact payload, provider, subject and workspace.
    expected=digest(json.dumps(request,sort_keys=True,separators=(',',':')).encode())
    for field,actual in [('subject',context['subject']),('workspace',request['workspace']),('provider',request['provider']),('request_sha256',expected)]:
        if not actual or grant.get(field)!=actual:missing.append(field)
    if grant.get('data_sharing_approved') is not True:missing.append('data-sharing approval')
    if grant.get('credentials_ready') is not True:missing.append('server credentials')
    cap=grant.get('spending_cap',0)
    if isinstance(cap,bool) or not isinstance(cap,(int,float)) or not math.isfinite(cap) or cap<=0 or request['budget']['maximum']<=0 or request['budget']['maximum']>cap:missing.append('spending cap')
    return {'status':'blocked' if missing else 'ready-for-server-dispatch','missing':missing,'executed':False}

def validate_result(asset,path,parents,receipt=None):
    validate('asset',asset)
    if asset['mode']=='catalog-seed':raise ValueError('catalog seeds are not job outputs')
    actual=inspect_glb(path)
    for k in ('file_sha256','geometry_sha256'):
        if asset[k]!=actual[k]:raise ValueError('asset hash mismatch: '+k)
    parent=next((x for x in parents if x['id']==asset['parent_id']),None)
    if asset['mode'] in ('reuse','adapt') and parent is None:raise ValueError('parent provenance required')
    if asset['mode'] in ('reuse','adapt') and asset['source_kind']!=parent['source_kind']:raise ValueError('derivative must preserve source origin')
    if asset['mode']=='reuse' and asset['file_sha256']!=parent['file_sha256']:raise ValueError('reuse must preserve exact source')
    if asset['mode']=='adapt':
        same=asset['geometry_sha256']==parent['geometry_sha256']
        if asset['adaptation']=='material-only' and not same:raise ValueError('geometry changed in material-only result')
        if asset['adaptation']=='geometry-adaptation' and same:raise ValueError('geometry adaptation did not change geometry')
        if not asset['adaptation']:raise ValueError('adaptation kind required')
    if asset['mode']=='generate-new':
        if asset['source_kind'] not in ('procedural-new','provider-ai'):raise ValueError('templates/imports are not new generation')
        if any(x['geometry_sha256']==asset['geometry_sha256'] for x in parents):raise ValueError('known geometry is not new')
        if receipt is None:raise ValueError('worker receipt required')
        validate('receipt',receipt)
        expected='provider-ai' if asset['source_kind']=='provider-ai' else 'procedural'
        if receipt['method']!=expected or receipt['output_sha256']!=asset['file_sha256'] or asset['provenance']['receipt_id']!=receipt['job_id']:raise ValueError('receipt mismatch')
        if expected=='provider-ai' and not receipt['provider_task_id']:raise ValueError('provider task ID required')
    return actual

TRANSITIONS={'queued':{'submitting','cancelled'},'submitting':{'running','outcome-unknown','failed'},'outcome-unknown':{'running','failed'},'running':{'review','failed','cancelled'},'review':{'ready','failed'},'ready':set(),'failed':set(),'cancelled':set()}
def transition(state,event):
    if event=='poll-error' and state=='running':return state
    if event not in TRANSITIONS[state]:raise ValueError('invalid job transition')
    return event

def result_matches(job,subject,workspace,revision,request_id):
    return job['subject']==subject and job['workspace']==workspace and job['plan_revision']==revision and job['request_id']==request_id

def catalog_check():
    catalog=json.loads((ROOT/'references/catalog.json').read_text())
    if len({a['id'] for a in catalog})!=len(catalog):raise ValueError('duplicate catalog ID')
    for a in catalog:
        validate('asset',a);p=(STUDIO/a['path']).resolve()
        if not p.is_relative_to(STUDIO.resolve()):raise ValueError('catalog path outside studio')
        info=inspect_glb(p)
        if any(info[k]!=a[k] for k in ('file_sha256','geometry_sha256')):raise ValueError('catalog hash mismatch')
    return {'assets':len(catalog),'status':'valid'}

if __name__=='__main__':
    p=argparse.ArgumentParser();sub=p.add_subparsers(dest='cmd',required=True)
    sub.add_parser('check-catalog');v=sub.add_parser('validate');v.add_argument('kind',choices=['plan','request','asset','receipt']);v.add_argument('file');g=sub.add_parser('inspect-glb');g.add_argument('file')
    a=p.parse_args()
    if a.cmd=='check-catalog':print(json.dumps(catalog_check()))
    elif a.cmd=='inspect-glb':print(json.dumps(inspect_glb(a.file)))
    else:validate(a.kind,json.loads(Path(a.file).read_text()));print('valid')
