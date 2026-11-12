import { createNetworkControls } from './network-core.mjs';
const button = document.querySelector('#run');
const status = document.querySelector('#status');
const results = document.querySelector('#results');
button.addEventListener('click', async () => {
  button.disabled = true; results.replaceChildren();
  const row = value => { const li = document.createElement('li'); li.textContent = value; results.append(li); };
  try {
    const state = await createNetworkControls(chrome.declarativeNetRequest).read();
    row(state.available ? 'PASS — Bundled filter is enabled' : 'FAIL — Bundled filter is disabled');
    row(state.paused ? 'NOTICE — Network blocking is paused' : 'PASS — Network blocking is not paused');
    row('INFO — Website exceptions: ' + state.exceptions.length);
    await chrome.storage.local.get('appearance');
    row('PASS — Local settings are readable');
    const activity = await chrome.runtime.sendMessage({ type: 'getActivity' });
    if (activity?.error || activity?.mode !== 'native-badge') throw new Error(activity?.error || 'Page counter unavailable');
    row('PASS — Chrome’s per-page toolbar counter is enabled');
    status.textContent = state.available && !state.paused ? 'Configuration checks complete' : 'Configuration checks complete — review notices';
  } catch (error) { status.textContent = 'Checks could not finish: ' + error.message; }
  finally { button.disabled = false; }
});
