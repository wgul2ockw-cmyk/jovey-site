/* Privacy-first visitor analytics via Cloudflare Web Analytics. */
"use strict";

(() => {
  const token = document
    .querySelector('meta[name="cloudflare-web-analytics-token"]')
    ?.content.trim();

  // Keep local development and unconfigured deployments free of network calls.
  if (!token) return;

  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) {
    console.warn("Cloudflare Web Analytics token is invalid; tracking is disabled.");
    return;
  }

  const beacon = document.createElement("script");
  beacon.type = "module";
  beacon.src = "https://static.cloudflareinsights.com/beacon.min.js";
  beacon.dataset.cfBeacon = JSON.stringify({ token, spa: false });
  document.head.append(beacon);
})();
