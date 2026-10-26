// Display processing only. Raw RGB samples continue unchanged into the model.
export const DISPLAY_VERSION='live-ac-v1';
const mean=a=>a.reduce((s,x)=>s+x,0)/Math.max(1,a.length);
const rms=a=>Math.sqrt(mean(a.map(x=>x*x)));
export function acTrace(samples,channel='g',invert=true){
  if(!samples.length)return[];
  const t=samples.map(s=>s.t),v=samples.map(s=>s[channel]),mt=mean(t),mv=mean(v);
  const den=mean(t.map(x=>(x-mt)**2)),slope=den?mean(t.map((x,i)=>(x-mt)*(v[i]-mv)))/den:0;
  const detrended=v.map((x,i)=>x-mv-slope*(t[i]-mt));
  // Symmetric 1.5 s moving baseline; no beat template, resampling or notch insertion.
  let left=0,right=0,sum=0;
  return detrended.map((x,i)=>{
    while(right<t.length&&t[right]<=t[i]+.75)sum+=detrended[right++];
    while(left<right&&t[left]<t[i]-.75)sum-=detrended[left++];
    return (invert?-1:1)*(x-sum/Math.max(1,right-left));
  });
}
export function inspectLive(input,preferred='auto',previous='g'){
  const end=input.at(-1)?.t??0,samples=input.filter(s=>s.t>=end-6),duration=end-(samples[0]?.t??end);
  const gaps=samples.slice(1).map((s,i)=>s.t-samples[i].t),fps=duration>0?(samples.length-1)/duration:0;
  const channels=['r','g','b'].map((channel,ci)=>{
    const raw=samples.map(s=>s[channel]),dc=mean(raw),ac=acTrace(samples,channel),amplitude=rms(ac);
    const clipping=mean(samples.map(s=>s.clipped?.[ci]??0));
    let periodicity=0;
    if(duration>=3&&amplitude>.02&&(preferred==='auto'||channel===preferred)){for(let lag=Math.max(2,Math.floor(fps*.33));lag<=Math.min(ac.length-2,Math.ceil(fps*1.5));lag++){
      let xx=0,yy=0,xy=0;for(let i=lag;i<ac.length;i++){xx+=ac[i]*ac[i];yy+=ac[i-lag]*ac[i-lag];xy+=ac[i]*ac[i-lag]}
      const den=Math.sqrt(xx*yy);if(den)periodicity=Math.max(periodicity,xy/den);
    }}
    const score=(clipping<.1&&dc>3&&dc<252&&amplitude>.03)?Math.max(.02,periodicity)*Math.min(amplitude,2)*(1-clipping):0;
    return{channel,dc,amplitude,clipping,periodicity,score};
  });
  let chosen=channels.find(c=>c.channel===(preferred==='auto'?previous:preferred))||channels[1];
  const best=channels.reduce((a,b)=>a.score>b.score?a:b);
  if(preferred==='auto'&&best.score>chosen.score*1.25)chosen=best;
  let message='Looking for a repeatable pulse. Cover the selected lens and torch with gentle, steady contact.';
  let state='unconfirmed';
  if(samples.length<3){message='Waiting for camera frames…';state='waiting'}
  else if(chosen.clipping>.1||chosen.dc>=252){message='Signal clipped. Ease pressure or reposition your finger over the lens and torch.';state='clipped'}
  else if(chosen.dc<=3){message='Too dark. Check the torch and that your finger covers the active lens.';state='dark'}
  else if(chosen.amplitude<.03){message='Little optical variation. Check the selected lens, torch and gentle finger contact.';state='flat'}
  else if(duration<3){message='Receiving camera signal. Hold still while the trace fills.';state='settling'}
  else if(fps<24||Math.max(...gaps)>.2){message='Frames are slow or interrupted. Keep this page visible and close other camera apps.';state='timing'}
  else if(chosen.periodicity>=.6){message='Repeating optical signal visible. Start capture when your finger and hand are steady.';state='repeating'}
  return{samples,channels,chosen,fps,duration,state,message,maxGap:gaps.length?Math.max(...gaps):0};
}
export function drawTrace(canvas,samples,{channel='g',mode='ac',invert=true,seconds=6}={}){
  const p=canvas.getContext('2d'),w=canvas.width,h=canvas.height,end=samples.at(-1)?.t??0;
  const a=samples.filter(s=>s.t>=end-seconds),values=mode==='raw'?a.map(s=>s[channel]):acTrace(a,channel,invert);
  p.clearRect(0,0,w,h);p.strokeStyle='#233249';p.lineWidth=1;p.beginPath();
  for(let i=1;i<seconds;i++){p.moveTo(w*i/seconds,0);p.lineTo(w*i/seconds,h)}p.moveTo(0,h/2);p.lineTo(w,h/2);p.stroke();
  if(values.length<2)return;
  const extent=Math.max(.15,...values.map(Math.abs));
  p.strokeStyle={r:'#ff9c9c',g:'#70e1c1',b:'#8eb7ff'}[channel];p.lineWidth=2;p.beginPath();
  a.forEach((s,i)=>{const x=(s.t-(end-seconds))/seconds*w,y=mode==='raw'?h-8-values[i]/255*(h-16):h/2-values[i]/extent*(h/2-12);if(!i||s.t-a[i-1].t>.2)p.moveTo(x,y);else p.lineTo(x,y)});p.stroke();
}

export function drawMeanWave(canvas,wave){
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);if(!wave?.values?.length)return;
  ctx.strokeStyle='#70e1c1';ctx.lineWidth=2;ctx.beginPath();wave.values.forEach((v,i)=>{const x=12+i/(wave.values.length-1)*(w-24),y=h-12-v*(h-24);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y)});ctx.stroke();
}

// Three synchronous lanes. Independent display scales improve visibility only;
// the captured DC level and pulse amplitudes are never replaced by these values.
export function drawRGBTrace(canvas,input,{mode='ac',invert=true,seconds=6}={}){
  const p=canvas.getContext('2d'),w=canvas.width,h=canvas.height,end=input.at(-1)?.t??0,last=input.at(-1)?.oxygen;
  const samples=input.filter(s=>s.t>=end-seconds&&s.oxygen&&s.oxygen.acquisitionEpoch===last?.acquisitionEpoch&&s.oxygen.regionId===last?.regionId).map(s=>({...s.oxygen,t:s.t}));
  p.clearRect(0,0,w,h);
  for(const [lane,channel] of ['r','g','b'].entries()){
    const top=lane*h/3,bottom=(lane+1)*h/3,mid=(top+bottom)/2,values=mode==='raw'?samples.map(s=>s[channel]):acTrace(samples,channel,invert),extent=Math.max(.02,...values.map(Math.abs));
    p.strokeStyle='#233249';p.lineWidth=1;p.beginPath();p.moveTo(0,mid);p.lineTo(w,mid);p.stroke();
    p.fillStyle={r:'#ff9c9c',g:'#70e1c1',b:'#8eb7ff'}[channel];p.font='28px system-ui';p.fillText?.(channel.toUpperCase(),6,top+30);
    p.strokeStyle=p.fillStyle;p.lineWidth=2;p.beginPath();
    samples.forEach((s,i)=>{const x=32+(s.t-(end-seconds))/seconds*(w-38),y=mode==='raw'?bottom-8-values[i]/255*(h/3-16):mid-values[i]/extent*(h/6-12);if(!i||s.t-samples[i-1].t>.12)p.moveTo(x,y);else p.lineTo(x,y)});p.stroke();
  }
}
export function drawRGBMeanWaves(canvas,rgb){
  const p=canvas.getContext('2d'),w=canvas.width,h=canvas.height;p.clearRect(0,0,w,h);
  for(const [lane,channel] of ['r','g','b'].entries()){
    const values=rgb?.channels?.[channel]?.meanWave?.values;if(!values?.length)continue;
    p.strokeStyle={r:'#ff9c9c',g:'#70e1c1',b:'#8eb7ff'}[channel];p.fillStyle=p.strokeStyle;p.font='28px system-ui';p.fillText?.(channel.toUpperCase(),6,lane*h/3+30);p.lineWidth=2;p.beginPath();
    values.forEach((v,i)=>{const x=32+i/(values.length-1)*(w-44),y=(lane+1)*h/3-8-v*(h/3-16);if(i)p.lineTo(x,y);else p.moveTo(x,y)});p.stroke();
  }
}
