export function createNetworkControls(dnr) {
  async function read() {
    const [rules, enabled] = await Promise.all([dnr.getDynamicRules(), dnr.getEnabledRulesets()]);
    return { paused: rules.some(rule => rule.id === 1), available: enabled.includes("bundled"),
      exceptions: rules.filter(rule => rule.id >= 1000 && rule.condition.initiatorDomains?.length)
        .map(rule => ({ id: rule.id, domain: rule.condition.initiatorDomains[0] })) };
  }
  async function toggle() {
    const state = await read();
    if (!state.available) throw new Error("Reload SafeBlock in Chrome’s Extensions page to restore its rules.");
    await dnr.updateDynamicRules({ removeRuleIds: [1], addRules: state.paused ? [] : [{
      id: 1, priority: 1000000, action: { type: "allow" }, condition: { urlFilter: "*" }
    }] });
    return read();
  }
  async function allow(value) {
    const domain = value.trim().toLowerCase().replace(/\.$/, "");
    const labels = domain.split(".");
    if (domain.length > 253 || labels.length < 2 || labels.some(label =>
      !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
      throw new Error("Enter a domain like example.com, without https:// or a page path.");
    }
    const rules = await dnr.getDynamicRules();
    if (!rules.some(rule => rule.condition.initiatorDomains?.[0] === domain)) {
      await dnr.updateDynamicRules({ addRules: [{ id: Math.max(999, ...rules.map(rule => rule.id)) + 1,
        priority: 1000, action: { type: "allow" }, condition: { initiatorDomains: [domain] } }] });
    }
    return read();
  }
  async function remove(id) {
    if (!(await read()).exceptions.some(item => item.id === id)) throw new Error("This website exception no longer exists.");
    await dnr.updateDynamicRules({ removeRuleIds: [id] });
    return read();
  }
  return { read, toggle, allow, remove };
}
