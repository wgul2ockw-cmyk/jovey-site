export const youtubePermission = {
  permissions: ["scripting"],
  origins: ["https://www.youtube.com/*", "https://m.youtube.com/*", "https://www.youtube-nocookie.com/*"]
};
const ids = ["quietblock-youtube-data", "quietblock-youtube-player"];
const scripts = [
  { id: ids[0], matches: youtubePermission.origins, js: ["youtube-data.js", "youtube-main.js"],
    runAt: "document_start", world: "MAIN", allFrames: true, persistAcrossSessions: true },
  { id: ids[1], matches: youtubePermission.origins, js: ["youtube-player.js", "youtube-content.js"],
    runAt: "document_idle", world: "ISOLATED", allFrames: true, persistAcrossSessions: true }
];
export function createYouTubeControls(api) {
  async function read() {
    const granted = await api.permissions.contains(youtubePermission);
    const { youtubeEnabled } = await api.storage.local.get("youtubeEnabled");
    const registered = granted ? await api.scripting.getRegisteredContentScripts({ ids }) : [];
    return { granted, enabled: granted && youtubeEnabled === true && ids.every(id => registered.some(s => s.id === id)) };
  }
  async function enable() {
    if (!await api.permissions.contains(youtubePermission)) throw new Error("YouTube access has not been granted.");
    await api.storage.local.set({ youtubeEnabled: false });
    const registered = await api.scripting.getRegisteredContentScripts({ ids });
    if (registered.length) await api.scripting.unregisterContentScripts({ ids: registered.map(s => s.id) });
    await api.scripting.registerContentScripts(scripts);
    await api.storage.local.set({ youtubeEnabled: true });
    const state = await read();
    if (!state.enabled) throw new Error("Chrome did not activate the YouTube module.");
    return state;
  }
  async function disable() {
    await api.storage.local.set({ youtubeEnabled: false });
    if (await api.permissions.contains({ permissions: ["scripting"] })) {
      const registered = await api.scripting.getRegisteredContentScripts({ ids });
      if (registered.length) await api.scripting.unregisterContentScripts({ ids: registered.map(s => s.id) });
    }
    return read();
  }
  async function reconcile() {
    const { youtubeEnabled } = await api.storage.local.get("youtubeEnabled");
    if (youtubeEnabled === true && await api.permissions.contains(youtubePermission)) {
      return (await read()).enabled ? read() : enable();
    }
    return disable();
  }
  return { read, enable, disable, reconcile };
}
