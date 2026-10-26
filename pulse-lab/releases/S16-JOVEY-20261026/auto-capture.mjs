// Provisional optical contact detector, not an anatomical classifier.
export const AUTO_POLICY=Object.freeze({version:'finger-auto-v1',contactSeconds:1,lostSeconds:1,maxGap:.25,minRedCoverage:.65});
export function opticalSample(pixels){
  const sum=[0,0,0],clippedLow=[0,0,0],clippedHigh=[0,0,0];let red=0;
  for(let i=0;i<pixels.length;i+=4){
    for(let c=0;c<3;c++){sum[c]+=pixels[i+c];if(pixels[i+c]<=2)clippedLow[c]++;if(pixels[i+c]>=253)clippedHigh[c]++}
    const r=pixels[i],g=pixels[i+1],b=pixels[i+2];
    if(r>35&&r>g*1.12&&r>b*1.12)red++;
  }
  const n=pixels.length/4;
  return{r:sum[0]/n,g:sum[1]/n,b:sum[2]/n,clipped:clippedLow.map((x,c)=>(x+clippedHigh[c])/n),clippedLow:clippedLow.map(x=>x/n),clippedHigh:clippedHigh.map(x=>x/n),redCoverage:red/n};
}
export class FingerGate{
  constructor(){this.reset()}
  reset(){this.since=null;this.lostSince=null;this.last=null;this.present=false}
  update(sample){
    const t=sample.t;
    if(!Number.isFinite(t))return{present:false,ready:false,lost:true};
    if(this.last!==null&&(t<=this.last||t-this.last>AUTO_POLICY.maxGap)){this.since=null;this.lostSince=null;this.present=false}
    this.last=t;
    // All-dark and all-clipped frames cannot establish contact.
    const contact=sample.redCoverage>=AUTO_POLICY.minRedCoverage&&sample.r>35&&sample.clipped.some(x=>x<.9);
    if(contact){this.since??=t;this.lostSince=null;if(t-this.since>=AUTO_POLICY.contactSeconds)this.present=true}
    else{this.since=null;this.lostSince??=t;if(t-this.lostSince>=AUTO_POLICY.lostSeconds)this.present=false}
    return{contact,present:this.present,ready:contact&&this.present,lost:!this.present&&this.lostSince!==null&&t-this.lostSince>=AUTO_POLICY.lostSeconds};
  }
}
