import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const code=fs.readFileSync(new URL('../../../studio.js',import.meta.url),'utf8');
const bytes=fs.readFileSync(new URL('../../../models/research.glb',import.meta.url));
function setup(){
 const elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,{value:id==='workspace'?'personal':'',textContent:'',disabled:false,addEventListener(){},setAttribute(k,v){this[k]=v},removeAttribute(k){delete this[k]},replaceChildren(){},append(){}});return elements.get(id)};
 const context=vm.createContext({document:{getElementById:get,createElement:()=>({append(){}})},indexedDB:{open:()=>({})},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},customElements:{get:()=>true},setTimeout(){},DataView,TextDecoder,Blob,console,structuredClone,crypto:{randomUUID:()=> 'test'},fetch:()=>Promise.reject(Error('unexpected network'))});
 vm.runInContext(code,context);return {context,get};
}
const payload=()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
test('delayed model validation cannot enter a different workspace',async()=>{
 const {context,get}=setup();let release;context.pending={size:bytes.length,arrayBuffer:()=>new Promise(resolve=>release=resolve)};
 const result=vm.runInContext("loadModel(pending,'old personal model')",context);
 get('workspace').value='team';get('workspace').onchange();release(payload());await result;
 assert.equal(get('viewer').src,undefined);assert.equal(get('model-state').textContent,'No model');
});
test('newer model supersedes a delayed earlier model',async()=>{
 const {context,get}=setup();let release;context.slow={size:bytes.length,arrayBuffer:()=>new Promise(resolve=>release=resolve)};context.fast={size:bytes.length,arrayBuffer:async()=>payload()};
 const old=vm.runInContext("loadModel(slow,'old')",context);await vm.runInContext("loadModel(fast,'new')",context);release(payload());await old;
 assert.equal(get('model-state').textContent,'new');
});
test('fetch completion cannot write source provenance into Team after leaving Personal',async()=>{
 const {context,get}=setup();let release;context.fetch=()=>new Promise(resolve=>release=resolve);
 vm.runInContext("accepted={kind:'research'}",context);const old=get('concept').onclick();
 get('workspace').value='team';get('workspace').onchange();release({ok:true,blob:async()=>new Blob([bytes])});await old;
 assert.equal(get('viewer').src,undefined);assert.equal(get('provenance').value,'');
});
test('editing accepted plan invalidates an in-flight model',async()=>{
 const {context,get}=setup();let release;context.slow={size:bytes.length,arrayBuffer:()=>new Promise(resolve=>release=resolve)};
 const old=vm.runInContext("loadModel(slow,'old plan model')",context);get('brief').oninput();release(payload());await old;assert.equal(get('viewer').src,undefined);
});
