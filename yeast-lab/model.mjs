export const fields=['temp_c','mq3_raw','mq135_raw'];
export const timeOf=r=>Date.parse(r.sampled_at||r.received_at);
export const valid=v=>typeof v==='number'&&Number.isFinite(v);
export function baselineReady(b,s,now=Date.now()) {return !!(b&&s&&Date.parse(b.end_at)<=now&&s.n>=20&&Date.parse(s.last_at)-Date.parse(s.first_at)>=240000&&(s.coverage_ms??240000)>=240000&&(s.boot_count??1)===1);}
export function delta(v,b,isTemp=false){if(!valid(v)||!valid(b))return 'ไม่มีค่าอ้างอิงที่ใช้ได้';const d=v-b;return `${d>=0?'+':''}${d.toFixed(isTemp?2:1)} ${isTemp?'°C':'counts'}${!isTemp&&b>=20?' · '+(d/b*100).toFixed(1)+'%':''}`;}
export function mergeRows(old,fresh){return [...new Map([...old,...fresh].map(x=>[x.id,x])).values()].sort((a,b)=>timeOf(a)-timeOf(b)||a.id-b.id).slice(-600);}
export function csv(rows){const keys=['id','device_id','boot_id','seq','uptime_ms','sampled_at','received_at','temp_c','mq3_raw','mq135_raw','dropped_total'];return keys.join(',')+'\n'+rows.map(r=>keys.map(k=>'"'+String(r[k]??'').replaceAll('"','""')+'"').join(',')).join('\n');}

export function referenceValid(value,index) {
 return valid(value)&&(index===0?value>=-55&&value<=125:value>0&&value<4095);
}
export function parseReference(text,index) {
 if(text.trim()==='')return {value:null,error:''};
 const value=Number(text);
 return referenceValid(value,index)?{value,error:''}:{value:null,error:index===0?'อุณหภูมิอ้างอิงต้องอยู่ระหว่าง −55 ถึง 125°C':'ค่าอ้างอิงก๊าซต้องมากกว่า 0 และน้อยกว่า 4095 counts'};
}
export function meanBaseline(input) {
 const ordered=[...new Map(input.map(r=>[r.id,r])).values()].filter(r=>r.sampled_at&&Number.isFinite(Date.parse(r.sampled_at))).sort((a,b)=>timeOf(a)-timeOf(b));
 const gasValid=r=>[r.mq3_raw,r.mq135_raw].every(v=>referenceValid(v,1));
 const tempValid=r=>gasValid(r)&&referenceValid(r.temp_c,0)&&r.temp_c!==85;
 const data=ordered.filter(gasValid),temperatures=ordered.filter(tempValid);
 const average=a=>a.length?a.reduce((sum,v)=>sum+v,0)/a.length:null;
 const coverage=accept=>ordered.reduce((sum,r,i)=>{if(!i)return sum;const prev=ordered[i-1],dt=timeOf(r)-timeOf(prev);return sum+(accept(r)&&accept(prev)&&r.boot_id===prev.boot_id&&dt>0&&dt<=25000?dt:0);},0);
 const range=field=>data.reduce(([lo,hi],r)=>[Math.min(lo,r[field]),Math.max(hi,r[field])],[Infinity,-Infinity]);
 const [mq3_min,mq3_max]=range('mq3_raw'),[mq135_min,mq135_max]=range('mq135_raw');
 return {n:data.length,first_at:data[0]?.sampled_at,last_at:data.at(-1)?.sampled_at,coverage_ms:coverage(gasValid),boot_count:new Set(data.map(r=>r.boot_id)).size,
  temp:temperatures.length>=20&&coverage(tempValid)>=240000?average(temperatures.map(r=>r.temp_c)):null,temp_n:temperatures.length,
  mq3:average(data.map(r=>r.mq3_raw)),mq135:average(data.map(r=>r.mq135_raw)),
  mq3_min:data.length?mq3_min:null,mq3_max:data.length?mq3_max:null,mq135_min:data.length?mq135_min:null,mq135_max:data.length?mq135_max:null};
}
