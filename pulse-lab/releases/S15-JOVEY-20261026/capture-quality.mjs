import {uniformWindow,featuresFromUniform,predictVector,median} from './ppg-model.mjs';

// Engineering thresholds. They have not been validated against phone/cuff BP error.
export const CAPTURE_POLICY=Object.freeze({version:'window-quality-v4-any-frame-clipping',windowSeconds:2.1,settlingSeconds:4.2,minWindows:3,minCaptureSeconds:0,maxCaptureSeconds:null,minFps:24,maxFrameGap:.2,maxIntervalCV:.35,minAutocorrelation:.60,minPulseBandPower:.55,maxClippedFrames:.05,maxClippedPixels:.10,minVariation:.05,maxStepFraction:.55,maxMotionRMS:.5,maxOutsideFraction:.24});
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
const sd=a=>{const m=mean(a);return Math.sqrt(mean(a.map(v=>(v-m)**2)))};
const quantile=(a,p)=>{const b=[...a].sort((x,y)=>x-y),i=(b.length-1)*p,l=Math.floor(i);return b[l]+(b[Math.min(l+1,b.length-1)]-b[l])*(i-l)};
const clamp=x=>Math.max(0,Math.min(1,x));
const reasonText={frames:'Frame timing is interrupted',clipping:'Camera pixels are clipped',flat:'Pulse signal is too weak',periodicity:'Pulse pattern is not stable',spectrum:'Too much non-pulse variation',jump:'Brightness or contact changed',motion:'Hand or phone movement detected',domain:'Signal differs from the training data',settling:'Camera settling'};

export function evaluateCapture(samples,model,options={}){
  const p={...CAPTURE_POLICY,...options};
  const empty={policy:p.version,ready:false,qualityValidated:false,consecutive:0,required:p.minWindows,windows:[],selected:null,duration:0,message:'Place your finger gently and hold still.'};
  if(samples.length<3)return empty;
  const times=samples.map(s=>s.t);
  if(times.some((t,i)=>!Number.isFinite(t)||(i&&t<=times[i-1])))return {...empty,message:'Frame timestamps are invalid. Restart the scan.'};
  const origin=times[0],duration=times.at(-1)-origin,windowCount=Math.floor((duration+1e-8)/p.windowSeconds);
  if(duration<p.settlingSeconds)return {...empty,duration,message:'Let the camera settle. Keep your finger still.'};
  const candidates=[];
  for(const [channel,index] of [['r',0],['g',1],['b',2]]){
    if(p.channel&&channel!==p.channel)continue;
    const values=samples.map(s=>s[channel]),windows=[];
    for(let k=0;k<windowCount;k++){
      const start=origin+k*p.windowSeconds,end=start+p.windowSeconds;
      if(k*p.windowSeconds<p.settlingSeconds-1e-8){windows.push({index:k,startSeconds:k*p.windowSeconds,endSeconds:(k+1)*p.windowSeconds,accepted:false,reasons:['settling'],score:0});continue}
      const local=samples.filter(s=>s.t>=start-1e-8&&s.t<end-1e-8),t=local.map(s=>s.t),v=local.map(s=>s[channel]),reasons=[];
      const w={index:k,startSeconds:k*p.windowSeconds,endSeconds:(k+1)*p.windowSeconds,accepted:false,reasons,score:0};
      windows.push(w);
      if(t.length<3||v.some(x=>!Number.isFinite(x))){reasons.push('frames');continue}
      const dt=t.slice(1).map((x,i)=>x-t[i]),fps=1/median(dt),maxGap=Math.max(...dt,t[0]-start,end-t.at(-1)),intervalCV=sd(dt)/mean(dt);
      const clippedFrames=v.filter(x=>x<=2||x>=253).length/v.length;
      const pixelValues=local.map(s=>s.clipped?.[index]).filter(Number.isFinite),clippedPixels=pixelValues.length===local.length?mean(pixelValues):null;
      const variation=sd(v),amplitude=quantile(v,.95)-quantile(v,.05),maxStep=Math.max(...v.slice(1).map((x,i)=>Math.abs(x-v[i]))),stepFraction=amplitude>0?maxStep/amplitude:Infinity;
      const motion=local.filter(s=>s.motion&&Number.isFinite(s.motionAgeMs)&&s.motionAgeMs<500&&['x','y','z'].every(axis=>Number.isFinite(s.motion[axis]))).map(s=>s.motion);
      let motionRMS=null;const motionCoverage=motion.length/local.length;
      // Partial motion data can identify movement, but cannot certify stillness.
      if(motion.length>=3){const center=['x','y','z'].map(axis=>mean(motion.map(m=>m[axis])));motionRMS=Math.sqrt(mean(motion.map(m=>['x','y','z'].reduce((sum,axis,j)=>sum+(m[axis]-center[j])**2,0))))}
      Object.assign(w,{fps,maxGap,intervalCV,clippedFrames,clippedPixels,variation,stepFraction,motionRMS,motionCoverage});
      if(fps<p.minFps||maxGap>p.maxFrameGap||intervalCV>p.maxIntervalCV)reasons.push('frames');
      if(clippedFrames>=p.maxClippedFrames||pixelValues.length!==local.length||pixelValues.some(x=>x>=p.maxClippedPixels))reasons.push('clipping');
      if(variation<p.minVariation)reasons.push('flat');
      if(stepFraction>p.maxStepFraction)reasons.push('jump');
      if(motionRMS!==null&&motionRMS>p.maxMotionRMS)reasons.push('motion');
      try{
        const features=featuresFromUniform(uniformWindow(times,values,start));
        const periodicity=features[10],pulseBandPower=features.slice(12,16).reduce((s,x)=>s+x,0);
        const outsideFraction=model?.training_feature_min?features.filter((v,i)=>v<model.training_feature_min[i]||v>model.training_feature_max[i]).length/features.length:null;
        Object.assign(w,{features,periodicity,pulseBandPower,outsideFraction});
        if(periodicity<p.minAutocorrelation)reasons.push('periodicity');
        if(pulseBandPower<p.minPulseBandPower)reasons.push('spectrum');
        if(outsideFraction!==null&&outsideFraction>p.maxOutsideFraction)reasons.push('domain');
        w.score=100*(.5*clamp(periodicity)+.25*clamp(pulseBandPower)+.15*clamp(1-intervalCV)+.10*clamp(1-Math.max(clippedFrames,clippedPixels||0)));
        w.accepted=reasons.length===0;
      }catch{if(!reasons.includes('flat')&&!reasons.includes('frames'))reasons.push('periodicity')}
    }
    let run=0,longest=0;
    for(let i=0;i<windows.length;i++){
      run=windows[i].accepted?run+1:0;longest=Math.max(longest,run);
      if(run>=p.minWindows){const block=windows.slice(i-p.minWindows+1,i+1);candidates.push({channel,windows,block,score:mean(block.map(w=>w.score)),startSeconds:block[0].startSeconds,endSeconds:block.at(-1).endSeconds})}
    }
    candidates.push({channel,windows,block:null,longest,currentRun:run,score:-1});
  }
  // Rank ONLY acquisition features. Neither predicted BP nor a cuff label is consulted.
  const selected=candidates.filter(c=>c.block).sort((a,b)=>b.score-a.score||a.startSeconds-b.startSeconds)[0];
  const pending=candidates.filter(c=>!c.block).sort((a,b)=>b.currentRun-a.currentRun||b.longest-a.longest||mean(b.windows.slice(-1).map(w=>w.score))-mean(a.windows.slice(-1).map(w=>w.score)))[0];
  if(!selected){const last=pending.windows.at(-1),reason=last?.reasons.find(r=>r!=='settling');return {...empty,duration,channel:pending.channel,windows:pending.windows,consecutive:Math.min(p.minWindows,pending.currentRun),message:reason?reasonText[reason]+'. Adjust and hold still.':`Stable signal: ${pending.currentRun} of ${p.minWindows} consecutive windows. Keep still.`}}
  const block=selected.block,motions=block.map(w=>w.motionCoverage>=.8?w.motionRMS:null),pixels=block.map(w=>w.clippedPixels);
  const summary={channel:selected.channel,startSeconds:selected.startSeconds,endSeconds:selected.endSeconds,durationSeconds:p.minWindows*p.windowSeconds,windowCount:block.length,score:selected.score,grade:selected.score>=85?'Strong signal':'Usable signal',fps:mean(block.map(w=>w.fps)),maxGap:Math.max(...block.map(w=>w.maxGap)),periodicity:mean(block.map(w=>w.periodicity)),pulseBandPower:mean(block.map(w=>w.pulseBandPower)),clippedPixels:pixels.every(Number.isFinite)?mean(pixels):null,motionRMS:motions.every(Number.isFinite)?mean(motions):null,outsideFraction:mean(block.map(w=>w.outsideFraction??0)),features:block.map(w=>w.features),windowIndices:block.map(w=>w.index)};
  return{...empty,duration,ready:duration>=p.minCaptureSeconds,consecutive:p.minWindows,channel:selected.channel,windows:selected.windows,selected:summary,message:duration>=p.minCaptureSeconds?'Stable capture complete. Preparing your BP report.':'Clean interval captured. Hold still briefly to complete.'};
}

export function predictSelectedCapture(model,assessment){
  if(!assessment.ready||!assessment.selected)throw Error('A stable capture interval is required before reporting BP.');
  const windows=assessment.selected.features.map(f=>predictVector(model,f));
  if(windows.some(p=>!p.every(Number.isFinite)||p[0]<=p[1]))throw Error('Model output failed the numerical check.');
  return{sbp:mean(windows.map(p=>p[0])),dbp:mean(windows.map(p=>p[1])),windowPredictions:windows,windowRange:{sbp:[Math.min(...windows.map(p=>p[0])),Math.max(...windows.map(p=>p[0]))],dbp:[Math.min(...windows.map(p=>p[1])),Math.max(...windows.map(p=>p[1]))]},aggregation:`Arithmetic mean of ${windows.length} consecutive windows selected using acquisition quality only`,rangeIsConfidenceInterval:false};
}

export function qualityTimeline(assessment){
  const selected=new Set(assessment.selected?.windowIndices||[]);
  return assessment.windows.map(w=>({start:w.startSeconds,end:w.endSeconds,state:selected.has(w.index)?'selected':w.reasons.includes('settling')?'settling':w.accepted?'usable':'rejected',reason:w.reasons.map(r=>reasonText[r]).join('; ')||'Acquisition checks passed'}));
}
