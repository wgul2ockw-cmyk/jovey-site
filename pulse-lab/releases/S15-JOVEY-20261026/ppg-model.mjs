// Shared preprocessing: used by the training feature exporter and browser.
export const FEATURE_VERSION = 'ppgbp-30hz-v1';
export const FEATURE_NAMES = ['skew','kurtosis','q10','q25','q50','q75','q90','diff_rms','diff_abs','diff_skew','autocorr','period_s','power_0_5_1','power_1_2','power_2_3','power_3_4','power_4_6','power_6_9','spectral_peak_hz','spectral_entropy','up_fraction','crossings','peak_count','mean_peak_width','mean_rise_fraction'];
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
export const median=a=>{const b=[...a].sort((x,y)=>x-y),n=b.length;return n%2?b[(n-1)/2]:(b[n/2-1]+b[n/2])/2};
const sd=a=>Math.sqrt(mean(a.map(v=>(v-mean(a))**2)));
const skew=a=>{const m=mean(a),s=sd(a);return s?mean(a.map(v=>((v-m)/s)**3)):0};
const quantile=(a,p)=>{const b=[...a].sort((x,y)=>x-y),i=(b.length-1)*p,j=Math.floor(i);return b[j]+(b[Math.min(j+1,b.length-1)]-b[j])*(i-j)};

export function uniformWindow(times,values,start=times[0]){
  if(times.length!==values.length||times.length<3||times.some((t,i)=>!Number.isFinite(t)||(i&&t<=times[i-1]))||values.some(v=>!Number.isFinite(v)))throw Error('Invalid or unordered samples');
  const dt=median(times.slice(1).map((t,i)=>t-times[i]));
  if(1/dt<24)throw Error('At least 24 unique frames per second are required');
  if(times.at(-1)<start+62/30)throw Error('Window too short');
  const out=[];let pos=0;
  for(let k=0;k<63;k++){
    const center=start+k/30,lo=center-1/60,hi=center+1/60;
    while(pos<times.length-1&&times[pos]<lo)pos++;
    let j=pos,sum=0,n=0;while(j<times.length&&times[j]<hi){sum+=values[j];n++;j++}
    if(n)out.push(sum/n);
    else{let right=pos;while(right<times.length-1&&times[right]<center)right++;const left=Math.max(0,right-1),den=times[right]-times[left];out.push(den?values[left]+(values[right]-values[left])*(center-times[left])/den:values[left])}
  }
  return out;
}

export function featuresFromUniform(raw){
  if(raw.length!==63||raw.some(x=>!Number.isFinite(x)))throw Error('Expected 63 finite samples');
  const n=raw.length,xbar=(n-1)/2,m=mean(raw);
  const slope=raw.reduce((s,v,i)=>s+(i-xbar)*(v-m),0)/raw.reduce((s,v,i)=>s+(i-xbar)**2,0);
  let a=raw.map((v,i)=>v-m-slope*(i-xbar));
  a=a.map((v,i)=>(a[Math.max(0,i-1)]+2*v+a[Math.min(n-1,i+1)])/4);
  const scale=sd(a);if(scale<1e-8)throw Error('Flat signal');
  const am=mean(a);a=a.map(v=>(v-am)/scale);
  // Same polarity rule for probe transmission and camera intensity traces.
  if(skew(a)<0)a=a.map(v=>-v);
  const d=a.slice(1).map((v,i)=>v-a[i]);
  let best=-Infinity,lagbest=10;
  for(let lag=9;lag<=40;lag++){
    const u=a.slice(0,n-lag),v=a.slice(lag),um=mean(u),vm=mean(v);
    const den=Math.sqrt(u.reduce((s,x)=>s+(x-um)**2,0)*v.reduce((s,x)=>s+(x-vm)**2,0));
    const r=den?u.reduce((s,x,i)=>s+(x-um)*(v[i]-vm),0)/den:0;
    if(r>best){best=r;lagbest=lag}
  }
  const bands=[0,0,0,0,0,0],bounds=[.5,1,2,3,4,6,9],powers=[];let maxp=-1,peakfreq=0;
  for(let k=1;k<=18;k++){
    const f=k*30/n;let re=0,im=0;
    a.forEach((v,i)=>{const w=.5-.5*Math.cos(2*Math.PI*i/(n-1));re+=v*w*Math.cos(2*Math.PI*k*i/n);im-=v*w*Math.sin(2*Math.PI*k*i/n)});
    const p=re*re+im*im;powers.push(p);
    for(let b=0;b<6;b++)if(f>=bounds[b]&&f<bounds[b+1])bands[b]+=p;
    if(f>=.7&&f<=3.5&&p>maxp){maxp=p;peakfreq=f}
  }
  const total=powers.reduce((s,x)=>s+x,0)||1;
  const entropy=-powers.reduce((s,x)=>{const p=x/total;return s+(p?p*Math.log(p):0)},0)/Math.log(powers.length);
  const peaks=[];
  for(let i=1;i<n-1;i++)if(a[i]>a[i-1]&&a[i]>=a[i+1]&&a[i]>.25){if(!peaks.length||i-peaks.at(-1)>=8)peaks.push(i);else if(a[i]>a[peaks.at(-1)])peaks[peaks.length-1]=i}
  const widths=[],rises=[];
  for(const p of peaks){const half=a[p]/2;let l=p,r=p;while(l>0&&a[l]>half)l--;while(r<n-1&&a[r]>half)r++;if(l>0&&r<n-1){widths.push((r-l)/30);rises.push((p-l)/(r-l))}}
  return [skew(a),mean(a.map(v=>v**4)),...[.1,.25,.5,.75,.9].map(p=>quantile(a,p)),Math.sqrt(mean(d.map(v=>v*v))),mean(d.map(Math.abs)),skew(d),best,lagbest/30,...bands.map(p=>p/total),peakfreq,entropy,d.filter(v=>v>0).length/d.length,a.slice(1).filter((v,i)=>v*a[i]<0).length,peaks.length,widths.length?mean(widths):0,rises.length?mean(rises):.5];
}

export function predictVector(model,features){
  if(model.feature_version!==FEATURE_VERSION||features.length!==FEATURE_NAMES.length||features.some(x=>!Number.isFinite(x)))throw Error('Model feature contract mismatch');
  if(model.kind==='ridge')return model.intercept.map((v,j)=>v+features.reduce((s,x,i)=>s+(x-model.mean[i])/model.scale[i]*model.coef[j][i],0));
  const out=[0,0];for(const tree of model.trees){let k=0;while(tree.left[k]!==-1)k=Math.fround(features[tree.feature[k]])<=tree.threshold[k]?tree.left[k]:tree.right[k];for(let j=0;j<2;j++)out[j]+=tree.value[k][j]/model.trees.length}return out;
}

export function analyzeCapture(samples){
  if(samples.length<240)throw Error('Capture at least 12 seconds of unique camera frames');
  const t=samples.map(s=>s.t),dt=t.slice(1).map((x,i)=>x-t[i]);
  if(dt.some(x=>x<=0))throw Error('Frame timestamps are not ordered');
  const duration=t.at(-1)-t[0],fps=1/median(dt),gap=Math.max(...dt);
  if(duration<12||fps<24||gap>.2)throw Error('Capture too short, frame rate below 24 fps, or interrupted frames. Retry.');
  // Acquisition guard only. These thresholds are engineering heuristics, not validated SQI.
  const candidates=['r','g','b'].map(channel=>{
    const values=samples.map(s=>s[channel]),clipped=values.filter(v=>v<=2||v>=253).length/values.length;
    const windows=[];
    for(let start=t[0];start+2.1<=t.at(-1);start+=2.1){try{const raw=uniformWindow(t,values,start),f=featuresFromUniform(raw);windows.push({features:f,variation:sd(raw)})}catch{}}
    const score=windows.length?median(windows.map(w=>w.features[10])):0;
    return{channel,clipped,windows,score,variation:windows.length?median(windows.map(w=>w.variation)):0};
  }).filter(c=>c.clipped<.05&&c.variation>.05&&c.windows.length>=5).sort((a,b)=>b.score-a.score);
  const c=candidates[0];
  if(!c||c.score<.35)throw Error('No stable pulse-like signal. Cover the camera and torch gently, hold still, and retry.');
  return{...c,duration,fps,maxGap:gap,qualityLabel:'Engineering checks passed',qualityValidated:false};
}
