// Design preview only. This file is never shipped in the extension package.
(() => {
  const events = () => { const listeners=[];return {addListener:fn=>listeners.push(fn),emit:(...args)=>listeners.forEach(fn=>fn(...args))}; };
  const stored = sessionStorage.getItem('safeblock-design-preview');
  const state = stored ? JSON.parse(stored) : { local:{cookieBannerEnabled:true,youtubeEnabled:true,appearance:'system'}, rules:[], granted:['privacy','scripting'], origins:['http://*/*','https://*/*'], registrations:[{id:'quietblock-cookie-reject'},{id:'quietblock-youtube-data'},{id:'quietblock-youtube-player'}], settings:{} };
  const save=()=>sessionStorage.setItem('safeblock-design-preview',JSON.stringify(state));
  const changed=events(),added=events(),removed=events();
  const api={tabs:{query:async()=>[{id:1,url:'https://example.com/'}]},action:{getBadgeText:async()=> '12'},
    storage:{local:{get:async key=> typeof key==='string'?{[key]:state.local[key]}:{...state.local},set:async values=>{const changes={};for(const [key,value] of Object.entries(values)){changes[key]={oldValue:state.local[key],newValue:value};state.local[key]=value;}save();changed.emit(changes,'local');}},onChanged:changed},
    runtime:{getManifest:()=>({version:'1.7.0'}),sendMessage:async()=>location.pathname.endsWith('checks.html')?{error:'Open the installed extension for configuration checks. This website is only a preview.'}:{mode:'native-badge',historical:null}},
    permissions:{contains:async permission=>(permission.permissions||[]).every(p=>state.granted.includes(p))&&(permission.origins||[]).every(p=>state.origins.includes(p)||(p.startsWith('https://')&&state.origins.includes('https://*/*'))),request:async permission=>{state.granted=[...new Set([...state.granted,...(permission.permissions||[])])];state.origins=[...new Set([...state.origins,...(permission.origins||[])])];save();added.emit(permission);return true;},remove:async permission=>{state.granted=state.granted.filter(x=>!permission.permissions?.includes(x));state.origins=state.origins.filter(x=>!permission.origins?.includes(x));if(permission.permissions?.includes('scripting')){state.registrations=[];state.local.youtubeEnabled=false;}save();removed.emit(permission);return true;},onAdded:added,onRemoved:removed},
    scripting:{getRegisteredContentScripts:async({ids})=>state.registrations.filter(s=>ids.includes(s.id)),registerContentScripts:async scripts=>{state.registrations.push(...scripts);save();},updateContentScripts:async scripts=>{for(const s of scripts)state.registrations=state.registrations.map(p=>p.id===s.id?s:p);save();},unregisterContentScripts:async({ids})=>{state.registrations=state.registrations.filter(p=>!ids.includes(p.id));save();}},
    declarativeNetRequest:{setExtensionActionOptions:async()=>{},getDynamicRules:async()=>structuredClone(state.rules),getEnabledRulesets:async()=>['bundled'],updateDynamicRules:async({removeRuleIds=[],addRules=[]})=>{state.rules=state.rules.filter(p=>!removeRuleIds.includes(p.id));state.rules.push(...addRules);save();},testMatchOutcome:async()=>{throw new Error('Open the installed extension to run Chrome’s real rule checks. Diagnostics are not simulated in this design preview.');}},
    privacy:{websites:{},network:{}}
  };
  const settings={websites:['thirdPartyCookiesAllowed','hyperlinkAuditingEnabled','topicsEnabled','fledgeEnabled','adMeasurementEnabled'],network:['networkPredictionEnabled']};
  for(const [group,keys] of Object.entries(settings))for(const key of keys){api.privacy[group][key]={get:async()=>state.settings[key]||{value:false,levelOfControl:'controlled_by_this_extension'},set:async({value})=>{state.settings[key]={value,levelOfControl:'controlled_by_this_extension'};save();},clear:async()=>{state.settings[key]={value:true,levelOfControl:'controllable_by_this_extension'};save();}};}
  globalThis.chrome=api;
  document.addEventListener('DOMContentLoaded',()=>{
    const banner=document.createElement('div');banner.className='design-preview-notice';const label=document.createElement('span');label.textContent='Interactive preview · Sample data · This page does not block ads';const link=document.createElement('a');link.href='install.html';link.textContent='Install Chrome extension →';banner.append(label,link);document.body.prepend(banner);
  });
})();
