// Morphology is measured on original timestamped samples, never on the smoothed display.
export const WAVEFORM_POLICY=Object.freeze({version:'morphology-stability-v1',minBeats:12,comparisonBeats:24,minTemplateCorrelation:.9,maxShapeRMSE:.10,maxIntervalShift:.10,maxAmplitudeShift:.25,maxWidthShift:.10});
const mean=a=>a.reduce((s,x)=>s+x,0)/Math.max(1,a.length);
export const median=a=>{const s=[...a].sort((a,b)=>a-b),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2};
export function correlation(a,b){const ma=mean(a),mb=mean(b);let xy=0,xx=0,yy=0;for(let i=0;i<a.length;i++){const x=a[i]-ma,y=b[i]-mb;xy+=x*y;xx+=x*x;yy+=y*y}return xy/Math.max(1e-9,Math.sqrt(xx*yy))}
const template=beats=>Array.from({length:64},(_,i)=>median(beats.map(b=>b.shape[i])));
export function originalBeat(samples,start,end,channel,polarity=1){
  const part=samples.filter(s=>s.t>=start-1e-8&&s.t<=end+1e-8);
  if(part.length<7||part.some(s=>s.clipped?.[['r','g','b'].indexOf(channel)]>=.1))return null;
  const duration=end-start;if(!(duration>0))return null;
  const first=part[0],last=part.at(-1),slope=(last[channel]-first[channel])/(last.t-first.t);
  const values=part.map(s=>polarity*(s[channel]-slope*(s.t-first.t))),low=Math.min(...values),amplitude=Math.max(...values)-low;
  if(amplitude<.16)return null;
  let j=0;const shape=Array.from({length:64},(_,i)=>{const t=first.t+i/63*(last.t-first.t);while(j<part.length-2&&part[j+1].t<t)j++;const f=(t-part[j].t)/(part[j+1].t-part[j].t);return(values[j]+f*(values[j+1]-values[j])-low)/amplitude});
  let above=0,area=0;for(let i=1;i<part.length;i++){const dt=part[i].t-part[i-1].t,a=(values[i-1]-low)/amplitude,b=(values[i]-low)/amplitude;area+=dt*(a+b)/2;if(a>=.5&&b>=.5)above+=dt;else if((a>=.5)!==(b>=.5))above+=dt*(Math.max(a,b)-.5)/Math.abs(b-a)}
  return{start,end,seconds:duration,shape,amplitude,dc:mean(part.map(s=>s[channel])),widthFraction:above/duration,areaFraction:area/duration,originalSamples:part.map(s=>({t:s.t,value:s[channel]})),channel,polarity};
}
export function waveformStability(beats){
  if(beats.length<WAVEFORM_POLICY.minBeats)return{ready:false,reason:'Collecting more distinct beats',beatCount:beats.length};
  const used=beats.slice(-WAVEFORM_POLICY.comparisonBeats),mid=Math.floor(used.length/2),left=used.slice(0,mid),right=used.slice(mid),a=template(left),b=template(right);
  const shapeCorrelation=correlation(a,b),shapeRMSE=Math.sqrt(mean(a.map((x,i)=>(x-b[i])**2)));
  const relative=key=>{const x=median(left.map(v=>v[key])),y=median(right.map(v=>v[key]));return Math.abs(x-y)/Math.max(1e-6,(Math.abs(x)+Math.abs(y))/2)};
  const intervalShift=relative('seconds'),amplitudeShift=relative('amplitude'),widthShift=Math.abs(median(left.map(v=>v.widthFraction))-median(right.map(v=>v.widthFraction)));
  const ready=shapeCorrelation>=WAVEFORM_POLICY.minTemplateCorrelation&&shapeRMSE<=WAVEFORM_POLICY.maxShapeRMSE&&intervalShift<=WAVEFORM_POLICY.maxIntervalShift&&amplitudeShift<=WAVEFORM_POLICY.maxAmplitudeShift&&widthShift<=WAVEFORM_POLICY.maxWidthShift;
  return{ready,reason:ready?'Waveform stable':'Pulse shape or contact is still changing',shapeCorrelation,shapeRMSE,intervalShift,amplitudeShift,widthShift,beatCount:used.length,validated:false};
}
export function representativeWave(beats){
  if(!beats.length)return null;const values=template(beats);
  return{values,dispersion:values.map((v,i)=>median(beats.map(b=>Math.abs(b.shape[i]-v)))),beatCount:beats.length,channel:beats[0].channel,polarity:beats[0].polarity,normalization:'Median of measured cycles, phase-aligned for display; original timing and amplitude retained',usedForBP:false};
}
