/* Privacy-first site traffic analytics via Cloudflare Web Analytics. */
"use strict";

(() => {
  if (document.querySelector('script[src="https://static.cloudflareinsights.com/beacon.min.js"]')) return;

  const beacon = document.createElement("script");
  beacon.type = "module";
  beacon.src = "https://static.cloudflareinsights.com/beacon.min.js";
  beacon.dataset.cfBeacon = JSON.stringify({
    token: "a7c18daa9b9e4c17800801afa2e350c0",
    spa: false,
  });
  document.head.append(beacon);
})();
