import {acTrace} from './live-signal.mjs';
import {originalBeat,representativeWave} from './waveform-quality.mjs';
// Experimental optical pulse estimate, independent of the BP model/domain gate.
export const PULSE_VERSION='optical-pulse-v3-original-morphology';
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const median=a=>{const s=[...a].sort((a,b)=>a-b);return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2};
const sd=a=>Math.sqrt(mean(a.map(x=>(x-mean(a))**2)));
export function estimatePulse(input,{channel:preferred=null,polarity:preferredPolarity=null,seconds=6}={}){
  const end=input.at(-1)?.t??0,samples=input.filter(s=>s.t>=end-seconds);
  if(samples.length<96||end-samples[0].t<4)return null;
  const dt=samples.slice(1).map((s,i)=>s.t-samples[i].t);
  if(samples.some(s=>!s.frameTimingVerified)||dt.some(d=>!Number.isFinite(d)||d<=0||d>.2)||1/median(dt)<24||sd(dt)/mean(dt)>.35)return null;
  const candidates=[];
  for(const [channel,ci] of [['r',0],['g',1],['b',2]]){
    if(preferred&&channel!==preferred)continue;
    const raw=samples.map(s=>s[channel]);
    if(raw.some(x=>!Number.isFinite(x))||mean(raw)<=3||mean(raw)>=252||mean(samples.map(s=>s.clipped?.[ci]??1))>=.1)continue;
    // Real timestamps are resampled for lag estimation; no assumed frame timing.
    let j=0;const uniform=[];
    for(let t=samples[0].t;t<=end;t+=1/30){while(j<samples.length-2&&samples[j+1].t<t)j++;const f=(t-samples[j].t)/(samples[j+1].t-samples[j].t);uniform.push({t,[channel]:raw[j]+f*(raw[j+1]-raw[j])})}
    const ac=acTrace(uniform,channel,false),v=ac.map((x,i)=>mean(ac.slice(Math.max(0,i-1),i+2))),amplitude=sd(v);
    if(amplitude<.08)continue;
    const corr=[];
    for(let lag=8;lag<=46;lag++){
      const n=v.length-lag;let sx=0,sy=0,xx=0,yy=0,xy=0;
      for(let i=lag;i<v.length;i++){const x=v[i],y=v[i-lag];sx+=x;sy+=y;xx+=x*x;yy+=y*y;xy+=x*y}
      const den=Math.sqrt(Math.max(0,xx-sx*sx/n)*Math.max(0,yy-sy*sy/n));corr[lag]=den?(xy-sx*sy/n)/den:0;
    }
    const peaks=[];for(let lag=10;lag<=45;lag++)if(corr[lag]>=.70&&corr[lag]>=corr[lag-1]&&corr[lag]>=corr[lag+1])peaks.push(lag);
    if(!peaks.length)continue;
    const best=Math.max(...peaks.map(l=>corr[l])),lag=peaks.find(l=>corr[l]>=best-.04);
    // If alternating cycles agree materially better than the chosen short period,
    // withhold this ambiguous readout. Equal 2T correlation is normal periodicity.
    if(peaks.some(l=>Math.abs(l-2*lag)<=2&&corr[l]>corr[lag]+.015))continue;
    const denominator=corr[lag-1]-2*corr[lag]+corr[lag+1],delta=denominator ? .5*(corr[lag-1]-corr[lag+1])/denominator : 0;
    const period=(lag+Math.max(-.5,Math.min(.5,delta)))/30,bpm=60/period;
    if(bpm<40||bpm>180)continue;
    // Extrema intervals check cycle consistency; harmonic ambiguity is not fully resolvable from optical data.
    let intervals=null,cycles=[],polarity=1;
    for(const sign of preferredPolarity?[preferredPolarity]:[1,-1]){
      const local=[];for(let i=1;i<v.length-1;i++)if(v[i]*sign>amplitude*.4&&v[i]*sign>=v[i-1]*sign&&v[i]*sign>v[i+1]*sign)local.push(i);
      const chosen=[];for(const i of local.sort((a,b)=>sign*(v[b]-v[a])))if(chosen.every(k=>Math.abs(k-i)>lag*.65))chosen.push(i);
      chosen.sort((a,b)=>a-b);const gaps=chosen.slice(1).map((x,i)=>(x-chosen[i])/30);
      if(gaps.length>=3&&sd(gaps)/mean(gaps)<.18&&Math.abs(median(gaps)-period)/period<.12){intervals=gaps;polarity=sign;
        cycles=chosen.slice(1).map((stop,k)=>originalBeat(samples,uniform[chosen[k]].t,uniform[stop].t,channel,sign)).filter(Boolean);
        break}
    }
    if(intervals){
      if(cycles.length<3)continue;
      const template=Array.from({length:64},(_,i)=>median(cycles.map(c=>c.shape[i])));
      cycles=cycles.map(c=>({...c,correlation:shapeCorrelation(c.shape,template)})).filter(c=>c.correlation>=.8);
      if(cycles.length<3)continue;
      candidates.push({bpm:Math.round(bpm),channel,periodicity:corr[lag],intervalCount:cycles.length,beats:cycles,polarity,startSeconds:samples[0].t,endSeconds:end,version:PULSE_VERSION,validated:false});
    }
  }
  return candidates.sort((a,b)=>b.periodicity-a.periodicity)[0]??null;
}
export function summarizePulse(estimates){if(!estimates.length)return null;return{bpm:Math.round(median(estimates.map(e=>e.bpm))),acceptedReadouts:estimates.length,firstSampleTime:estimates[0].startSeconds,lastSampleTime:estimates.at(-1).endSeconds,aggregation:'Median of overlapping accepted live pulse readouts; not independent beats',version:PULSE_VERSION,validated:false}}

export function shapeCorrelation(a,b){const ma=mean(a),mb=mean(b),den=Math.sqrt(a.reduce((s,x)=>s+(x-ma)**2,0)*b.reduce((s,x)=>s+(x-mb)**2,0));return den?a.reduce((s,x,i)=>s+(x-ma)*(b[i]-mb),0)/den:0}
export function meanAcceptedPulse(snippets){
  const seen=new Set(),beats=snippets.flatMap(s=>s.pulse.beats.map(b=>({...b,id:`${s.contact}:${b.start.toFixed(5)}:${b.end.toFixed(5)}`,contact:s.contact,channel:s.channel,polarity:s.pulse.polarity,snippetId:s.id}))).filter(b=>{if(seen.has(b.id))return false;seen.add(b.id);return true});
  if(!beats.length)return null;
  const groups=new Map();for(const beat of beats){const key=beat.contact+':'+beat.channel+':'+beat.polarity;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(beat)}
  const group=[...groups.values()].sort((a,b)=>b.length-a.length)[0];
  return{bpm:Math.round(60/mean(beats.map(b=>b.seconds))),beatCount:beats.length,intervalSeconds:beats.map(b=>b.seconds),aggregation:'60 divided by mean duration of complete, nonoverlapping accepted beat intervals in one stable acquisition epoch',version:PULSE_VERSION,validated:false,meanWave:representativeWave(group)};
}
