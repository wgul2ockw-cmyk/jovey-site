import { createYouTubeControls, youtubePermission } from "./youtube-controls.mjs";
const controls = createYouTubeControls(chrome);
const enable = document.querySelector("#enable-youtube"), disable = document.querySelector("#disable-youtube");
const status = document.querySelector("#youtube-status"), message = document.querySelector("#youtube-message"), error = document.querySelector("#youtube-error");
let busy = false;
async function refresh() {
  try {
    const state = await controls.read();
    status.textContent = state.enabled ? "Experimental YouTube filtering is on." : "YouTube filtering is off.";
    enable.disabled = busy || state.enabled; disable.disabled = busy || !state.enabled;
  } catch (failure) { error.textContent = failure.message; enable.disabled = busy; disable.disabled = busy; }
}
async function run(action) {
  if (busy) return;
  busy = true; enable.disabled = true; disable.disabled = true; error.textContent = "";
  try { await action(); message.textContent = "Updated. Reload open YouTube tabs."; }
  catch (failure) { error.textContent = failure.message; }
  finally { busy = false; await refresh(); }
}
enable.addEventListener("click", () => {
  const grant = chrome.permissions.request(youtubePermission);
  run(async () => { if (!await grant) throw new Error("YouTube access was not granted."); return controls.enable(); });
});
disable.addEventListener("click", () => run(() => controls.disable()));
window.addEventListener("focus", () => { if (!busy) refresh(); });
refresh();
