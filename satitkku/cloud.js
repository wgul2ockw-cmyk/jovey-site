const PHYSICS_SUPABASE_URL = "https://wudjxctrzabkmfqvdwwf.supabase.co";
const PHYSICS_SUPABASE_KEY = "sb_publishable_Uhqt2TmlX40XIzkuFX8n_w_Mw3LHsqA";
const PHYSICS_TABLE = "physics_explorer_user_data";

let physicsSupabase = null;
let physicsUser = null;
let physicsCloudReady = false;
let physicsSaveTimer = null;
let physicsSaveQueue = Promise.resolve();
let physicsAccountMode = "signin";

function setSaveState(message, synced) {
  const status = document.querySelector(".save-state");
  status.dataset.sync = synced ? "ok" : "error";
  document.querySelector("#saveState").textContent = message;
}

function hasSavedPlan() {
  return Object.values(collections).some((items) => Object.keys(items || {}).length) ||
    Object.keys(plans).length > 0;
}

function getLocalOwner() {
  try {
    return localStorage.getItem("physics-explorer-owner-v1");
  } catch {
    return null;
  }
}

function clearLocalPlan() {
  try {
    localStorage.removeItem("physics-explorer-collections-v1");
    localStorage.removeItem("physics-explorer-plan-v1");
  } catch {}
}

function setAccountDialogForUser(user) {
  const form = document.querySelector("#accountForm");
  const modeButton = document.querySelector("#accountMode");
  const signOut = document.querySelector("#accountSignout");
  const intro = document.querySelector("#accountIntro");
  form.hidden = !!user;
  modeButton.hidden = !!user;
  signOut.hidden = !user;
  if (user) {
    document.querySelector("#accountTitle").textContent = "Your Jovey account";
    intro.textContent = `${user.email || "Signed in"}. Your physics plan syncs privately across devices.`;
  } else {
    setAccountMode("signin");
  }
}

function queueCloudSave() {
  if (!physicsUser || !physicsCloudReady) {
    if (!physicsUser) {
      setSaveState(hasSavedPlan() ? "Saved on this device · sign in to sync" : "Sign in to sync across devices", false);
    }
    return;
  }

  setSaveState("Saving to your account…", true);
  clearTimeout(physicsSaveTimer);
  physicsSaveTimer = setTimeout(() => {
    physicsSaveQueue = physicsSaveQueue.then(syncPhysicsPlan).catch(() => {});
  }, 450);
}

async function syncPhysicsPlan() {
  if (!physicsUser || !physicsCloudReady) return;
  const ownerId = physicsUser.id;
  try {
    const { error } = await physicsSupabase
      .from(PHYSICS_TABLE)
      .upsert({
        user_id: ownerId,
        payload: { collections, plans },
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    if (error) throw error;
    if (physicsUser?.id === ownerId) {
      localStorage.setItem("physics-explorer-owner-v1", ownerId);
      document.querySelector("#storageNotice").hidden = true;
      setSaveState("Synced to your account · " + new Date().toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      }), true);
    }
  } catch {
    document.querySelector("#storageNotice").hidden = false;
    if (physicsUser?.id === ownerId) {
      setSaveState("Saved on this device · account sync unavailable", false);
    }
  }
}

function validPhysicsPayload(value) {
  return value && typeof value === "object" && value.collections && value.plans &&
    ["disruptive", "labs", "ap"].every((key) =>
      value.collections[key] && typeof value.collections[key] === "object" &&
      !Array.isArray(value.collections[key])) &&
    typeof value.plans === "object" && !Array.isArray(value.plans);
}

async function loadPhysicsPlan(user) {
  physicsUser = user || null;
  physicsCloudReady = false;
  document.querySelector("#accountButton").textContent = user ? "Account" : "Sign in to sync";
  setAccountDialogForUser(user);
  if (!user) {
    setSaveState(hasSavedPlan() ? "Saved on this device · sign in to sync" : "Sign in to sync across devices", false);
    render();
    return;
  }

  setSaveState("Loading your saved plan…", true);
  try {
    const { data, error } = await physicsSupabase
      .from(PHYSICS_TABLE)
      .select("payload")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;

    const previousOwner = getLocalOwner();
    if (data && validPhysicsPayload(data.payload)) {
      collections = data.payload.collections;
      plans = Object.fromEntries(Object.entries(data.payload.plans).filter(([id, value]) =>
        byId[id] && !byId[id].children && ["sprint", "later"].includes(value)));
      try {
        localStorage.setItem("physics-explorer-collections-v1", JSON.stringify(collections));
        localStorage.setItem("physics-explorer-plan-v1", JSON.stringify(plans));
        localStorage.setItem("physics-explorer-owner-v1", user.id);
      } catch {}
    } else if (previousOwner && previousOwner !== user.id) {
      collections = { disruptive: {}, labs: {}, ap: {} };
      plans = {};
      clearLocalPlan();
      try { localStorage.setItem("physics-explorer-owner-v1", user.id); } catch {}
    } else {
      try { localStorage.setItem("physics-explorer-owner-v1", user.id); } catch {}
    }

    physicsCloudReady = true;
    document.querySelector("#storageNotice").hidden = true;
    setSaveState("Synced to your account · " + new Date().toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    }), true);
    render();
    if (!data && hasSavedPlan()) queueCloudSave();
  } catch {
    document.querySelector("#storageNotice").hidden = false;
    setSaveState("Account sync unavailable · saved on this device", false);
    render();
  }
}

function setAccountMode(mode) {
  physicsAccountMode = mode;
  const creating = mode === "signup";
  document.querySelector("#accountTitle").textContent = creating ? "Create your Jovey account" : "Sign in to sync";
  document.querySelector("#accountIntro").textContent = creating
    ? "Use the same account on your other devices. Your saved physics plan is private to your account."
    : "Sign in on each device with the same Jovey account to see your selections and notes.";
  document.querySelector("#accountSubmit").textContent = creating ? "Create account" : "Sign in";
  document.querySelector("#accountPassword").autocomplete = creating ? "new-password" : "current-password";
  document.querySelector("#accountMode").textContent = creating ? "Back to sign in" : "Create an account";
  document.querySelector("#accountMessage").textContent = "";
}

function openAccountDialog() {
  document.querySelector("#accountMessage").textContent = "";
  setAccountDialogForUser(physicsUser);
  document.querySelector("#accountDialog").showModal();
  if (!physicsUser) document.querySelector("#accountEmail").focus();
}

async function startPhysicsCloud() {
  if (!window.supabase?.createClient) {
    setSaveState("Account sync could not load · saved on this device", false);
    render();
    return;
  }

  physicsSupabase = window.supabase.createClient(PHYSICS_SUPABASE_URL, PHYSICS_SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  try {
    const { data, error } = await physicsSupabase.auth.getSession();
    if (error) throw error;
    await loadPhysicsPlan(data.session?.user || null);
    physicsSupabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        void loadPhysicsPlan(session.user);
      } else if (event === "SIGNED_OUT") {
        physicsUser = null;
        physicsCloudReady = false;
        collections = { disruptive: {}, labs: {}, ap: {} };
        plans = {};
        clearLocalPlan();
        document.querySelector("#accountButton").textContent = "Sign in to sync";
        setAccountDialogForUser(null);
        setSaveState("Signed out · sign in to sync", false);
        render();
      }
    });
  } catch {
    document.querySelector("#storageNotice").hidden = false;
    setSaveState("Account sync unavailable · saved on this device", false);
    render();
  }
}

document.querySelector("#accountButton").addEventListener("click", openAccountDialog);
document.querySelector("#closeAccount").addEventListener("click", () => document.querySelector("#accountDialog").close());
document.querySelector("#accountMode").addEventListener("click", () =>
  setAccountMode(physicsAccountMode === "signin" ? "signup" : "signin"));
document.querySelector("#accountSignout").addEventListener("click", async () => {
  const { error } = await physicsSupabase.auth.signOut();
  if (error) document.querySelector("#accountMessage").textContent = "Could not sign out. Please try again.";
  else document.querySelector("#accountDialog").close();
});
document.querySelector("#accountForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.querySelector("#accountEmail").value.trim();
  const password = document.querySelector("#accountPassword").value;
  const submit = document.querySelector("#accountSubmit");
  submit.disabled = true;
  document.querySelector("#accountMessage").textContent = physicsAccountMode === "signup"
    ? "Creating your account…"
    : "Signing in…";
  try {
    const result = physicsAccountMode === "signup"
      ? await physicsSupabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: location.origin + location.pathname },
      })
      : await physicsSupabase.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    if (physicsAccountMode === "signup" && !result.data.session) {
      document.querySelector("#accountMessage").textContent = "Check your email to confirm the account, then return here to sign in.";
    } else {
      document.querySelector("#accountMessage").textContent = "Signed in. Loading your saved plan…";
      if (result.data.user) await loadPhysicsPlan(result.data.user);
      document.querySelector("#accountDialog").close();
    }
  } catch (error) {
    document.querySelector("#accountMessage").textContent = error?.message || "Sign-in could not be completed. Please try again.";
  } finally {
    submit.disabled = false;
  }
});

window.addEventListener("focus", () => {
  if (physicsSupabase && !physicsCloudReady) {
    physicsSupabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) void loadPhysicsPlan(data.session.user);
    });
  }
});

startPhysicsCloud();
