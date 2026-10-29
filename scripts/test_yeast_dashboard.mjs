import vm from 'node:vm';import fs from 'node:fs';import assert from 'node:assert/strict';import*as model from '../yeast-lab/model.mjs';
class Node{constructor(){this.value='';this.children=[];this.checked=false;this.clientWidth=340;this.classList={add(){},remove(){}};}replaceChildren(...c){this.children=c;if(c[0]?.isOption)this.value=c[0].value;}append(x){this.children.push(x)}getContext(){return new Proxy({},{get:(t,k)=>t[k]||(()=>{})});}click(){}}
const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id)};
const requests=[];const storage=new Map();let fail=false;const now=Date.now(),sample={id:1,device_id:'dev',boot_id:'boot',seq:10,uptime_ms:10000,sampled_at:new Date(now).toISOString(),received_at:new Date(now).toISOString(),temp_c:27.1,mq3_raw:600,mq135_raw:120,dropped_total:0};
const ctx=vm.createContext({...model,console,URL,Blob,AbortSignal,Intl,Date,setInterval(){},setTimeout,crypto:{randomUUID(){return 'local-base';}},localStorage:{getItem(k){return storage.get(k)||null},setItem(k,v){storage.set(k,v)}},Option:function(text,value){return{isOption:true,text,value}},document:{getElementById:get,createElement:()=>new Node()},window:{devicePixelRatio:1,addEventListener(){}},fetch:async(url,opt)=>{if(fail)throw Error('offline');requests.push({url,opt});assert.ok(!url.includes('/auth/')&&!url.includes('/rpc/'));assert.ok(!opt.headers.Authorization);let data;if(url.includes('yeast_samples?'))data=[sample];else throw Error(url);return{ok:true,json:async()=>data};}});
vm.runInContext(fs.readFileSync(new URL('../yeast-lab/app.js',import.meta.url),'utf8').replace(/^import[^\n]*\n/,''),ctx);
for(let i=0;i<20;i++)await Promise.resolve();await vm.runInContext('poll()',ctx);
assert.equal(get('v1').textContent,600);assert.match(get('status').textContent,/LIVE/);assert.ok(requests.length>0);
await get('start').onclick();assert.match(get('notice').textContent,/ติ๊ก/);
get('stable').checked=true;await get('start').onclick();assert.match(get('baselineStatus').textContent,/กำลังเก็บ/);assert.match(get('d1').textContent,/ยังไม่มี baseline/);
fail=true;await vm.runInContext('poll()',ctx);assert.match(get('status').textContent,/ไม่ได้/);assert.equal(get('v1').textContent,600);
assert.equal(JSON.parse([...storage.values()][0])[0].id,'local-base');
console.log('PASS dashboard with mocked HTTP/DOM: no-login startup, read-only API, readings, local baseline capture, insufficient baseline, offline status');
