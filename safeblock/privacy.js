import { createPrivacyControls, summarizePrivacy } from "./privacy-core.mjs";

const controls = createPrivacyControls(chrome);
const enable = document.querySelector("#enable-privacy");
const release = document.querySelector("#release-privacy");
const summary = document.querySelector("#privacy-summary");
const message = document.querySelector("#privacy-message");
const error = document.querySelector("#privacy-error");
const list = document.querySelector("#privacy-settings");
let busy = false;
let generation = 0;

function render(state) {
  summary.textContent = summarizePrivacy(state);
  enable.disabled = busy;
  release.disabled = busy || !state.granted;
  enable.textContent = state.granted ? "Apply protections" : "Enable protections";
  list.replaceChildren();
  for (const item of state.items) {
    const row = document.createElement("li");
    const title = document.createElement("h2");
    title.textContent = item.title;
    const detail = document.createElement("p");
    detail.className = "hint";
    detail.textContent = item.detail;
    const status = document.createElement("p");
    status.className = "setting-status " + item.status;
    if (item.status === "protected") {
      status.textContent = item.protectedLabel || "Disabled";
    } else if (item.status === "unprotected") {
      status.textContent = item.unprotectedLabel || "Enabled";
    } else if (item.status === "unsupported") {
      status.textContent = "Not available in this Chrome version";
    } else if (item.status === "error") {
      status.textContent = "Could not verify: " + item.error;
    } else {
      status.textContent = "Permission needed to check";
    }
    const owners = {
      controlled_by_this_extension: " · Managed by SafeBlock",
      controlled_by_other_extensions: " · Managed by another extension",
      not_controllable: " · Locked by Chrome or an administrator",
      controllable_by_this_extension: " · Chrome setting"
    };
    status.textContent += owners[item.levelOfControl] || "";
    row.append(title, status, detail);
    if (item.levelOfControl === "controlled_by_this_extension") {
      const restore = document.createElement("button");
      restore.className = "secondary";
      restore.textContent = "Use Chrome setting";
      restore.disabled = busy;
      restore.addEventListener("click", () => run(() => controls.releaseOne(item.key),
        "SafeBlock released this setting. Chrome’s resulting value is shown below."));
      row.append(restore);
    }
    list.append(row);
  }
}

async function refresh() {
  const current = ++generation;
  try {
    const state = await controls.read();
    if (current === generation) render(state);
  } catch (failure) {
    error.textContent = "Unable to check privacy controls: " + failure.message;
    enable.disabled = busy;
    release.disabled = busy;
  }
}

async function run(operation, success) {
  if (busy) return;
  busy = true;
  ++generation;
  error.textContent = "";
  message.textContent = "Applying your choice…";
  document.querySelectorAll("button").forEach(button => { button.disabled = true; });
  try {
    const state = await operation();
    if (state.errors?.length) error.textContent = state.errors.join("\n");
    message.textContent = success;
  } catch (failure) {
    error.textContent = failure.message;
    message.textContent = "No complete change was confirmed. Check the current states below.";
  } finally {
    busy = false;
    await refresh();
  }
}

enable.addEventListener("click", () => {
  if (busy) return;
  // The request starts directly inside the click handler, retaining user gesture.
  const granted = chrome.permissions.request({ permissions: ["privacy"] });
  run(async () => {
    if (!await granted) throw new Error("Permission declined. No privacy settings were changed.");
    return controls.enable();
  }, "Checked the available controls. Their effective states are shown below. Reload open websites to use the new settings.");
});
release.addEventListener("click", () => run(() => controls.releaseAll(),
  "Release requested. The current permission and settings status is shown below."));
window.addEventListener("focus", () => { if (!busy) refresh(); });
chrome.permissions.onAdded.addListener(() => { if (!busy) refresh(); });
chrome.permissions.onRemoved.addListener(() => { if (!busy) refresh(); });
refresh();
