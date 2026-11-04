import {loadHistory,temperatureReport,seriesFor,processedCSV,bounds} from './analysis.mjs';
import {csv} from './model.mjs';

const $=id=>document.getElementById(id);
const dateLabel=t=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',dateStyle:'medium',timeStyle:'short'}).format(new Date(t));
const localInput=t=>new Date(t+7*3600000).toISOString().slice(0,16);
const parseInput=s=>s?Date.parse(s+':00+07:00'):NaN;
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const number=(v,d=2)=>Number.isFinite(v)?v.toFixed(d):'—';
function save(text,name,type){const u=URL.createObjectURL(new Blob(['\ufeff',text],{type})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}

// Exported SVGs include the window, units, and processing rule; no external assets.
export function chartSVG(series,{title,subtitle,start,end,normalized=false,unit='°C',target=null}) {
  const W=1100,H=440,L=72,R=1065,T=105,B=325;
  const palette=['#b9e8a7','#86d5d4','#efc285'];
  const values=series.flatMap(s=>s.points.map(p=>p.value)).filter(Number.isFinite);
  const [minimum,maximum]=bounds(values);
  let lo=values.length?minimum:0,hi=values.length?maximum:1;
  if(target){lo=Math.min(lo,target[0]);hi=Math.max(hi,target[1]);}
  if(normalized){lo=0;hi=100;}else{const pad=Math.max((hi-lo)*.12,unit==='°C'?.25:2);lo-=pad;hi+=pad;}
  const x=t=>L+(t-start)/(end-start)*(R-L),y=v=>B-(v-lo)/(hi-lo)*(B-T);
  const out=[`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escape(title+'; '+subtitle)}"><title>${escape(title)}</title><desc>${escape(subtitle)}. Disconnected lines indicate missing or rejected samples or a board restart.</desc><rect width="1100" height="440" rx="14" fill="#0d1717"/><g font-family="system-ui,sans-serif" fill="#e7eee8"><text x="28" y="38" font-size="24" font-weight="650">${escape(title)}</text><text x="28" y="66" fill="#adc1bb" font-size="12">${escape(subtitle)}</text><text x="${L}" y="92" fill="#adc1bb" font-size="12">${escape(unit)}</text>`];
  if(target) out.push(`<rect x="${L}" y="${y(target[1])}" width="${R-L}" height="${y(target[0])-y(target[1])}" fill="#b9e8a7" opacity=".09"/>`);
  for(let i=0;i<=4;i++){const v=lo+(hi-lo)*i/4,Y=y(v);out.push(`<line x1="${L}" y1="${Y}" x2="${R}" y2="${Y}" stroke="#30453b" stroke-dasharray="4 5"/><text x="${L-10}" y="${Y+4}" text-anchor="end" fill="#adc1bb" font-size="12">${v.toFixed(unit==='°C'?1:0)}</text>`);}
  for(let i=0;i<=6;i++){const time=start+(end-start)*i/6;out.push(`<text x="${x(time)}" y="350" text-anchor="middle" fill="#adc1bb" font-size="12">${((time-start)/3600000).toFixed(1)} h</text>`);}
  if(!values.length)out.push(`<text x="550" y="210" text-anchor="middle" fill="#adc1bb" font-size="16">No usable ${normalized?'variable ':''}signal in this selection</text>`);
  series.forEach((s,i)=>{
    const color=palette[i+(unit==='°C'?0:1)],groups=new Map();
    s.points.filter(p=>Number.isFinite(p.value)).forEach(p=>{if(!groups.has(p.segment))groups.set(p.segment,[]);groups.get(p.segment).push(p);});
    groups.forEach(points=>{out.push(`<polyline fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" points="${points.map(p=>`${x(p.t).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ')}"/>`);
      for(const p of points)out.push(`<circle cx="${x(p.t).toFixed(2)}" cy="${y(p.value).toFixed(2)}" r="3" fill="${color}"><title>${escape(s.label)} · ${dateLabel(p.t)} ICT · ${number(p.value)} ${escape(unit)} · n=${p.n} · raw median ${number(p.raw)}</title></circle>`);
    });
    const label=s.label+(s.normalized&&s.flat?' · constant (cannot normalize)':'');
    out.push(`<circle cx="${L+i*440}" cy="391" r="5" fill="${color}"/><text x="${L+14+i*440}" y="395" font-size="14">${escape(label)}</text>`);
  });
  out.push(`<text x="${L}" y="423" font-size="11" fill="#adc1bb">Elapsed hours from report start · ${unit==='°C'?'DS18B20 measurements; flagged values excluded'+(target?`; user target ${target[0]}–${target[1]}°C (shaded)`:''):'MQ sensor responses; not CO₂ ppm or ethanol concentration'}</text></g></svg>`);
  return out.join('');
}

export function setupAnalysis({api,getDevice}) {
  let snapshot=null,processed=[],selected=[],generation=0,loading=false;
  function preset(end=Date.now()) {
    const hours=Number($('historyPreset').value)||24;
    $('historyEnd').value=localInput(end);$('historyStart').value=localInput(end-hours*3600000);
  }
  function stale(){generation++;$('reportContent').hidden=true;snapshot=null;$('historyStatus').textContent='ช่วงเวลาเปลี่ยนแล้ว · กดโหลดรายงาน';}
  function targets(){const a=$('targetLow').value,b=$('targetHigh').value,low=Number(a),high=Number(b);return a!==''&&b!==''&&Number.isFinite(low)&&Number.isFinite(high)&&low<high&&low>=-55&&high<=125?[low,high]:null;}
  function render() {
    if(!snapshot)return;
    const boot=$('historyBoot').value;selected=snapshot.rows.filter(r=>!boot||r.boot_id===boot);
    const minutes=Number($('historyBin').value)||5, normalized=$('historyMode').value==='normalized',target=targets();
    const report=temperatureReport(selected,snapshot.start,snapshot.end,target?.[0]??NaN,target?.[1]??NaN);
    $('reportMean').textContent=number(report.mean)+' °C';$('reportSD').textContent='SD '+number(report.sd)+' °C · n='+report.n.toLocaleString();
    $('reportRange').textContent=number(report.min,1)+' / '+number(report.max,1)+' °C';
    $('reportTarget').textContent=target?number(report.inRange,1)+'%':'—';
    $('reportTargetSummary').textContent=target?`ช่วง ${target[0]}–${target[1]}°C · % ของจุดที่ใช้ได้`:'คิดเป็น % ของจุดอุณหภูมิที่ใช้ได้';
    $('targetMessage').textContent=target?`${target[0]}–${target[1]}°C · ผู้ใช้กำหนด`:'ระบุค่าต่ำสุด < สูงสุด ภายใน −55 ถึง 125°C';
    $('reportCoverage').textContent=number(report.coverage,1)+'%';
    const start=snapshot.start,end=snapshot.end;
    const baseLabel=dateLabel(start)+' – '+dateLabel(end)+' ICT';
    $('reportWindow').textContent=`${baseLabel} · ${selected.length.toLocaleString()} จุด · ${boot?'Boot '+boot:'ทุกรอบบอร์ด'} · snapshot ${dateLabel(snapshot.loaded)} ICT`;
    processed=['temp_c','mq3_raw','mq135_raw'].map(f=>seriesFor(selected,f,start,minutes,normalized));
    const [temp,mq3,mq135]=processed;temp.label='Temperature';mq3.label='MQ3 response';mq135.label='MQ135 response';
    $('temperatureChart').innerHTML=chartSVG([temp],{title:'Temperature over time',subtitle:`${baseLabel} · ${minutes}-minute median · ${boot?'Boot '+boot:'all boots'}`,start,end,target});
    $('gasChart').innerHTML=chartSVG([mq3,mq135],{title:'Yeast gas-signal profile',subtitle:`${baseLabel} · ${minutes}-minute median · ${normalized?'each sensor scaled to its own selected min/max':'unscaled ADC counts'}`,start,end,normalized,unit:normalized?'Relative signal (0–100)':'ADC counts'});
    $('reportQuality').textContent=`คุณภาพข้อมูล: อุณหภูมิใช้ไม่ได้ ${report.rejected} จุด (85°C: ${report.suspicious85}) · ADC ชนขอบ ${report.saturated} จุด · ช่องว่าง >25 วินาที ${report.gaps} ช่วง · เปลี่ยน boot ${report.restarts} ครั้ง · รวมเวลาที่มีอุณหภูมิต่อเนื่อง ${number(report.observedMs/3600000,2)} ชั่วโมง`;
    for(const id of ['exportReportRaw','exportReportProcessed','exportTempSVG','exportGasSVG','printReport'])$(id).disabled=!selected.length;
  }
  async function load(latest=false) {
    if(loading)return;
    loading=true;const ticket=++generation,device=getDevice();snapshot=null;$('reportContent').hidden=true;
    $('loadHistory').disabled=true;$('latestHistory').disabled=true;
    try{
      if(latest){
        $('historyStatus').textContent='กำลังหาช่วงข้อมูลล่าสุด…';
        const newest=await api('yeast_samples?device_id=eq.'+encodeURIComponent(device)+'&sampled_at=not.is.null&order=sampled_at.desc&limit=1');
        if(ticket!==generation)return;
        if(!newest.length)throw Error('ยังไม่มีข้อมูลที่ซิงก์เวลาวัดจากบอร์ด');
        if($('historyPreset').value==='custom')$('historyPreset').value='24';
        preset(Math.floor(Date.parse(newest[0].sampled_at)/60000)*60000+60000);
      }
      const start=parseInput($('historyStart').value),end=parseInput($('historyEnd').value);
      $('historyStatus').textContent='กำลังโหลดข้อมูลทุกหน้า…';
      const data=await loadHistory(api,device,start,end,n=>{if(ticket===generation)$('historyStatus').textContent=`โหลดแล้ว ${n.toLocaleString()} จุด…`;});
      if(ticket!==generation||device!==getDevice())return;
      snapshot={rows:data,start,end,device,loaded:Date.now()};
      const boots=[...new Set(data.map(r=>r.boot_id))];
      $('historyBoot').replaceChildren(new Option('ทุกรอบในช่วงที่เลือก',''),...boots.map(b=>new Option(b,b)));
      $('historyStatus').textContent=data.length?`โหลดครบ ${data.length.toLocaleString()} จุด · รายงานเป็น snapshot กดโหลดอีกครั้งเพื่อรับจุดใหม่`:'ไม่มีข้อมูลในช่วงนี้ · ลอง “ช่วงข้อมูลล่าสุด” หรือเลือกวันที่อื่น';
      $('reportContent').hidden=!data.length;if(data.length)render();
    }catch(e){if(ticket===generation)$('historyStatus').textContent='ยังสร้างรายงานไม่ได้: '+e.message;}
    finally{loading=false;$('loadHistory').disabled=false;$('latestHistory').disabled=false;}
  }
  $('historyPreset').onchange=()=>{if($('historyPreset').value!=='custom')preset();stale();};
  for(const id of ['historyStart','historyEnd'])$(id).onchange=()=>{$('historyPreset').value='custom';stale();};
  for(const id of ['historyBoot','historyBin','historyMode','targetLow','targetHigh'])$(id).onchange=render;
  for(const id of ['targetLow','targetHigh'])$(id).oninput=render;
  $('loadHistory').onclick=()=>load();$('latestHistory').onclick=()=>load(true);
  $('exportReportRaw').onclick=()=>save(csv(selected),'yeast-report-original.csv','text/csv;charset=utf-8');
  $('exportReportProcessed').onclick=()=>save(processedCSV(processed,{...snapshot,boot:$('historyBoot').value,minutes:Number($('historyBin').value)}),'yeast-report-processed.csv','text/csv;charset=utf-8');
  $('exportTempSVG').onclick=()=>save($('temperatureChart').innerHTML,'yeast-temperature.svg','image/svg+xml');
  $('exportGasSVG').onclick=()=>save($('gasChart').innerHTML,'yeast-gas-profile.svg','image/svg+xml');
  $('printReport').onclick=()=>window.print();
  preset();load();
}
