export const bannerPermission = Object.freeze({
  permissions: ["scripting"], origins: ["http://*/*", "https://*/*"]
});
export const bannerScriptId = "quietblock-cookie-reject";
const script = {
  id: bannerScriptId, matches: bannerPermission.origins,
  js: ["consent-engine.js", "consent-content.js"],
  runAt: "document_idle", world: "ISOLATED", allFrames: true,
  persistAcrossSessions: true
};

export function createBannerControls(api) {
  async function read() {
    const granted = await api.permissions.contains(bannerPermission);
    const scriptAccess = await api.permissions.contains({ permissions: ["scripting"] });
    const { cookieBannerEnabled } = await api.storage.local.get("cookieBannerEnabled");
    const registrations = granted ? await api.scripting.getRegisteredContentScripts({ ids: [bannerScriptId] }) : [];
    const registered = registrations.some(item => item.id === bannerScriptId);
    return { granted, scriptAccess, registered, enabled: granted && registered && cookieBannerEnabled === true };
  }

  async function enable() {
    if (!await api.permissions.contains(bannerPermission)) {
      throw new Error("Website access was not granted. Cookie pop-up handling stays off.");
    }
    await api.storage.local.set({ cookieBannerEnabled: false });
    const current = await api.scripting.getRegisteredContentScripts({ ids: [bannerScriptId] });
    if (current.length) await api.scripting.updateContentScripts([script]);
    else await api.scripting.registerContentScripts([script]);
    await api.storage.local.set({ cookieBannerEnabled: true });
    const state = await read();
    if (!state.enabled) throw new Error("Chrome did not activate cookie pop-up handling.");
    return state;
  }

  async function disable() {
    // Existing page scripts must stop too; unregistering affects future pages only.
    await api.storage.local.set({ cookieBannerEnabled: false });
    if (await api.permissions.contains({ permissions: ["scripting"] })) {
      const current = await api.scripting.getRegisteredContentScripts({ ids: [bannerScriptId] });
      if (current.length) await api.scripting.unregisterContentScripts({ ids: [bannerScriptId] });
    }
    const removed = await api.permissions.remove(bannerPermission);
    if (!removed && await api.permissions.contains(bannerPermission)) {
      throw new Error("Automatic rejection is off, but Chrome did not release website access. Retry or remove access in Chrome’s extension settings.");
    }
    return read();
  }

  async function reconcile() {
    const { cookieBannerEnabled } = await api.storage.local.get("cookieBannerEnabled");
    if (cookieBannerEnabled === true && await api.permissions.contains(bannerPermission)) {
      const state = await read();
      return state.registered ? state : enable();
    }
    // Do not request or silently re-enable revoked permission.
    await api.storage.local.set({ cookieBannerEnabled: false });
    if (await api.permissions.contains({ permissions: ["scripting"] })) {
      const current = await api.scripting.getRegisteredContentScripts({ ids: [bannerScriptId] });
      if (current.length) await api.scripting.unregisterContentScripts({ ids: [bannerScriptId] });
    }
    return read();
  }
  return { read, enable, disable, reconcile };
}
