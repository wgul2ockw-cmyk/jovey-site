import {CAPTURE_POLICY,evaluateCapture,predictSelectedCapture} from './capture-quality.mjs';
import {estimatePulse,meanAcceptedPulse} from './pulse-rate.mjs';
import {waveformStability,WAVEFORM_POLICY} from './waveform-quality.mjs';
// Provisional acquisition criteria, not a clinical accuracy or certainty claim.
export const SNIPPET_POLICY=Object.freeze({version:'continuous-snippets-v3',snippetSeconds:6.3,windowsPerSnippet:3,settlingSeconds:2.1,retrySeconds:1,targetSnippets:2,targetBeats:WAVEFORM_POLICY.minBeats,maxAgeSeconds:60,maxCaptureSeconds:null,stability:WAVEFORM_POLICY,validated:false});
export function assessSnippet(samples,model,{channel:preferred=samples[0]?.selectedChannel,polarity=null}={}){
  if(samples.length<3||samples.some(s=>!s.frameTimingVerified))return{accepted:false,message:'Checking frame timing'};
  const choices=[];let reason='Finding a repeatable pulse';
  for(const channel of ['r','g','b']){
    if(preferred&&channel!==preferred)continue;
    const options={channel,settlingSeconds:0,minWindows:3,minCaptureSeconds:0};
    // Pulse periodicity/morphology is checked on the whole snippet, not a short BP window.
    const optical=evaluateCapture(samples,null,{...options,minAutocorrelation:0,minPulseBandPower:0});
    if(!optical.ready){reason=optical.message;continue}
    const pulse=estimatePulse(samples,{channel,polarity,seconds:SNIPPET_POLICY.snippetSeconds});
    if(!pulse){reason='Waiting for repeatable beats';continue}
    const bp=model?evaluateCapture(samples,model,options):null;
    choices.push({accepted:true,channel,pulse,optical,bpEligible:!!bp?.ready,bp,message:bp?.ready?'Clean segment saved':model?'Pulse saved · BP signal differs from training data':'Pulse saved · BP model unavailable'});
  }
  return choices.sort((a,b)=>Number(b.bpEligible)-Number(a.bpEligible)||b.optical.selected.score-a.optical.selected.score)[0]??{accepted:false,message:reason};
}
export class SnippetCollector {
  constructor(){this.bank=[];this.audit=[];this.contact=0;this.serial=0;this.savedBeats=0;this.savedSnippets=0;this.savedBPSnippets=0;this.resetContact();this.message='Place your finger';this.checked=0;this.rejected=0}
  // Only a new scan constructs a new bank. Temporary faults discard candidates.
  pause(){this.buffer=[];this.nextStart=null}
  resetContact(){this.contact++;this.pause();this.settleUntil=null;this.lastPolarity=null;this.regionEpoch=null;this.activeChannel=null;this.activeRegion=null;this.message='Settling · saved snippets kept'}
  prune(elapsed){const before=this.bank.length;this.bank=this.bank.filter(s=>elapsed-s.capturedAtSeconds<=SNIPPET_POLICY.maxAgeSeconds);if(before>this.bank.length)this.message='Refreshing older signal';return before!==this.bank.length}
  push(sample,model,elapsed,acquisition={}){
    this.prune(elapsed);
    if(this.buffer.length&&(sample.t<=this.buffer.at(-1).t||sample.t-this.buffer.at(-1).t>CAPTURE_POLICY.maxFrameGap))this.pause();
    if(this.regionEpoch!==null&&sample.acquisitionEpoch!==undefined&&sample.acquisitionEpoch!==this.regionEpoch)this.resetContact();
    if(this.activeChannel&&sample.selectedChannel&&sample.selectedChannel!==this.activeChannel)this.resetContact();
    if(this.activeRegion&&sample.regionId&&sample.regionId!==this.activeRegion)this.resetContact();
    this.regionEpoch=sample.acquisitionEpoch??this.regionEpoch;this.activeChannel=sample.selectedChannel??this.activeChannel;this.activeRegion=sample.regionId??this.activeRegion;
    this.settleUntil??=sample.t+SNIPPET_POLICY.settlingSeconds;
    if(sample.candidateInterrupted||sample.contactUsable===false||!sample.frameTimingVerified){this.pause();return null}
    this.nextStart??=Math.max(sample.t,this.settleUntil);
    this.buffer.push(sample);
    this.buffer=this.buffer.filter(s=>s.t>=this.nextStart-.05);
    const first=this.buffer.find(s=>s.t>=this.nextStart-1e-8);
    if(!first||sample.t-first.t<SNIPPET_POLICY.snippetSeconds-1e-8)return null;
    // Keep the measured frame that brackets the end. Camera timestamps rarely
    // land exactly on 6.3 s; dropping that frame leaves only two BP windows.
    const start=first.t,end=sample.t;
    const part=this.buffer.filter(s=>s.t>=start-1e-8&&s.t<=end+1e-8);
    const result=assessSnippet(part,model,{channel:this.activeChannel,polarity:this.lastPolarity}),id=`segment-${++this.serial}`;
    this.checked++;if(!result.accepted)this.rejected++;
    const entry={id,contact:this.contact,start,end,capturedAtSeconds:elapsed,acquisition:{...acquisition,epoch:this.regionEpoch,regionId:this.activeRegion},...result};
    if(result.accepted){entry.samples=part;this.bank.push(entry);this.savedSnippets++;this.savedBeats+=result.pulse.beats.length;this.savedBPSnippets+=Number(result.bpEligible);this.lastPolarity=result.pulse.polarity;this.activeChannel=result.channel}
    this.audit.push({id,contact:this.contact,start,end,capturedAtSeconds:elapsed,accepted:result.accepted,bpEligible:!!result.bpEligible,channel:result.channel??null,message:result.message});this.audit=this.audit.slice(-120);
    this.message=result.message;this.nextStart=result.accepted?end:start+SNIPPET_POLICY.retrySeconds;this.buffer=this.buffer.filter(s=>s.t>=this.nextStart-1e-8);
    return entry;
  }
  summary(elapsed){
    this.prune(elapsed);const groups=new Map();
    for(const s of this.bank){const key=JSON.stringify([s.contact,s.acquisition.epoch,s.acquisition.regionId,s.channel]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(s)}
    const summarize=(bank,groupKey=null)=>{
      const pulse=meanAcceptedPulse(bank),bpSnippets=bank.filter(s=>s.bpEligible),beats=pulse?.beatCount||0;
      const stability=waveformStability(bank.flatMap(s=>s.pulse.beats)),bpStability=waveformStability(bpSnippets.flatMap(s=>s.pulse.beats));
      return{pulse,beats,stability,bpStability,epoch:bank.at(-1)?.contact??this.contact,groupKey,selectedSnippetIds:bank.map(s=>s.id),lastCapturedAtSeconds:bank.at(-1)?.capturedAtSeconds??null,snippets:bank.length,bpSnippets:bpSnippets.length,cleanSeconds:bank.length*SNIPPET_POLICY.snippetSeconds,bpSeconds:bpSnippets.length*SNIPPET_POLICY.snippetSeconds,pulseReady:beats>=4,ready:bpSnippets.length>=SNIPPET_POLICY.targetSnippets&&stability.ready&&bpStability.ready,waveformReady:beats>=SNIPPET_POLICY.targetBeats&&stability.ready};
    };
    const candidates=[...groups].map(([key,bank])=>summarize(bank,key));
    candidates.sort((a,b)=>Number(b.ready)-Number(a.ready)||Number(b.waveformReady)-Number(a.waveformReady)||b.beats-a.beats||b.lastCapturedAtSeconds-a.lastCapturedAtSeconds);
    return{...(candidates[0]??summarize([])),groups:groups.size,retainedSnippets:this.bank.length,savedSnippets:this.savedSnippets,savedBPSnippets:this.savedBPSnippets,savedBeats:this.savedBeats,message:this.message,checked:this.checked,rejected:this.rejected};
  }
  analysis(elapsed){
    const state=this.summary(elapsed),eligible=this.bank.filter(s=>state.selectedSnippetIds.includes(s.id)&&s.bpEligible),windows=[];
    for(const snippet of eligible)for(const w of snippet.bp.windows){windows.push({...w,index:windows.length,snippetId:snippet.id,channel:snippet.channel,startSeconds:snippet.capturedAtSeconds-SNIPPET_POLICY.snippetSeconds+w.startSeconds,endSeconds:snippet.capturedAtSeconds-SNIPPET_POLICY.snippetSeconds+w.endSeconds})}
    const selected=windows.length?{kind:'snippets',features:windows.map(w=>w.features),windowIndices:windows.map(w=>w.index),windowCount:windows.length,snippetCount:eligible.length,durationSeconds:state.bpSeconds,channels:[...new Set(eligible.map(s=>s.channel))],grade:'Accepted segments',snippets:eligible.map(s=>({id:s.id,contact:s.contact,start:s.start,end:s.end,capturedAtSeconds:s.capturedAtSeconds,channel:s.channel,acquisition:s.acquisition}))}:null;
    return{policy:SNIPPET_POLICY.version,ready:state.ready,stability:state.stability,bpStability:state.bpStability,epoch:state.epoch,groupKey:state.groupKey,selectedSnippetIds:state.selectedSnippetIds,lastCapturedAtSeconds:state.lastCapturedAtSeconds,qualityValidated:false,windows,selected,duration:elapsed,message:state.message};
  }
}
export function predictSnippets(model,assessment){
  const result=predictSelectedCapture(model,assessment);return{...result,aggregation:`Arithmetic mean of ${result.windowPredictions.length} original 2.1-second model windows from accepted nonoverlapping snippets; normalized mean waveform is display only`};
}
