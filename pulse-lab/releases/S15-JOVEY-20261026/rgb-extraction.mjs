import {rank,sustainedExposureShift} from './adaptive-extraction.mjs';
import {estimatePulse} from './pulse-rate.mjs';
import {waveformStability,representativeWave,WAVEFORM_POLICY} from './waveform-quality.mjs';

// One region and one time base for all colours. Quality selection never sees
// SpO2 predictions or labels, and display normalization never enters inference.
export const RGB_POLICY=Object.freeze({version:'synchronized-rgb-v2-continuous',channels:['r','g','b'],historySeconds:4,minHistorySeconds:3,rankingSeconds:1,hysteresis:1.4,confirmations:2,maxGap:.12,maxClipped:.05,maxRateDifference:.12,retrySeconds:1,stability:WAVEFORM_POLICY,validated:false});
const channels=RGB_POLICY.channels,names={r:'Red',g:'Green',b:'Blue'};
const mean=a=>a.reduce((s,x)=>s+x,0)/Math.max(1,a.length);

export class SynchronizedRGBExtractor{
  constructor(){this.epoch=0;this.reset()}
  reset({keepSelection=false}={}){this.epoch++;this.history=[];if(!keepSelection)this.region=0;this.ready=false;this.scores=[];this.lastRanking=-Infinity;this.challenger=null;this.confirmations=0}
  push(t,regions,{locked=false}={}){
    let changed=false,reason=null,interrupted=false;const last=this.history.at(-1);
    if(last){
      const before=last.regions[this.region],current=regions[this.region];
      if(t<=last.t||t-last.t>RGB_POLICY.maxGap){this.history=[];this.lastRanking=-Infinity;interrupted=true}
      if(channels.some(c=>Math.abs(current[c]-before[c])>Math.max(8,Math.abs(before[c])*.12)))interrupted=true;
    }
    this.history.push({t,regions,interrupted});this.history=this.history.filter(s=>s.t>=t-RGB_POLICY.historySeconds);
    if(t-this.history[0].t>=RGB_POLICY.minHistorySeconds&&t-this.lastRanking>=RGB_POLICY.rankingSeconds){
      if(sustainedExposureShift(this.history,this.region,channels)){this.reset({keepSelection:true});this.history.push({t,regions});changed=true;reason='rgb_exposure_step';interrupted=true}
      else if(this.history.some(s=>s.interrupted)){this.lastRanking=t}
      else{
      this.lastRanking=t;
      this.scores=regions.map((_,region)=>{
        const perChannel=channels.map((c,i)=>{
          const eligible=this.history.every(s=>s.regions[region].clipped[i]<=RGB_POLICY.maxClipped&&s.regions[region][c]>3&&s.regions[region][c]<250);
          return{...rank(this.history,region,c),eligible};
        });
        return{region,channels:perChannel,score:perChannel.every(c=>c.eligible)?Math.min(...perChannel.map(c=>c.score)):0};
      });
      const active=this.scores[this.region],best=this.scores.reduce((a,b)=>b.score>a.score+1e-6?b:a,active);
      // A healthy selected region stays fixed while its snippets accumulate.
      if(best.region!==this.region&&best.score>0&&(!locked||active.score===0)&&best.score>active.score*RGB_POLICY.hysteresis){
        this.confirmations=this.challenger===best.region?this.confirmations+1:1;this.challenger=best.region;
        if(!this.ready||this.confirmations>=RGB_POLICY.confirmations){this.region=best.region;this.epoch++;changed=true;reason='rgb_region_change';this.challenger=null;this.confirmations=0}
      }else{this.challenger=null;this.confirmations=0}
      this.ready=this.scores[this.region].score>0;
      }
    }
    const selected=regions[this.region];
    return{...selected,t,regionId:selected.id,acquisitionEpoch:this.epoch,selectionReady:this.ready,selectionChanged:changed,selectionReason:reason,candidateInterrupted:interrupted,channelScores:this.scores[this.region]?.channels??[],commonRegion:true};
  }
}

export function assessRGBWaveforms(samples,polarities={}){
  const fail=(message,status={})=>({accepted:false,message,channels:status});
  if(samples.length<2||samples.some(s=>!s.frameTimingVerified)||samples.slice(1).some((s,i)=>s.t<=samples[i].t||s.t-samples[i].t>RGB_POLICY.maxGap))return fail('RGB frame timing is interrupted.');
  const regions=new Set(samples.map(s=>s.oxygen?.regionId??'whole-frame')),epochs=new Set(samples.map(s=>s.oxygen?.acquisitionEpoch??0));
  if(regions.size!==1||epochs.size!==1)return fail('RGB region changed inside the segment.');
  const raw=samples.map(s=>({t:s.t,...s.oxygen,frameTimingVerified:s.frameTimingVerified})),status={};
  for(const [i,channel] of channels.entries()){
    const usable=raw.every(s=>Number.isFinite(s[channel])&&Number.isFinite(s.clipped?.[i])&&s.clipped[i]<=RGB_POLICY.maxClipped);
    const pulse=usable?estimatePulse(raw,{channel,polarity:polarities[channel]??null,seconds:6}):null;
    status[channel]={channel,accepted:!!pulse,beatCount:pulse?.beats.length??0,pulse,message:!usable?`${names[channel]} clipped or missing`:pulse?'Repeatable beats':`${names[channel]} needs repeatable beats`};
  }
  const failed=channels.filter(c=>!status[c].accepted);
  if(failed.length)return fail(failed.map(c=>status[c].message).join(' · '),status);
  const rates=channels.map(c=>status[c].pulse.bpm),rateDifference=(Math.max(...rates)-Math.min(...rates))/mean(rates);
  if(rateDifference>RGB_POLICY.maxRateDifference)return fail('RGB pulse rates disagree. Hold still.',status);
  return{accepted:true,channels:status,rateDifference,regionId:[...regions][0],epoch:[...epochs][0],message:'Synchronized RGB segment saved'};
}

function summarizeGroup(bank){
  const status={};
  for(const channel of channels){
    const beats=bank.flatMap(s=>s.rgb.channels[channel].pulse.beats);
    const stability=waveformStability(beats);
    status[channel]={channel,beatCount:beats.length,stability,meanWave:representativeWave(beats)};
  }
  return{ready:channels.every(c=>status[c].stability.ready),channels:status,segments:bank.length,selectedSnippetIds:bank.map(s=>s.id),contact:bank.at(-1)?.contact??null,regionId:bank.at(-1)?.rgb.regionId??null,epoch:bank.at(-1)?.rgb.epoch??null,lastCapturedAtSeconds:bank.at(-1)?.capturedAtSeconds??null,synchronized:true,policy:RGB_POLICY};
}
export function summarizeRGBSegments(bank,{minSegments=1}={}){
  const groups=new Map();
  for(const s of bank){const key=JSON.stringify([s.contact,s.rgb.epoch,s.rgb.regionId]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(s)}
  const summaries=[...groups].map(([groupKey,items])=>({...summarizeGroup(items),groupKey}));
  const qualified=s=>s.ready&&s.segments>=minSegments;
  summaries.sort((a,b)=>Number(qualified(b))-Number(qualified(a))||Number(b.ready)-Number(a.ready)||b.segments-a.segments||b.lastCapturedAtSeconds-a.lastCapturedAtSeconds);
  return{...(summaries[0]??summarizeGroup([])),groups:groups.size,retainedSegments:bank.length};
}
