// Deterministic RGB preprocessing shared with research/spo2/train_spo2.py.
// The pulse waveform shown on screen is never an input to this model.
import {RGB_POLICY,assessRGBWaveforms,summarizeRGBSegments} from './rgb-extraction.mjs';
export const SPO2_FEATURE_VERSION='rgb-acdc-rescnn-v1';
export const SPO2_POLICY=Object.freeze({version:'spo2-rgb-v5-continuous',fps:30,frames:180,seconds:6,settlingSeconds:4.2,minSegments:3,maxAgeSeconds:120,maxGap:RGB_POLICY.maxGap,maxClipped:RGB_POLICY.maxClipped,minPulseCorrelation:.35,rgbPolicy:RGB_POLICY});
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
// Report the existing any-frame clipping gate without relaxing it. Legacy RGB
// exports still work, but combined clipping alone cannot reveal dark vs bright.
export function inspectOxygenExposure(samples){
  const frames=samples.map(s=>s.oxygen),valid=a=>Array.isArray(a)&&a.length===3&&a.every(x=>Number.isFinite(x)&&x>=0&&x<=1);
  if(!frames.length||frames.some(f=>!f||!valid(f.clipped)||['r','g','b'].some(c=>!Number.isFinite(f[c]))))return{available:false,blocked:true,code:'rgb_exposure_unavailable',channels:[],message:'RGB clipping information is unavailable.'};
  const split=frames.every(f=>valid(f.clippedLow)&&valid(f.clippedHigh)&&f.clipped.every((v,i)=>Math.abs(v-f.clippedLow[i]-f.clippedHigh[i])<1e-6));
  const channels=['r','g','b'].map((channel,i)=>({channel,name:['Red','Green','Blue'][i],brightness:mean(frames.map(f=>f[channel])),clippedMax:Math.max(...frames.map(f=>f.clipped[i])),darkMax:split?Math.max(...frames.map(f=>f.clippedLow[i])):null,brightMax:split?Math.max(...frames.map(f=>f.clippedHigh[i])):null}));
  const blocked=channels.filter(c=>c.clippedMax>SPO2_POLICY.maxClipped).sort((a,b)=>b.clippedMax-a.clippedMax);
  for(const c of channels)c.direction=c.clippedMax<=SPO2_POLICY.maxClipped?'none':!split?'unknown':c.darkMax===0?'bright':c.brightMax===0?'dark':c.darkMax>SPO2_POLICY.maxClipped&&c.brightMax<=SPO2_POLICY.maxClipped?'dark':c.brightMax>SPO2_POLICY.maxClipped&&c.darkMax<=SPO2_POLICY.maxClipped?'bright':'both';
  const wording={dark:'too dark',bright:'too bright',both:'clipped at dark and bright limits',unknown:'clipped'};
  const message=blocked.length?blocked.map(c=>`${c.name} camera channel ${wording[c.direction]}`).join('; ')+'.':'RGB clipping check clear.';
  const hint=blocked.length?'Searching for usable colour data; saved snippets are kept.':'Hold still while RGB segments are checked.';
  return{available:true,blocked:!!blocked.length,code:blocked.length?'rgb_clipping':'rgb_exposure_clear',channels,message,hint};
}
export function formatOxygenExposure(exposure){
  if(!exposure?.available)return exposure?.message||'No RGB exposure data.';
  return exposure.channels.map(c=>`${c.name}: ${c.brightness.toFixed(1)}/255 mean; ${c.darkMax===null?`${(c.clippedMax*100).toFixed(1)}% clipped`:`${(c.darkMax*100).toFixed(1)}% dark, ${(c.brightMax*100).toFixed(1)}% bright`}`).join(' · ');
}
export function preprocessRGB(rgb){
  if(rgb.length!==180||rgb.some(row=>row.length!==3||row.some(x=>!Number.isFinite(x)||x<0||x>255)))throw Error('SpO₂ requires 180 finite RGB frames.');
  const dc=[0,1,2].map(c=>mean(rgb.map(r=>r[c])));
  if(dc.some(x=>x<=3||x>=250))throw Error('All three colours need usable exposure.');
  const t=rgb.map((_,i)=>i-89.5),den=t.reduce((s,x)=>s+x*x,0);
  const wave=dc.map((d,c)=>{const z=rgb.map(r=>r[c]/d-1),slope=z.reduce((s,x,i)=>s+x*t[i],0)/den;return z.map((x,i)=>(x-slope*t[i])*100)});
  const rms=wave.map(a=>Math.max(Math.sqrt(mean(a.map(x=>x*x))),1e-6));
  const features=[...rms.map(Math.log),Math.log(rms[0]/rms[1]),Math.log(rms[0]/rms[2]),Math.log(rms[1]/rms[2]),Math.log(dc[1]/dc[0]),Math.log(dc[2]/dc[0])];
  return{wave,features,dc,rms};
}
export function validateSpO2Model(model){
  if(model?.kind==='bounded_cnn_ensemble'){
    if(model.feature_version!==SPO2_FEATURE_VERSION||model.frames!==180||model.fps!==30||!Array.isArray(model.members)||model.members.length!==2)throw Error('SpO₂ neural model version mismatch.');
    for(const member of model.members)if(!member.weights?.['c1.weight']||!member.normalization?.wave_scale||member.normalization.wave_scale.some(x=>!Number.isFinite(x)||x<=0))throw Error('Invalid SpO₂ neural weights.');
    return model;
  }
  if(model?.feature_version==='rgb-spectral-v2'){
    if(!['spectral_svr','spectral_trees','spectral_ridge'].includes(model.kind)||model.frames!==180||model.fps!==30||![9,15].includes(model.feature_count))throw Error('SpO₂ spectral model version mismatch.');
    for(const name of ['feature_min','feature_max'])if(!Array.isArray(model[name])||model[name].length!==model.feature_count||model[name].some(x=>!Number.isFinite(x)))throw Error('Invalid SpO₂ feature bounds.');
    if(model.kind==='spectral_trees'){if(!Array.isArray(model.trees)||!model.trees.length)throw Error('SpO₂ trees unavailable.')}
    else{for(const name of ['feature_mean','feature_scale'])if(!Array.isArray(model[name])||model[name].length!==model.feature_count||model[name].some(x=>!Number.isFinite(x)))throw Error('Invalid SpO₂ spectral scale.');if(model.feature_scale.some(x=>x<=0))throw Error('Invalid SpO₂ spectral scale.')}
    return model;
  }
  if(model?.feature_version!==SPO2_FEATURE_VERSION||model.kind!=='ratio_ridge'||model.frames!==180||model.fps!==30)throw Error('SpO₂ model version mismatch.');
  for(const name of ['feature_mean','feature_scale','coefficients','feature_min','feature_max'])if(!Array.isArray(model[name])||model[name].length!==3||model[name].some(x=>!Number.isFinite(x)))throw Error('Invalid SpO₂ model coefficients.');
  if(model.feature_scale.some(x=>x<=0)||!Number.isFinite(model.intercept))throw Error('Invalid SpO₂ model scale.');
  return model;
}
export function predictRatio(model,features){
  const x=features.slice(3,6);
  return model.intercept+x.reduce((s,v,i)=>s+(v-model.feature_mean[i])/model.feature_scale[i]*model.coefficients[i],0);
}
export function spectralFeatures(prepared){
  const power=Array.from({length:22},()=>[0,0,0]),n=180;
  for(let k=4;k<22;k++)for(let c=0;c<3;c++){
    let re=0,im=0;
    for(let i=0;i<n;i++){
      const v=prepared.wave[c][i]/100*(.5-.5*Math.cos(2*Math.PI*i/(n-1))),angle=2*Math.PI*k*i/n;
      re+=v*Math.cos(angle);im-=v*Math.sin(angle);
    }
    power[k][c]=re*re+im*im;
  }
  const band=[0,1,2].map(c=>Math.sqrt(Math.max(1e-12,power.slice(4,22).reduce((s,p)=>s+p[c],0))));
  let peak=4;for(let k=5;k<19;k++)if(power[k][1]>power[peak][1])peak=k;
  const pulse=[0,1,2].map(c=>Math.sqrt(Math.max(1e-12,power.slice(Math.max(4,peak-1),Math.min(22,peak+2)).reduce((s,p)=>s+p[c],0))));
  const ratio=a=>[Math.log(a[0]/a[1]),Math.log(a[0]/a[2]),Math.log(a[1]/a[2])];
  return [...ratio(band),...ratio(pulse),...ratio(prepared.rms),...band.map(Math.log),...pulse.map((x,i)=>Math.log(Math.max(x/band[i],1e-8)))];
}
export function predictSpectral(model,features){
  const raw=features.slice(0,model.feature_count);
  if(model.kind==='spectral_trees')return mean(model.trees.map(tree=>{let node=0;while(tree.children_left[node]!==-1)node=raw[tree.feature[node]]<=tree.threshold[node]?tree.children_left[node]:tree.children_right[node];return tree.value[node]}));
  const x=raw.map((v,i)=>(v-model.feature_mean[i])/model.feature_scale[i]);
  if(model.kind==='spectral_ridge')return model.intercept+x.reduce((s,v,i)=>s+v*model.coefficients[i],0);
  let prediction=model.intercept;
  for(let i=0;i<model.support_vectors.length;i++){
    let distance=0;for(let j=0;j<x.length;j++)distance+=(x[j]-model.support_vectors[i][j])**2;
    prediction+=model.dual_coefficients[i]*Math.exp(-model.gamma*distance);
  }
  return prediction;
}
// Portable reference CNN inference is retained for parity and reproducibility.
function conv(x,w,b,pad){return w.map((kernel,o)=>x[0].map((_,i)=>{let v=b[o];for(let c=0;c<x.length;c++)for(let k=0;k<kernel[c].length;k++){const j=i+k-pad;if(j>=0&&j<x[c].length)v+=x[c][j]*kernel[c][k]}return v}))}
const relu=x=>x.map(c=>c.map(v=>Math.max(0,v)));
const pool=x=>x.map(c=>Array.from({length:Math.floor(c.length/3)},(_,i)=>(c[i*3]+c[i*3+1]+c[i*3+2])/3));
const dense=(x,w,b)=>w.map((row,i)=>row.reduce((s,v,j)=>s+v*x[j],b[i]));
export function predictCNN(model,prepared){
  const n=model.normalization,w=model.weights;
  const clip=v=>model.input_clip?Math.max(-model.input_clip,Math.min(model.input_clip,v)):v;
  let x=prepared.wave.map((c,i)=>c.map(v=>clip(v/n.wave_scale[i])));
  x=relu(conv(x,w['c1.weight'],w['c1.bias'],3));
  const residual=conv(x,w['c2.weight'],w['c2.bias'],2);
  x=pool(relu(x.map((c,i)=>c.map((v,j)=>v+residual[i][j]))));
  x=pool(relu(conv(x,w['c3.weight'],w['c3.bias'],2)));
  const features=prepared.features.map((v,i)=>clip(((model.mask_dc&&i>=6?0:v)-n.feature_mean[i])/n.feature_scale[i]));
  let z=[...x.map(mean),...x.map(c=>Math.max(...c)),...features];
  z=dense(z,w['fc1.weight'],w['fc1.bias']).map(v=>Math.max(0,v));
  const output=dense(z,w['fc2.weight'],w['fc2.bias'])[0];
  return (model.output_activation==='sigmoid'?1/(1+Math.exp(-output)):output)*model.output_scale+model.output_offset;
}
export function predictBounded(model,prepared){return mean(model.members.map(member=>predictCNN(member,prepared)))}
function pulseCorrelation(wave){
  let best=0;
  for(const a of wave)for(let lag=9;lag<=43;lag++){
    let xy=0,xx=0,yy=0;for(let i=lag;i<a.length;i++){xy+=a[i]*a[i-lag];xx+=a[i]*a[i];yy+=a[i-lag]*a[i-lag]}
    best=Math.max(best,xy/Math.sqrt(xx*yy||1));
  }
  return best;
}
export function assessOxygenSegment(samples,model,acquisition={}){
  const fail=(message,details={})=>({accepted:false,message,...details});
  if(!model)return fail('SpO₂ model unavailable.');
  if(acquisition.torch!=='on')return fail('SpO₂ needs the camera flash reported on.');
  if(samples.length<2||samples.some(s=>!s.frameTimingVerified))return fail('SpO₂ needs verified camera timing.');
  const start=samples[0].t;
  if(samples.at(-1).t-start<(179/30)-1e-8)return fail('Collecting six seconds of RGB.');
  const fps=(samples.length-1)/(samples.at(-1).t-start);
  if(!Number.isFinite(fps)||fps<24)return fail('SpO₂ needs at least 24 measured camera frames per second.');
  for(let i=1;i<samples.length;i++)if(!Number.isFinite(samples[i].t)||samples[i].t<=samples[i-1].t||samples[i].t-samples[i-1].t>SPO2_POLICY.maxGap)return fail('Camera frames were interrupted.');
  if(samples.some(s=>!s.oxygen||['r','g','b'].some(c=>!Number.isFinite(s.oxygen[c]))))return fail('Synchronized RGB is unavailable for SpO₂.');
  if(new Set(samples.map(s=>s.oxygen.regionId??'whole-frame')).size!==1||new Set(samples.map(s=>s.oxygen.acquisitionEpoch??0)).size!==1)return fail('RGB region changed inside the segment.');
  const exposure=inspectOxygenExposure(samples);
  if(exposure.blocked)return fail(exposure.message+(exposure.hint?' '+exposure.hint:''),{code:exposure.code,exposure});
  const rgb=[];let j=0;
  for(let i=0;i<180;i++){const t=start+i/30;while(j+1<samples.length&&samples[j+1].t<t)j++;const a=samples[j],b=samples[Math.min(j+1,samples.length-1)],mix=b.t>a.t?(t-a.t)/(b.t-a.t):0;rgb.push(['r','g','b'].map(c=>a.oxygen[c]+mix*(b.oxygen[c]-a.oxygen[c])))}
  let prepared;try{prepared=preprocessRGB(rgb)}catch(e){return fail(e.message)}
  if(prepared.rms.some(v=>v<.005||v>15))return fail('RGB pulse variation is too weak or unstable.');
  const correlation=pulseCorrelation(prepared.wave);
  if(correlation<SPO2_POLICY.minPulseCorrelation)return fail('Waiting for repeatable RGB pulses.');
  const spectral=model.feature_version==='rgb-spectral-v2',features=spectral?spectralFeatures(prepared):prepared.features;
  const ratios=spectral?features.slice(0,model.feature_count):features.slice(3,6);
  if(ratios.some((v,i)=>v<model.feature_min[i]||v>model.feature_max[i]))return fail('RGB ratios are outside this model’s training range.');
  const value=spectral?predictSpectral(model,features):model.kind==='bounded_cnn_ensemble'?predictBounded(model,prepared):predictRatio(model,features);
  if(!Number.isFinite(value)||value<70||value>100)return fail('Model output is outside its studied range. No estimate reported.');
  return{accepted:true,value,features,pulseCorrelation:correlation,exposure,message:'Experimental SpO₂ segment saved',phoneValidated:false};
}
export class OxygenCollector{
  constructor(){this.bank=[];this.signalBank=[];this.audit=[];this.serial=0;this.contact=0;this.savedSegments=0;this.savedRGBSegments=0;this.resetContact()}
  pause(){this.buffer=[];this.nextStart=null}
  resetContact(){this.contact++;this.pause();this.settleUntil=null;this.activeEpoch=null;this.activeRegion=null;this.polarities={};this.signalSummary=null;this.modelSummary=null;this.message='Collecting stable RGB · saved snippets kept'}
  prune(elapsed){
    const count=this.bank.length,signals=this.signalBank.length;
    this.bank=this.bank.filter(s=>elapsed-s.capturedAtSeconds<=SPO2_POLICY.maxAgeSeconds);this.signalBank=this.signalBank.filter(s=>elapsed-s.capturedAtSeconds<=SPO2_POLICY.maxAgeSeconds);
    if(count!==this.bank.length)this.modelSummary=null;if(signals!==this.signalBank.length)this.signalSummary=null;
  }
  push(sample,model,elapsed,acquisition){
    this.prune(elapsed);
    if(this.buffer.length&&(sample.t<=this.buffer.at(-1).t||sample.t-this.buffer.at(-1).t>SPO2_POLICY.maxGap))this.pause();
    const epoch=sample.oxygen?.acquisitionEpoch??0,region=sample.oxygen?.regionId??'whole-frame';
    if(this.activeEpoch!==null&&(epoch!==this.activeEpoch||region!==this.activeRegion))this.resetContact();
    this.activeEpoch=epoch;this.activeRegion=region;
    this.settleUntil??=sample.t+SPO2_POLICY.settlingSeconds;
    if(sample.oxygen?.candidateInterrupted||sample.contactUsable===false||!sample.frameTimingVerified){this.pause();return null}
    this.nextStart??=Math.max(sample.t,this.settleUntil);
    this.buffer.push(sample);
    // Bound the buffer during settling and after each candidate.
    this.buffer=this.buffer.filter(s=>s.t>=this.nextStart-.05);
    const first=this.buffer.find(s=>s.t>=this.nextStart-1e-8);
    if(!first||sample.t-first.t<SPO2_POLICY.seconds-1e-8)return null;
    // Retain the real endpoint frame for timestamp interpolation at noninteger fps.
    const start=first.t,end=sample.t,part=this.buffer.filter(s=>s.t>=start&&s.t<=end+1e-8);
    const exposure=inspectOxygenExposure(part),rgb=assessRGBWaveforms(part,this.polarities);
    const assessed=exposure.blocked?{accepted:false,message:exposure.message,code:exposure.code}:!rgb.accepted?{accepted:false,message:rgb.message,code:'rgb_waveform'}:assessOxygenSegment(part,model,acquisition);
    const result={id:`oxygen-${++this.serial}`,contact:this.contact,start,end,capturedAtSeconds:elapsed,...assessed,exposure,rgbAccepted:rgb.accepted,rgb};
    const channelAudit=Object.fromEntries(Object.entries(rgb.channels).map(([c,s])=>[c,{accepted:s.accepted,beatCount:s.beatCount,message:s.message}]));
    this.audit.push({...result,rgb:{accepted:rgb.accepted,channels:channelAudit,rateDifference:rgb.rateDifference}});this.audit=this.audit.slice(-120);
    const saved={...result,samples:part,acquisition:{...acquisition,regionId:region,epoch,synchronizedRGB:true,roiValidated:false}};
    if(rgb.accepted&&!exposure.blocked){this.signalBank.push(saved);this.savedRGBSegments++;this.signalSummary=null;for(const c of RGB_POLICY.channels)this.polarities[c]=rgb.channels[c].pulse.polarity}
    if(result.accepted){this.bank.push(saved);this.savedSegments++;this.modelSummary=null}
    // Retry an unsuccessful window one second later, then resume disjoint
    // snippets after acceptance. Never splice good frames around a bad interval.
    this.message=result.message;this.nextStart=rgb.accepted&&!exposure.blocked?end:start+RGB_POLICY.retrySeconds;this.buffer=this.buffer.filter(s=>s.t>=this.nextStart-1e-8);return result;
  }
  summary(elapsed,model){
    this.prune(elapsed);const rgb=this.signalSummary??=summarizeRGBSegments(this.signalBank),modelRGB=this.modelSummary??=summarizeRGBSegments(this.bank,{minSegments:SPO2_POLICY.minSegments});
    const selected=this.bank.filter(s=>modelRGB.selectedSnippetIds.includes(s.id)),ready=!!model&&selected.length>=SPO2_POLICY.minSegments&&modelRGB.ready;
    const values=selected.map(s=>s.value);
    const last=this.audit.at(-1),latest=last?.contact===this.contact?last:null;
    const message=ready?'Experimental SpO₂ ready':latest?.accepted?modelRGB.ready?`${values.length}/${SPO2_POLICY.minSegments} RGB segments saved; keep collecting.`:'RGB snippets saved · checking stability in every colour':this.message;
    return{ready,segments:values.length,savedSegments:this.savedSegments,savedRGBSegments:this.savedRGBSegments,rgb,modelRGB,latestChannels:latest?.rgb.channels??{},message,code:latest?.code??null,exposure:latest?.exposure??null,modelId:model?.id??null,prediction:ready?{value:mean(values),range:[Math.min(...values),Math.max(...values)],segments:values.length,selectedSnippetIds:modelRGB.selectedSnippetIds,contact:modelRGB.contact,epoch:modelRGB.epoch,lastCapturedAtSeconds:modelRGB.lastCapturedAtSeconds,modelId:model.id,mode:'experimental_synchronized_rgb',regionId:modelRGB.regionId,roiValidated:false,phoneValidated:false,benchmarkMAE:model.benchmark.mae,lowRangeBias:model.low_range_bias??11.499237876406983,aggregation:'Mean of nonoverlapping six-second synchronized RGB outputs from one contact, region and exposure epoch; segment range is not an accuracy interval.'}:null};
  }
}
