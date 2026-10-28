export const fields=['temp_c','mq3_raw','mq135_raw'];
export const timeOf=r=>Date.parse(r.sampled_at||r.received_at);
export const valid=v=>typeof v==='number'&&Number.isFinite(v);
export function baselineReady(b,s,now=Date.now()) {return !!(b&&s&&Date.parse(b.end_at)<=now&&s.n>=20&&Date.parse(s.last_at)-Date.parse(s.first_at)>=240000);}
export function delta(v,b,isTemp=false){if(!valid(v)||!valid(b))return 'ไม่มีค่าอ้างอิงที่ใช้ได้';const d=v-b;return `${d>=0?'+':''}${d.toFixed(isTemp?2:1)} ${isTemp?'°C':'counts'}${!isTemp&&b>=20?' · '+(d/b*100).toFixed(1)+'%':''}`;}
export function mergeRows(old,fresh){return [...new Map([...old,...fresh].map(x=>[x.id,x])).values()].sort((a,b)=>timeOf(a)-timeOf(b)||a.id-b.id).slice(-600);}
export function csv(rows){const keys=['id','device_id','boot_id','seq','uptime_ms','sampled_at','received_at','temp_c','mq3_raw','mq135_raw','dropped_total'];return keys.join(',')+'\n'+rows.map(r=>keys.map(k=>'"'+String(r[k]??'').replaceAll('"','""')+'"').join(',')).join('\n');}
