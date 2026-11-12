import { createSiteControls } from './site-core.mjs';
import { createNetworkControls } from './network-core.mjs';
import { createPrivacyControls } from './privacy-core.mjs';
import { createBannerControls } from './banner-controls.mjs';
import { createYouTubeControls } from './youtube-controls.mjs';
const $=selector=>document.querySelector(selector);
const site=createSiteControls(chrome),network=createNetworkControls(chrome.declarativeNetRequest);
let current=null,busy=false;
const stateText=(id,text,active)=>{const node=$(id);node.textContent=text;node.dataset.active=String(active);};
async function refresh(){
 if(busy)return;busy=true;$('#refresh').disabled=true;$('#site-toggle').disabled=true;$('#pause-all').disabled=true;$('#popup-error').textContent='';
 const failures=[];
 try{
  current=await site.read();
  const label=!current.available?'Needs attention':current.paused?'Blocking paused':current.matches.length?'Allowed on this site':'Blocking is on';
  $('#status-text').textContent=label;$('#site-status').dataset.state=!current.available?'error':current.paused||current.matches.length?'paused':'active';
  $('#site-name').textContent=current.site?.host || 'Open a website to use site controls';
  $('#site-name').title=current.site?.host || '';
  $('#site-toggle').textContent=current.inherited?'Manage website exception':current.matches.length?'Block on this site':'Allow on this site';
  $('#site-toggle').disabled=!current.site || !current.available || current.inherited;
  $('#site-note').textContent=current.inherited?'Allowed by a parent domain. Change it in Dashboard → Allowed websites.':current.paused?'All network blocking is paused. Resume it below; privacy and page controls stay separate.':'Network blocking only; includes subdomains. Cookie rejection and YouTube stay separate.';
  $('#pause-all').textContent=current.paused?'Resume all blocking':'Pause all blocking';$('#pause-all').disabled=!current.available;
  try{const count=await site.count(current.site);$('#page-count').textContent=count===null?(current.site?'See icon':'—'):count.toLocaleString();}
  catch{ $('#page-count').textContent='Unavailable';failures.push('Page count unavailable.'); }
 }catch(error){current=null;$('#status-text').textContent='Status unavailable';$('#site-status').dataset.state='error';$('#page-count').textContent='—';failures.push(error.message);}
 await Promise.all([
  createPrivacyControls(chrome).read().then(state=>{const items=state.items.filter(item=>item.status!=='unsupported');const active=items.filter(item=>item.status==='protected').length;stateText('#privacy-state',!state.granted?'Off':!items.length?'Unavailable':`${active} / ${items.length}`,state.granted&&items.length>0&&active===items.length);},()=>{stateText('#privacy-state','Check',false);failures.push('Privacy status unavailable.');}),
  createBannerControls(chrome).read().then(state=>stateText('#banner-state',state.enabled?'On':'Off',state.enabled),()=>{stateText('#banner-state','Check',false);failures.push('Cookie rejection status unavailable.');}),
  createYouTubeControls(chrome).read().then(state=>stateText('#youtube-state',state.enabled?'On':'Off',state.enabled),()=>{stateText('#youtube-state','Check',false);failures.push('YouTube status unavailable.');})
 ]);
 $('#popup-error').textContent=failures.join(' ');$('#checked-status').textContent=failures.length?'Check status':'Checked just now';$('#refresh').disabled=false;busy=false;
}
$('#refresh').addEventListener('click',refresh);
$('#site-toggle').addEventListener('click',async()=>{
 if(busy||!current?.site)return;busy=true;$('#site-toggle').disabled=true;const expected=current.site;
 try{const result=await site.toggle(expected);$('#popup-message').textContent=result.matches.length?'Site allowed. Reload this website.':result.paused?'Exception removed. Resume all blocking below.':'Blocking restored. Reload this website.';}
 catch(error){$('#popup-message').textContent=error.message;}
 finally{busy=false;await refresh();}
});
$('#pause-all').addEventListener('click',async()=>{if(busy)return;busy=true;$('#pause-all').disabled=true;
 try{await network.toggle();$('#popup-message').textContent='Network setting updated. Reload pages to apply.';}
 catch(error){$('#popup-message').textContent=error.message;}
 finally{busy=false;await refresh();}
});
refresh();
