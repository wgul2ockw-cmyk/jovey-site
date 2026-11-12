// Production counter: Chrome owns and displays the per-page DNR count.
// No request listener, URL sampling, or inferred lifetime totals.
export function createActivityControls(api) {
  async function enableBadge() {
    await api.declarativeNetRequest.setExtensionActionOptions({ displayActionCountAsBadgeText: true });
  }
  async function read() {
    const { blockTotals } = await api.storage.local.get('blockTotals');
    const valid = blockTotals && Number.isSafeInteger(blockTotals.lifetime) && blockTotals.lifetime >= 0 &&
      Number.isFinite(blockTotals.since) && blockTotals.since > 0;
    return { mode: 'native-badge', historical: valid ? { lifetime: blockTotals.lifetime, since: blockTotals.since } : null };
  }
  return { enableBadge, read };
}
