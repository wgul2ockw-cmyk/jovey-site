export function cameraError(error){
  if(error?.name==='NotAllowedError'||error?.name==='SecurityError')return 'Allow camera access in your browser, then try again.';
  if(error?.name==='NotReadableError'||error?.name==='AbortError')return 'Camera is busy. Close other camera apps and try again.';
  if(error?.name==='NotFoundError')return 'No camera found. Open this page on your phone.';
  return 'Camera could not start. Open this link directly in Safari or Chrome and try again.';
}
export async function requestCamera(media,deviceId=''){
  if(!media?.getUserMedia){const e=Error('Camera API unavailable');e.name='NotFoundError';throw e}
  const facing=deviceId?{deviceId:{exact:deviceId}}:{facingMode:{ideal:'environment'}};
  try{return await media.getUserMedia({audio:false,video:{...facing,width:{ideal:640},height:{ideal:480},frameRate:{ideal:30}}})}
  catch(e){if(e.name!=='OverconstrainedError')throw e;return media.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'}}})}
}
export function capabilities(track){try{return track.getCapabilities?.()||{}}catch{return{}}}
const pendingTorch=new WeakMap();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function torchInfo(track){
  let actual=null;try{const s=track?.getSettings?.();if(typeof s?.torch==='boolean')actual=s.torch}catch{}
  const cap=track?capabilities(track):{};
  return{capability:cap.torch??null,reported:actual,facingMode:cap.facingMode??null};
}
export async function requestTorch(track,on=true,{sleep=delay,isActive=()=>true,timeoutMs=2500,setTimer=setTimeout,clearTimer=clearTimeout}={}){
  const info=torchInfo(track),attempts=[];
  const result=(state,requested=false)=>({state,requested,reported:torchInfo(track).reported,capability:info.capability,attempts});
  if(!isActive()||track.readyState==='ended')return result('cancelled');
  if(pendingTorch.has(track))return result('pending');
  if(info.capability===false||Array.isArray(info.capability)&&!info.capability.includes(true)||!track.applyConstraints)return result('unavailable');
  let base={};try{base={...(track.getConstraints?.()||{})}}catch{}
  // Preserve capture settings; torch changes must not reset width, rate or lens.
  delete base.torch;
  const advanced=(base.advanced||[]).map(({torch,...rest})=>rest).filter(x=>Object.keys(x).length);delete base.advanced;
  let accepted=false;
  for(const method of ['basic','advanced']){
    if(!isActive()||track.readyState==='ended')return result('cancelled',accepted);
    const entry={method,requested:on,observed:[]};attempts.push(entry);
    const constraints=method==='basic'?{...base,...(advanced.length?{advanced}:{}),torch:on}:{...base,advanced:[...advanced,{torch:on}]};
    let timer;
    try{
      // A timeout does not launch a competing constraint request on this track.
      const operation=Promise.resolve(track.applyConstraints(constraints));pendingTorch.set(track,operation);
      operation.then(()=>{if(pendingTorch.get(track)===operation)pendingTorch.delete(track)},()=>{if(pendingTorch.get(track)===operation)pendingTorch.delete(track)});
      const outcome=await Promise.race([operation.then(()=> 'applied'),new Promise(resolve=>{timer=setTimer(()=>resolve('pending'),timeoutMs)})]);clearTimer(timer);
      if(outcome==='pending'){entry.pending=true;return result('pending',accepted)}
      accepted=true;
      // Camera settings can lag native torch changes. Re-read rather than infer
      // physical illumination from successful applyConstraints alone.
      for(const wait of [0,120,240]){
        if(wait)await sleep(wait);
        if(!isActive()||track.readyState==='ended')return result('cancelled',accepted);
        const actual=torchInfo(track).reported;entry.observed.push(actual);
        if(actual===on)return result(on?'on':'off',true);
      }
    }catch(e){clearTimer(timer);entry.error={name:e.name||'Error',message:e.message||''}}
  }
  return result(accepted?'unconfirmed':'unavailable',accepted);
}
