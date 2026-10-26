// Functional browser simulation. Does not establish actual phone camera/BP accuracy.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {predictVector} from '../pulse-lab/releases/S15-JOVEY-20261026/ppg-model.mjs';
const html=fs.readFileSync('pulse-lab/index.html','utf8'),elements=new Map(),events=new Map();
let frameCallback=null,currentIntensity=120,covered=false,cameraStopped=false,drawCount=0,playVisible=false,motionRequests=0,torchMode='hang',mediaResolver=null,playMode='reject',mediaRequests=0,torchCalls=0,presentedCount=0;
const downloads=[];let loadedModel=null;let clock=0,timerId=0;const timers=new Map(),realTimeout=globalThis.setTimeout;
const pause=()=>new Promise(resolve=>realTimeout(resolve,0));
Object.defineProperty(globalThis,'performance',{value:{now:()=>clock},configurable:true});
function requireWindowReceiver(receiver){if(receiver!==undefined&&receiver!==null&&receiver!==globalThis)throw new TypeError('Illegal invocation: Window API receiver')}
globalThis.setTimeout=function(fn,ms=0){requireWindowReceiver(this);timers.set(++timerId,{fn,at:clock+ms});return timerId};globalThis.clearTimeout=function(id){requireWindowReceiver(this);return timers.delete(id)};
const advance=ms=>{clock+=ms;for(const [id,t]of [...timers])if(t.at<=clock){timers.delete(id);t.fn()}};
const noModel=process.argv.includes('--no-model'),noOxygen=process.argv.includes('--no-oxygen');
let replayOxygen=false,clipOxygen=false,createdCanvases=0;const oxygenReplay=JSON.parse(fs.readFileSync('scripts/fixtures/pulse-lab-spo2-parity.json')).rgb;

function element(){const classes=new Set();return{dataset:{},replaceChildren(){},appendChild(){},textContent:'',value:'',disabled:false,checked:false,style:{},classList:{add(x){classes.add(x)},remove(x){classes.delete(x)},contains(x){return classes.has(x)},toggle(x,on){if(on)classes.add(x);else classes.delete(x)}},querySelectorAll:()=>Array.from({length:4},element),getContext:()=>({clearRect(){},beginPath(){},moveTo(){},lineTo(){drawCount++},stroke(){},drawImage(){},getImageData(){const p=new Uint8ClampedArray(16384);for(let i=0;i<p.length;i+=4){p[i]=covered?currentIntensity+40:100;p[i+1]=covered?currentIntensity:100;p[i+2]=covered?currentIntensity-20:100;p[i+3]=255}return{data:p}}}),click(){},play:async()=>{playVisible=!elements.get('#capture').classList.contains('hidden');if(playMode==='reject')throw Object.assign(Error('Playback blocked for test'),{name:'NotAllowedError'})},requestVideoFrameCallback(cb){frameCallback=cb;return 1},cancelVideoFrameCallback(){frameCallback=null},readyState:4,videoWidth:640,videoHeight:480,width:960,height:280};}
for(const m of html.matchAll(/id="([^"]+)"/g))elements.set('#'+m[1],element());elements.set('.stepper',element());
globalThis.document={hidden:false,addEventListener(type,fn){events.set(type,fn)},querySelector:s=>elements.get(s),createElement:tag=>{const el=element();if(tag==='canvas'&&++createdCanvases===2){const base=el.getContext;el.getContext=()=>{const context=base();const original=context.getImageData;context.getImageData=()=>{if(clipOxygen){const frame=original();for(let i=2;i<frame.data.length;i+=4)frame.data[i]=0;return frame}if(!replayOxygen)return original();const rgb=oxygenReplay[presentedCount%180],p=new Uint8ClampedArray(16384);for(let j=0;j<4096;j++){for(let c=0;c<3;c++)p[j*4+c]=Math.floor(rgb[c])+(j<Math.round((rgb[c]%1)*4096)?1:0);p[j*4+3]=255}return{data:p}};return context}}return el}};globalThis.window={addEventListener(){},removeEventListener(){}};globalThis.requestAnimationFrame=function(){requireWindowReceiver(this);return 1};globalThis.cancelAnimationFrame=function(){requireWindowReceiver(this)};
globalThis.DeviceMotionEvent={requestPermission(){motionRequests++;return Promise.resolve('granted')}};
elements.get('#channelSelect').value='rgb';elements.get('#traceMode').value='ac';elements.get('#invertTrace').checked=true;
let track={label:'Mock rear camera',getSettings:()=>({frameRate:30,torch:true}),getCapabilities:()=>({torch:[true,false]}),applyConstraints:()=>{torchCalls++;return torchMode==='hang'?new Promise(()=>{}):Promise.resolve()},stop(){cameraStopped=true}};
const mockStream=()=>({getVideoTracks:()=>[track],getTracks:()=>[track]});
Object.defineProperty(globalThis,'navigator',{value:{userAgent:'Software smoke test',mediaDevices:{getUserMedia:()=>{mediaRequests++;return new Promise(resolve=>{mediaResolver=resolve})},enumerateDevices:()=>new Promise(()=>{})}},configurable:true});
globalThis.fetch=async url=>{if(noOxygen&&url.includes('/spo2/'))throw Error('Test oxygen load failure');if(noModel&&url==='./model.json')throw Error('Test model load failure');if(url.startsWith('/api/'))return{ok:false,headers:{get:()=>''}};const value=JSON.parse(fs.readFileSync('pulse-lab/'+url.replace('./','')));if(url==='./model.json')loadedModel=value;return{ok:true,headers:{get:()=> 'application/json'},json:async()=>value}};
if(process.argv.includes('--standalone')){const {runInThisContext}=await import('node:vm');const portable=fs.readFileSync('pulse-lab/Pulse_Lab_S15_Jovey.html','utf8');const script=portable.match(/<script id="pulse-lab-portable">([\s\S]*?)<\/script>/);assert(script);runInThisContext(script[1]);}else await import('../pulse-lab/releases/S15-JOVEY-20261026/app.mjs');await pause();
assert.match(elements.get('#oxygenTraining').textContent,noOxygen?/could not load/:/6 participants/);
if(!noOxygen){elements.get('#oxygenDemo').onclick();assert.match(elements.get('#oxygenValue').textContent,/%/);assert.match(elements.get('#oxygenResultNote').textContent,/Stored held-out result/);assert.match(elements.get('#resultNote').textContent,/not your oxygen level/)}
assert.match(elements.get('#trainingStatus').textContent,noModel?/Model could not load/:/173 participants/);
assert(!html.includes('id="record"'),'No manual recording button in automatic flow');assert(html.indexOf('id="video"')<html.indexOf('id="plot"'),'Large video precedes waveform');
if(!noModel)elements.get('#sampleDemo').onclick();
const model=JSON.parse(fs.readFileSync('pulse-lab/model.json')),example=JSON.parse(fs.readFileSync('pulse-lab/examples.json'))[0],expected=predictVector(model,example.features);
if(!noModel){assert.equal(elements.get('#coldBp').textContent,`${expected[0].toFixed(1)}/${expected[1].toFixed(1)}`);assert(elements.get('#calibrate').disabled)}
if(process.argv.includes('--standalone')){assert(globalThis.__PULSE_LAB_ASSETS__['./model.json']);assert.equal(typeof elements.get('#start').onclick,'function');console.log('PASS: standalone HTML boots embedded models, renders source examples and wires camera controls');process.exit(0)}
// Unexpected errors before getUserMedia must produce visible feedback and allow retry.
const workingClearTimeout=globalThis.clearTimeout;globalThis.clearTimeout=()=>{throw new TypeError('Injected early startup failure')};
await elements.get('#start').onclick();assert.match(elements.get('#startupError').textContent,/Injected early startup failure/);assert(!elements.get('#startupError').classList.contains('hidden'));assert(!elements.get('#start').disabled);assert.equal(mediaRequests,0);
globalThis.clearTimeout=workingClearTimeout;
// Permission sheet temporarily hides the page, then permission is granted.
const opening=elements.get('#start').onclick();document.hidden=true;events.get('visibilitychange')();document.hidden=false;events.get('visibilitychange')();mediaResolver(mockStream());await opening;
await pause();assert(!cameraStopped);assert.match(elements.get('#startupError').textContent,/playback.*NotAllowedError/);assert(!elements.get('#resumeCamera').classList.contains('hidden'));playMode='resolve';elements.get('#resumeCamera').onclick();await pause();assert.equal(mediaRequests,1,'Resume reuses camera permission and stream');
assert(!cameraStopped,'Permission-popup visibility must not cancel startup');assert.equal(motionRequests,0,'No second motion permission popup');assert(playVisible);assert(frameCallback,'Torch and enumerateDevices may hang without blocking video');
assert.equal(torchCalls,0,'Do not request flash before the camera has produced frames');
const emit=t=>{assert(frameCallback,'Camera frame loop exists');advance(1000/30);if(!frameCallback)return;frameCallback(t*1000,{mediaTime:0,presentedFrames:++presentedCount,presentationTime:t*1000})};
for(let i=0;i<100;i++)emit(i/30);assert(drawCount>100);assert.equal(torchCalls,1,'Automatically request flash after arriving frames');assert(!elements.get('#cameraSelect').disabled,'Uncovered lens must not start capture');
covered=true;for(let i=100;i<260;i++){currentIntensity=110+12*Math.sin(i/30*1.2*2*Math.PI);emit(i/30)}assert(elements.get('#cameraSelect').disabled,'Finger contact starts recording without a tap');
covered=false;for(let i=260;i<320;i++)emit(i/30);assert(!elements.get('#cameraSelect').disabled,'Finger removal resets recording');
// No arbitrary deadline while the user is waiting for usable signal.
covered=false;advance(90000);assert(!cameraStopped,'Continuous capture must not end at a fixed deadline');assert(!elements.get('#capture').classList.contains('hidden'));
elements.get('#cancelCapture').onclick();assert(cameraStopped);
URL.createObjectURL=blob=>{downloads.push(blob);return 'blob:test'};URL.revokeObjectURL=()=>{};
const restart=async()=>{cameraStopped=false;covered=true;const pending=elements.get('#rescan').onclick();mediaResolver(mockStream());await pending;await pause()};
// Accumulate BP/HR while whole-frame blue is clipped, then lose contact.
torchMode='resolve';track={...track};clipOxygen=true;
let earlyPulseSeen=false,glitchSaved=null;await restart();for(let i=0;i<620&&!cameraStopped;i++){
  currentIntensity=110+12*Math.sin(i/30*1.2*2*Math.PI);
  if(i===420){glitchSaved=elements.get('#timer').textContent;covered=false}
  if(i===421)covered=true;
  emit(i/30);
  if(i===420||i===421){assert(elements.get('#cameraSelect').disabled,'A one-frame contact glitch must not restart capture');assert.equal(elements.get('#timer').textContent,glitchSaved,'Brief contact glitch preserves progress')}
  if(i<300&&Number(elements.get('#livePulse').textContent)>0)earlyPulseSeen=true;if(i%30===0)await pause();
}
assert(earlyPulseSeen,'Pulse must appear before the first complete accepted segment');
if(!noOxygen)assert(!cameraStopped);assert(Number(elements.get('#livePulse').textContent)>=71);assert(Number(elements.get('#livePulse').textContent)<=73);
if(!cameraStopped){const saved=elements.get('#timer').textContent;assert.notEqual(saved,'0 beats collected');covered=false;for(let i=620;i<680;i++)emit(i/30);assert.equal(elements.get('#pulseSource').textContent,'· saved estimate','A retained pulse is not labeled live');assert.equal(elements.get('#timer').textContent,saved,'Confirmed loss of contact preserves saved progress');}
covered=true;for(let i=680;i<1650&&!cameraStopped;i++){currentIntensity=110+12*Math.sin(i/30*1.2*2*Math.PI);emit(i/30);if(i%30===0)await pause()}
if(!noOxygen){
  assert(!cameraStopped,'BP/HR readiness must not cut off pending SpO2');
  assert.match(elements.get('#oxygenCapture').textContent,/Blue camera channel too dark/);
  if(!noModel)assert.match(elements.get('#captureHint').textContent,/BP \+ pulse ready/);
  assert(!elements.get('#partialReport').classList.contains('hidden'),'Available report remains accessible when BP is ready');
  elements.get('#partialReport').onclick();
}
assert(cameraStopped,'Available report or all loaded models complete');assert(!elements.get('#result').classList.contains('hidden'));assert.match(elements.get('#summaryDuration').textContent,/accepted beats/);assert.match(elements.get('#summaryPulse').textContent,/7[123] bpm/);assert.match(elements.get('#meanWaveCaption').textContent,/Median normalized pulse/);
elements.get('#downloadReport').onclick();const partialHTML=await downloads.at(-1).text();assert(partialHTML.includes('Median normalized pulse'));
if(!noOxygen){
  assert.match(elements.get('#oxygenResultNote').textContent,/Blue camera channel too dark/);
  assert.match(elements.get('#oxygenDiagnostic').textContent,/100.0% dark/);
  assert(partialHTML.includes('100.0% dark'));
  elements.get('#exportScan').onclick();const partial=JSON.parse(await downloads.at(-1).text());
  assert.equal(partial.oxygen.prediction,null);assert.equal(partial.completionTrigger,'requested_available_report');
  assert(partial.oxygen.audit.some(x=>x.code==='rgb_clipping'&&x.exposure.channels[2].darkMax===1));
}
clipOxygen=false;
if(noModel){assert.equal(elements.get('#coldBp').textContent,'— / —');assert.match(elements.get('#modelDataNote').textContent,/model unavailable/)}
else {
  assert.match(elements.get('#modelDataNote').textContent,/BP from/);
  const frozen=elements.get('#coldBp').textContent;elements.get('#calibrate').onclick();elements.get('#sys').value='121';elements.get('#dia').value='79';elements.get('#trustedCheck').checked=true;elements.get('#personalize').onclick();assert.equal(elements.get('#personalBp').textContent,frozen);
  // A signal outside the BP training range keeps scanning; an explicit pulse report is available.
  loadedModel.training_feature_min=Array(25).fill(-.01);loadedModel.training_feature_max=Array(25).fill(.01);
  await restart();for(let i=0;i<1500;i++){currentIntensity=110+12*Math.sin(i/30*1.2*2*Math.PI);emit(i/30)}
  assert(!cameraStopped);assert(!elements.get('#partialReport').classList.contains('hidden'));elements.get('#partialReport').onclick();assert(cameraStopped);assert.equal(elements.get('#coldBp').textContent,'— / —');assert.match(elements.get('#summaryPulse').textContent,/7[123] bpm/);
}
// Replay real source RGB through the new capture channel and full scan/report path.
if(!noOxygen){
  // Restore the real BP feature bounds after the domain-rejection scenario.
  if(loadedModel){loadedModel.training_feature_min=model.training_feature_min;loadedModel.training_feature_max=model.training_feature_max}
  replayOxygen=true;torchMode='resolve';track={...track};await restart();
  for(let i=0;i<1700&&!cameraStopped;i++){currentIntensity=110+12*Math.sin(i/30*1.2*2*Math.PI);emit(i/30);if(i%30===0)await pause()}
  assert(cameraStopped,`All loaded models should complete: ${elements.get('#oxygenCapture').textContent}`);
  assert.match(elements.get('#oxygenValue').textContent,/%/);
  elements.get('#exportScan').onclick();const exported=JSON.parse(await downloads.at(-1).text());
  assert.equal(exported.completionPolicy.version,'continuous-compatible-snippets-v4');
  if(!noModel)assert(exported.prediction,'Successful automatic report includes BP');
  assert(exported.oxygen.rgb.ready);assert(['r','g','b'].every(c=>exported.oxygen.rgb.channels[c].stability.ready));
  assert(exported.oxygen.waveformSegments.length>=3);
  assert(!elements.get('#rgbMeanPanel').classList.contains('hidden'));assert.match(elements.get('#rgbMeanCaption').textContent,/Synchronized RGB/);
  assert(exported.sessionSamples.some(s=>s.oxygenWhole&&s.oxygenRegions.length===10));
  assert(exported.oxygen.prediction.segments>=3);assert.equal(exported.oxygen.prediction.phoneValidated,false);
  elements.get('#downloadReport').onclick();const report=await downloads.at(-1).text();assert(report.includes('Experimental SpO₂'));assert(report.includes('Synchronized RGB waveforms'));assert(report.includes('whole-frame training data'));assert(report.includes('6.37'));replayOxygen=false;
}
// Loss of visibility stops hardware and retains a clearly partial summary.
await restart();for(let i=0;i<400;i++){currentIntensity=110+12*Math.sin(i/30*1.2*2*Math.PI);emit(i/30)}
assert.notEqual(elements.get('#livePulse').textContent,'—');document.hidden=true;events.get('visibilitychange')();assert(cameraStopped);assert(!elements.get('#result').classList.contains('hidden'));document.hidden=false;
// Explicit cancellation still invalidates an in-flight permission request.
cameraStopped=false;const pending=elements.get('#start').onclick();elements.get('#cancelCapture').onclick();mediaResolver(mockStream());await pending;assert(cameraStopped);assert.equal(elements.get('#video').srcObject,null);assert(!elements.get('#start').classList.contains('hidden'));
console.log(JSON.stringify({status:'passed',model:noModel?'unavailable':'loaded',checks:['SpO2 model load/failure and stored held-out demo','simultaneous RGB display, per-colour stability and snippet provenance','real RGB to SpO2 scan, JSON and HTML export','Window receiver and startup recovery','permission-popup survival','continuous capture without an arbitrary deadline','early pulse and accepted beat summary','one-frame contact glitch does not reset capture','saved snippets survive confirmed finger loss with separate groups','BP/HR readiness waits for SpO2; explicit available report remains accessible','blue clipping diagnosis in live view, audit, JSON and HTML','automatic report includes every loaded model','median waveform and download','original BP and cuff flow','BP-domain failure keeps scanning with explicit pulse report','no-model pulse report','visibility interruption','cancellation']}));
