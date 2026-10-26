// Continuous preview acquisition; a stalled video callback must not leave a blank plot.
export function startFramePump(video,onFrame,onStatus,env={now:()=>performance.now(),raf:fn=>globalThis.requestAnimationFrame(fn),caf:id=>globalThis.cancelAnimationFrame(id)}){
  let stopped=false,callback=null,watchdog=null,lastTime=-1,lastSeen=env.now(),lastDelivered=env.now(),lastWarning=0,lastCount=-1;
  let presented=-1,mediaTime=-Infinity,presentationTime=null,presentationClock=false,presentationOffset=null,timing={timeSource:'media-time'};
  let mode=video.requestVideoFrameCallback?'video-frame':'playback-counter';
  function deliver(t,verified){if(stopped||!Number.isFinite(t)||t<=lastTime||video.readyState<2)return;lastTime=t;lastDelivered=env.now();onFrame(t,{mode,verified,...timing})}
  function queue(){callback=video.requestVideoFrameCallback((now,meta)=>{
    if(stopped)return;lastSeen=env.now();
    const count=meta.presentedFrames,newPresentation=Number.isFinite(count)&&count>presented;
    if(Number.isFinite(count)&&count<=presented){if(!stopped)queue();return}
    const stamp=Number.isFinite(meta.presentationTime)?meta.presentationTime:now;
    let t=meta.mediaTime,verified=true;
    timing={timeSource:'media-time',mediaTime:meta.mediaTime??null,presentedFrames:count??null,presentationTime:meta.presentationTime??null};
    // Some WebKit camera callbacks repeat mediaTime=0. An advancing presented
    // frame counter proves a fresh frame; use its real monotonic presentation
    // time instead. Never invent a frame interval or count callback duplicates.
    if(presentationClock||!Number.isFinite(t)||t<=mediaTime){
      if(newPresentation&&Number.isFinite(stamp)&&(lastTime<0||presentationTime!==null&&stamp>presentationTime)){
        presentationClock=true;verified=Number.isFinite(meta.presentationTime);
        mode=verified?'video-frame-presentation':'video-frame-callback';timing.timeSource=verified?'presentation-time':'callback-time';
        presentationOffset??=lastTime<0?-stamp/1000:lastTime-presentationTime/1000;
        t=presentationOffset+stamp/1000;
      }else t=NaN;
    }
    const before=lastTime;deliver(t,verified);
    if(lastTime>before){mediaTime=Number.isFinite(meta.mediaTime)?meta.mediaTime:mediaTime;presentationTime=Number.isFinite(stamp)?stamp:presentationTime;if(Number.isFinite(count))presented=count}
    if(!stopped)queue();
  })}
  function poll(){
    if(stopped)return;
    if(mode.startsWith('video-frame')&&(env.now()-lastSeen>1000||env.now()-lastDelivered>1000)){video.cancelVideoFrameCallback?.(callback);mode='playback-counter';onStatus('Video frames or timestamps stalled; using playback-frame fallback.');}
    if(!mode.startsWith('video-frame')){
      timing={timeSource:'playback-clock'};
      const count=video.getVideoPlaybackQuality?.().totalVideoFrames;
      if(Number.isFinite(count)&&count>0){if(count!==lastCount){lastCount=count;deliver(video.currentTime,true)}}
      else if(video.currentTime-lastTime>=1/30-.001){mode='display-clock';deliver(video.currentTime,false)}
    }
    if(env.now()-lastDelivered>2500&&env.now()-lastWarning>2500){lastWarning=env.now();onStatus('No new camera frames. Keep this page visible, or reopen the camera.');}
    if(!stopped)watchdog=env.raf(poll);
  }
  if(mode==='video-frame')queue();watchdog=env.raf(poll);
  return()=>{stopped=true;video.cancelVideoFrameCallback?.(callback);env.caf(watchdog)};
}
