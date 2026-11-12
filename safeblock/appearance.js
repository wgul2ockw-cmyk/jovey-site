"use strict";
// Appearance is the only UI preference saved. System is the default.
(() => {
  const valid = value => ["system", "light", "dark"].includes(value) ? value : "system";
  function apply(value) {
    const choice = valid(value);
    document.documentElement.dataset.appearance = choice;
    document.querySelectorAll("[data-appearance]").forEach(select => { select.value = choice; });
  }
  async function load() {
    try { apply((await chrome.storage.local.get("appearance")).appearance); }
    catch { apply("system"); }
  }
  document.addEventListener("DOMContentLoaded", () => {
    load();
    document.querySelectorAll("[data-appearance]").forEach(select => {
      select.addEventListener("change", async () => {
        const value = valid(select.value);
        try { await chrome.storage.local.set({ appearance: value }); apply(value); }
        catch { await load(); }
      });
    });
    const version = chrome.runtime.getManifest().version;
    document.querySelectorAll("[data-version]").forEach(node => { node.textContent = "v" + version; });
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.appearance) apply(changes.appearance.newValue);
  });
  load();
})();
