import {setupAnalysis} from './analysis-ui.js';
import{fields,timeOf,valid,baselineReady,delta,mergeRows,csv,meanBaseline,referenceValid,parseReference}from'./model.mjs?v=20261104-baseline-mean';
const $=id=>document.getElementById(id);let base='',key='',device='',rows=[],cursor=0,baselines=[],stats=null,busy=false,epoch=0,lastMeta=0,reference=null;
const format=t=>new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(t));
const SITE_CONFIG={url:'https://wudjxctrzabkmfqvdwwf.supabase.co',key:'sb_publishable_Uhqt2TmlX40XIzkuFX8n_w_Mw3LHsqA'};
base=SITE_CONFIG.url;key=SITE_CONFIG.key;
const BENCH='8e773858-b689-4a0c-ba45-9bc0b139ab43';
async function fetchJSON(path,opts={}){const r=await fetch(base+path,{...opts,signal:AbortSignal.timeout(12000)});const data=await r.json().catch(()=>null);if(!r.ok)throw Error(data?.msg||data?.message||data?.error_description||`HTTP ${r.status}`);return data;}
async function api(path){return fetchJSON('/rest/v1/'+path,{headers:{apikey:key}});}
async function connect(){device=BENCH;$('device').replaceChildren(new Option('Yeast bench 01',BENCH));changeDevice();}
const storageKey=()=> 'jovey-baselines-v1-'+device;
function savedBaselines(){try{const data=JSON.parse(localStorage.getItem(storageKey())||'[]');return Array.isArray(data)?data.filter(b=>b&&typeof b.id==='string'&&typeof b.label==='string'&&Number.isFinite(Date.parse(b.start_at))&&Date.parse(b.end_at)-Date.parse(b.start_at)===300000).slice(0,100):[];}catch{return [];}}
async function baselineRows(b){return api('yeast_samples?device_id=eq.'+device+'&sampled_at=gte.'+encodeURIComponent(b.start_at)+'&sampled_at=lt.'+encodeURIComponent(b.end_at)+'&order=sampled_at.asc&limit=1000');}
async function baselineStats(b){return meanBaseline(await baselineRows(b));}
const referenceKey=()=> 'jovey-live-reference-v1-'+device;
function restoreReference(){
 try {
  const saved=JSON.parse(localStorage.getItem(referenceKey())||'null');
  if(!saved||!Array.isArray(saved.values)||saved.values.length!==3||!Array.isArray(saved.base)||saved.base.length!==3)return null;
  if(![saved.values,saved.base].every(a=>a.every((v,i)=>v===null||referenceValid(v,i))))return null;
  const date=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?v:null;
  return {values:saved.values,base:saved.base,label:String(saved.label||'Manual reference').slice(0,160),start_at:date(saved.start_at),end_at:date(saved.end_at),edited:!!saved.edited};
 }catch{return null;}
}
function saveReference(){try{localStorage.setItem(referenceKey(),JSON.stringify(reference));}catch{$('referenceMessage').textContent='ปรับค่าได้ในหน้านี้ แต่บันทึกในเบราว์เซอร์ไม่สำเร็จ';}}
function referenceInputs(){fields.forEach((_,i)=>{$('ref'+i).value=reference?.values[i]??'';$('ref'+i).setCustomValidity('');});}
function setReference(s,b,label){
 const values=[s.temp,s.mq3,s.mq135].map((v,i)=>referenceValid(v,i)?Math.round(v*100)/100:null);
 reference={values:[...values],base:[...values],label,start_at:b.start_at,end_at:b.end_at,edited:false};
 referenceInputs();$('referenceMessage').textContent='ตั้งค่าเฉลี่ยอ้างอิงแล้ว · ค่าอ้างอิงคงที่จนกว่าคุณจะปรับใหม่';saveReference();render();
}
fields.forEach((_,i)=>{$('ref'+i).oninput=()=>{
 if(!reference)reference={values:[null,null,null],base:[null,null,null],label:'Manual reference',start_at:null,end_at:null,edited:false};
 const parsed=parseReference($('ref'+i).value,i);
 reference.values[i]=parsed.value;reference.edited=true;
 $('ref'+i).setCustomValidity(parsed.error);
 $('referenceMessage').textContent=parsed.error||'ปรับ baseline แล้ว · Δ และเส้นอ้างอิงเปลี่ยนทันที · ค่าวัดต้นฉบับคงเดิม';
 saveReference();render();
};});
$('resetReference').onclick=()=>{if(!reference)return;reference.values=[...reference.base];reference.edited=false;referenceInputs();$('referenceMessage').textContent='คืนค่าเฉลี่ยอ้างอิงที่ตั้งไว้แล้ว';saveReference();render();};
$('useRecordedMean').onclick=()=>{const b=chosen();if(baselineReady(b,stats))setReference(stats,b,b.label);};
$('useRecentMean').onclick=async()=>{
 const latest=rows.at(-1);if(!latest?.sampled_at||Date.now()-timeOf(latest)>30000){$('referenceMessage').textContent='รอข้อมูลสดที่ซิงก์เวลาก่อนใช้ค่าเฉลี่ยล่าสุด';return;}
 const ticket=epoch,end=timeOf(latest)+1,b={start_at:new Date(end-300000).toISOString(),end_at:new Date(end).toISOString()};
 $('useRecentMean').disabled=true;$('referenceMessage').textContent='กำลังคำนวณค่าเฉลี่ย 5 นาทีล่าสุด…';
 try{const s=await baselineStats(b);if(ticket!==epoch)return;if(!baselineReady(b,s))throw Error('ข้อมูลยังไม่พอ: ต้อง ≥20 จุด ครอบคลุมเวลาที่อ่านได้ ≥4 นาที และอยู่ในรอบเปิดบอร์ดเดียว');setReference(s,b,'Mean · last 5 minutes');}
 catch(e){if(ticket===epoch)$('referenceMessage').textContent=e.message;}
 finally{$('useRecentMean').disabled=false;}
};
function changeDevice(){epoch++;device=$('device').value;rows=[];cursor=0;stats=null;baselines=[];lastMeta=0;reference=restoreReference();referenceInputs();$('referenceMessage').textContent='';$('baseline').replaceChildren(new Option('ยังไม่มี baseline',''));render();poll();}
$('device').onchange=changeDevice;
function chosen(){return baselines.find(b=>b.id===$('baseline').value);}
async function metadata(ticket){const bs=savedBaselines();if(ticket!==epoch)return;baselines=bs;const previous=$('baseline').value;$('baseline').replaceChildren(...(bs.length?bs.map(b=>new Option(b.label+' · '+format(b.start_at),b.id)):[new Option('ยังไม่มี baseline','')]));if(bs.some(b=>b.id===previous))$('baseline').value=previous;const b=chosen();const st=b?await baselineStats(b):null;if(ticket===epoch){stats=st;if(!reference&&baselineReady(b,st))setReference(st,b,b.label);}}
async function poll(){if(busy||!device)return;busy=true;const ticket=epoch;try{const query='yeast_samples?device_id=eq.'+device+(cursor?'&id=gt.'+cursor+'&order=id.asc&limit=600':'&order=id.desc&limit=600');const data=await api(query);if(ticket!==epoch)return;rows=mergeRows(rows,data);cursor=Math.max(cursor,...data.map(r=>Number(r.id)),0);if(Date.now()-lastMeta>10000){await metadata(ticket);lastMeta=Date.now();}if(ticket!==epoch)return;$('notice').textContent='';render();}catch(e){if(ticket===epoch){$('status').textContent='ติดต่อเซิร์ฟเวอร์ไม่ได้';$('notice').textContent=e.message+' · ค่าบนหน้าจอเป็นข้อมูลล่าสุดที่รับไว้';}}finally{busy=false;}}
$('baseline').onchange=async()=>{const id=$('baseline').value;stats=null;try{const b=chosen();const s=b?await baselineStats(b):null;if($('baseline').value===id){stats=s;render();}}catch(e){$('notice').textContent=e.message;}};
$('start').onclick=async()=>{if(!$('stable').checked){$('notice').textContent='โปรดตรวจสภาพอ้างอิงและติ๊กยืนยันก่อน';return;}const latest=rows.at(-1);if(!latest?.sampled_at||Date.now()-timeOf(latest)>30000){$('notice').textContent='รอข้อมูลสดที่มีเวลาวัดจากบอร์ดก่อนเริ่ม baseline';return;}$('start').disabled=true;try{const existing=savedBaselines();if(existing.some(b=>Date.parse(b.end_at)>Date.now()))throw Error('มี baseline กำลังเก็บอยู่แล้ว');const id=crypto.randomUUID(),start=new Date();const b={id,label:$('baselineLabel').value.trim().slice(0,100)||'Baseline',start_at:start.toISOString(),end_at:new Date(start.getTime()+300000).toISOString()};localStorage.setItem(storageKey(),JSON.stringify([b,...existing].slice(0,100)));await metadata(epoch);$('baseline').value=id;stats=null;$('stable').checked=false;lastMeta=0;render();}catch(e){$('notice').textContent=e.message;}finally{$('start').disabled=false;}};
function download(data,name){const u=URL.createObjectURL(new Blob(['\ufeff'+csv(data)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
$('export').onclick=()=>download(rows,'yeast-loaded-points.csv');
$('exportBaseline').onclick=async()=>{const b=chosen();if(!b)return;try{const data=await api('yeast_samples?device_id=eq.'+device+'&sampled_at=gte.'+encodeURIComponent(b.start_at)+'&sampled_at=lt.'+encodeURIComponent(b.end_at)+'&order=sampled_at.asc&limit=1000');download(data,'baseline-'+b.id+'.csv');}catch(e){$('notice').textContent=e.message;}};
function render(){const latest=rows.at(-1),b=chosen(),ready=baselineReady(b,stats),age=latest?(Date.now()-timeOf(latest))/1000:Infinity;$('status').textContent=!latest?'รอข้อมูล':age<30?'● LIVE · '+Math.max(0,Math.round(age))+'s ago':'ข้อมูลเก่า · '+Math.round(age)+'s';$('pointCount').textContent=rows.length+' จุดที่โหลดแล้ว / สูงสุด 600';fields.forEach((f,i)=>{const v=latest?.[f],ref=reference?.values[i];$('v'+i).textContent=valid(v)?(i?v:v.toFixed(2)):'—';$('d'+i).textContent=referenceValid(ref,i)?(referenceValid(v,i)&&(i!==0||v!==85)?'Δ '+delta(v,ref,i===0):'ค่าวัดนี้ต้องตรวจสอบก่อนเทียบ baseline'):'ตั้งค่า baseline mean เพื่อดู Δ แบบสด';plot(i,f,reference,referenceValid(ref,i)?ref:null);});$('useRecordedMean').disabled=!ready;$('resetReference').disabled=!reference||!reference.edited;$('referenceSource').textContent=reference?`${reference.edited?'ปรับเอง · ':''}${reference.label}${reference.start_at&&reference.end_at?' · '+format(reference.start_at)+'–'+format(reference.end_at):''} · เส้นประ = baseline คงที่`:'ยังไม่มีค่าอ้างอิง · ใช้ mean 5 นาทีล่าสุด หรือกรอกค่าที่แต่ละการ์ด';$('baselineStatus').textContent=!b?'ยังไม่มี baseline':Date.now()<Date.parse(b.end_at)?'กำลังเก็บ · เหลือ '+Math.ceil((Date.parse(b.end_at)-Date.now())/1000)+' วินาที':ready?'เก็บครบ · เปรียบเทียบสัญญาณได้':'จบช่วงเก็บ · ข้อมูลยังไม่ครบเกณฑ์';$('baselineInfo').textContent=stats?`${stats.n} จุด · Temperature mean ${stats.temp?.toFixed(2)??'—'} °C · MQ3 mean ${stats.mq3?.toFixed(2)??'—'} · MQ135 mean ${stats.mq135?.toFixed(2)??'—'} · เวลาที่อ่านได้ ${(stats.coverage_ms/60000).toFixed(1)} นาที`:'';$('timing').textContent=latest?`รับล่าสุด ${format(latest.received_at)} · ${latest.sampled_at?'เวลาวัดซิงก์แล้ว':'ยังไม่มีเวลาวัด: ใช้เวลารับแทน'} · dropped ใน boot นี้ ${latest.dropped_total}`:'';$('rows').replaceChildren(...rows.slice(-10).reverse().map(r=>{const tr=document.createElement('tr');const quality=[!r.sampled_at?'เวลาไม่ซิงก์':'',!valid(r.temp_c)?'ไม่มีอุณหภูมิ':'',r.temp_c===85?'ตรวจค่า 85°C':'',[r.mq3_raw,r.mq135_raw].some(v=>v===0||v===4095)?'ADC ชนขอบ':''].filter(Boolean).join(' / ')||'รับข้อมูลแล้ว';[format(timeOf(r)),r.temp_c??'—',r.mq3_raw,r.mq135_raw,quality].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.append(td);});return tr;}));}
function plot(i,f,b,median){const c=$('c'+i),dpr=window.devicePixelRatio||1,w=c.clientWidth,h=190;c.width=w*dpr;c.height=h*dpr;const ctx=c.getContext('2d');ctx.scale(dpr,dpr);const values=rows.map(r=>r[f]).filter(valid);if(valid(median))values.push(median);if(!values.length)return;let lo=Math.min(...values),hi=Math.max(...values);const pad=Math.max((hi-lo)*.12,i?2:.1);lo-=pad;hi+=pad;const first=timeOf(rows[0]),last=Math.max(timeOf(rows.at(-1)),first+10000),x=t=>42+(t-first)/(last-first)*(w-54),y=v=>12+(hi-v)/(hi-lo)*144;ctx.font='10px system-ui';ctx.fillStyle='#adc1bb';ctx.strokeStyle='#30453b';for(let j=0;j<3;j++){const val=lo+(hi-lo)*j/2,Y=y(val);ctx.beginPath();ctx.moveTo(40,Y);ctx.lineTo(w-8,Y);ctx.stroke();ctx.fillText(val.toFixed(i?0:1),0,Y+3);}if(b?.start_at&&b?.end_at){ctx.fillStyle='#b9e8a715';const a=Math.max(42,x(Date.parse(b.start_at))),z=Math.min(w-12,x(Date.parse(b.end_at)));if(z>a)ctx.fillRect(a,12,z-a,144);}if(valid(median)){ctx.setLineDash([4,4]);ctx.strokeStyle='#e9cc80';ctx.beginPath();ctx.moveTo(42,y(median));ctx.lineTo(w-12,y(median));ctx.stroke();ctx.setLineDash([]);}ctx.strokeStyle=['#b9e8a7','#efc285','#86d5d4'][i];ctx.lineWidth=2;ctx.beginPath();let prev=null;for(const r of rows){if(!valid(r[f])){prev=null;continue;}const X=x(timeOf(r)),Y=y(r[f]);if(!prev||timeOf(r)-timeOf(prev)>25000||r.boot_id!==prev.boot_id)ctx.moveTo(X,Y);else ctx.lineTo(X,Y);prev=r;}ctx.stroke();const r=rows.at(-1);if(valid(r[f])){ctx.beginPath();ctx.arc(x(timeOf(r)),y(r[f]),3,0,7);ctx.fillStyle=ctx.strokeStyle;ctx.fill();}ctx.fillStyle='#adc1bb';ctx.fillText(format(first),42,183);ctx.textAlign='right';ctx.fillText(format(last),w-12,183);ctx.textAlign='left';}
setInterval(poll,2000);window.addEventListener('resize',()=>{if(rows.length)render();});

connect();
setupAnalysis({api,getDevice:()=>device});
