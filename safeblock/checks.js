"use strict";

const button = document.querySelector("#run");
const status = document.querySelector("#status");
const results = document.querySelector("#results");
button.addEventListener("click", async () => {
  button.disabled = true;
  results.replaceChildren();
  try {
    const dynamicRules = await chrome.declarativeNetRequest.getDynamicRules();
    if (dynamicRules.length) {
      throw new Error("Resume blocking and remove website exceptions before running these baseline checks.");
    }
    const cases = [
      ["Ad domain", "https://doubleclick.net/ad.js", "https://example.org", "script", true],
      ["Ad subdomain", "https://ads.doubleclick.net/ad.js", "https://example.org", "script", true],
      ["Tracker", "https://www.google-analytics.com/collect", "https://example.org", "xmlhttprequest", true],
      ["Normal resource", "https://example.org/app.js", "https://example.org", "script", false],
      ["Lookalike domain", "https://doubleclick.net.example.org/app.js", "https://example.org", "script", false],
      ["Domain in path", "https://example.org/doubleclick.net/ad.js", "https://example.org", "script", false],
      ["Direct navigation", "https://doubleclick.net/", "https://example.org", "main_frame", false],
      ["First-party resource", "https://doubleclick.net/app.js", "https://doubleclick.net", "script", false]
    ];
    let passed = 0;
    for (const [name, url, initiator, type, expected] of cases) {
      const outcome = await chrome.declarativeNetRequest.testMatchOutcome({ url, initiator, type });
      const blocked = outcome.matchedRules.some(rule => rule.rulesetId === "bundled");
      const ok = blocked === expected;
      passed += Number(ok);
      const row = document.createElement("li");
      row.textContent = (ok ? "PASS — " : "FAIL — ") + name;
      results.append(row);
    }
    status.textContent = passed + " of " + cases.length + " checks passed";
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
