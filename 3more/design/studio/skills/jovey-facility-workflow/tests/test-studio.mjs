import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mountLibrary,models} from '../../../studio.js';
// Minimal DOM surface: the viewer must never need storage, uploads or a write API.
class Element{
 constructor(tag='div'){this.tagName=tag;this.children=[];this.attrs={};this.handlers={};this.textContent='';this.style={setProperty(){}};}
 setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k]??null;}
 append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;}
 addEventListener(k,fn){(this.handlers[k]??=[]).push(fn);}removeEventListener(k,fn){this.handlers[k]=(this.handlers[k]||[]).filter(f=>f!==fn);}
 emit(k){for(const fn of this.handlers[k]||[])fn();}
}
function setup(){const elements=new Map(),root={ownerDocument:{createElement:tag=>new Element(tag)},querySelector:selector=>{if(!elements.has(selector))elements.set(selector,new Element());return elements.get(selector);}};return {root,get:id=>root.querySelector('#'+id),app:mountLibrary(root)};}
test('initial published concept loads without an editor, storage or generation action',()=>{
 const {get}=setup();assert.equal(get('model-name').textContent,'Drying module');assert.equal(get('model-list').children.length,5);const viewer=get('viewer-host').children[0];assert.match(viewer.attrs.src,/jovey-styled\.glb$/);assert.equal(viewer.attrs['camera-controls'],'');viewer.emit('load');assert.match(get('viewer-status').textContent,/orbit/);
});
test('only catalog IDs may change the read-only model and late load events cannot overwrite current state',()=>{
 const {get,app}=setup(),old=get('viewer-host').children[0];assert.equal(app.select('https://evil.test/model.glb'),false);assert.equal(app.select('research'),true);const current=get('viewer-host').children[0];old.emit('load');assert.equal(get('viewer-status').textContent,'Loading model…');current.emit('error');assert.match(get('viewer-status').textContent,/unavailable/);old.emit('load');assert.match(get('viewer-status').textContent,/unavailable/);assert.equal(get('model-name').textContent,'Research campus');
});
test('selection, camera reset and disposal are view-only; destroyed views ignore late events',()=>{
 const {get,app}=setup();get('model-list').children[2].emit('click');assert.equal(get('model-name').textContent,'Production facility');const before=get('viewer-host').children[0];get('reset-view').emit('click');const after=get('viewer-host').children[0];assert.notEqual(before,after);assert.equal(before.attrs.src,after.attrs.src);app.destroy();after.emit('load');assert.equal(get('viewer-host').children.length,0);assert.equal(app.select('research'),false);
});
test('every displayed model and provenance file exists; GLBs contain valid self-contained glTF 2.0',()=>{
 for(const model of models){
  const base=new URL('../../../',import.meta.url);assert.ok(fs.existsSync(new URL(model.evidence,base)));
  const b=fs.readFileSync(new URL(model.path,base));assert.equal(b.readUInt32LE(0),0x46546c67);assert.equal(b.readUInt32LE(4),2);assert.equal(b.readUInt32LE(8),b.length);
  const json=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());assert.ok(json.meshes.length>0);for(const item of [...json.buffers||[],...json.images||[]])assert.ok(!item.uri||item.uri.startsWith('data:'));
 }
});
