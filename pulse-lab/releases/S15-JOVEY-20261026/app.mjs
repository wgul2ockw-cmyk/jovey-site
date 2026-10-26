import {predictVector,FEATURE_VERSION} from './ppg-model.mjs';
import {SNIPPET_POLICY,SnippetCollector,predictSnippets} from './snippet-capture.mjs';
import {selectionFacts,buildReportHTML} from './scan-report.mjs';
import {DISPLAY_VERSION,inspectLive,drawTrace,drawMeanWave,drawRGBTrace,drawRGBMeanWaves} from './live-signal.mjs';
import {startFramePump} from './camera-frames.mjs';
import {AUTO_POLICY,FingerGate} from './auto-capture.mjs';
import {requestCamera,requestTorch,torchInfo,cameraError} from './camera-access.mjs';
import {connectVideo} from './video-startup.mjs';
import {ScanSession} from './scan-session.mjs';
import {AdaptiveExtractor,regionalOptics,EXTRACTION_POLICY} from './adaptive-extraction.mjs';
import {SynchronizedRGBExtractor,RGB_POLICY} from './rgb-extraction.mjs';
import {estimatePulse} from './pulse-rate.mjs';
import {OxygenCollector,SPO2_POLICY,validateSpO2Model,inspectOxygenExposure,formatOxygenExposure} from './spo2-model.mjs';
const BUILD='S15-JOVEY-20261026';
const OXYGEN_ASSETS='./spo2/S2-20261005/';
let oxygenModel=null,oxygenModelState='loading',oxygenCollector=new OxygenCollector(),oxygenExamples=[],oxygenExampleIndex=0;
const $=s=>document.querySelector(s);
const sections=['#setup','#capture','#result','#calibration','#personalResult'];
let stream=null,track=null,recording=false,samples=[],model=null,modelState='loading',benchmark=null,lastScan=null,emrContext={},lastFrame=-1,examples=[],exampleIndex=0,finishing=false,captureStartedAt=null,assessment=null,lastQualityAt=-Infinity,previewSamples=[],stopFrames=null,lastPreviewAt=-Infinity,previewChannel='g',opening=false,frameMetadata=null,cameraEpoch=0,torchState='unknown',playback=null,startupPhase='idle',startupEvents=[],cameraFrameCount=0,lastCameraFrameAt=null,torchBusy=false,autoTorchStarted=false,lastTorchResult=null,torchWanted=true;
let sessionSamples=[],attemptEvents=[],collector=new SnippetCollector(),collection=null,liveOxygenExposure=null,extractor=new AdaptiveExtractor(),rgbExtractor=new SynchronizedRGBExtractor(),oxygenContactActive=false,livePulse=null,lastPulseAt=-Infinity;
const session=new ScanSession({seconds:SNIPPET_POLICY.maxCaptureSeconds,onEnd:()=>finish('attempt_limit'),onTick:({elapsed})=>{
  const oxygenCount=oxygenCollector.bank.length,rgbCount=oxygenCollector.signalBank.length;oxygenCollector.prune(elapsed);
  if(collector.prune(elapsed)||oxygenCount!==oxygenCollector.bank.length||rgbCount!==oxygenCollector.signalBank.length)refreshCollection();
  setText('#elapsedInfo',`${Math.floor(elapsed)} s elapsed · collecting until ready`);
  if(recording&&lastCameraFrameAt!==null&&performance.now()-lastCameraFrameAt>1000){resetAttempt('Camera paused · saved snippets kept')}
}});
const fingerGate=new FingerGate();
function clearPulse(){setText('#livePulse',livePulse?String(livePulse.bpm):collection?.pulse?String(collection.pulse.bpm):'—');setText('#pulseSource',livePulse?'· live estimate':collection?.pulse?'· saved estimate':'· estimated')}
function allSignalsReady(oxygen){return !!collection?.waveformReady&&(collection.ready||modelState==='failed')&&(oxygen.ready||oxygenModelState==='failed')}
function refreshOxygen(){
  const oxygen=oxygenCollector.summary(session.elapsed(),oxygenModel);
  let message=oxygen.message;
  if(!oxygen.ready&&fingerGate.present&&liveOxygenExposure?.available){
    if(liveOxygenExposure.blocked)message=liveOxygenExposure.message;
    else if(oxygen.code==='rgb_clipping')message='Clipping check clear · collecting a new segment';
  }
  setText('#oxygenCapture',oxygenModelState==='failed'?'SpO₂ model unavailable':oxygenModelState==='loading'?'SpO₂ model loading…':`SpO₂: ${oxygen.savedRGBSegments} RGB snippets saved · ${message}`);
  for(const [i,c] of ['r','g','b'].entries()){
    const state=oxygen.rgb.channels[c],exposure=liveOxygenExposure?.channels?.[i],clipped=fingerGate.present&&exposure?.clippedMax>RGB_POLICY.maxClipped;
    const text=clipped?exposure.direction==='dark'?'Too dark':exposure.direction==='bright'?'Too bright':'Clipped':state.stability.ready?`Stable · ${state.beatCount}`:state.beatCount?`${state.beatCount} beats`:oxygen.latestChannels[c]?.message||'Collecting';
    setText('#rgbStatus_'+c,text);
  }
  return oxygen;
}
function refreshCollection(){
  collection=collector.summary(session.elapsed());clearPulse();
  const oxygen=refreshOxygen();
  setText('#timer',`${collection.savedBeats} beats collected`);
  setText('#collectionCount',collection.waveformReady?`Waveform stable · ${collection.cleanSeconds.toFixed(1)} s compatible signal`:collection.beats?`${collection.stability.reason} · saved snippets kept`:collection.savedSnippets?'Collecting current waveform · older signal expired':'Finding a stable camera region');
  // This is saved-signal progress, not a promise that model gates will pass.
  const goals=[Math.min(1,collection.savedBeats/SNIPPET_POLICY.targetBeats)];if(oxygenModelState!=='failed')goals.push(Math.min(1,oxygen.savedRGBSegments/SPO2_POLICY.minSegments));
  $('#bar').style.width=(100*Math.min(.99,goals.reduce((a,b)=>a+b,0)/goals.length))+'%';
  $('#partialReport').classList.toggle('hidden',!collection.pulseReady&&!oxygen.ready);
  return oxygen;
}
function startSession(){if(session.active)return;lastScan=null;sessionSamples=[];attemptEvents=[];collector=new SnippetCollector();oxygenCollector=new OxygenCollector();collection=null;clearPulse();captureStartedAt=new Date().toISOString();session.start();refreshCollection()}

const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const ctx=canvas.getContext('2d',{willReadFrequently:true});
const oxygenCanvas=document.createElement('canvas');oxygenCanvas.width=64;oxygenCanvas.height=64;const oxygenCtx=oxygenCanvas.getContext('2d',{willReadFrequently:true});
function show(id){sections.forEach(x=>$(x).classList.toggle('hidden',x!==id));$('.stepper').querySelectorAll('.step').forEach((x,i)=>x.classList.toggle('on',i<=sections.indexOf(id)));}
function status(s){$('#status').textContent=s}
function setText(id,s){$(id).textContent=s}
async function jsonFetch(url,options={}){const embedded=globalThis.__PULSE_LAB_ASSETS__?.[url];if(embedded!==undefined)return structuredClone(embedded);const res=await fetch(url,{...options,signal:AbortSignal.timeout(5000)});if(!res.ok||!res.headers.get('content-type')?.includes('application/json'))throw Error('Service not connected');return res.json()}
async function loadModel(){try{[model,benchmark,examples]=await Promise.all(['model.json','benchmark.json','examples.json'].map(x=>jsonFetch('./'+x)));if(model.feature_version!==FEATURE_VERSION)throw Error('Model version mismatch');modelState='ready';const h=model.heldout;setText('#trainingStatus',`Trained on ${benchmark.final_fit_participants} participants · tested on ${benchmark.split_counts.test} unseen participants. Source-test MAE: ${h.sbp.mae.toFixed(1)} / ${h.dbp.mae.toFixed(1)} mmHg (SBP / DBP).`);$('#sampleDemo').disabled=false}catch(e){model=null;modelState='failed';setText('#trainingStatus','Model could not load. Reload to retry. No fallback BP numbers will be generated.');status(e.message)}}
async function loadOxygenModel(){
  try{const [m,e]=await Promise.all(['model.json','examples.json'].map(x=>jsonFetch(OXYGEN_ASSETS+x)));oxygenModel=validateSpO2Model(m);oxygenExamples=e;oxygenModelState='ready';setText('#oxygenTraining',`SpO₂ ${m.kind==='bounded_cnn_ensemble'?'neural ensemble':m.kind==='ratio_ridge'?'RGB ratio model':'spectral model'} · ${m.participants} participants · unseen-participant MAE ${m.benchmark.mae.toFixed(2)} percentage points. iPhone/browser accuracy is unknown.`);$('#oxygenDemo').disabled=false;setText('#oxygenCapture','SpO₂: ready to collect RGB · experimental')}catch{oxygenModel=null;oxygenModelState='failed';setText('#oxygenTraining','SpO₂ model could not load. Reload to retry.');setText('#oxygenCapture','SpO₂ model unavailable')}
}
async function fetchEMR(){emrContext={};setText('#emrStatus','Browser-only scan · no hospital connection');$('#emrDot').classList.remove('live')}

function scanMessage(text){setText('#captureHint',text);setText('#liveText',text)}
function resetAttempt(message='Place your finger',{resetExtraction=true,resetOxygen=true,resetContact=true}={}){
  halt();samples=[];assessment=null;lastQualityAt=-Infinity;if(resetContact)fingerGate.reset();collector.resetContact();if(resetOxygen){oxygenCollector.resetContact();rgbExtractor.reset();oxygenContactActive=false;liveOxygenExposure=null}if(resetExtraction)extractor.reset();livePulse=null;lastPulseAt=-Infinity;clearPulse();
  if(session.active)refreshCollection();
  if(session.active){attemptEvents.push({elapsedSeconds:session.elapsed(),reason:message});attemptEvents=attemptEvents.slice(-80)}
  else{$('#bar').style.width='0';setText('#timer','')}scanMessage(message);
}
function idleCamera(message='Place your finger after starting'){
  halt();stopCamera();collector=new SnippetCollector();oxygenCollector=new OxygenCollector();collection=null;show('#capture');resetAttempt('Ready to scan');$('#partialReport').classList.add('hidden');setText('#collectionCount','');previewSamples=[];drawTrace($('#plot'),[]);setText('#torchLabel','');
  $('#start').classList.remove('hidden');$('#start').disabled=false;setText('#start','Start scan');
  $('#cancelCapture').classList.add('hidden');$('#resumeCamera').classList.add('hidden');$('#retryCamera').classList.add('hidden');setText('#signalHelp',message);
}
function startupEvent(event,details={}){
  startupEvents.push({at:new Date().toISOString(),event,...details});startupEvents=startupEvents.slice(-80);
  setText('#startupStage',`${BUILD} · ${event}`);
}
function startupFailure(stage,error){
  if(session.active){startupEvent('error',{stage,name:error?.name||'Error'});finish('camera_error');return}
  startupPhase='recovery';opening=false;resetAttempt('Camera needs a retry');
  startupEvent('error',{stage,name:error?.name||'Error',message:error?.message||''});
  setText('#startupError',`${stage} · ${error?.name||'Error'}: ${error?.message||'Unknown error'}`);$('#startupError').classList.remove('hidden');
  const canResume=!!stream&&track?.readyState!=='ended'&&!['acquisition','initialization','pixels'].includes(stage);
  $('#resumeCamera').classList.toggle('hidden',!canResume);$('#retryCamera').classList.remove('hidden');$('#start').classList.add('hidden');
  scanMessage(stage==='acquisition'?'Camera could not open':stage==='playback'?'Video playback blocked':stage==='frames'?'Waiting for camera frames':'Camera interrupted');
  setText('#signalHelp',stage==='acquisition'?cameraError(error):canResume?'Tap Resume camera':'Tap Retry camera');
}
function startupState(epoch,phase){
  if(epoch!==cameraEpoch)return;startupEvent(phase);
  if(phase==='live'){
    startupPhase='live';opening=false;$('#start').classList.add('hidden');$('#resumeCamera').classList.add('hidden');$('#retryCamera').classList.add('hidden');$('#startupError').classList.add('hidden');
    scanMessage('Place your finger');setText('#signalHelp','Cover rear lens + flash · hand at heart level');
  }else if(phase==='track-muted'){
    startupPhase='waiting-frames';resetAttempt('Camera paused');setText('#signalHelp','Waiting for camera to resume');
  }
}
async function camera(deviceId=''){
  // Keep camera acquisition in the original click stack and surface early errors.
  try{await openCamera(deviceId)}catch(error){
    opening=false;recording=false;try{stopCamera()}catch{}
    show('#capture');startupPhase='recovery';startupEvent('error',{stage:'start',name:error?.name||'Error',message:error?.message||''});
    $('#start').disabled=false;setText('#start','Start scan');$('#start').classList.remove('hidden');$('#cancelCapture').classList.add('hidden');
    scanMessage('Unable to start');setText('#signalHelp','Tap Start scan to retry');
    setText('#startupError',`Start · ${error?.name||'Error'}: ${error?.message||'Unexpected startup error'}`);$('#startupError').classList.remove('hidden');
  }
}
async function openCamera(deviceId=''){
  if(opening||recording)return;stopCamera();opening=true;startupPhase='requesting';const epoch=cameraEpoch;show('#capture');
  startupEvents=[];cameraFrameCount=0;lastCameraFrameAt=null;autoTorchStarted=false;torchState='unknown';lastTorchResult=null;torchWanted=true;startupEvent('requesting-camera');
  previewSamples=[];liveOxygenExposure=null;setText('#oxygenMetrics','');lastPreviewAt=-Infinity;lastFrame=-1;previewChannel='g';collector=new SnippetCollector();oxygenCollector=new OxygenCollector();collection=null;resetAttempt('Opening camera');$('#partialReport').classList.add('hidden');setText('#collectionCount','');
  $('#start').classList.remove('hidden');$('#start').disabled=true;setText('#start','Allow camera…');
  for(const id of ['#resumeCamera','#retryCamera','#startupError'])$(id).classList.add('hidden');$('#cancelCapture').classList.remove('hidden');
  setText('#signalHelp','Allow camera access');setText('#torchLabel','');drawTrace($('#plot'),[]);
  let opened;
  try{opened=await requestCamera(navigator.mediaDevices,deviceId)}
  catch(e){if(epoch===cameraEpoch)startupFailure('acquisition',e);return}
  if(epoch!==cameraEpoch){opened.getTracks().forEach(t=>t.stop());return}
  stream=opened;track=stream.getVideoTracks()[0];startupEvent('stream-received',{tracks:stream.getVideoTracks().length});
  if(!track){startupFailure('acquisition',Object.assign(Error('Granted stream has no video track.'),{name:'NoVideoTrack'}));return}
  try{
    startupPhase='waiting-frames';setText('#start','Starting video…');setText('#signalHelp','Camera granted · starting video');
    const v=$('#video');
    playback=connectVideo(v,stream,{onState:phase=>startupState(epoch,phase),onFailure:(stage,error)=>{if(epoch===cameraEpoch)startupFailure(stage,error)}});
    stopFrames=startFramePump(v,takeFrame,message=>{if(epoch!==cameraEpoch)return;startupEvent('frame-wait',{message});if(startupPhase==='live'){resetAttempt('Camera paused');setText('#signalHelp','Tap Resume camera');$('#resumeCamera').classList.remove('hidden');$('#retryCamera').classList.remove('hidden')}});
    let settings={};try{settings=track.getSettings?.()||{}}catch(e){startupEvent('settings-unavailable',{name:e.name})}
    setText('#activeCamera',track.label||'Rear camera');setText('#cameraInfo',track.label||'Rear camera');setText('#fpsInfo',settings.frameRate?`${settings.frameRate} fps reported`:'Measuring frames');
    // All optional operations are isolated from playback readiness.
    void populateCameras(epoch,settings.deviceId||deviceId);void fetchEMR();
  }catch(e){if(epoch===cameraEpoch)startupFailure('initialization',e)}
}
function resumeCamera(){
  if(!playback||!stream||track?.readyState==='ended'){camera();return}
  startupEvent('resume-tapped');startupPhase='waiting-frames';opening=true;
  $('#resumeCamera').classList.add('hidden');$('#startupError').classList.add('hidden');scanMessage('Starting video');
  playback.play();
}
function exportStartup(){
  const v=$('#video');let embedded=false;try{embedded=window.self!==window.top}catch{embedded=true}
  const diagnostic={build:BUILD,phase:startupPhase,browser:navigator.userAgent,secureContext:globalThis.isSecureContext??null,embedded,visibility:document.visibilityState||null,cameraAllowedByPolicy:(document.permissionsPolicy||document.featurePolicy)?.allowsFeature?.('camera')??null,events:startupEvents,track:track?{readyState:track.readyState,muted:track.muted,enabled:track.enabled}:null,video:{readyState:v.readyState,paused:v.paused,width:v.videoWidth,height:v.videoHeight,currentTime:v.currentTime},torch:{desired:torchWanted,...torchInfo(track),lastRequest:lastTorchResult},frames:{timing:frameMetadata,count:cameraFrameCount,mode:frameMetadata?.mode??null,lastFrameAgeMs:lastCameraFrameAt===null?null:performance.now()-lastCameraFrameAt}};
  diagnostic.oxygenExposure=liveOxygenExposure;
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(diagnostic,null,2)],{type:'application/json'}));a.download='pulse-lab-camera-diagnostic.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
async function populateCameras(epoch,selected){
  try{const devices=await navigator.mediaDevices.enumerateDevices?.()||[];if(epoch!==cameraEpoch)return;
    $('#cameraSelect').replaceChildren();
    for(const [i,d] of devices.filter(d=>d.kind==='videoinput').entries()){const option=document.createElement('option');option.value=d.deviceId;option.textContent=d.label||`Camera ${i+1}`;$('#cameraSelect').appendChild(option)}
    $('#cameraSelect').value=selected;
  }catch{/* Camera selection is optional; preview remains running. */}
}
function torchView(result){
  torchState=result.state;
  const labels={on:'Flash on*',off:'Flash off*',unconfirmed:'Flash unconfirmed',unavailable:'Flash unavailable',pending:'Flash not ready',cancelled:''};
  setText('#torchLabel',labels[result.state]||'');setText('#torchInfo',result.state);
  setText('#torchToggle',result.state==='on'?'Retry flash':'Enable flash');
  setText('#torchMessage',result.state==='unavailable'?'This camera/browser did not expose working flash control.':result.state==='unconfirmed'?'Flash request sent; the browser did not confirm it.':result.state==='pending'?'Flash request is still pending. The camera preview stays active.':'');
  $('#torchMessage').classList.toggle('hidden',['on','off','cancelled'].includes(result.state));
}
async function configureTorch(epoch,activeTrack,on=true){
  if(torchBusy||!activeTrack||epoch!==cameraEpoch)return;
  torchBusy=true;torchWanted=on;resetAttempt('Adjusting flash');previewSamples=[];lastPreviewAt=-Infinity;
  $('#torchToggle').disabled=true;$('#torchOff').disabled=true;setText('#torchLabel',on?'Starting flash…':'Stopping flash…');
  startupEvent('torch-request',{desired:on,capability:torchInfo(activeTrack).capability});
  const result=await requestTorch(activeTrack,on,{isActive:()=>epoch===cameraEpoch&&activeTrack===track});
  if(epoch!==cameraEpoch||activeTrack!==track)return;
  torchBusy=false;lastTorchResult=result;torchView(result);$('#torchToggle').disabled=false;$('#torchOff').disabled=false;
  startupEvent('torch-result',result);
  if(result.requested){resetAttempt(startupPhase==='live'?'Place your finger':'Starting video');previewSamples=[];lastPreviewAt=-Infinity;}
}
function renderLive(){
  if(!previewSamples.length)return;
  const latest=previewSamples.at(-1),preferred=$('#channelSelect').value||'rgb';
  const info=inspectLive(previewSamples,['auto','rgb'].includes(preferred)?latest.selectedChannel:preferred,previewChannel);previewChannel=info.chosen.channel;
  if(preferred==='rgb')drawRGBTrace($('#plot'),previewSamples,{mode:$('#traceMode').value||'ac',invert:$('#invertTrace').checked});
  else drawTrace($('#plot'),info.samples,{channel:previewChannel,mode:$('#traceMode').value||'ac',invert:$('#invertTrace').checked});
  setText('#waveLabel',preferred==='rgb'?`RGB · ${latest.oxygen.regionId}`:'PPG · '+previewChannel.toUpperCase()+' · '+(latest.regionId==='central'?'centre':latest.regionId));
  setText('#signalMetrics',`${info.fps.toFixed(1)} fps · brightness ${info.chosen.dc.toFixed(1)}/255 · AC RMS ${info.chosen.amplitude.toFixed(3)} · clipped ${(info.chosen.clipping*100).toFixed(1)}%`);
  setText('#frameStatus',frameMetadata?.verified?`Frame timing: ${frameMetadata.mode}`:'Unverified frame timing · preview only');
  liveOxygenExposure=inspectOxygenExposure(previewSamples.filter(s=>s.t>=latest.t-.5&&s.oxygen.acquisitionEpoch===latest.oxygen.acquisitionEpoch&&s.oxygen.regionId===latest.oxygen.regionId));
  setText('#oxygenMetrics',`Synchronized RGB · ${latest.oxygen.regionId} · ${formatOxygenExposure(liveOxygenExposure)}. Dark/bright percentages are the worst frame in the last 0.5 s. All colours use the same region and timestamps; trace scales are for display only.`);
  const oxygen=refreshOxygen();
  $('#liveDot').classList.toggle('live',info.state==='repeating');$('#captureExport').disabled=!previewSamples.length;
  if(recording&&latest.t-lastPulseAt>=.5){
    const lastBreak=previewSamples.findLastIndex(s=>!s.contactUsable||s.candidateInterrupted||s.acquisitionEpoch!==latest.acquisitionEpoch||s.regionId!==latest.regionId||s.selectedChannel!==latest.selectedChannel);
    livePulse=estimatePulse(previewSamples.slice(lastBreak+1),{channel:latest.selectedChannel,seconds:6});lastPulseAt=latest.t;clearPulse();
  }
  if(recording){renderCaptureGuidance(oxygen)}else{
    if(modelState==='loading'){scanMessage('Loading model');setText('#signalHelp','Camera preview is ready')}
    else if(!frameMetadata?.verified){scanMessage('Checking camera');setText('#signalHelp','Waiting for verified frames')}
    else if(fingerGate.present){scanMessage('Finger detected');setText('#signalHelp','Hold still')}
    else {scanMessage(collection?.savedSnippets?'Waiting for contact · snippets kept':'Place your finger');setText('#signalHelp',torchState==='unavailable'?'Cover the active lens · flash unavailable':'Cover rear lens + flash · hand at heart level')}
  }
}
function takeFrame(t,metadata){
  if(!stream)return;const v=$('#video');if(v.readyState<2||!v.videoWidth||!v.videoHeight||t<=lastFrame||track?.muted||track?.readyState==='ended')return;if(!playback?.frame())return;if(!session.active)startSession();if(!stream)return;lastFrame=t;frameMetadata=metadata;cameraFrameCount++;lastCameraFrameAt=performance.now();
  try{
    ctx.drawImage(v,v.videoWidth*.25,v.videoHeight*.25,v.videoWidth*.5,v.videoHeight*.5,0,0,64,64);
    oxygenCtx.drawImage(v,0,0,v.videoWidth,v.videoHeight,0,0,64,64);
    const regional=extractor.push(t,regionalOptics(ctx.getImageData(0,0,64,64).data),{locked:collector.bank.length>0});
    if(regional.selectionChanged){attemptEvents.push({elapsedSeconds:session.elapsed(),reason:regional.selectionReason,regionId:regional.regionId,savedSnippetsKept:true});attemptEvents=attemptEvents.slice(-80)}
    const rgbRegions=regionalOptics(oxygenCtx.getImageData(0,0,64,64).data).map((r,i)=>({...r,id:i?`rgb-tile-${i}`:'whole-frame'}));
    const oxygen=rgbExtractor.push(t,rgbRegions,{locked:oxygenCollector.signalBank.length>0});
    if(oxygen.selectionChanged){attemptEvents.push({elapsedSeconds:session.elapsed(),reason:oxygen.selectionReason,regionId:oxygen.regionId,savedSnippetsKept:true});attemptEvents=attemptEvents.slice(-80)}
    const sample={...regional,oxygen,oxygenWhole:rgbRegions[0],oxygenRegions:rgbRegions,motion:null,motionAgeMs:null,frameTimingVerified:metadata.verified,frameMetadata:metadata};
    if(!autoTorchStarted&&cameraFrameCount>=3){autoTorchStarted=true;void configureTorch(cameraEpoch,track,true)}
    if(!torchBusy&&torchWanted&&['pending','unconfirmed'].includes(torchState)&&cameraFrameCount%30===0&&torchInfo(track).reported===true){torchView({state:'on'});resetAttempt('Place your finger');startupEvent('torch-late-reported-on')}
    const contact=fingerGate.update({...sample,...sample.central});sample.contactUsable=contact.ready&&metadata.verified&&!opening;
    sessionSamples.push(sample);sessionSamples=sessionSamples.filter(s=>s.t>=t-60).slice(-7200);
    previewSamples.push(sample);previewSamples=previewSamples.filter(s=>s.t>=t-8);
    if(!sample.contactUsable){collector.pause();oxygenCollector.pause();livePulse=null;clearPulse()}
    if((recording||oxygenContactActive)&&contact.lost)resetAttempt('Waiting for contact · saved snippets kept');
    if(contact.ready)oxygenContactActive=true;
    if(!recording&&contact.ready&&sample.selectionReady&&metadata.verified&&!opening)begin();
    if(t-lastPreviewAt>=.1){renderLive();lastPreviewAt=t}
    const oxygenSegment=contact.ready&&metadata.verified&&!opening?oxygenCollector.push(sample,oxygenModel,session.elapsed(),{torch:torchState,roi:'One fixed common RGB region from a 3x3 full-frame grid',cameraLabel:track?.label||null,frameMode:metadata.mode}):null;
    if(recording&&sample.contactUsable){samples.push(sample);samples=samples.filter(s=>s.t>=t-12)}
    const beforeSegments=collector.bank.length;const segment=recording&&sample.contactUsable?collector.push(sample,model,session.elapsed(),{torch:torchState,regionId:sample.regionId,channel:sample.selectedChannel,epoch:sample.acquisitionEpoch,cameraLabel:track?.label||null,frameMode:metadata.mode}):null;
    if(segment||oxygenSegment||collector.bank.length!==beforeSegments){const oxygen=updateQuality();if(allSignalsReady(oxygen))finish(modelState==='ready'&&oxygenModelState==='ready'?'enough_clean_segments':'available_models_ready')}
  }catch(e){setText('#frameStatus',e.message);if(session.active)finish('camera_error');else{startupFailure('pixels',e)}}
}
function updateQuality(){
  const oxygen=refreshCollection();setText('#captureStatus',collector.message);renderCaptureGuidance(oxygen);return oxygen;
}
function renderCaptureGuidance(oxygen){
  if(!collection)return;
  const needsOxygen=oxygenModelState!=='failed'&&!oxygen.ready;
  scanMessage(allSignalsReady(oxygen)?'Preparing report':collection.ready&&needsOxygen?'BP + pulse ready · collecting SpO₂':collection.pulseReady&&!collection.waveformReady?'Pulse found · checking waveform stability':collection.pulseReady&&needsOxygen?(modelState==='failed'?'Pulse ready · collecting SpO₂':'Pulse ready · collecting BP + SpO₂'):collection.pulseReady?'Pulse ready · collecting BP signal':collection.beats?'Clean segment saved':'Finding your pulse');
  setText('#signalHelp',needsOxygen&&liveOxygenExposure?.blocked?'Searching usable RGB · saved snippets kept':'Keep still · clean sections save automatically');
}
function begin(){
  if(opening||!stream||!session.active||!frameMetadata?.verified||recording||finishing)return;
  samples=[];assessment=null;lastQualityAt=-Infinity;recording=true;
  scanMessage('Collecting clean segments');setText('#signalHelp','Hold still · stops when signal is ready');$('#cameraSelect').disabled=true;$('#torchToggle').disabled=torchBusy;
}
function halt(){recording=false;$('#cameraSelect').disabled=false;$('#torchToggle').disabled=torchBusy;}
function finish(trigger='automatic'){
  if(!session.active||finishing)return;finishing=true;const elapsedSeconds=session.elapsed();session.stop();halt();
  const id=crypto.randomUUID(),capturedAt=new Date().toISOString();let settings={};try{settings=track?.getSettings?.()||{}}catch{}
  const saved=collector.summary(elapsedSeconds);
  lastScan={schemaVersion:11,build:BUILD,scanId:id,capturedAt,startedAt:captureStartedAt,modelId:model?.id??null,featureVersion:FEATURE_VERSION,source:'phone_camera',displayVersion:DISPLAY_VERSION,autoPolicy:AUTO_POLICY,acquisition:{roi:'Fixed centre plus 3x3 tiles within central half of sensor',extractionPolicy:EXTRACTION_POLICY,rgbExtractionPolicy:RGB_POLICY,pixelGrid:[64,64],frameMode:frameMetadata?.mode,torch:torchState},completionTrigger:trigger,elapsedSeconds,pulse:saved.pulse,collection:saved,snippets:structuredClone(collector.bank),snippetAudit:structuredClone(collector.audit),collectionPolicy:SNIPPET_POLICY,sessionSamples:structuredClone(sessionSamples),rawRetention:'Rolling 60 seconds / 7200 frames; accepted BP snippets remain eligible for 60 seconds and RGB snippets for 120 seconds. Session saved counters persist. Contact/region/exposure groups stay separate.',attemptEvents:structuredClone(attemptEvents),samples:structuredClone(samples),camera:settings,cameraLabel:track?.label||null,userAgent:navigator.userAgent,positionInstruction:'Seated, left index finger, hand supported at heart level; not sensor-verified',emrSnapshot:structuredClone(emrContext),emrUsedForInference:false,reference:null};
  const oxygen=oxygenCollector.summary(elapsedSeconds,oxygenModel);
  lastScan.completionPolicy={version:'continuous-compatible-snippets-v4',bpModel:modelState,oxygenModel:oxygenModelState,maxSeconds:null,rule:'Continuous collection until loaded model gates pass or the user finishes. Keep accepted snippets through interruptions; infer from fresh nonoverlapping snippets within one contact/region/exposure group for each metric.',validated:false};
  lastScan.oxygen={...oxygen,liveExposure:structuredClone(liveOxygenExposure),policy:SPO2_POLICY,extractionPolicy:RGB_POLICY,acquisitionNote:'Synchronized common-region RGB; regional extraction is not validated against the whole-frame training data',waveformSegments:structuredClone(oxygenCollector.signalBank),segments:structuredClone(oxygenCollector.bank),audit:structuredClone(oxygenCollector.audit),producedAt:capturedAt,phoneValidated:false};
  if(!oxygen.ready&&!oxygenCollector.audit.length&&liveOxygenExposure?.blocked)lastScan.oxygen.message=liveOxygenExposure.message;
  try{assessment=collector.analysis(elapsedSeconds);lastScan.analysis=assessment;lastScan.capturePolicy=SNIPPET_POLICY;
    if(!model)throw Error('BP model unavailable.');
    if(!assessment.ready)throw Error(lastScan.pulse?'Pulse captured · signal did not pass BP checks.':'No steady pulse captured · adjust your finger and retry.');
    const prediction=predictSnippets(model,assessment);lastScan.prediction=Object.freeze({...prediction,producedAt:new Date().toISOString(),modelId:model.id,phoneValidated:false,mode:'generalized_no_prior_cuff'});
  }catch(e){lastScan.abstention=e.message}
  finally{finishing=false;stopCamera();renderResult()}
}
function drawSelected(){drawMeanWave($('#selectedPlot'),lastScan.pulse?.meanWave)}
function renderResult(){
  const p=lastScan.prediction,isPhone=lastScan.source==='phone_camera',isOxygenDemo=lastScan.source==='public_spo2_heldout_sample',selected=lastScan.analysis?.selected,pulse=lastScan.pulse;
  const oxygen=lastScan.oxygen,op=oxygen?.prediction;
  setText('#oxygenValue',op?`${op.value.toFixed(1)}%`:'Unavailable');
  setText('#oxygenResultNote',isOxygenDemo?`Stored held-out result · reference ${lastScan.datasetOxygenReference.toFixed(1)}% · participant ${lastScan.participant}. This example was excluded from its fold’s training.`:op?`Experimental · ${op.segments} RGB segments. Source-test average error: ${op.benchmarkMAE.toFixed(2)} percentage points; average bias below 80% oxygen was ${op.lowRangeBias>=0?'+':''}${op.lowRangeBias.toFixed(2)} points. Phone and regional RGB accuracy unknown.`:isPhone?oxygen?.message||'No eligible RGB segments.':'This BP example has no camera RGB for SpO₂.');
  setText('#oxygenRange',op?.range?`Segment outputs ${op.range.map(x=>x.toFixed(1)).join('–')}%. This is variation, not an accuracy interval.`:'');
  const rgb=op?oxygen.modelRGB:oxygen?.rgb;drawRGBMeanWaves($('#rgbMeanPlot'),rgb);
  $('#rgbMeanPanel').classList.toggle('hidden',!isPhone||!rgb?.segments);
  setText('#rgbMeanCaption',rgb?.segments?`Synchronized RGB · ${rgb.regionId} · ${rgb.segments} common segments. ${['r','g','b'].map(c=>`${c.toUpperCase()}: ${rgb.channels[c].beatCount} beats · ${rgb.channels[c].stability.ready?'stable':'collecting'}`).join(' / ')}. Normalized medians are display only; SpO₂ receives original RGB amplitudes.`:'');
  const exposure=oxygen?.exposure||oxygen?.liveExposure;
  setText('#oxygenDiagnostic',isPhone&&exposure?`SpO₂ ${oxygen.exposure?'last assessed segment':'last 0.5 s'} · ${formatOxygenExposure(exposure)}. Percentages show the worst frame; the rejection limit is more than 5% clipped pixels in any colour.`:'');
  setText('#coldBp',p?`${p.sbp.toFixed(1)}/${p.dbp.toFixed(1)}`:'— / —');setText('#modelMode',(lastScan.modelId||'Model unavailable')+' · generalized');
  setText('#summaryPulse',pulse?`${pulse.bpm} bpm`:'Unavailable');setText('#summaryDuration',isPhone?`${pulse?.beatCount||0} accepted beats · ${lastScan.snippets?.length||0} clean segments · ${Math.round(lastScan.elapsedSeconds)} s scan${lastScan.completionTrigger==='attempt_limit'?' · attempt ended':''}`:'Public-data sample');
  setText('#quality',isPhone?(p?'Accepted segments':pulse?'Pulse captured':'Retry needed'):'Source recording');setText('#confidence','Not phone-tested');
  setText('#modelDataNote',isPhone?(p?`BP from ${selected.snippetCount} accepted segments · ${selected.durationSeconds.toFixed(1)} s of original signal`:lastScan.abstention):isOxygenDemo?'Camera RGB dataset example; no BP reference or BP estimate.':'Held-out infrared-probe recording. This sample was excluded from training; it is not a camera scan.');
  setText('#resultNote',isPhone?'Research only · pulse, BP and SpO₂ unvalidated on this phone.':isOxygenDemo?'Recorded research example, not your oxygen level.':`Dataset cuff reference: ${lastScan.datasetReference.join('/')} mmHg.`);
  $('#calibrate').disabled=!isPhone||!p;$('#downloadReport').disabled=!isPhone;$('#scanReport').classList.toggle('hidden',!isPhone);$('#selectionDetails').classList.toggle('hidden',!pulse);$('#meanWavePanel').classList.toggle('hidden',!pulse);
  if(isPhone){
    const audit=lastScan.snippetAudit||[];
    $('#qualityTimeline').innerHTML=audit.map(w=>`<span class="window-${w.bpEligible?'selected':w.accepted?'usable':'rejected'}" title="${w.id}: ${w.message}"></span>`).join('');
    setText('#timelineCaption',`${lastScan.snippets?.length||0} retained clean segments. Green: BP eligible. Blue: pulse only. Rejected segments excluded.`);
    $('#qualityFacts').innerHTML=selectionFacts(lastScan).map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('');drawSelected();
    setText('#meanWaveCaption',pulse?`Median normalized pulse · ${pulse.meanWave.beatCount} beats · ${pulse.meanWave.channel.toUpperCase()}. Original timing and amplitude retained; BP uses original windows.`:'');
    setText('#predictionSpread',p?.windowRange?`Original-window outputs: ${p.windowRange.sbp.map(x=>x.toFixed(1)).join('–')} systolic / ${p.windowRange.dbp.map(x=>x.toFixed(1)).join('–')} diastolic mmHg. Output variation, not an accuracy interval.`:'BP remains unavailable until enough segments pass its checks.');
  }
  show('#result');
}
function downloadReport(){if(!lastScan||lastScan.source!=='phone_camera')return;const blob=new Blob([buildReportHTML(lastScan)],{type:'text/html'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`pulse-lab-scan-report-${lastScan.scanId}.html`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function exportScan(){if(!lastScan)return;const blob=new Blob([JSON.stringify(lastScan,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`pulse-lab-${lastScan.scanId}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function localInputTime(){const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}
function stopCamera(){session.stop();clearPulse();cameraEpoch++;opening=false;torchBusy=false;autoTorchStarted=false;$('#torchToggle').disabled=true;$('#torchOff').disabled=true;startupPhase='idle';playback?.stop();playback=null;stopFrames?.();stopFrames=null;frameMetadata=null;stream?.getTracks().forEach(t=>t.stop());stream=null;track=null;$('#video').srcObject=null;fingerGate.reset();}
$('#captureExport').onclick=()=>{if(!previewSamples.length)return;const data={schemaVersion:4,build:BUILD,rgbPolicy:RGB_POLICY,source:'phone_camera_preview',capturedAt:new Date().toISOString(),samples:previewSamples,camera:track?.getSettings(),cameraLabel:track?.label,frameTiming:frameMetadata,displayVersion:DISPLAY_VERSION,userAgent:navigator.userAgent};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='pulse-lab-live-rgb.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
$('#cameraSelect').onchange=()=>camera($('#cameraSelect').value);
$('#torchToggle').onclick=()=>{if(track)void configureTorch(cameraEpoch,track,true)};
$('#torchOff').onclick=()=>{if(track)void configureTorch(cameraEpoch,track,false)};
for(const id of ['#channelSelect','#traceMode','#invertTrace'])$(id).onchange=renderLive;
$('#cancelCapture').onclick=()=>idleCamera('Scan cancelled');
$('#partialReport').onclick=()=>finish('requested_available_report');
$('#oxygenDemo').onclick=()=>{if(!oxygenExamples.length)return;if(stream||session.active){halt();stopCamera()}const e=oxygenExamples[oxygenExampleIndex++%oxygenExamples.length];lastScan={schemaVersion:7,scanId:`hoffman-${e.subject}-${e.hand}-${e.start_seconds}`,source:'public_spo2_heldout_sample',participant:e.subject,modelId:null,datasetOxygenReference:e.reference,oxygen:{message:e.origin,prediction:{value:e.prediction,modelId:oxygenModel.id,phoneValidated:false,benchmarkMAE:oxygenModel.benchmark.mae,origin:'outer-fold prediction',heldoutParticipant:e.subject}},prediction:null};renderResult()};
$('#start').onclick=()=>camera();
$('#retryCamera').onclick=()=>{opening=false;camera()};
$('#resumeCamera').onclick=resumeCamera;$('#exportStartup').onclick=exportStartup;
$('#calibrate').onclick=()=>{setText('#personalStatus','');$('#trustedCheck').checked=false;$('#personalize').disabled=false;$('#referenceTime').value=localInputTime();show('#calibration')};
$('#personalize').onclick=()=>{const s=Number($('#sys').value),d=Number($('#dia').value),p=Number($('#pulse').value),time=new Date($('#referenceTime').value).getTime();if(!lastScan?.prediction||lastScan.source!=='phone_camera')return;if(!$('#trustedCheck').checked||!Number.isFinite(time)||time>Date.now()+60000||Math.abs(time-Date.parse(lastScan.capturedAt))>10*60000){setText('#personalStatus','Confirm the cuff source and an actual measurement time within 10 minutes of this scan.');return}if(s<70||s>250||d<35||d>150||s<=d||(p&&(p<25||p>250))){setText('#personalStatus','Check the cuff values.');return}lastScan.reference={sbp:s,dbp:d,pulse:p||null,measuredAt:new Date(time).toISOString(),enteredAt:new Date().toISOString(),source:'user-entered upper-arm cuff',device:$('#cuffDevice').value.trim()||null,verifiedByStudyStaff:false,pairingWindowProvisional:true};const e=[lastScan.prediction.sbp-s,lastScan.prediction.dbp-d];setText('#personalBp',`${lastScan.prediction.sbp.toFixed(1)}/${lastScan.prediction.dbp.toFixed(1)}`);setText('#personalNote',`Original estimate preserved. Difference from entered cuff: ${e[0].toFixed(1)} / ${e[1].toFixed(1)} mmHg. Pair stored in this tab; export it before leaving. Personal calibration is not trained or applied in this sprint.`);$('#personalize').disabled=true;show('#personalResult')};
$('#again').onclick=()=>camera();
$('#reset').onclick=()=>{lastScan=null;idleCamera()};
for(const id of ['#exportScan','#exportPair'])$(id).onclick=exportScan;
$('#sampleDemo').onclick=()=>{const e=examples[exampleIndex++%examples.length],p=predictVector(model,e.features);lastScan={schemaVersion:1,scanId:`ppgbp-${e.subject}-${e.segment}`,source:'public_heldout_sample',modelId:model.id,participant:e.subject,segment:e.segment,datasetReference:e.reference,prediction:{sbp:p[0],dbp:p[1],mode:'generalized_no_prior_cuff',phoneValidated:false}};renderResult()};
$('#backSetup').onclick=()=>idleCamera();
$('#downloadReport').onclick=downloadReport;$('#downloadPairedReport').onclick=downloadReport;$('#rescan').onclick=()=>camera();
document.addEventListener('visibilitychange',()=>{
  // Permission sheets can temporarily hide the page. Never cancel a pending camera request.
  startupEvent('visibility',{hidden:document.hidden});
  if(session.active){if(document.hidden)finish('page_hidden');else session.check();return}
  if(opening||startupPhase==='waiting-frames')return;
  if(document.hidden&&stream){idleCamera('Camera paused · tap Start scan to resume')}
});
window.addEventListener('pagehide',event=>{startupEvent('pagehide',{persisted:!!event.persisted});if(session.active)finish('page_hidden');else{halt();stopCamera()}});
window.addEventListener('pageshow',event=>{if(event.persisted&&!lastScan)idleCamera('Tap Start scan to resume')});
show('#capture');loadModel();loadOxygenModel();
