// Session elapsed clock; an optional deadline is disabled for quality-driven scans.
export class ScanSession {
  // Window methods must keep their global receiver, even when stored on a class.
  constructor({seconds=null,now=()=>performance.now(),setTimer=(fn,ms)=>globalThis.setTimeout(fn,ms),clearTimer=id=>globalThis.clearTimeout(id),onTick=()=>{},onEnd=()=>{}}={}){Object.assign(this,{seconds,now,setTimer,clearTimer,onTick,onEnd});this.active=false;this.timer=null;this.started=null}
  start(){if(this.active)return;this.started=this.now();this.active=true;this.check()}
  elapsed(){return this.started===null?0:Math.max(0,(this.now()-this.started)/1000)}
  check(){if(!this.active)return;this.clearTimer(this.timer);const elapsed=this.elapsed();this.onTick({elapsed,remaining:this.seconds===null?null:Math.max(0,this.seconds-elapsed)});if(this.seconds!==null&&elapsed>=this.seconds){this.onEnd();return}this.timer=this.setTimer(()=>this.check(),this.seconds===null?250:Math.min(250,(this.seconds-elapsed)*1000))}
  stop(){this.active=false;this.clearTimer(this.timer);this.timer=null}
}
