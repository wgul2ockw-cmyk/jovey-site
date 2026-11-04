// Pure analysis: original measurements stay intact; no interpolation across gaps.
export const GAP_MS = 25000;
export const validTemperature = v => Number.isFinite(v) && v >= -55 && v <= 125 && v !== 85;
export const validGas = v => Number.isFinite(v) && v > 0 && v < 4095;
export const bounds = values => values.reduce(([lo,hi],v)=>[Math.min(lo,v),Math.max(hi,v)],[Infinity,-Infinity]);
export const median = values => {
  const a = [...values].sort((x,y)=>x-y), n=a.length;
  return n ? (a[Math.floor((n-1)/2)]+a[Math.floor(n/2)])/2 : null;
};
export function cleanRows(rows) {
  return [...new Map(rows.map(r=>[String(r.id),r])).values()]
    .filter(r=>r.sampled_at && Number.isFinite(Date.parse(r.sampled_at)))
    .sort((a,b)=>Date.parse(a.sampled_at)-Date.parse(b.sampled_at)||Number(a.id)-Number(b.id));
}
export function temperatureReport(rows, start, end, low, high) {
  const data=cleanRows(rows), good=data.filter(r=>validTemperature(r.temp_c));
  const n=good.length, mean=n?good.reduce((s,r)=>s+r.temp_c,0)/n:null;
  const [minimum,maximum]=bounds(good.map(r=>r.temp_c));
  let observedMs=0, gaps=0, restarts=0;
  for(let i=1;i<data.length;i++) {
    const a=data[i-1],b=data[i],dt=Date.parse(b.sampled_at)-Date.parse(a.sampled_at);
    if(a.boot_id!==b.boot_id) restarts++;
    else if(dt>GAP_MS) gaps++;
    else if(dt>0&&validTemperature(a.temp_c)&&validTemperature(b.temp_c)) observedMs+=dt;
  }
  return {n,mean,min:n?minimum:null,max:n?maximum:null,
    sd:n>1?Math.sqrt(good.reduce((s,r)=>s+(r.temp_c-mean)**2,0)/(n-1)):null,
    inRange:n?100*good.filter(r=>r.temp_c>=low&&r.temp_c<=high).length/n:null,
    coverage:end>start?100*observedMs/(end-start):0,observedMs,gaps,restarts,
    rejected:data.length-n, suspicious85:data.filter(r=>r.temp_c===85).length,
    saturated:data.filter(r=>[r.mq3_raw,r.mq135_raw].some(v=>v===0||v===4095)).length};
}
export function seriesFor(rows, field, start, minutes=5, normalized=false) {
  const data=cleanRows(rows), valid=field==='temp_c'?validTemperature:validGas;
  const all=data.map(r=>r[field]).filter(valid), [minimum,maximum]=bounds(all), lo=all.length?minimum:null, hi=all.length?maximum:null;
  const flat=lo!==null&&lo===hi, normalize=normalized&&field!=='temp_c';
  let previous=null, segment=0, bucket=null; const points=[];
  for(const row of data) {
    const time=Date.parse(row.sampled_at), value=row[field];
    if(!valid(value)){previous=null;bucket=null;continue;}
    if(!previous||row.boot_id!==previous.boot_id||time-Date.parse(previous.sampled_at)>GAP_MS){segment++;bucket=null;}
    const bin=Math.floor((time-start)/(minutes*60000));
    if(!bucket||bucket.bin!==bin){bucket={bin,segment,times:[],values:[]};points.push(bucket);}
    bucket.times.push(time);bucket.values.push(value);previous=row;
  }
  return {field,lo,hi,flat,normalized:normalize,points:points.map(p=>{
    const raw=median(p.values),t=p.times.reduce((a,b)=>a+b,0)/p.times.length;
    return {segment:p.segment,t,hours:(t-start)/3600000,n:p.values.length,raw,
      value:normalize?(flat?null:100*(raw-lo)/(hi-lo)):raw,min:Math.min(...p.values),max:Math.max(...p.values)};
  })};
}
export function csvTable(headers, rows) {
  const cell=v=>'"'+String(v??'').replace(/^[=+@\t\r]/,"'").replaceAll('"','""')+'"';
  return [headers,...rows].map(r=>r.map(cell).join(',')).join('\r\n');
}
export function processedCSV(series, meta) {
  return csvTable(['device_id','selected_boot','window_start_utc','window_end_utc','aggregation_minutes','field','segment','time_utc','elapsed_hours','value','unit','samples','raw_median','raw_min','raw_max','normalization_min','normalization_max'],
    series.flatMap(s=>s.points.map(p=>[meta.device,meta.boot||'all',new Date(meta.start).toISOString(),new Date(meta.end).toISOString(),meta.minutes,s.field,p.segment,new Date(p.t).toISOString(),p.hours,p.value,s.field==='temp_c'?'degC':s.normalized?'relative_0_100':'ADC_counts',p.n,p.raw,p.min,p.max,s.lo,s.hi])));
}
export async function loadHistory(api, device, start, end, progress=()=>{}) {
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>7*86400000) throw Error('เลือกช่วงเวลามากกว่า 0 และไม่เกิน 7 วัน');
  const scope='yeast_samples?device_id=eq.'+encodeURIComponent(device)+'&sampled_at=gte.'+encodeURIComponent(new Date(start).toISOString())+'&sampled_at=lt.'+encodeURIComponent(new Date(end).toISOString());
  const top=await api(scope+'&select=id&order=id.desc&limit=1');
  if(!top.length) return [];
  const upper=String(top[0].id); let after='0'; const collected=[];
  for(;;) {
    const page=await api(scope+'&id=gt.'+after+'&id=lte.'+upper+'&order=id.asc&limit=1000');
    if(!page.length) break;
    const last=String(page.at(-1).id);
    if(BigInt(last)<=BigInt(after)) throw Error('โหลดข้อมูลไม่คืบหน้า กรุณาลองใหม่');
    collected.push(...page);after=last;progress(collected.length);
    if(collected.length>100000) throw Error('ข้อมูลเกิน 100,000 จุด กรุณาลดช่วงเวลา');
    if(BigInt(after)>=BigInt(upper)) break;
  }
  return cleanRows(collected);
}
