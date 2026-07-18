/* ============================================================
   Attention Switch — app logic (Jovey theme)
   Timing is timestamp-based (Date.now), so clocks stay accurate
   across reloads and backgrounded tabs. State persists to
   localStorage on every mutation.
   ============================================================ */

"use strict";

const KEY = "attention-switch:v1";
const PROJECT_LIMIT = 8; // matches the validated 8-slot categorical palette
const MIN_SESSION_MS = 10_000;
const HISTORY_PREVIEW = 8;
// Attention ring — jovey-style confetti dashes orbiting the counting clock.
// The ring holds the WHOLE SESSION'S composition: every project's earned
// dots in its own colour. The focused project's pile glows at full
// prominence (and pops up fast when you switch to it); the rest recede
// but remain visible. Past the soft cap the oldest dots are deducted.
const RING_FRAC = 0.44;   // ring radius as a fraction of the dial box
const RING_THICK = 0.24;  // radial band spread (fraction of radius)
const WOBBLE = 4;         // gentle radial shimmer (px)
const ORBIT_SPEED = (2 * Math.PI) / 80; // one lap ≈ 80s, per-dot variance applied
const BREAK_GRAY = "#9aa1ab";
const DOT_MAX = 420;      // absolute earn ceiling (safety)
const DOT_SOFT = 240;     // ring ceiling — overflow is deducted ONLY at a swap
const DOT_CURVE_K = 2.2;  // reward curve: dots ≈ K·√(project seconds) — fast burst early
const DOT_DIE_S = 0.45;   // quick pop-away for deducted dots
const DOT_IN_S = 0.25;    // pop-in age of a newborn dot
const WAVE_DUR = 1.4;     // swap wave: a ripple runs through the ring
const WAVE_A = 10;        // wave amplitude (px)
const TILT_MAX = 11;      // ring parallax with device tilt / cursor (px)

// Orb-gradient shade families per slot (light / base / deep), echoing the
// jovey.co growth orbs. Ring-only; charts keep the validated base hexes.
const CAT_FAM = [
  ["#F5A83C", "#D9822B", "#B85F14"], // personal orange
  ["#5B99C9", "#2E74A8", "#1E5680"], // jovey blue
  ["#E3BC5C", "#C29A3F", "#9C7722"], // ochre
  ["#DD74C4", "#B0519E", "#8A3B9E"], // spiritual magenta → purple
  ["#A3C167", "#7D9C43", "#5C7A2C"], // moss
  ["#D67A5D", "#AD5340", "#7F3627"], // terracotta
  ["#3FC7B8", "#1FA39A", "#0A5F53"], // vitality teal
  ["#B191DE", "#8B6BB8", "#64478F"], // violet
];

// Mirrors --cat-0..7 in styles.css (for the dynamic <meta theme-color>)
const CAT_HEX = ["#D9822B", "#2E74A8", "#C29A3F", "#B0519E", "#7D9C43", "#AD5340", "#1FA39A", "#8B6BB8"];

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

/* ---------- State ---------- */

function defaults() {
  return { projects: [], active: null, sessions: [], theme: "auto" };
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.projects)) return { ...defaults(), ...s };
  } catch (_) { /* corrupted storage — start fresh */ }
  return defaults();
}

let state = load();
// UI-only state (not persisted)
let view = state.active ? "session" : "home";
let summaryId = null;
let showAllHistory = false;
let justSwitched = false;
let addOpen = false; // in-session "add project" tile expanded

function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

function commit() {
  save();
  render();
}

/* ---------- Time helpers ---------- */

const now = () => Date.now();

function openSeg(a) {
  const s = a.segments[a.segments.length - 1];
  return s && s.end === null ? s : null;
}
function openBreak(a) {
  const b = a.breaks[a.breaks.length - 1];
  return b && b.end === null ? b : null;
}
function segMs(g, t) { return (g.end ?? t) - g.start; }
function focusMs(a, t) { return a.segments.reduce((s, g) => s + segMs(g, t), 0); }
function breakMs(a, t) { return a.breaks.reduce((s, b) => s + segMs(b, t), 0); }
function projSessionMs(a, pid, t) {
  return a.segments.filter((g) => g.p === pid).reduce((s, g) => s + segMs(g, t), 0);
}
function switchCount(segments) {
  let n = 0;
  for (let i = 1; i < segments.length; i++) {
    if (segments[i].p !== segments[i - 1].p) n++;
  }
  return n;
}

/* ---------- Formatting ---------- */

function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

function fmtHuman(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function fmtDay(ts) {
  return new Date(ts).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// Prata has no tabular figures — render each glyph in a fixed-width cell
// so the big serif clock never jitters as digits change.
function digitsHtml(str) {
  return [...str]
    .map((ch) => (ch === ":" ? '<span class="c">:</span>' : `<span class="d">${ch}</span>`))
    .join("");
}

/* ---------- Icons (inline SVG, Lucide-style) ---------- */

const svg = (paths, cls = "icon") =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;

const ICONS = {
  play: svg('<polygon points="6 3 20 12 6 21 6 3"/>'),
  pause: svg('<rect x="5" y="4" width="4.5" height="16" rx="1"/><rect x="14.5" y="4" width="4.5" height="16" rx="1"/>'),
  stop: svg('<rect x="5" y="5" width="14" height="14" rx="2"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  trash: svg('<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/>'),
  shuffle: svg('<path d="M2 18h4.5c1.5 0 2.8-.7 3.7-1.9L15 9.5c.9-1.2 2.2-1.9 3.7-1.9H22M18.5 4.5 22 7.6l-3.5 3.1M2 7.6h4.5c1.1 0 2.2.4 3 1.2M18.5 21.4l3.5-3.1-3.5-3.1M13.4 17.1c.9.8 1.9 1.2 3 1.2H22"/>'),
  spark: svg('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>'),
};

/* ---------- Aggregates ---------- */

function projectAllTimeMs(pid) {
  let t = 0;
  for (const s of state.sessions) {
    for (const pp of s.perProject) if (pp.id === pid) t += pp.ms;
  }
  return t;
}

function todayStats() {
  const today = new Date().toDateString();
  const todays = state.sessions.filter(
    (s) => new Date(s.startedAt).toDateString() === today
  );
  return {
    count: todays.length,
    focus: todays.reduce((t, s) => t + s.focusMs, 0),
    switches: todays.reduce((t, s) => t + s.switches, 0),
  };
}

/* ---------- Trend + hook derivations (all pure, computed on render) ---------- */

function rateOf(focus, switches) {
  return focus >= 600_000 ? switches / (focus / 3_600_000) : null;
}

function fmtRate(r) {
  return r >= 10 ? String(Math.round(r)) : r.toFixed(1);
}

// Last N calendar days, oldest → newest, zero-filled.
function dailySeries(days) {
  const out = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  for (let i = 0; i < days; i++) {
    out.push({
      key: d.toDateString(),
      label: d.toLocaleDateString([], { weekday: "narrow" }),
      focusMs: 0,
      switches: 0,
      perSlot: new Map(),
    });
    d.setDate(d.getDate() + 1);
  }
  const byKey = new Map(out.map((x) => [x.key, x]));
  for (const s of state.sessions) {
    const day = byKey.get(new Date(s.startedAt).toDateString());
    if (!day) continue;
    day.focusMs += s.focusMs;
    day.switches += s.switches;
    for (const pp of s.perProject) {
      day.perSlot.set(pp.slot, (day.perSlot.get(pp.slot) || 0) + pp.ms);
    }
  }
  return out;
}

// Consecutive days with at least one session, counting back from today
// (or from yesterday when today hasn't started yet).
function streakDays() {
  const days = new Set(state.sessions.map((s) => new Date(s.startedAt).toDateString()));
  const today = days.has(new Date().toDateString());
  let n = 0;
  const d = new Date();
  if (!today) d.setDate(d.getDate() - 1);
  while (days.has(d.toDateString())) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return { n, today };
}

// The project the user most recently spent time on — the one-tap quick start.
function suggestedProject() {
  for (const s of state.sessions) {
    for (const pp of s.perProject) {
      const p = state.projects.find((x) => x.id === pp.id);
      if (p) return p;
    }
  }
  return state.projects[0] ?? null;
}

// Gentle session character — variable reward, never a judgement.
function flowRating(rec) {
  const rate = rateOf(rec.focusMs, rec.switches);
  if (rate === null) return null;
  if (rate <= 6 && rec.longestMs >= 1_200_000) {
    return { word: "Deep", blurb: "long unbroken blocks", tone: "deep" };
  }
  if (rate <= 12) return { word: "Steady", blurb: "settled attention", tone: "steady" };
  if (rate <= 25) return { word: "Lively", blurb: "quick rotations", tone: "lively" };
  return { word: "Busy mind", blurb: "a lot of switching", tone: "busy" };
}

// Personal records this session set — computed against everything before it.
function momentsFor(rec) {
  const idx = state.sessions.findIndex((s) => s.id === rec.id);
  if (idx === -1) return [];
  const prior = state.sessions.slice(idx + 1);
  if (!prior.length) return ["First session — the record starts here."];
  const out = [];
  if (rec.longestMs > Math.max(...prior.map((s) => s.longestMs))) {
    out.push(`Longest focus block yet — ${fmtHuman(rec.longestMs)}`);
  }
  if (rec.focusMs > Math.max(...prior.map((s) => s.focusMs))) {
    out.push(`Most focus in one session — ${fmtHuman(rec.focusMs)}`);
  }
  const rate = rateOf(rec.focusMs, rec.switches);
  const priorRates = prior.map((s) => rateOf(s.focusMs, s.switches)).filter((r) => r !== null);
  if (rate !== null && priorRates.length >= 2 && rate < Math.min(...priorRates)) {
    out.push(`Calmest session yet — ${fmtRate(rate)} switches/hr`);
  }
  const priorIds = new Set(prior.flatMap((s) => s.perProject.map((pp) => pp.id)));
  const fresh = rec.perProject.find((pp) => !priorIds.has(pp.id));
  if (fresh) out.push(`First session on ${fresh.name}`);
  return out.slice(0, 2);
}

/* ---------- Actions ---------- */

const actions = {
  goHome() {
    view = state.active ? "session" : "home";
    render();
  },

  deleteProject(id) {
    if (state.active) return;
    const p = state.projects.find((x) => x.id === id);
    if (!p) return;
    if (!confirm(`Delete "${p.name}"? Past sessions keep their records.`)) return;
    state.projects = state.projects.filter((x) => x.id !== id);
    commit();
  },

  startSession() {
    if (!state.projects.length || state.active) return;
    state.active = { startedAt: null, segments: [], breaks: [] };
    view = "session";
    addOpen = false;
    askMotionPermission();
    commit();
  },

  tap(id) {
    const a = state.active;
    if (!a) return;
    const p = state.projects.find((x) => x.id === id);
    if (!p) return;
    const t = now();
    const s = openSeg(a);
    if (s && s.p === id) return; // already focusing here

    if (a.startedAt === null) a.startedAt = t;
    const b = openBreak(a);
    if (b) b.end = t;
    const wasFocusing = !!s;
    if (s) s.end = t;
    a.segments.push({ p: id, start: t, end: null });

    justSwitched = wasFocusing; // first tap isn't a switch
    announce(
      wasFocusing
        ? `Switched to ${p.name}. ${switchCount(a.segments)} switches so far.`
        : `Focusing on ${p.name}.`
    );
    buzz(12);
    commit();
  },

  toggleBreak() {
    const a = state.active;
    if (!a || a.startedAt === null) return;
    const t = now();
    const b = openBreak(a);
    if (b) {
      // resume into the project that was focused before the break
      b.end = t;
      const last = a.segments[a.segments.length - 1];
      a.segments.push({ p: last.p, start: t, end: null });
      announce("Break over. Back to focus.");
    } else {
      const s = openSeg(a);
      if (!s) return;
      s.end = t;
      a.breaks.push({ start: t, end: null });
      announce("On a break. Focus clock paused.");
    }
    buzz(8);
    commit();
  },

  endSession() {
    const a = state.active;
    if (!a) return;
    const t = now();
    const s = openSeg(a);
    if (s) s.end = t;
    const b = openBreak(a);
    if (b) b.end = t;

    const focus = focusMs(a, t);
    if (a.startedAt === null || focus < MIN_SESSION_MS) {
      state.active = null;
      view = "home";
      addOpen = false;
      toast(
        a.startedAt === null
          ? "Session cancelled."
          : "Session discarded — under 10 seconds of focus."
      );
      commit();
      return;
    }

    const projOf = (pid) => state.projects.find((x) => x.id === pid);
    const per = {};
    for (const g of a.segments) per[g.p] = (per[g.p] || 0) + (g.end - g.start);
    const perProject = Object.entries(per)
      .map(([pid, ms]) => {
        const p = projOf(pid);
        return { id: pid, name: p ? p.name : "Deleted project", slot: p ? p.slot : 0, ms };
      })
      .sort((x, y) => y.ms - x.ms);

    const rec = {
      id: uid(),
      startedAt: a.startedAt,
      endedAt: t,
      focusMs: focus,
      breakMs: breakMs(a, t),
      switches: switchCount(a.segments),
      longestMs: Math.max(...a.segments.map((g) => g.end - g.start)),
      blocks: a.segments.length,
      perProject,
      segments: a.segments.map((g) => {
        const p = projOf(g.p);
        return { name: p ? p.name : "Deleted project", slot: p ? p.slot : 0, start: g.start, end: g.end };
      }),
      breaks: a.breaks.map((x) => ({ start: x.start, end: x.end })),
    };
    state.sessions.unshift(rec);
    state.active = null;
    summaryId = rec.id;
    view = "summary";
    addOpen = false;
    commit();
  },

  openSession(id) {
    if (state.sessions.some((s) => s.id === id)) {
      summaryId = id;
      view = "summary";
      render();
    }
  },

  deleteSession(id) {
    const s = state.sessions.find((x) => x.id === id);
    if (!s) return;
    if (!confirm("Delete this session record?")) return;
    state.sessions = state.sessions.filter((x) => x.id !== id);
    view = "home";
    commit();
  },

  showAllHistory() {
    showAllHistory = true;
    render();
  },

  openTrends() {
    view = "trends";
    render();
    scrollTo(0, 0);
  },

  // Hook: one tap from opening the app to a running clock.
  quickStart(id) {
    if (state.active || !state.projects.length) return;
    state.active = { startedAt: null, segments: [], breaks: [] };
    view = "session";
    addOpen = false;
    askMotionPermission();
    save();
    const p = state.projects.find((x) => x.id === id) ?? state.projects[0];
    if (p) actions.tap(p.id);
    else commit();
  },

  openAdd() {
    addOpen = true;
    render();
    const input = document.getElementById("sess-proj-name");
    if (input) input.focus();
  },

  closeAdd() {
    addOpen = false;
    render();
  },
};

function uid() {
  return now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ---------- Announcements & toast ---------- */

function announce(msg) {
  document.getElementById("announcer").textContent = msg;
}

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3500);
}

/* ---------- Shared renderers ---------- */

function dotHtml(slot) {
  return `<span class="dot" style="--pc: var(--cat-${slot})" aria-hidden="true"></span>`;
}

// Timeline strip: focus blocks + breaks laid out proportionally on the
// wall clock. flex-grow carries duration; 2px gaps keep adjacent fills
// separated (the palette's secondary encoding).
function stripHtml(items, { mini = false, label = "" } = {}) {
  const total = items.reduce((t, x) => t + x.ms, 0) || 1;
  const cells = items
    .map((x) => {
      if (x.type === "break") {
        return `<i class="brk" style="--f:${(x.ms / total).toFixed(5)}" title="Break — ${fmtHuman(x.ms)}"></i>`;
      }
      return `<i style="--f:${(x.ms / total).toFixed(5)}; --pc: var(--cat-${x.slot})" title="${esc(x.name)} — ${fmtHuman(x.ms)}"></i>`;
    })
    .join("");
  return `<div class="strip${mini ? " mini" : ""}" role="img" aria-label="${esc(label)}">${cells}</div>`;
}

function timelineItems(rec) {
  const items = [
    ...rec.segments.map((g) => ({
      type: "seg", name: g.name, slot: g.slot, start: g.start, ms: g.end - g.start,
    })),
    ...rec.breaks.map((b) => ({ type: "break", start: b.start, ms: b.end - b.start })),
  ];
  return items.sort((a, b) => a.start - b.start);
}

function stripLabel(rec) {
  const names = [...new Set(rec.segments.map((g) => g.name))];
  return `Attention timeline: ${rec.blocks ?? rec.segments.length} focus blocks across ${names.join(", ")}; ${rec.switches} switches; ${rec.breaks.length} breaks.`;
}

/* ---------- Home view ---------- */

function renderHome() {
  const t = todayStats();
  const projects = state.projects;
  const st = streakDays();

  const todayHtml = t.count
    ? `<div class="today-strip">
         <span>Today</span><span class="sep">·</span>
         <b>${fmtHuman(t.focus)}</b><span>focus</span><span class="sep">·</span>
         <b>${t.switches}</b><span>${t.switches === 1 ? "switch" : "switches"}</span>
         ${st.n > 1 ? `<span class="sep">·</span><b>${st.n}</b><span>day run</span>` : ""}
       </div>`
    : "";

  // Hook trigger + action: a new-day card with yesterday's echo and a
  // one-tap start on the project you were last working in.
  let dayCard = "";
  if (!t.count && !state.active && projects.length) {
    const yesterday = dailySeries(2)[0];
    const suggested = suggestedProject();
    const echo = yesterday.focusMs
      ? `Yesterday: ${fmtHuman(yesterday.focusMs)} · ${yesterday.switches} ${yesterday.switches === 1 ? "switch" : "switches"}.`
      : state.sessions.length ? "Yesterday was quiet." : "Your first session awaits.";
    const streakLine = st.n > 0 && !st.today
      ? `<p class="day-streak">${st.n === 1 ? "Yesterday started a run — day 2 is today." : `${st.n} days in a row — keep the run alive today.`}</p>`
      : "";
    dayCard = suggested
      ? `<div class="day-card">
           <p class="day-echo">${echo}</p>
           ${streakLine}
           <div class="day-actions">
             <button class="pill pill-dark" data-action="quickStart" data-id="${suggested.id}">
               ${ICONS.play}<span>Start on ${esc(suggested.name)}</span>
             </button>
           </div>
         </div>`
      : "";
  }

  const projHtml = projects.length
    ? `<div class="proj-list">${projects
        .map((p) => {
          const all = projectAllTimeMs(p.id);
          return `<div class="proj-row" style="--pc: var(--cat-${p.slot})">
            ${dotHtml(p.slot)}
            <span class="p-name">${esc(p.name)}</span>
            <span class="p-meta">${all ? fmtHuman(all) + " all-time" : ""}</span>
            <button class="del" data-action="deleteProject" data-id="${p.id}" aria-label="Delete project ${esc(p.name)}">${ICONS.trash}</button>
          </div>`;
        })
        .join("")}</div>`
    : `<div class="empty-card">Add the projects competing for your attention — then start a session and tap whichever one has it.</div>`;

  const atLimit = projects.length >= PROJECT_LIMIT;
  const addForm = atLimit
    ? `<p class="form-note">8 projects max — the palette (and your attention) has limits.</p>`
    : `<form class="add-form" data-form="add">
         <label class="visually-hidden" for="proj-name">Project name</label>
         <input id="proj-name" name="name" type="text" maxlength="32" autocomplete="off" placeholder="Add a project…" />
         <button class="pill pill-ghost" type="submit" aria-label="Add project">${ICONS.plus}<span>Add</span></button>
       </form>`;

  // trends teaser: last 7 days of focus as a micro sparkline
  const spark7 = dailySeries(7);
  const sparkMax = Math.max(...spark7.map((d) => d.focusMs), 1);
  const sparkHtml = `<span class="spark" aria-hidden="true">${spark7
    .map((d) => `<i style="height:${Math.max(12, (d.focusMs / sparkMax) * 100).toFixed(0)}%"${d.focusMs ? "" : ' class="nil"'}></i>`)
    .join("")}</span>`;

  const shown = showAllHistory ? state.sessions : state.sessions.slice(0, HISTORY_PREVIEW);
  const historyHtml = state.sessions.length
    ? `<section class="section" aria-label="Past sessions">
        <div class="section-head">
          <h2 class="sec-label">Sessions</h2>
          <button class="trends-link" data-action="openTrends" aria-label="See your trends">${sparkHtml}<span>Trends</span></button>
        </div>
        <div class="sess-list">
          ${shown
            .map(
              (s) => `<button class="sess-row" data-action="openSession" data-id="${s.id}" aria-label="Open session from ${fmtDay(s.startedAt)}, ${fmtHuman(s.focusMs)} focus, ${s.switches} switches">
                <span class="s-top">
                  <span class="s-date">${fmtDay(s.startedAt)}</span>
                  <span class="s-meta">${fmtHuman(s.focusMs)} · ${s.switches} ${s.switches === 1 ? "switch" : "switches"}</span>
                </span>
                ${stripHtml(timelineItems(s), { mini: true, label: "" })}
              </button>`
            )
            .join("")}
        </div>
        ${!showAllHistory && state.sessions.length > HISTORY_PREVIEW
          ? `<p class="form-note"><button class="link-more" data-action="showAllHistory">Show ${state.sessions.length - HISTORY_PREVIEW} older…</button></p>`
          : ""}
      </section>`
    : "";

  return `
    <div class="hero-copy">
      <h1>Track where your attention&nbsp;goes.</h1>
      <p>Time per project — and the number of times you switch between them.</p>
    </div>
    ${todayHtml}
    ${dayCard}
    <section class="section" aria-label="Your projects">
      <div class="section-head"><h2 class="sec-label">Projects</h2><span class="count">${projects.length}/${PROJECT_LIMIT}</span></div>
      ${projHtml}
      ${addForm}
    </section>
    <div class="start-wrap">
      <button class="pill pill-dark pill-block cta-start" data-action="startSession" ${projects.length ? "" : "disabled"}>
        ${ICONS.play}<span>Start session</span>
      </button>
      <p class="cta-hint">${projects.length ? "Then tap a project to begin focusing." : "Add a project first."}</p>
    </div>
    ${historyHtml}
  `;
}

/* ---------- Session view ---------- */

function dialHtml({ slot, dimmed, labelHtml, clockStr, clockKind, clockClass, underHtml }) {
  const pc = slot === null ? "" : `--pc: var(--cat-${slot});`;
  return `
    <div class="dial-wrap">
      <div class="dial${dimmed ? " dim" : ""}" style="${pc}">
        <canvas class="ring-canvas" aria-hidden="true"></canvas>
        <div class="dial-center">
          <div class="focus-label">${labelHtml}</div>
          <div class="big-clock${clockClass}" data-digits data-clock="${clockKind}" data-v="${clockStr}">${digitsHtml(clockStr)}</div>
          ${underHtml}
        </div>
      </div>
    </div>`;
}

function renderSession() {
  const a = state.active;
  if (!a) return renderHome();
  const t = now();
  const seg = openSeg(a);
  const brk = openBreak(a);
  const started = a.startedAt !== null;
  const activeProj = seg ? state.projects.find((p) => p.id === seg.p) : null;
  const lastSeg = a.segments[a.segments.length - 1];
  const pausedProj = brk && lastSeg ? state.projects.find((p) => p.id === lastSeg.p) : null;
  const switches = switchCount(a.segments);
  const switchLine = `<div class="switch-line" aria-label="${switches} attention switches">
    ${ICONS.shuffle}<b id="switch-n">${switches}</b><span>${switches === 1 ? "switch" : "switches"}</span>
  </div>`;

  let dial;
  if (!started) {
    dial = dialHtml({
      slot: null, dimmed: false,
      labelHtml: `<span class="state-word">Tap a project to begin</span>`,
      clockStr: "0:00", clockKind: "none", clockClass: " idle",
      underHtml: `<p class="under-clock">The clock starts on your first tap.</p>`,
    });
  } else if (brk) {
    const frozen = pausedProj ? projSessionMs(a, pausedProj.id, t) : 0;
    dial = dialHtml({
      slot: pausedProj ? pausedProj.slot : null, dimmed: true,
      labelHtml: pausedProj
        ? `${dotHtml(pausedProj.slot)}<span>${esc(pausedProj.name)}</span><span class="state-word">— break</span>`
        : `<span class="state-word">On a break</span>`,
      clockStr: fmtClock(frozen), clockKind: "pausedProj", clockClass: " paused",
      underHtml: `<p class="under-clock">Break <b data-clock="break">${fmtClock(segMs(brk, t))}</b> · Focus <b data-clock="focus">${fmtClock(focusMs(a, t))}</b></p>${switchLine}`,
    });
  } else {
    dial = dialHtml({
      slot: activeProj.slot, dimmed: false,
      labelHtml: `<span class="pulse-dot" style="--pc: var(--cat-${activeProj.slot})" aria-hidden="true"></span>
                  <span>${esc(activeProj.name)}</span>`,
      clockStr: fmtClock(projSessionMs(a, activeProj.id, t)), clockKind: "activeProj", clockClass: "",
      underHtml: `<p class="under-clock">Focus total <b data-clock="focus">${fmtClock(focusMs(a, t))}</b></p>${switchLine}`,
    });
  }

  const cards = state.projects
    .map((p, i) => {
      const isActive = !brk && seg && seg.p === p.id;
      return `<button class="proj-card${isActive ? " active" : ""}" style="--pc: var(--cat-${p.slot})"
                data-action="tap" data-id="${p.id}"
                aria-pressed="${isActive}" aria-label="${isActive ? "Focusing on" : "Switch attention to"} ${esc(p.name)}">
        <span class="c-head">${dotHtml(p.slot)}<span class="c-name">${esc(p.name)}</span><span class="kbd" aria-hidden="true">${i + 1}</span></span>
      </button>`;
    })
    .join("");

  const addTile = state.projects.length >= PROJECT_LIMIT
    ? ""
    : addOpen
      ? `<form class="add-card-form" data-form="add">
           <label class="visually-hidden" for="sess-proj-name">Project name</label>
           <input id="sess-proj-name" name="name" type="text" maxlength="32" autocomplete="off" placeholder="New project…" />
           <div class="row">
             <button class="pill pill-dark" type="submit">Add</button>
             <button class="pill pill-ghost" type="button" data-action="closeAdd">Cancel</button>
           </div>
         </form>`
      : `<button class="add-card" data-action="openAdd" aria-label="Add a project to this session">${ICONS.plus}<span>Add project</span></button>`;

  return `
    ${dial}
    <p class="grid-label sec-label">Tap where your attention goes</p>
    <div class="proj-grid">${cards}${addTile}</div>
    <div class="controls-bar">
      <button class="pill pill-ghost" data-action="toggleBreak" ${started ? "" : "disabled"}>
        ${brk ? ICONS.play : ICONS.pause}${brk
          ? "<span>Resume</span>"
          : '<span class="lbl-long">Take a break</span><span class="lbl-short">Break</span>'}
      </button>
      <button class="pill pill-dark" data-action="endSession">${ICONS.stop}<span class="lbl-long">End session</span><span class="lbl-short">End</span></button>
    </div>
    <p class="key-hints"><span class="kbd">1</span>–<span class="kbd">8</span> switch project · <span class="kbd">Space</span> break</p>
  `;
}

/* ---------- Summary view ---------- */

function renderSummary() {
  const rec = state.sessions.find((s) => s.id === summaryId);
  if (!rec) return renderHome();

  const rate = rec.switches / (rec.focusMs / 3_600_000);
  const perHour = rec.focusMs >= 60_000
    ? (rate >= 10 ? String(Math.round(rate)) : rate.toFixed(1))
    : null;
  const avgBlock = rec.focusMs / (rec.blocks ?? rec.segments.length);

  const tiles = `
    <div class="tiles">
      <div class="tile feature"><b>${fmtHuman(rec.focusMs)}</b><small>Focus time</small></div>
      <div class="tile feature"><b>${rec.switches}</b><small>${rec.switches === 1 ? "Switch" : "Switches"}</small>${perHour ? `<span class="sub">${perHour}/hour of focus</span>` : ""}</div>
      <div class="tile"><b>${fmtHuman(rec.longestMs)}</b><small>Longest block</small></div>
      <div class="tile"><b>${fmtHuman(avgBlock)}</b><small>Average block</small></div>
      <div class="tile"><b>${fmtHuman(rec.breakMs)}</b><small>${rec.breaks.length} ${rec.breaks.length === 1 ? "break" : "breaks"}</small></div>
      <div class="tile"><b>${fmtHuman(rec.endedAt - rec.startedAt)}</b><small>Wall clock</small></div>
    </div>`;

  const rows = rec.perProject
    .map(
      (pp) => `<tr>
        <td><span class="cell-name">${dotHtml(pp.slot)}${esc(pp.name)}</span></td>
        <td class="num">${fmtHuman(pp.ms)}</td>
        <td class="num pct">${Math.round((pp.ms / rec.focusMs) * 100)}%</td>
      </tr>`
    )
    .join("");

  const shareBar = `<div class="share-bar" role="img" aria-label="Share of focus per project">
    ${rec.perProject
      .map((pp) => `<i style="--f:${(pp.ms / rec.focusMs).toFixed(5)}; --pc: var(--cat-${pp.slot})" title="${esc(pp.name)} — ${Math.round((pp.ms / rec.focusMs) * 100)}%"></i>`)
      .join("")}
  </div>`;

  // Variable rewards: a flow word + whatever records this session happened to set
  const flow = flowRating(rec);
  const moments = momentsFor(rec);
  const st = streakDays();
  const rewardsHtml = flow || moments.length
    ? `<div class="reward-row">
         ${flow ? `<span class="flow-chip flow-${flow.tone}">${flow.word} session — ${flow.blurb}</span>` : ""}
         ${moments.map((m) => `<span class="moment-chip">${ICONS.spark}${esc(m)}</span>`).join("")}
       </div>`
    : "";

  return `
    <div class="sum-head">
      <h1>Session complete</h1>
      <p>${fmtDay(rec.startedAt)} · ${fmtTime(rec.startedAt)} – ${fmtTime(rec.endedAt)}</p>
    </div>
    ${rewardsHtml}
    ${tiles}
    <section class="sum-section" aria-label="Attention timeline">
      <h2 class="sec-label">Attention timeline</h2>
      ${stripHtml(timelineItems(rec), { label: stripLabel(rec) })}
      <div class="strip-scale"><span>${fmtTime(rec.startedAt)}</span><span>${fmtTime(rec.endedAt)}</span></div>
    </section>
    <section class="sum-section" aria-label="Per-project breakdown">
      <h2 class="sec-label">Where it went</h2>
      ${shareBar}
      <table class="break-table">
        <thead><tr><th scope="col">Project</th><th scope="col" class="num">Time</th><th scope="col" class="num">Share</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
    <div class="sum-actions">
      <button class="pill pill-dark" data-action="goHome">Done</button>
      <button class="pill pill-ghost" data-action="openTrends">Trends</button>
      <button class="pill pill-ghost pill-icon" data-action="deleteSession" data-id="${rec.id}" aria-label="Delete this session record">${ICONS.trash}</button>
    </div>
    ${st.today && st.n >= 1
      ? `<p class="streak-note">${st.n === 1 ? "Day one is on the board — same time tomorrow?" : `Day ${st.n} in a row. Come back tomorrow to keep the run going.`}</p>`
      : ""}
  `;
}

/* ---------- Trends view ---------- */

function renderTrends() {
  if (!state.sessions.length) {
    return `
      <div class="sum-head"><h1>Your trends</h1><p>Patterns need a little data first.</p></div>
      <div class="empty-card">Finish a session or two and this page starts showing daily focus, switch rate, streaks, and personal records.</div>
      <div class="sum-actions" style="margin-top:22px"><button class="pill pill-dark" data-action="goHome">Back</button></div>`;
  }

  const series = dailySeries(14);
  const week = series.slice(7);
  const prev = series.slice(0, 7);
  const wFocus = week.reduce((t, d) => t + d.focusMs, 0);
  const pFocus = prev.reduce((t, d) => t + d.focusMs, 0);
  const wRate = rateOf(wFocus, week.reduce((t, d) => t + d.switches, 0));
  const pRate = rateOf(pFocus, prev.reduce((t, d) => t + d.switches, 0));
  const st = streakDays();
  const todayKey = new Date().toDateString();

  const focusDelta = pFocus
    ? wFocus >= pFocus
      ? `<span class="delta good">▲ ${fmtHuman(wFocus - pFocus)} vs last week</span>`
      : `<span class="delta quiet">▼ ${fmtHuman(pFocus - wFocus)} vs last week</span>`
    : "";
  const rateDelta = wRate !== null && pRate !== null
    ? wRate <= pRate
      ? `<span class="delta good">▼ calmer than last week</span>`
      : `<span class="delta quiet">▲ livelier than last week</span>`
    : "";

  const tiles = `
    <div class="tiles">
      <div class="tile feature"><b>${fmtHuman(wFocus)}</b><small>Focus · 7 days</small>${focusDelta ? `<span class="sub">${focusDelta}</span>` : ""}</div>
      <div class="tile feature"><b>${wRate === null ? "—" : fmtRate(wRate)}</b><small>Switches/hr · 7 days</small>${rateDelta ? `<span class="sub">${rateDelta}</span>` : ""}</div>
      <div class="tile"><b>${st.n}</b><small>${st.n === 1 ? "Day streak" : "Day streak"}</small>${st.n > 0 && !st.today ? `<span class="sub">today keeps it alive</span>` : ""}</div>
    </div>`;

  // Chart A — daily focus, stacked by project (14 days)
  const maxFocus = Math.max(...series.map((d) => d.focusMs), 1);
  const focusCols = series
    .map((d) => {
      const segs = [...d.perSlot.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([slot, ms]) => `<i style="height:${((ms / maxFocus) * 100).toFixed(2)}%; --pc: var(--cat-${slot})"></i>`)
        .join("");
      return `<div class="bar-col${d.key === todayKey ? " today" : ""}" role="img"
                aria-label="${d.label}: ${d.focusMs ? `${fmtHuman(d.focusMs)} focus, ${d.switches} switches` : "no focus"}"
                title="${d.focusMs ? fmtHuman(d.focusMs) : "—"}">
        <div class="bar-stack">${segs || '<span class="nil"></span>'}</div>
        <span class="bar-day">${d.label}</span>
      </div>`;
    })
    .join("");

  // Chart B — switch rate per day (single hue; lower = calmer)
  const rates = series.map((d) => rateOf(d.focusMs, d.switches));
  const maxRate = Math.max(...rates.filter((r) => r !== null), 1);
  const rateCols = series
    .map((d, i) => {
      const r = rates[i];
      const bar = r === null
        ? '<span class="nil"></span>'
        : `<i class="mono" style="height:${((r / maxRate) * 100).toFixed(2)}%"></i>`;
      return `<div class="bar-col${d.key === todayKey ? " today" : ""}" role="img"
                aria-label="${d.label}: ${r === null ? "not enough focus to rate" : `${fmtRate(r)} switches per hour`}"
                title="${r === null ? "—" : `${fmtRate(r)}/hr`}">
        <div class="bar-stack">${bar}</div>
        <span class="bar-day">${d.label}</span>
      </div>`;
    })
    .join("");

  // Records — the investment on display
  const longestRec = state.sessions.reduce((m, s) => (s.longestMs > m.longestMs ? s : m));
  const dayTotals = new Map();
  for (const s of state.sessions) {
    const k = new Date(s.startedAt).toDateString();
    const cur = dayTotals.get(k) || { ms: 0, ts: s.startedAt };
    cur.ms += s.focusMs;
    dayTotals.set(k, cur);
  }
  const bestDay = [...dayTotals.values()].reduce((m, d) => (d.ms > m.ms ? d : m));
  const rated = state.sessions
    .map((s) => ({ s, r: rateOf(s.focusMs, s.switches) }))
    .filter((x) => x.r !== null);
  const calmest = rated.length ? rated.reduce((m, x) => (x.r < m.r ? x : m)) : null;
  const allFocus = state.sessions.reduce((t, s) => t + s.focusMs, 0);

  const records = `
    <div class="tiles">
      <div class="tile"><b>${fmtHuman(longestRec.longestMs)}</b><small>Longest block ever</small></div>
      <div class="tile"><b>${fmtHuman(bestDay.ms)}</b><small>Best day</small><span class="sub">${fmtDay(bestDay.ts)}</span></div>
      ${calmest ? `<div class="tile"><b>${fmtRate(calmest.r)}/hr</b><small>Calmest session</small><span class="sub">${fmtDay(calmest.s.startedAt)}</span></div>` : ""}
      <div class="tile"><b>${fmtHuman(allFocus)}</b><small>All-time focus</small><span class="sub">${state.sessions.length} ${state.sessions.length === 1 ? "session" : "sessions"}</span></div>
    </div>`;

  // Per-project, last 7 days
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - 6);
  const perWeek = new Map();
  for (const s of state.sessions) {
    if (s.startedAt < weekStart.getTime()) continue;
    for (const pp of s.perProject) {
      const cur = perWeek.get(pp.id) || { name: pp.name, slot: pp.slot, ms: 0 };
      cur.ms += pp.ms;
      perWeek.set(pp.id, cur);
    }
  }
  const weekProjects = [...perWeek.values()].sort((a, b) => b.ms - a.ms);
  const weekBreakdown = weekProjects.length && wFocus
    ? `<section class="sum-section" aria-label="Per-project, last 7 days">
        <h2 class="sec-label">This week, per project</h2>
        <div class="share-bar" role="img" aria-label="Share of this week's focus per project">
          ${weekProjects.map((p) => `<i style="--f:${(p.ms / wFocus).toFixed(5)}; --pc: var(--cat-${p.slot})" title="${esc(p.name)} — ${fmtHuman(p.ms)}"></i>`).join("")}
        </div>
        <table class="break-table">
          <thead><tr><th scope="col">Project</th><th scope="col" class="num">Time</th><th scope="col" class="num">Share</th></tr></thead>
          <tbody>${weekProjects
            .map((p) => `<tr>
              <td><span class="cell-name">${dotHtml(p.slot)}${esc(p.name)}</span></td>
              <td class="num">${fmtHuman(p.ms)}</td>
              <td class="num pct">${Math.round((p.ms / wFocus) * 100)}%</td>
            </tr>`)
            .join("")}</tbody>
        </table>
      </section>`
    : "";

  return `
    <div class="sum-head">
      <h1>Your trends</h1>
      <p>Last 14 days — focus, switching, and the records you're building.</p>
    </div>
    ${tiles}
    <section class="sum-section" aria-label="Daily focus, last 14 days">
      <div class="chart-head"><h2 class="sec-label">Daily focus</h2><span class="chart-max">peak ${fmtHuman(maxFocus === 1 ? 0 : maxFocus)}</span></div>
      <div class="bars">${focusCols}</div>
    </section>
    <section class="sum-section" aria-label="Switch rate, last 14 days">
      <div class="chart-head"><h2 class="sec-label">Switches per hour</h2><span class="chart-max">lower&nbsp;=&nbsp;calmer</span></div>
      <div class="bars">${rateCols}</div>
    </section>
    <section class="sum-section" aria-label="Personal records">
      <h2 class="sec-label" style="display:block;margin-bottom:12px">Records</h2>
      ${records}
    </section>
    ${weekBreakdown}
    <div class="sum-actions">
      <button class="pill pill-dark" data-action="goHome">Done</button>
    </div>
  `;
}

/* ---------- Render root ---------- */

const appEl = document.getElementById("app");
const washEl = document.getElementById("wash");
const themeMeta = document.querySelector('meta[name="theme-color"]');
let currentSlot = null; // slot of the project colouring the ambience right now

function mixHex(hex, base, t) {
  const h = (x) => parseInt(x, 16);
  const c = (a, b) =>
    Math.round(h(a) * t + h(b) * (1 - t)).toString(16).padStart(2, "0");
  return "#" + c(hex.slice(1, 3), base.slice(1, 3)) + c(hex.slice(3, 5), base.slice(3, 5)) + c(hex.slice(5, 7), base.slice(5, 7));
}

function render() {
  appEl.innerHTML =
    view === "session" ? renderSession() :
    view === "summary" ? renderSummary() :
    view === "trends" ? renderTrends() :
    renderHome();

  const a = state.active;
  const inSession = view === "session" && !!a;
  document.body.classList.toggle("in-session", inSession);

  // Ambient wash takes the active (or paused) project's colour
  let washSlot = null;
  if (inSession) {
    const seg = openSeg(a);
    const last = a.segments[a.segments.length - 1];
    const ref = seg ?? last;
    if (ref) {
      const p = state.projects.find((x) => x.id === ref.p);
      if (p) washSlot = p.slot;
    }
  }
  washEl.style.setProperty("--pc", washSlot === null ? "transparent" : `var(--cat-${washSlot})`);
  currentSlot = washSlot;

  // Tint the browser chrome (mobile status bar) toward the active project
  if (themeMeta) {
    themeMeta.content = washSlot === null ? "#F8F9FA" : mixHex(CAT_HEX[washSlot], "#F8F9FA", 0.16);
  }

  setupRing();
  syncWakeLock();

  if (justSwitched) {
    justSwitched = false;
    const n = document.getElementById("switch-n");
    if (n) {
      n.classList.add("pop");
      n.addEventListener("animationend", () => n.classList.remove("pop"), { once: true });
    }
  }
  tick();
  syncRingLoop();
}

/* ---------- Live clock tick (text, 500ms) ---------- */

function tick() {
  const a = state.active;
  if (!a) {
    if (document.title !== "Attention Switch") document.title = "Attention Switch";
    return;
  }
  const t = now();
  const seg = openSeg(a);
  const brk = openBreak(a);

  for (const el of appEl.querySelectorAll("[data-clock]")) {
    const kind = el.getAttribute("data-clock");
    let ms = null;
    if (kind === "wall") ms = a.startedAt ? t - a.startedAt : 0;
    else if (kind === "focus") ms = focusMs(a, t);
    else if (kind === "block" && seg) ms = segMs(seg, t);
    else if (kind === "break" && brk) ms = segMs(brk, t);
    else if (kind === "activeProj" && seg) ms = projSessionMs(a, seg.p, t);
    else if (kind === "pausedProj") {
      const last = a.segments[a.segments.length - 1];
      if (last) ms = projSessionMs(a, last.p, t);
    } else if (kind.startsWith("proj:")) ms = projSessionMs(a, kind.slice(5), t);
    if (ms === null) continue;

    const txt = fmtClock(ms);
    if (el.hasAttribute("data-digits")) {
      if (el.dataset.v !== txt) {
        const old = el.dataset.v || "";
        el.dataset.v = txt;
        el.innerHTML = digitsHtml(txt);
        if (!reducedMotion.matches) {
          const cells = el.children;
          for (let i = 0; i < cells.length; i++) {
            if (old.length !== txt.length || old[i] !== txt[i]) cells[i].classList.add("chg");
          }
        }
      }
    } else if (el.textContent !== txt) {
      el.textContent = txt;
    }
  }

  // Reduced motion: no orbit loop, but dots are still born as time passes —
  // repaint the ring statically on each tick.
  if (reducedMotion.matches && view === "session" && seg) {
    syncDots();
    drawRing(performance.now() / 1000, { motion: false, gray: null });
  }

  // Grow the live mini-strip's open block without a full re-render
  const lastCell = appEl.querySelector(".live-strip-wrap .strip i:last-child");
  if (lastCell && (seg || brk)) {
    const open = seg || brk;
    const total = (a.startedAt ? t - a.startedAt : 1) || 1;
    lastCell.style.setProperty("--f", (segMs(open, t) / total).toFixed(5));
  }

  if (seg) {
    const p = state.projects.find((x) => x.id === seg.p);
    document.title = `${fmtClock(projSessionMs(a, seg.p, t))} · ${p ? p.name : ""} — Attention Switch`;
  } else if (brk) {
    document.title = "On a break — Attention Switch";
  } else {
    document.title = "Session ready — Attention Switch";
  }
}

setInterval(tick, 500);

/* ---------- Attention ring (canvas, rAF) ----------
   Jovey-field confetti dashes orbiting the counting clock. Each dash's
   colour is allocated from the session's per-project time split via a
   fixed shuffled permutation — as a project's share grows, dashes flip
   to its colour one at a time. */

let rafId = null;
let ringCanvas = null, ringCtx = null, ringSize = 0, ringR = 0;
let ringParticles = [];      // every project's dots — the session's composition
let dyingParticles = [];     // deducted dots scattering away
let ringLastT = null;
let ringSessionKey = null;   // session identity — a new session clears the ring
let ringEarnedBy = new Map(); // projId → dots ever born (deducted dots aren't reborn)
let ringFocusId = null;      // current focus — a change triggers wave + deduction
let ringWaveT0 = -99;        // when the last swap wave started (perf seconds)
const ringTilt = { x: 0, y: 0, tx: 0, ty: 0 }; // parallax state (current → target)

function seedDot(slot, born = 0, projId = null, k = 1) {
  // shade: light / base / deep from the project's orb family (30/40/30)
  const r = Math.random();
  const band = 1 + (Math.random() - 0.5) * RING_THICK;
  return {
    born,
    projId,
    k, // prominence 0..1 — focused project's dots glow, others recede
    ang: Math.random() * 2 * Math.PI,
    band,
    depth: 0.5 + (band - 1 + RING_THICK / 2) / RING_THICK, // 0.5..1.5 parallax layer
    size: 5 + Math.random() * 4.5,      // dash length, like the jovey field
    weight: 1.1 + Math.random() * 0.7,  // ~thin strokes, round caps
    phase: Math.random() * 2 * Math.PI,
    pulse: 0.6 + Math.random() * 1.3,   // twinkle rate
    wob: Math.random() * 2 * Math.PI,
    wobSpd: 0.4 + Math.random() * 0.8,  // radial shimmer
    orbit: ORBIT_SPEED * (0.75 + Math.random() * 0.5),
    tilt: (Math.random() - 0.5) * 0.5,  // dash-angle jitter off the tangent
    slot,
    shade: r < 0.3 ? 0 : r < 0.7 ? 1 : 2,
  };
}

// Reward curve: √time. A burst when focus begins (~12 dots in the first
// 30s, one every couple of seconds), easing toward ~one dot per minute
// deep into a project.
function dotCountFor(ms) {
  return Math.min(DOT_MAX, Math.max(1, Math.round(DOT_CURVE_K * Math.sqrt(ms / 1000))));
}

// The ring holds EVERY project's earned dots at once — the session's
// composition so far. Each project's pile grows on its own √ curve while
// focused (fast burst early). The focused project's dots glow at full
// prominence; the others recede but stay visible in their colours.
// Past DOT_SOFT total, the oldest dots are deducted (and never reborn).
// `dt` present → animated births (1/frame); dt null → instant fill.
function syncDots(dt) {
  const a = state.active;
  const key = a && a.startedAt !== null ? a.startedAt : null;
  if (ringSessionKey !== key) {
    ringSessionKey = key;
    ringParticles = [];
    dyingParticles = [];
    ringEarnedBy = new Map();
    ringFocusId = null;
    ringWaveT0 = -99;
  }
  if (!key) return;
  const t = now();
  const focusSeg = openSeg(a) ?? (a.segments.length ? a.segments[a.segments.length - 1] : null);
  const focusId = focusSeg ? focusSeg.p : null;

  // A swap: send a wave through the ring, and only NOW deduct overflow —
  // dots are never pushed out while you stay inside a project.
  if (focusId !== ringFocusId) {
    if (ringFocusId !== null && focusId !== null && !reducedMotion.matches) {
      ringWaveT0 = performance.now() / 1000;
    }
    while (ringParticles.length > DOT_SOFT) {
      const old = ringParticles.shift();
      if (dt != null && !reducedMotion.matches) {
        dyingParticles.push({
          ...old,
          dieT: 0,
          vBand: 0.8 + Math.random() * 1.2,
          vAng: (Math.random() - 0.5),
        });
      }
    }
    ringFocusId = focusId;
  }

  let budget = dt == null ? Infinity : 1;
  const bornT = performance.now() / 1000;
  for (const p of state.projects) {
    if (budget <= 0) break;
    const ms = projSessionMs(a, p.id, t);
    if (!ms) continue;
    const earned = dotCountFor(ms);
    let born = ringEarnedBy.get(p.id) || 0;
    while (born < earned && budget > 0) {
      ringParticles.push(seedDot(p.slot, bornT, p.id, p.id === focusId ? 1 : 0.35));
      born++;
      budget--;
    }
    ringEarnedBy.set(p.id, born);
  }

  // static contexts can't animate prominence — set it directly
  if (dt == null || reducedMotion.matches) {
    for (const p of ringParticles) p.k = p.projId === focusId ? 1 : 0.35;
  }
}

function setupRing() {
  ringCanvas = appEl.querySelector(".ring-canvas");
  ringCtx = null;
  ringLastT = null;
  if (ringCanvas) {
    const size = ringCanvas.parentElement.clientWidth;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    ringCanvas.width = size * dpr;
    ringCanvas.height = size * dpr;
    ringCtx = ringCanvas.getContext("2d");
    ringCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ringSize = size;
    ringR = size * RING_FRAC;
    paintRingForState();
  }
  syncRingLoop();
}

function drawDash(p, alpha, color, wobble, pop = 1) {
  const cx = ringSize / 2, cy = ringSize / 2;
  const r = ringR * p.band + wobble;
  const depth = p.depth || 1; // deeper-band dots drift more — parallax layers
  const x = cx + Math.cos(p.ang) * r + ringTilt.x * depth;
  const y = cy + Math.sin(p.ang) * r + ringTilt.y * depth;
  ringCtx.save();
  ringCtx.translate(x, y);
  ringCtx.rotate(p.ang + Math.PI / 2 + p.tilt); // tangent to the orbit
  ringCtx.globalAlpha = alpha;
  ringCtx.strokeStyle = color;
  ringCtx.lineWidth = p.weight * pop;
  ringCtx.lineCap = "round";
  ringCtx.beginPath();
  ringCtx.moveTo((-p.size / 2) * pop, 0);
  ringCtx.lineTo((p.size / 2) * pop, 0);
  ringCtx.stroke();
  ringCtx.restore();
}

function drawRing(t, { motion, gray }) {
  if (!ringCtx) return;
  ringCtx.clearRect(0, 0, ringSize, ringSize);
  // dropped-streak dots scatter behind the living ring
  if (motion && !gray) {
    for (const p of dyingParticles) {
      const fade = Math.max(0, 1 - p.dieT / DOT_DIE_S);
      drawDash(p, fade * 0.7, CAT_FAM[p.slot][p.shade], 0);
    }
  }
  const waveT = t - ringWaveT0;
  const waving = motion && waveT >= 0 && waveT < WAVE_DUR;
  for (const p of ringParticles) {
    let wobble = motion ? Math.sin(t * p.wobSpd + p.wob) * WOBBLE : 0;
    if (waving) {
      // the swap wave: a decaying ripple travelling around the ring
      wobble += WAVE_A * Math.exp(-waveT * 2.2) * Math.sin(p.ang * 3 - waveT * 12);
    }
    let alpha = motion
      ? Math.max(0.18, 0.55 + 0.4 * Math.sin(t * p.pulse * 2 + p.phase))
      : 0.5;
    // prominence: focused project full-strength, others recessive
    const prom = 0.4 + 0.6 * p.k;
    alpha *= prom;
    let pop = 0.82 + 0.22 * p.k;
    // newborn pop: fade in fast, land from slightly oversized
    if (motion && p.born) {
      const age = Math.min(1, (t - p.born) / DOT_IN_S);
      alpha *= Math.max(0.2, age);
      pop *= 1 + 0.7 * (1 - age);
    }
    drawDash(p, gray ? 0.4 : alpha, gray || CAT_FAM[p.slot][p.shade], wobble, pop);
  }
}

// Paint after a render. Running + motion allowed → births stay animated
// (the loop re-piles at one dot per frame); otherwise fill instantly.
function paintRingForState() {
  const a = state.active;
  if (!ringCtx || !a) return;
  const animated = openSeg(a) && !reducedMotion.matches;
  syncDots(animated ? 0 : null);
  const t = performance.now() / 1000;
  if (openSeg(a)) drawRing(t, { motion: !reducedMotion.matches, gray: null });
  else if (openBreak(a)) drawRing(t, { motion: false, gray: BREAK_GRAY });
  else drawRing(t, { motion: false, gray: null }); // idle → no dots yet
}

function ringFrame() {
  const a = state.active;
  const seg = a && openSeg(a);
  if (!seg || !ringCtx || document.hidden || view !== "session" || reducedMotion.matches) {
    rafId = null;
    return;
  }
  const t = performance.now() / 1000;
  const dt = ringLastT === null ? 0 : Math.min(0.1, t - ringLastT);
  ringLastT = t;
  const focusNow = openSeg(state.active);
  const focusId = focusNow ? focusNow.p : null;
  const lerp = Math.min(1, 7 * dt);
  // parallax chase — the ring leans with the phone (or the cursor)
  const tiltLerp = Math.min(1, 5 * dt);
  ringTilt.x += (ringTilt.tx - ringTilt.x) * tiltLerp;
  ringTilt.y += (ringTilt.ty - ringTilt.y) * tiltLerp;
  for (const p of ringParticles) {
    p.ang += p.orbit * dt; // the circling
    // prominence chase: the focused project's pile pops up fast,
    // the others settle back — nothing disappears
    p.k += ((p.projId === focusId ? 1 : 0.35) - p.k) * lerp;
  }
  if (dyingParticles.length) {
    for (const p of dyingParticles) {
      p.dieT += dt;
      p.band += p.vBand * dt;             // fly outward
      p.ang += (p.orbit + p.vAng) * dt;   // with a spin of its own
    }
    dyingParticles = dyingParticles.filter((p) => p.dieT < DOT_DIE_S);
  }
  syncDots(dt); // reward-curve births + deduction past the soft cap
  drawRing(t, { motion: true, gray: null });
  rafId = requestAnimationFrame(ringFrame);
}

function syncRingLoop() {
  const a = state.active;
  const shouldRun =
    view === "session" && a && openSeg(a) && !document.hidden && !reducedMotion.matches;
  if (shouldRun && rafId === null) {
    ringLastT = null;
    rafId = requestAnimationFrame(ringFrame);
  }
  if (!shouldRun && rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

addEventListener("resize", () => {
  if (view === "session") setupRing();
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) tick();
  syncRingLoop();
  syncWakeLock();
});

/* ---------- Ring parallax input: device tilt, cursor as fallback ---------- */

addEventListener("deviceorientation", (e) => {
  if (e.gamma == null || e.beta == null || reducedMotion.matches) return;
  ringTilt.tx = Math.max(-1, Math.min(1, e.gamma / 28)) * TILT_MAX;
  ringTilt.ty = Math.max(-1, Math.min(1, (e.beta - 42) / 28)) * TILT_MAX;
});

addEventListener("mousemove", (e) => {
  if (reducedMotion.matches) return;
  ringTilt.tx = (e.clientX / innerWidth - 0.5) * 2 * TILT_MAX * 0.8;
  ringTilt.ty = (e.clientY / innerHeight - 0.5) * 2 * TILT_MAX * 0.8;
});

// iOS needs a user-gesture permission for motion events — ask when a
// session starts (a tap), fail silently everywhere else.
function askMotionPermission() {
  try {
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === "function") {
      DeviceOrientationEvent.requestPermission().catch(() => {});
    }
  } catch (_) { /* not iOS — listener already works */ }
}

/* ---------- Phone niceties: haptics + screen wake lock ---------- */

function buzz(ms) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (_) { /* unsupported */ }
}

let wakeLock = null;
async function syncWakeLock() {
  const want = view === "session" && !!state.active;
  try {
    if (want && !wakeLock && "wakeLock" in navigator && document.visibilityState === "visible") {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    } else if (!want && wakeLock) {
      const wl = wakeLock;
      wakeLock = null;
      await wl.release();
    }
  } catch (_) {
    wakeLock = null; // permission denied or unsupported — timing is timestamp-based anyway
  }
}

// Offline support when served over http(s) — home-screen app keeps working.
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

/* ---------- Events ---------- */

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el || el.disabled) return;
  e.preventDefault();
  const fn = actions[el.dataset.action];
  if (fn) fn(el.dataset.id, el);
});

document.addEventListener("submit", (e) => {
  const form = e.target.closest('[data-form="add"]');
  if (!form) return;
  e.preventDefault();
  const input = form.querySelector("input[name=name]");
  const name = input.value.trim();
  if (!name) return;
  if (state.projects.length >= PROJECT_LIMIT) return;
  if (state.projects.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    toast("You already have a project with that name.");
    return;
  }
  const used = new Set(state.projects.map((p) => p.slot));
  let slot = 0;
  while (used.has(slot) && slot < PROJECT_LIMIT) slot++;
  const project = { id: uid(), name, slot, createdAt: now() };
  state.projects.push(project);
  const fromSession = view === "session";
  addOpen = false;

  if (fromSession && state.active && state.active.startedAt !== null) {
    // You add a project mid-session because your attention just moved there.
    save();
    actions.tap(project.id); // switches (or resumes from break), announces, commits
    toast(`Added ${project.name} — attention switched to it.`);
  } else {
    commit();
    if (fromSession) {
      announce(`Added ${project.name}. Tap it to begin.`);
    } else {
      const next = document.getElementById("proj-name");
      if (next) next.focus();
    }
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && addOpen) {
    addOpen = false;
    render();
    return;
  }
  if (e.target.matches("input, textarea, select")) return;
  if (view !== "session" || !state.active) return;
  if (e.key >= "1" && e.key <= "8") {
    const p = state.projects[Number(e.key) - 1];
    if (p) { e.preventDefault(); actions.tap(p.id); }
  } else if (e.key === " ") {
    e.preventDefault();
    actions.toggleBreak();
  }
});

// Multi-tab safety: reload state written by another tab.
window.addEventListener("storage", (e) => {
  if (e.key !== KEY) return;
  state = load();
  if (view === "session" && !state.active) view = "home";
  if (view === "summary" && !state.sessions.some((s) => s.id === summaryId)) view = "home";
  render();
});

/* ---------- Boot ---------- */

render();
