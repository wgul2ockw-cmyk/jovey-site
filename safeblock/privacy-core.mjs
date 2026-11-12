// Chrome owns these settings. No cookie, page, or browsing data is read or saved.
export const protections = Object.freeze([
  { group: "websites", key: "thirdPartyCookiesAllowed", title: "Third-party cookies",
    detail: "Use Chrome’s third-party cookie blocking policy. Cookies for the site you visit remain available. Chrome exceptions can still allow cross-site cookies.",
    protectedLabel: "Blocking policy on", unprotectedLabel: "Blocking policy off" },
  { group: "websites", key: "hyperlinkAuditingEnabled", title: "Link-click reports",
    detail: "Disable the extra reports sent by links that use the HTML ping feature. Other click-tracking methods may still operate." },
  { group: "network", key: "networkPredictionEnabled", title: "Page preloading",
    detail: "Turn off Chrome’s predictive loading of pages you have not opened. Websites can still make their own connections." },
  { group: "websites", key: "topicsEnabled", title: "Ad topics",
    detail: "Disable the browser feature that shares inferred interests with websites, if this Chrome version supports it." },
  { group: "websites", key: "fledgeEnabled", title: "Site-suggested ads",
    detail: "Disable the browser’s interest-group advertising feature, if supported." },
  { group: "websites", key: "adMeasurementEnabled", title: "Ad measurement",
    detail: "Disable Chrome’s advertising attribution and private aggregation APIs, if supported. This does not block every analytics service." }
].map(item => Object.freeze(item)));

const permission = { permissions: ["privacy"] };
const controllable = new Set(["controllable_by_this_extension", "controlled_by_this_extension"]);

export function createPrivacyControls(api) {
  const settingFor = spec => api.privacy?.[spec.group]?.[spec.key];

  async function read() {
    const granted = await api.permissions.contains(permission);
    const items = await Promise.all(protections.map(async spec => {
      if (!granted) return { ...spec, status: "permission-required" };
      const setting = settingFor(spec);
      if (!setting) return { ...spec, status: "unsupported" };
      try {
        const details = await setting.get({ incognito: false });
        if (typeof details.value !== "boolean") throw new Error("Chrome returned an unexpected setting value.");
        return { ...spec, status: details.value === false ? "protected" : "unprotected",
          levelOfControl: details.levelOfControl };
      } catch (error) {
        return { ...spec, status: "error", error: error.message };
      }
    }));
    return { granted, items };
  }

  async function enable() {
    // Permission must already be granted by a button click; never request it on load.
    if (!await api.permissions.contains(permission)) throw new Error("Privacy permission was not granted. No settings were changed.");
    const errors = [];
    for (const spec of protections) {
      const setting = settingFor(spec);
      if (!setting) continue;
      try {
        const details = await setting.get({ incognito: false });
        if (typeof details.value !== "boolean") throw new Error("Unexpected setting value.");
        if (!controllable.has(details.levelOfControl)) continue;
        await setting.set({ value: false, scope: "regular" });
      } catch (error) {
        errors.push(spec.title + ": " + error.message);
      }
    }
    // Always read back the effective values; another extension or policy can win.
    return { ...await read(), errors };
  }

  async function releaseOne(key) {
    const spec = protections.find(item => item.key === key);
    if (!spec) throw new Error("Unknown privacy control.");
    if (!await api.permissions.contains(permission)) return read();
    const setting = settingFor(spec);
    if (setting) await setting.clear({ scope: "regular" });
    // Clear only our override. Never set true or overwrite the user's preference.
    return read();
  }

  async function releaseAll() {
    if (!await api.permissions.contains(permission)) return read();
    const errors = [];
    for (const spec of protections) {
      const setting = settingFor(spec);
      if (!setting) continue;
      try { await setting.clear({ scope: "regular" }); }
      catch (error) { errors.push(spec.title + ": " + error.message); }
    }
    // Keep access on a clear failure so the user can retry releasing our overrides.
    if (!errors.length) {
      const removed = await api.permissions.remove(permission);
      if (!removed) errors.push("Chrome did not release the privacy permission. Please retry.");
    }
    return { ...await read(), errors };
  }

  return { read, enable, releaseOne, releaseAll };
}

export function summarizePrivacy(state) {
  if (!state.granted) return "Additional privacy controls are not enabled in SafeBlock.";
  const available = state.items.filter(item => item.status !== "unsupported");
  const active = available.filter(item => item.status === "protected").length;
  if (!available.length) return "These controls are unavailable in this Chrome version.";
  return active + " of " + available.length + " available settings are in the protective state.";
}
