import { bannerPermission, createBannerControls } from "./banner-controls.mjs";
const controls = createBannerControls(chrome);
const enable = document.querySelector("#enable-banners");
const disable = document.querySelector("#disable-banners");
const status = document.querySelector("#banner-status");
const message = document.querySelector("#banner-message");
const error = document.querySelector("#banner-error");
let busy = false;
async function refresh() {
  try {
    const state = await controls.read();
    status.textContent = state.enabled ? "Automatic cookie rejection is on." : "Automatic cookie rejection is off.";
    enable.disabled = busy || state.enabled;
    disable.disabled = busy || (!state.granted && !state.scriptAccess && !state.enabled);
  } catch (failure) {
    error.textContent = "Could not verify cookie pop-up handling: " + failure.message;
    enable.disabled = busy;
    disable.disabled = busy;
  }
}
async function run(action, success) {
  if (busy) return;
  busy = true; enable.disabled = true; disable.disabled = true;
  message.textContent = "Applying your choice…"; error.textContent = "";
  try { await action(); message.textContent = success; }
  catch (failure) { error.textContent = failure.message; message.textContent = ""; }
  finally { busy = false; await refresh(); }
}
enable.addEventListener("click", () => {
  if (busy) return;
  const granted = chrome.permissions.request(bannerPermission);
  run(async () => {
    if (!await granted) throw new Error("Website access declined. Automatic rejection remains off.");
    return controls.enable();
  }, "Enabled. Reload open websites to start automatic rejection.");
});
disable.addEventListener("click", () => run(() => controls.disable(),
  "Automatic rejection is off and its website access has been removed. Reload a page if needed."));
window.addEventListener("focus", () => { if (!busy) refresh(); });
chrome.permissions.onRemoved.addListener(() => { if (!busy) refresh(); });
refresh();
