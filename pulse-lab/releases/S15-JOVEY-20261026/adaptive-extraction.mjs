// Fixed pixel regions prevent changing pixel membership from manufacturing a pulse.
// Thresholds are provisional engineering settings, not a validated medical SQI.
export const EXTRACTION_POLICY = Object.freeze({version:'regional-rgb-v2-continuous',grid:3,historySeconds:4,rankingSeconds:1,minHistorySeconds:3,hysteresis:1.4,confirmations:2,maxGap:.2});
const channels=['r','g','b'];
const mean=a=>a.reduce((s,x)=>s+x,0)/Math.max(1,a.length);
export function regionalOptics(pixels,width=64,height=64){
  if(pixels.length!==width*height*4)throw Error('Unexpected camera image dimensions');
  const bins=Array.from({length:10},()=>({sum:[0,0,0],low:[0,0,0],high:[0,0,0],n:0,red:0}));
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4,region=1+Math.min(2,Math.floor(y*3/height))*3+Math.min(2,Math.floor(x*3/width));
    const red=pixels[i]>35&&pixels[i]>pixels[i+1]*1.12&&pixels[i]>pixels[i+2]*1.12;
    for(let pass=0;pass<2;pass++){const b=bins[pass?region:0];b.n++;b.red+=Number(red);for(let c=0;c<3;c++){b.sum[c]+=pixels[i+c];b.low[c]+=Number(pixels[i+c]<=2);b.high[c]+=Number(pixels[i+c]>=253)}}
  }
  return bins.map((b,i)=>({id:i===0?'central':`tile-${i}`,r:b.sum[0]/b.n,g:b.sum[1]/b.n,b:b.sum[2]/b.n,clipped:b.low.map((v,c)=>(v+b.high[c])/b.n),clippedLow:b.low.map(v=>v/b.n),clippedHigh:b.high.map(v=>v/b.n),redCoverage:b.red/b.n,pixels:b.n}));
}
function correlationAt(a,lag){
  const n=a.length-lag;if(n<10)return 0;let sx=0,sy=0,xx=0,yy=0,xy=0;
  for(let i=lag;i<a.length;i++){const x=a[i],y=a[i-lag];sx+=x;sy+=y;xx+=x*x;yy+=y*y;xy+=x*y}
  return (xy-sx*sy/n)/Math.max(1e-9,Math.sqrt(Math.max(0,xx-sx*sx/n)*Math.max(0,yy-sy*sy/n)));
}
export function rank(history,region,channel){
  const ci=channels.indexOf(channel),values=history.map(s=>s.regions[region][channel]),dc=mean(values),n=values.length;
  if(dc<=3||dc>=252||history.some(s=>s.regions[region].clipped[ci]>=.1))return{region,channel,score:0,periodicity:0};
  const times=history.map(s=>s.t),mt=mean(times),den=times.reduce((s,t)=>s+(t-mt)**2,0),slope=den?times.reduce((s,t,i)=>s+(t-mt)*(values[i]-dc),0)/den:0;
  const v=values.map((x,i)=>x-dc-slope*(times[i]-mt)),rms=Math.sqrt(mean(v.map(x=>x*x))),fps=(n-1)/(times.at(-1)-times[0]);
  if(rms<.08||fps<24||fps>125)return{region,channel,score:0,periodicity:0};
  // Only a ranking: the timestamp-resampled detector independently qualifies beats.
  let periodicity=0;for(let lag=Math.floor(fps/3);lag<=Math.min(n-10,Math.ceil(fps*1.5));lag++)periodicity=Math.max(periodicity,correlationAt(v,lag));
  return{region,channel,periodicity,rms,score:periodicity>=.6?periodicity*Math.min(rms,2):0};
}
// A single brightness spike breaks the unfinished snippet, not the acquisition.
// Compare two pulse-length windows before declaring a sustained DC change.
export function sustainedExposureShift(history,region,selectedChannels){
  const end=history.at(-1)?.t;
  if(!Number.isFinite(end)||end-history[0].t<3-1e-8)return false;
  const earlier=history.filter(s=>s.t>=end-3&&s.t<end-1.5),later=history.filter(s=>s.t>=end-1.5);
  if(earlier.length<24||later.length<24)return false;
  return selectedChannels.some(c=>{const before=mean(earlier.map(s=>s.regions[region][c])),after=mean(later.map(s=>s.regions[region][c]));return Math.abs(after-before)>Math.max(8,Math.abs(before)*.12)});
}
export class AdaptiveExtractor{
  constructor(){this.epoch=0;this.reset()}
  reset({keepSelection=false}={}){this.epoch++;this.history=[];if(!keepSelection)this.selected={region:0,channel:'g',score:0};this.lastRanking=-Infinity;this.challenger=null;this.confirmations=0;this.ready=false}
  push(t,regions,{locked=false}={}){
    let changed=false,reason=null,interrupted=false;const previous=this.history.at(-1);
    if(previous&&(t<=previous.t||t-previous.t>EXTRACTION_POLICY.maxGap)){this.history=[];this.lastRanking=-Infinity;interrupted=true}
    if(previous){const before=previous.regions[this.selected.region][this.selected.channel];if(Math.abs(regions[this.selected.region][this.selected.channel]-before)>Math.max(8,Math.abs(before)*.12))interrupted=true}
    this.history.push({t,regions,interrupted});this.history=this.history.filter(s=>s.t>=t-EXTRACTION_POLICY.historySeconds);
    if(t-this.history[0].t>=EXTRACTION_POLICY.minHistorySeconds&&t-this.lastRanking>=EXTRACTION_POLICY.rankingSeconds){
      if(sustainedExposureShift(this.history,this.selected.region,[this.selected.channel])){this.reset({keepSelection:true});this.history.push({t,regions});changed=true;reason='exposure_or_contact_step';interrupted=true}
      else if(this.history.some(s=>s.interrupted)){this.lastRanking=t}
      else{
      this.lastRanking=t;
      const scores=regions.flatMap((_,r)=>channels.map(c=>rank(this.history,r,c))),active=scores.find(s=>s.region===this.selected.region&&s.channel===this.selected.channel);
      // Prefer the larger central region for ties; retain the existing channel for ties.
      const best=scores.reduce((a,b)=>b.score>a.score+1e-6?b:a,active);
      this.selected=active;
      const key=`${best.region}:${best.channel}`,different=key!==`${active.region}:${active.channel}`;
      if(different&&best.score>0&&(!locked||active.score===0)&&best.score>active.score*EXTRACTION_POLICY.hysteresis){
        this.confirmations=this.challenger===key?this.confirmations+1:1;this.challenger=key;
        if(!this.ready||this.confirmations>=EXTRACTION_POLICY.confirmations){this.selected=best;this.epoch++;changed=true;reason='region_or_channel_change';this.challenger=null;this.confirmations=0}
      }else{this.selected=active;this.challenger=null;this.confirmations=0}
      this.ready=this.selected.score>0;
      }
    }
    const selected=regions[this.selected.region],index=channels.indexOf(this.selected.channel);
    return{...selected,t,regions,central:regions[0],selectedChannel:this.selected.channel,regionId:selected.id,acquisitionEpoch:this.epoch,selectionReady:this.ready,selectionScore:this.selected.score,selectionChanged:changed,selectionReason:reason,candidateInterrupted:interrupted,clippingBlocked:selected.clipped[index]>=.1};
  }
}
