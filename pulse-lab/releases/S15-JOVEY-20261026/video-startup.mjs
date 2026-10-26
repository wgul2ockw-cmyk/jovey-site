// A granted MediaStream and a playable, advancing video are different states.
export function connectVideo(video,stream,{onState=()=>{},onFailure=()=>{},setTimer=setTimeout,clearTimer=clearTimeout,timeoutMs=6000}={}){
  const track=stream.getVideoTracks()[0];let stopped=false,hasFrame=false,attempt=0,watchdog=null;const remove=[];
  function state(stage,extra={}){if(!stopped)onState(stage,extra)}
  function failure(stage,error){if(!stopped&&!hasFrame){clearTimer(watchdog);onFailure(stage,error)}}
  function watch(){clearTimer(watchdog);watchdog=setTimer(()=>failure('frames',Object.assign(Error('Camera stream received, but no video frames arrived.'),{name:'FirstFrameTimeout'})),timeoutMs)}
  function listen(target,name,fn){target?.addEventListener?.(name,fn);remove.push(()=>target?.removeEventListener?.(name,fn))}
  function play(){
    if(stopped)return;hasFrame=false;const current=++attempt;watch();state('play-requested');
    // Keep this call synchronous so the recovery button retains user activation.
    try{const promise=video.play();Promise.resolve(promise).then(()=>{if(!stopped&&current===attempt&&!hasFrame)state('waiting-frames')},e=>{if(current===attempt)failure('playback',e)})}
    catch(e){failure('playback',e)}
  }
  for(const name of ['loadedmetadata','loadeddata','playing','pause','waiting','stalled'])listen(video,name,()=>state('video-'+name));
  listen(video,'error',()=>{hasFrame=false;failure('video',Object.assign(Error(video.error?.message||'Video element error'),{name:`MediaError${video.error?.code||''}`}))});
  listen(track,'mute',()=>{hasFrame=false;state('track-muted');watch()});
  listen(track,'unmute',()=>{state('track-unmuted');play()});
  listen(track,'ended',()=>{hasFrame=false;failure('track',Object.assign(Error('The camera track ended.'),{name:'TrackEnded'}))});
  video.muted=true;video.defaultMuted=true;video.autoplay=true;video.playsInline=true;
  for(const attr of ['muted','autoplay','playsinline','webkit-playsinline'])video.setAttribute?.(attr,'');
  video.srcObject=stream;state('stream-attached');play();
  return{
    play,
    frame(){if(stopped||track?.muted||track?.enabled===false||track?.readyState==='ended'||video.readyState<2||!video.videoWidth||!video.videoHeight)return false;clearTimer(watchdog);if(!hasFrame){hasFrame=true;state('live')}return true},
    stop(){stopped=true;attempt++;clearTimer(watchdog);remove.forEach(fn=>fn())}
  };
}
