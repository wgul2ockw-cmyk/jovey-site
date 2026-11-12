import { createNetworkControls } from "./network-core.mjs";
import { createPrivacyControls } from "./privacy-core.mjs";
import { createBannerControls } from "./banner-controls.mjs";
import { createYouTubeControls } from "./youtube-controls.mjs";

const network = createNetworkControls(chrome.declarativeNetRequest);
const text = (selector, value) => document.querySelectorAll(selector).forEach(node => { node.textContent = value; });
function badge(selector, label, state) {
  document.querySelectorAll(selector).forEach(node => { node.textContent = label; node.dataset.state = state; });
}
let busy = false;
async function renderNetwork() {
  try {
    const state = await network.read();
    const label = !state.available ? "Needs attention" : state.paused ? "Blocking paused" : "Blocking is on";
    text("[data-network-status]", label);
    document.querySelectorAll("[data-network-panel]").forEach(node => {
      node.dataset.state = !state.available ? "error" : state.paused ? "paused" : "active";
    });
    text("[data-network-detail]", !state.available ? "Reload SafeBlock in Chrome’s Extensions page." :
      state.paused ? "Ad and tracker requests are currently allowed." : "Known ads and trackers are blocked on this device.");
    document.querySelectorAll("[data-toggle-network]").forEach(button => {
      button.disabled = busy || !state.available;
      button.setAttribute("aria-label", state.paused ? "Resume network blocking" : "Pause network blocking");
      button.textContent = state.paused ? "Resume blocking" : "Pause blocking";
    });
    text("[data-exception-count]", state.exceptions.length ? `${state.exceptions.length} allowed` : "No exceptions");
  } catch (error) {
    text("[data-network-status]", "Status unavailable");
    text("#network-error", error.message);
    document.querySelectorAll("[data-toggle-network]").forEach(button => { button.disabled = true; });
    document.querySelectorAll("[data-network-panel]").forEach(node => { node.dataset.state = "error"; });
  }
}
document.querySelectorAll("[data-toggle-network]").forEach(button => button.addEventListener("click", async () => {
  if (busy) return;
  busy = true; button.disabled = true; text("#network-error", "");
  try { await network.toggle(); }
  catch (error) { text("#network-error", error.message); }
  finally { busy = false; await renderNetwork(); }
}));

async function renderTotals() {
  try {
    const state = await chrome.runtime.sendMessage({ type: "getActivity" });
    if (state?.error || state?.mode !== "native-badge") throw new Error(state?.error || "Chrome did not confirm the page counter.");
    text("[data-page-counter]", "On icon");
    text("[data-counter-detail]", "Pin SafeBlock to see Chrome’s blocked-request count for each page.");
    document.querySelectorAll("[data-history]").forEach(node => { node.hidden = !state.historical; });
    if (state.historical) {
      text("[data-historical-total]", state.historical.lifetime.toLocaleString());
      text("[data-history-since]", "Recorded by the earlier developer build, starting " + new Date(state.historical.since).toLocaleDateString());
    }
    text("#counter-error", "");
  } catch (error) {
    text("[data-page-counter]", "Unavailable");
    text("[data-counter-detail]", "Reload SafeBlock in Chrome’s Extensions page.");
    text("#counter-error", "Page counter unavailable. " + error.message);
  }
}
async function renderFeatures() {
  await Promise.allSettled([
    createPrivacyControls(chrome).read().then(state => {
      const available = state.items.filter(item => item.status !== "unsupported");
      const active = available.filter(item => item.status === "protected").length;
      badge("[data-privacy-badge]", !state.granted ? "Set up" : !available.length ? "Unavailable" : `${active} / ${available.length} active`,
        state.granted && available.length && active === available.length ? "active" : "off");
    }, () => badge("[data-privacy-badge]", "Check status", "error")),
    createBannerControls(chrome).read().then(state => badge("[data-banner-badge]", state.enabled ? "On" : "Off", state.enabled ? "active" : "off"),
      () => badge("[data-banner-badge]", "Check status", "error")),
    createYouTubeControls(chrome).read().then(state => badge("[data-youtube-badge]", state.enabled ? "On" : "Off", state.enabled ? "active" : "off"),
      () => badge("[data-youtube-badge]", "Check status", "error"))
  ]);
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.blockTotals) renderTotals();
  if (area === "local" && (changes.cookieBannerEnabled || changes.youtubeEnabled)) renderFeatures();
});
window.addEventListener("focus", () => { if (!busy) { renderNetwork(); renderFeatures(); renderTotals(); } });
renderNetwork(); renderTotals(); renderFeatures();
