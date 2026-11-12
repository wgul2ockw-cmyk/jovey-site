import { createNetworkControls } from './network-core.mjs';
export function siteFromTab(tab) {
  if (!tab || !Number.isInteger(tab.id) || typeof tab.url !== 'string') return null;
  let url; try { url = new URL(tab.url); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.hostname === 'chromewebstore.google.com' ||
      (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore'))) return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host.length > 253 || !host.includes('.') || host.split('.').some(label=>!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
  return {tabId:tab.id,host};
}
export function createSiteControls(api) {
 const network = createNetworkControls(api.declarativeNetRequest);
 async function current() { const [tab] = await api.tabs.query({active:true,currentWindow:true});return siteFromTab(tab); }
 async function read() {
  const [site,state] = await Promise.all([current(),network.read()]);
  const matches=site ? state.exceptions.filter(item=>site.host===item.domain || site.host.endsWith('.'+item.domain)) : [];
  return {site,...state, matches, inherited:matches.some(item=>site.host!==item.domain)};
 }
 async function toggle(expected) {
  const state=await read();
  if(!state.site || state.site.tabId!==expected?.tabId || state.site.host!==expected?.host) throw new Error('The page changed. Reopen SafeBlock before changing this site.');
  if(!state.available) throw new Error('The bundled filter is unavailable. Reload SafeBlock.');
  if(state.inherited) throw new Error('This site is allowed by a parent-domain exception. Manage it in Allowed websites.');
  if(state.matches.length) for(const item of state.matches) await network.remove(item.id);
  else await network.allow(state.site.host);
  return read();
 }
 async function count(site) {
  if(!site) return null;
  // activeTab is granted when the user opens this popup. Chrome may return a
  // placeholder when it withholds the count; never turn that into a fake zero.
  await api.declarativeNetRequest.setExtensionActionOptions({displayActionCountAsBadgeText:true});
  const raw=await api.action.getBadgeText({tabId:site.tabId});
  if(raw==='') return 0;
  if(!/^\d+$/.test(raw)) return null;
  const value=Number(raw);return Number.isSafeInteger(value)?value:null;
 }
 return {read,toggle,count};
}
