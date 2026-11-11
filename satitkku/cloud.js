const PHYSICS_API = "https://wudjxctrzabkmfqvdwwf.supabase.co";
const PHYSICS_PUBLISHABLE_KEY = "sb_publishable_Uhqt2TmlX40XIzkuFX8n_w_Mw3LHsqA";
const PHYSICS_SAVE_CODE_KEY = "physics-explorer-save-code-v1";
const PHYSICS_FUNCTION = `${PHYSICS_API}/functions/v1/physics-plan`;
let physicsSaveCode = null;
let physicsLoading = false;
let physicsSaveTimer = null;
let physicsSaveQueue = Promise.resolve();

function physicsSaveStatus(message) {
  document.querySelector("#saveMessage").textContent = message;
}

function validPlanPayload(value) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    value.collections && typeof value.collections === "object" && !Array.isArray(value.collections) &&
    value.plans && typeof value.plans === "object" && !Array.isArray(value.plans);
}

function snapshotPhysicsPlan() {
  return JSON.parse(JSON.stringify({ collections, plans }));
}

function saveLocalPhysicsPlan() {
  try {
    localStorage.setItem("physics-explorer-plan-v1", JSON.stringify(plans));
    localStorage.setItem("physics-explorer-collections-v1", JSON.stringify(collections));
  } catch {
    document.querySelector("#storageNotice").hidden = false;
  }
}

function applyPhysicsPayload(payload) {
  if (!validPlanPayload(payload)) throw new Error("This save code has no valid plan.");
  const cleanCollections = { disruptive: {}, labs: {}, ap: {} };
  for (const key of Object.keys(cleanCollections)) {
    const source = payload.collections[key];
    if (!source || typeof source !== "object" || Array.isArray(source)) continue;
    for (const [id, value] of Object.entries(source)) {
      if (!byId[id] || byId[id].children || !value || typeof value !== "object") continue;
      cleanCollections[key][id] = { note: String(value.note || "").slice(0, 5000) };
    }
  }
  collections = cleanCollections;
  plans = Object.fromEntries(Object.entries(payload.plans).filter(([id, value]) =>
    byId[id] && !byId[id].children && ["sprint", "later"].includes(value)));
  saveLocalPhysicsPlan();
}

async function callPhysicsServer(action, code, payload) {
  const response = await fetch(PHYSICS_FUNCTION, {
    method: "POST",
    headers: {
      apikey: PHYSICS_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
      "x-save-code": code,
    },
    body: JSON.stringify({ action, payload }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new Error(result.error || "Could not reach the server.");
  return result;
}

function newPhysicsSaveCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function setActiveSaveCode(code) {
  document.querySelector("#activeSaveCode").hidden = !code;
  document.querySelector("#saveCodeValue").textContent = code || "";
}

function openSaveCodeDialog() {
  setActiveSaveCode(physicsSaveCode);
  document.querySelector("#saveCodeMessage").textContent = "";
  document.querySelector("#saveCodeDialog").showModal();
}

async function savePhysicsPlan({ showCode = true } = {}) {
  const button = document.querySelector("#savePlan");
  button.disabled = true;
  let createdCode = false;
  try {
    if (!physicsSaveCode) {
      physicsSaveCode = newPhysicsSaveCode();
      localStorage.setItem(PHYSICS_SAVE_CODE_KEY, physicsSaveCode);
      createdCode = true;
    }
    const payload = snapshotPhysicsPlan();
    saveLocalPhysicsPlan();
    await callPhysicsServer("save", physicsSaveCode, payload);
    document.querySelector("#storageNotice").hidden = true;
    physicsSaveStatus("Saved to Jovey server");
    if (showCode && createdCode) openSaveCodeDialog();
  } catch (error) {
    physicsSaveStatus("Server save failed — try again");
    document.querySelector("#saveCodeMessage").textContent = error.message || "Server save failed. Your plan is still on this device.";
  } finally {
    button.disabled = false;
  }
}

function queuePhysicsServerSave() {
  if (!physicsSaveCode || physicsLoading) return;
  clearTimeout(physicsSaveTimer);
  physicsSaveTimer = setTimeout(() => {
    physicsSaveQueue = physicsSaveQueue.then(async () => {
      try {
        await callPhysicsServer("save", physicsSaveCode, snapshotPhysicsPlan());
        physicsSaveStatus("Saved to Jovey server");
      } catch {
        physicsSaveStatus("Server save failed — try Save again");
      }
    });
  }, 700);
}

async function loadPhysicsFromCode(code, { startup = false } = {}) {
  if (!/^[a-f0-9]{64}$/i.test(code)) throw new Error("Enter the 64-character code from your other device.");
  const result = await callPhysicsServer("load", code.toLowerCase());
  if (!result.found || !validPlanPayload(result.payload)) throw new Error("No saved plan was found for that code.");
  physicsSaveCode = code.toLowerCase();
  localStorage.setItem(PHYSICS_SAVE_CODE_KEY, physicsSaveCode);
  physicsLoading = true;
  try {
    applyPhysicsPayload(result.payload);
    render();
  } finally {
    physicsLoading = false;
  }
  physicsSaveStatus("Loaded from Jovey server");
  if (!startup) {
    document.querySelector("#saveCodeMessage").textContent = "Plan loaded from Jovey.";
    setActiveSaveCode(physicsSaveCode);
  }
}

document.querySelector("#savePlan").addEventListener("click", () => void savePhysicsPlan());
document.querySelector("#manageSaveCode").addEventListener("click", openSaveCodeDialog);
document.querySelector("#closeSaveCode").addEventListener("click", () => document.querySelector("#saveCodeDialog").close());
document.querySelector("#copySaveCode").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(physicsSaveCode);
    document.querySelector("#saveCodeMessage").textContent = "Code copied.";
  } catch {
    document.querySelector("#saveCodeMessage").textContent = "Select and copy the code above.";
  }
});
document.querySelector("#loadSaveCodeForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = document.querySelector("#saveCodeInput").value.trim().replace(/\s+/g, "");
  const submit = event.currentTarget.querySelector("button[type=submit]");
  submit.disabled = true;
  document.querySelector("#saveCodeMessage").textContent = "Loading saved plan…";
  try {
    await loadPhysicsFromCode(code);
    document.querySelector("#saveCodeInput").value = "";
  } catch (error) {
    document.querySelector("#saveCodeMessage").textContent = error.message || "Could not load this plan.";
  } finally {
    submit.disabled = false;
  }
});

(async function startPhysicsServerSave() {
  const save = document.querySelector("#savePlan");
  if (!crypto?.getRandomValues || !crypto?.subtle) {
    save.disabled = true;
    physicsSaveStatus("Secure server saves need an up-to-date browser");
    render();
    return;
  }
  try { physicsSaveCode = localStorage.getItem(PHYSICS_SAVE_CODE_KEY); } catch {}
  if (physicsSaveCode) {
    try {
      await loadPhysicsFromCode(physicsSaveCode, { startup: true });
    } catch {
      physicsSaveStatus("Using this device’s saved copy");
    }
  } else {
    physicsSaveStatus("Ready to save to Jovey server");
  }
  render();
})();
