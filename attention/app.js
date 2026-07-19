/* ============================================================
   Attention Switch — app logic (Jovey theme)
   Timing is timestamp-based (Date.now), so clocks stay accurate
   across reloads and backgrounded tabs. State persists to
   localStorage on every mutation.
   ============================================================ */

"use strict";

const KEY = "attention-switch:v1";
const PROJECT_LIMIT = 9; // matches the nine stable Jovey color slots
const MIN_SESSION_MS = 10_000;
const HISTORY_PREVIEW = 8;
const SWITCH_FEELINGS = [
  "Overwhelmed",
  "Restless",
  "Bored",
  "Anxious",
  "Curious",
  "Frustrated",
  "Energized",
  "Relieved",
];
// Attention ring — jovey-style confetti dashes orbiting the counting clock.
// The ring holds the WHOLE SESSION'S composition: every project's earned
// dots in its own colour. The focused project's pile glows at full
// prominence (and pops up fast when you switch to it); the rest recede
// but remain visible. Past the soft cap the oldest dots are deducted.
const RING_FRAC = 0.44;   // ring radius as a fraction of the dial box
const RING_THICK = 0.24;  // radial band spread (fraction of radius)
// Locked particle model — shared by the logo, home swarm, and session ring.
const PARTICLE_SIZE = 7;
const PARTICLE_WEIGHT = 1.35;
const PARTICLE_ALPHA_MIN = 0.28;
const PARTICLE_ALPHA_MAX = 0.9;
const PARTICLE_ROTATION_SPEED = (2 * Math.PI) / 42;
const SINE_AMP_MIN = 1.2;
const SINE_AMP_MAX = 4.8;
const ORBIT_SPEED = PARTICLE_ROTATION_SPEED;
const BREAK_GRAY = "#9aa1ab";
const DOT_MAX = 420;      // absolute earn ceiling (safety)
const DOT_SOFT = 240;     // ring ceiling — overflow is deducted ONLY at a swap
const DOT_CURVE_K = 2.2;  // reward curve: dots ≈ K·√(project seconds) — fast burst early
const DOT_DIE_S = 0.45;   // quick pop-away for deducted dots
const DOT_IN_S = 0.25;    // pop-in age of a newborn dot
const WAVE_DUR = 1.4;     // swap wave: a ripple runs through the ring
const WAVE_A = 10;        // wave amplitude (px)
const TILT_MAX = 11;      // ring parallax with device tilt / cursor (px)

// Jovey field/pillar families shared by the swarm, session, and project UI.
const CAT_FAM = [
  ["#feca57", "#FF9F43", "#D9822B"],
  ["#48dbfb", "#3b6e8f", "#3b6e8f"],
  ["#feca57", "#feca57", "#FF9F43"],
  ["#FF5E7E", "#B0519E", "#B15BFF"],
  ["#1FA39A", "#1FA39A", "#3b6e8f"],
  ["#FF9F43", "#FF5E7E", "#B0519E"],
  ["#48dbfb", "#48dbfb", "#1FA39A"],
  ["#B15BFF", "#B15BFF", "#B0519E"],
  ["#FF9F43", "#E67673", "#FF5E7E"],
];

// Mirrors --cat-0..8 in styles.css (for the dynamic <meta theme-color>)
const CAT_HEX = ["#FF9F43", "#3B6E8F", "#FECA57", "#B0519E", "#1FA39A", "#FF5E7E", "#48DBFB", "#B15BFF", "#E67673"];
const CAT_LABELS = ["Tangerine", "Jovey blue", "Sunshine", "Magenta", "Teal", "Coral", "Sky", "Violet", "Rose"];

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const mobileMotion = matchMedia("(max-width: 720px), (pointer: coarse)");

/* ---------- State ---------- */

const LEGACY_STARTER_PROJECTS = [
  { id: "starter-mindspend", name: "Mindspend", slot: 0 },
  { id: "starter-jovey-blog", name: "Jovey blog", slot: 1 },
  { id: "starter-read-books", name: "Read books", slot: 2 },
  { id: "starter-vocs-tb-ai", name: "VOCs TB AI", slot: 3 },
  { id: "starter-feed-pro", name: "Feed pro", slot: 4 },
  { id: "starter-attention-switching", name: "Attention switching", slot: 5 },
];

function removeUntouchedStarterProjects(stored) {
  if (stored.active) return stored;

  const referencedIds = new Set();
  for (const session of Array.isArray(stored.sessions) ? stored.sessions : []) {
    for (const project of Array.isArray(session.perProject) ? session.perProject : []) {
      if (project.id) referencedIds.add(project.id);
    }
    for (const segment of Array.isArray(session.segments) ? session.segments : []) {
      if (segment.id || segment.p) referencedIds.add(segment.id || segment.p);
    }
    for (const event of Array.isArray(session.switchEvents) ? session.switchEvents : []) {
      if (event.fromId) referencedIds.add(event.fromId);
      if (event.toId) referencedIds.add(event.toId);
    }
  }
  for (const note of Array.isArray(stored.notes) ? stored.notes : []) {
    if (note.projectId) referencedIds.add(note.projectId);
  }

  const projects = stored.projects.filter((project) => {
    const starter = LEGACY_STARTER_PROJECTS.find((item) => item.id === project.id);
    if (!starter) return true;
    const untouched = project.name === starter.name
      && project.slot === starter.slot
      && !project.archivedAt
      && (!Array.isArray(project.tasks) || project.tasks.length === 0)
      && !referencedIds.has(project.id);
    return !untouched;
  });

  if (projects.length === stored.projects.length) return stored;
  const migrated = { ...stored, projects };
  localStorage.setItem(KEY, JSON.stringify(migrated));
  return migrated;
}

function defaults() {
  return {
    projects: [],
    active: null,
    sessions: [],
    notes: [],
    customFeelings: [],
    pendingReflectionId: null,
    theme: "auto",
  };
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.projects)) return { ...defaults(), ...removeUntouchedStarterProjects(s) };
  } catch (_) { /* corrupted storage — start fresh */ }
  return defaults();
}

let state = load();
// UI-only state (not persisted)
const pendingReflection = state.pendingReflectionId
  && state.sessions.some((session) => session.id === state.pendingReflectionId);
let view = state.active ? "session" : pendingReflection ? "reflection" : "home";
let summaryId = pendingReflection ? state.pendingReflectionId : null;
let reflectionIndex = 0;
let reflectionCustomOpen = false;
let projectHubId = null;
let selectedAttentionPathKey = null;
let showAllHistory = false;
let justSwitched = false;
let addOpen = false; // in-session "add project" tile expanded
let editingColorId = null;
let showArchivedProjects = false;
let expandedTaskProjectIds = new Set();
let taskComposerProjectIds = new Set();
let sessionCaptureMode = null;

function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

function commit() {
  save();
  render();
}

function activeProjects() {
  return state.projects.filter((project) => !project.archivedAt);
}

function archivedProjects() {
  return state.projects
    .filter((project) => project.archivedAt)
    .sort((a, b) => b.archivedAt - a.archivedAt);
}

function projectTasks(project) {
  return Array.isArray(project.tasks) ? project.tasks : [];
}

function ensureProjectTasks(project) {
  if (!Array.isArray(project.tasks)) project.tasks = [];
  return project.tasks;
}

function allNotes() {
  return Array.isArray(state.notes) ? state.notes : [];
}

function ensureNotes() {
  if (!Array.isArray(state.notes)) state.notes = [];
  return state.notes;
}

function savedSwitchFeelings() {
  const current = Array.isArray(state.customFeelings) ? state.customFeelings : [];
  const legacy = Array.isArray(state.customReasons) ? state.customReasons : [];
  const seen = new Set();
  return [...current, ...legacy].filter((feeling) => {
    if (typeof feeling !== "string" || !feeling.trim()) return false;
    const normalized = feeling.toLocaleLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  }).slice(0, 12);
}

function rememberSwitchFeeling(feeling) {
  const normalized = feeling.toLocaleLowerCase();
  state.customFeelings = [
    feeling,
    ...savedSwitchFeelings().filter((item) => item.toLocaleLowerCase() !== normalized),
  ].slice(0, 12);
}

function noteProject(note) {
  return note.projectId
    ? state.projects.find((project) => project.id === note.projectId) || null
    : null;
}

function noteSlot(note) {
  const project = noteProject(note);
  return project ? project.slot : (note.projectSlot ?? 2);
}

function switchEventsFor(rec) {
  if (Array.isArray(rec.switchEvents)) return rec.switchEvents;
  const events = [];
  for (let i = 1; i < rec.segments.length; i++) {
    const from = rec.segments[i - 1];
    const to = rec.segments[i];
    const fromId = from.id ?? from.name;
    const toId = to.id ?? to.name;
    if (fromId === toId) continue;
    events.push({
      id: `legacy-${rec.id}-${i}`,
      at: to.start,
      fromId: from.id ?? null,
      fromName: from.name,
      fromSlot: projectSlot(from),
      toId: to.id ?? null,
      toName: to.name,
      toSlot: projectSlot(to),
      answered: true,
      reason: null,
    });
  }
  return events;
}

function switchEventSlot(event, side) {
  return projectSlot({
    id: event[`${side}Id`],
    name: event[`${side}Name`],
    slot: event[`${side}Slot`],
  });
}

function reflectionRecord() {
  return state.sessions.find((session) => session.id === summaryId) ?? null;
}

function advanceReflection(rec) {
  const next = rec.switchEvents.findIndex((event) => !event.answered);
  if (next !== -1) {
    reflectionIndex = next;
    reflectionCustomOpen = false;
    save();
    render();
    return;
  }
  state.pendingReflectionId = null;
  reflectionCustomOpen = false;
  view = "summary";
  commit();
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

function fmtCompact(ms) {
  if (ms < 60_000) return "<1m";
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  const hours = ms / 3_600_000;
  return `${hours < 10 ? hours.toFixed(1).replace(".0", "") : Math.round(hours)}h`;
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
  archive: svg('<path d="M3 6h18v4H3zM5 10v10h14V10M10 14h4"/>'),
  restore: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  chevron: svg('<path d="m9 18 6-6-6-6"/>'),
  shuffle: svg('<path d="M2 18h4.5c1.5 0 2.8-.7 3.7-1.9L15 9.5c.9-1.2 2.2-1.9 3.7-1.9H22M18.5 4.5 22 7.6l-3.5 3.1M2 7.6h4.5c1.1 0 2.2.4 3 1.2M18.5 21.4l3.5-3.1-3.5-3.1M13.4 17.1c.9.8 1.9 1.2 3 1.2H22"/>'),
  spark: svg('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>'),
  note: svg('<path d="M5 3h11l3 3v15H5z"/><path d="M16 3v4h4M8 11h8M8 15h8M8 19h5"/>'),
  task: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 2.2 2.2L16 8.5"/>'),
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
      const slot = projectSlot(pp);
      day.perSlot.set(slot, (day.perSlot.get(slot) || 0) + pp.ms);
    }
  }
  return out;
}

// Focus distributed across the clock, split at each local hour boundary.
// This reveals when sustained work actually happens rather than only which
// calendar day contained the session.
function hourlyFocusSeries(days = 30) {
  const bins = Array.from({ length: 24 }, (_, hour) => ({ hour, focusMs: 0 }));
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cutoffMs = cutoff.getTime();
  for (const session of state.sessions) {
    for (const segment of session.segments || []) {
      let cursor = Math.max(segment.start, cutoffMs);
      const finish = Math.max(cursor, segment.end);
      while (cursor < finish) {
        const at = new Date(cursor);
        const boundary = new Date(cursor);
        boundary.setMinutes(0, 0, 0);
        boundary.setHours(boundary.getHours() + 1);
        const sliceEnd = Math.min(finish, boundary.getTime());
        bins[at.getHours()].focusMs += sliceEnd - cursor;
        cursor = sliceEnd;
      }
    }
  }
  return bins;
}

function fmtHour(hour) {
  const date = new Date(2020, 0, 1, hour);
  return date.toLocaleTimeString([], { hour: "numeric" });
}

function timeOfDayHtml(series) {
  const max = Math.max(...series.map((item) => item.focusMs), 1);
  const best = series.reduce((top, item) => item.focusMs > top.focusMs ? item : top, series[0]);
  const total = series.reduce((sum, item) => sum + item.focusMs, 0);
  const aria = total
    ? series.filter((item) => item.focusMs).map((item) => `${fmtHour(item.hour)}, ${fmtHuman(item.focusMs)}`).join(". ")
    : "No focus time recorded in the last 30 days";
  return `<section class="sum-section" aria-label="Focus by time of day, last 30 days">
    <div class="chart-head"><h2 class="sec-label">Time of day</h2><span class="chart-max">${total ? `peak ${fmtHour(best.hour)}–${fmtHour((best.hour + 1) % 24)}` : "last 30 days"}</span></div>
    <div class="time-day-card">
      <div class="time-day-bars" role="img" aria-label="${esc(aria)}">
        ${series.map((item) => `<i class="${item.hour === best.hour && item.focusMs ? "peak" : ""}" style="--h:${item.focusMs ? Math.max(5, (item.focusMs / max) * 100).toFixed(2) : 2}%" title="${fmtHour(item.hour)}–${fmtHour((item.hour + 1) % 24)} · ${item.focusMs ? fmtHuman(item.focusMs) : "no focus"}"><span></span></i>`).join("")}
      </div>
      <div class="time-day-axis" aria-hidden="true"><span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>12am</span></div>
      <p>${total ? `You focus most often between <b>${fmtHour(best.hour)} and ${fmtHour((best.hour + 1) % 24)}</b>.` : "Your strongest focus hour will appear after more sessions."}</p>
    </div>
  </section>`;
}

function projectDailySeries(projectId, days) {
  const out = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  for (let i = 0; i < days; i++) {
    out.push({ key: d.toDateString(), focusMs: 0 });
    d.setDate(d.getDate() + 1);
  }
  const byKey = new Map(out.map((item) => [item.key, item]));
  for (const session of state.sessions) {
    const day = byKey.get(new Date(session.startedAt).toDateString());
    if (!day) continue;
    const project = session.perProject.find((item) => item.id === projectId);
    if (project) day.focusMs += project.ms;
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
  const projects = activeProjects();
  for (const s of state.sessions) {
    for (const pp of s.perProject) {
      const p = projects.find((x) => x.id === pp.id);
      if (p) return p;
    }
  }
  return projects[0] ?? null;
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
    projectHubId = null;
    selectedAttentionPathKey = null;
    sessionCaptureMode = null;
    view = state.active ? "session" : "home";
    render();
  },

  openNotes() {
    sessionCaptureMode = null;
    view = "notes";
    render();
    scrollTo(0, 0);
  },

  deleteNote(id) {
    const note = allNotes().find((item) => item.id === id);
    if (!note || !confirm("Delete this note?")) return;
    state.notes = allNotes().filter((item) => item.id !== id);
    commit();
  },

  openSessionCapture(_id, el) {
    if (!state.active) return;
    sessionCaptureMode = el.dataset.mode === "task" ? "task" : "note";
    render();
    const target = document.getElementById(sessionCaptureMode === "task" ? "session-task-text" : "session-note-text");
    if (target) target.focus();
  },

  closeSessionCapture() {
    sessionCaptureMode = null;
    render();
  },

  closeAttentionPath() {
    selectedAttentionPathKey = null;
    render();
  },

  answerSwitchReason(id, el) {
    const rec = reflectionRecord();
    if (!rec || !Array.isArray(rec.switchEvents)) return;
    const event = rec.switchEvents.find((item) => item.id === id);
    if (!event) return;
    event.reason = el.dataset.reason || null;
    event.reasonGroup = "Feeling";
    event.reasonSource = el.dataset.source || "preset";
    event.answered = true;
    advanceReflection(rec);
  },

  openCustomReason(id) {
    const rec = reflectionRecord();
    if (!rec || !Array.isArray(rec.switchEvents)) return;
    const index = rec.switchEvents.findIndex((event) => event.id === id);
    if (index === -1) return;
    reflectionIndex = index;
    reflectionCustomOpen = true;
    render();
    const input = document.getElementById("switch-reason-custom");
    if (input) input.focus();
  },

  skipSwitchReason(id) {
    const rec = reflectionRecord();
    if (!rec || !Array.isArray(rec.switchEvents)) return;
    const event = rec.switchEvents.find((item) => item.id === id);
    if (!event) return;
    event.reason = null;
    event.reasonGroup = null;
    event.reasonSource = null;
    event.answered = true;
    advanceReflection(rec);
  },

  skipReflection() {
    const rec = reflectionRecord();
    if (!rec || !Array.isArray(rec.switchEvents)) return;
    for (const event of rec.switchEvents) {
      if (!event.answered) event.answered = true;
    }
    advanceReflection(rec);
  },

  deleteProject(id) {
    if (state.active) return;
    const p = state.projects.find((x) => x.id === id);
    if (!p) return;
    if (!confirm(`Permanently delete "${p.name}"? Past sessions keep their records.`)) return;
    state.projects = state.projects.filter((x) => x.id !== id);
    expandedTaskProjectIds.delete(id);
    taskComposerProjectIds.delete(id);
    commit();
  },

  toggleProjectColor(id) {
    if (state.active) return;
    expandedTaskProjectIds.delete(id);
    taskComposerProjectIds.delete(id);
    editingColorId = editingColorId === id ? null : id;
    render();
  },

  toggleProjectTasks(id) {
    if (state.active) return;
    const p = state.projects.find((x) => x.id === id && !x.archivedAt);
    if (!p) return;
    editingColorId = null;
    const opening = !expandedTaskProjectIds.has(id);
    if (opening) expandedTaskProjectIds.add(id);
    else {
      expandedTaskProjectIds.delete(id);
      taskComposerProjectIds.delete(id);
    }
    render();
  },

  openTaskComposer(id) {
    if (state.active) return;
    const p = state.projects.find((x) => x.id === id && !x.archivedAt);
    if (!p) return;
    editingColorId = null;
    expandedTaskProjectIds.add(id);
    taskComposerProjectIds.add(id);
    render();
    const input = document.getElementById(`task-input-${id}`);
    if (input) input.focus();
  },

  toggleTask(id, el) {
    const p = state.projects.find((x) => x.id === id && !x.archivedAt);
    if (!p) return;
    const task = projectTasks(p).find((item) => item.id === el.dataset.taskId);
    if (!task) return;
    task.done = !task.done;
    task.completedAt = task.done ? now() : null;
    expandedTaskProjectIds.add(id);
    commit();
  },

  setProjectColor(id, el) {
    if (state.active) return;
    const p = state.projects.find((x) => x.id === id && !x.archivedAt);
    const slot = Number(el.dataset.slot);
    if (!p || !Number.isInteger(slot) || slot < 0 || slot >= CAT_HEX.length) return;
    p.slot = slot;
    editingColorId = null;
    toast(`${p.name} color updated.`);
    commit();
  },

  archiveProject(id) {
    if (state.active) return;
    const p = state.projects.find((x) => x.id === id && !x.archivedAt);
    if (!p) return;
    p.archivedAt = now();
    if (editingColorId === id) editingColorId = null;
    expandedTaskProjectIds.delete(id);
    taskComposerProjectIds.delete(id);
    showArchivedProjects = true;
    toast(`${p.name} archived.`);
    commit();
  },

  restoreProject(id) {
    if (state.active) return;
    const p = state.projects.find((x) => x.id === id && x.archivedAt);
    if (!p) return;
    if (activeProjects().length >= PROJECT_LIMIT) {
      toast("Archive another project before restoring this one.");
      return;
    }
    delete p.archivedAt;
    if (!archivedProjects().length) showArchivedProjects = false;
    toast(`${p.name} restored.`);
    commit();
  },

  toggleArchived() {
    showArchivedProjects = !showArchivedProjects;
    render();
  },

  startSession() {
    if (!activeProjects().length || state.active) return;
    requestAppFullscreen();
    state.active = { id: uid(), startedAt: null, segments: [], breaks: [] };
    view = "session";
    addOpen = false;
    sessionCaptureMode = null;
    askMotionPermission();
    commit();
  },

  tap(id) {
    const a = state.active;
    if (!a) return;
    const p = state.projects.find((x) => x.id === id && !x.archivedAt);
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

    const segmentSnapshots = a.segments.map((g) => {
      const p = projOf(g.p);
      return { id: g.p, name: p ? p.name : "Deleted project", slot: p ? p.slot : 0, start: g.start, end: g.end };
    });
    const switchEvents = [];
    for (let i = 1; i < segmentSnapshots.length; i++) {
      const from = segmentSnapshots[i - 1];
      const to = segmentSnapshots[i];
      if (from.id === to.id) continue;
      switchEvents.push({
        id: uid(),
        at: to.start,
        fromId: from.id,
        fromName: from.name,
        fromSlot: from.slot,
        toId: to.id,
        toName: to.name,
        toSlot: to.slot,
        answered: false,
        reason: null,
        reasonGroup: null,
        reasonSource: null,
      });
    }

    const rec = {
      id: a.id || uid(),
      startedAt: a.startedAt,
      endedAt: t,
      focusMs: focus,
      breakMs: breakMs(a, t),
      switches: switchCount(a.segments),
      longestMs: Math.max(...a.segments.map((g) => g.end - g.start)),
      blocks: a.segments.length,
      perProject,
      segments: segmentSnapshots,
      switchEvents,
      breaks: a.breaks.map((x) => ({ start: x.start, end: x.end })),
    };
    state.sessions.unshift(rec);
    state.active = null;
    summaryId = rec.id;
    reflectionIndex = 0;
    reflectionCustomOpen = false;
    state.pendingReflectionId = switchEvents.length ? rec.id : null;
    view = switchEvents.length ? "reflection" : "summary";
    addOpen = false;
    sessionCaptureMode = null;
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
    if (state.pendingReflectionId === id) state.pendingReflectionId = null;
    view = "home";
    commit();
  },

  openProjectHub(id) {
    const p = state.projects.find((project) => project.id === id);
    if (!p) return;
    projectHubId = id;
    selectedAttentionPathKey = null;
    view = "project";
    render();
    scrollTo(0, 0);
  },

  showAllHistory() {
    showAllHistory = true;
    render();
  },

  openTrends() {
    selectedAttentionPathKey = null;
    view = "trends";
    render();
    scrollTo(0, 0);
  },

  // Hook: one tap from opening the app to a running clock.
  quickStart(id) {
    const projects = activeProjects();
    if (state.active || !projects.length) return;
    requestAppFullscreen();
    state.active = { id: uid(), startedAt: null, segments: [], breaks: [] };
    view = "session";
    addOpen = false;
    sessionCaptureMode = null;
    askMotionPermission();
    save();
    const p = projects.find((x) => x.id === id) ?? projects[0];
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

function heatLevel(ms) {
  if (!ms) return 0;
  if (ms < 10 * 60_000) return 1;
  if (ms < 30 * 60_000) return 2;
  if (ms < 60 * 60_000) return 3;
  return 4;
}

function heatmapHtml(series, label) {
  if (!series.length) return "";
  const cells = Array(new Date(series[0].key).getDay()).fill(null).concat(series);
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return `<div class="heatmap-wrap">
    <div class="heatmap-weekdays" aria-hidden="true"><span>M</span><span>W</span><span>F</span></div>
    <div class="heatmap-scroll">
      <div class="heatmap-grid" role="grid" aria-label="${esc(label)}">
        ${weeks.map((week) => `<div class="heat-week" role="row">${week.map((day) => day
          ? `<span class="heat-cell level-${heatLevel(day.focusMs)}" role="gridcell" aria-label="${esc(day.key)}: ${day.focusMs ? fmtHuman(day.focusMs) : "no focus"}" title="${esc(day.key)} — ${day.focusMs ? fmtHuman(day.focusMs) : "no focus"}"></span>`
          : '<span class="heat-cell blank" aria-hidden="true"></span>').join("")}</div>`).join("")}
      </div>
    </div>
    <div class="heatmap-legend" aria-hidden="true"><span>Less</span><i class="level-0"></i><i class="level-1"></i><i class="level-2"></i><i class="level-3"></i><i class="level-4"></i><span>More</span></div>
  </div>`;
}

function allSwitchMoves() {
  return state.sessions
    .flatMap((session) => switchEventsFor(session).map((event) => ({ ...event, sessionId: session.id })))
    .sort((a, b) => b.at - a.at);
}

function moveProjectId(event, side) {
  const storedId = event[`${side}Id`];
  if (storedId && state.projects.some((project) => project.id === storedId)) return storedId;
  const project = state.projects.find((item) => item.name === event[`${side}Name`]);
  return project ? project.id : null;
}

function attentionMapProjects(focusProjectId = null) {
  const projects = activeProjects().slice(0, PROJECT_LIMIT);
  if (!focusProjectId || projects.some((project) => project.id === focusProjectId)) return projects;
  const focus = state.projects.find((project) => project.id === focusProjectId);
  return focus ? [focus, ...projects].slice(0, PROJECT_LIMIT) : projects;
}

function attentionMapPaths(moves, projects, focusProjectId = null) {
  const ids = new Set(projects.map((project) => project.id));
  const paths = new Map();
  for (const move of moves) {
    const fromId = moveProjectId(move, "from");
    const toId = moveProjectId(move, "to");
    if (!fromId || !toId || fromId === toId || !ids.has(fromId) || !ids.has(toId)) continue;
    if (focusProjectId && fromId !== focusProjectId && toId !== focusProjectId) continue;
    const key = `${fromId}→${toId}`;
    const path = paths.get(key) || { key, fromId, toId, count: 0, reasons: new Map(), events: [] };
    path.count++;
    path.events.push(move);
    if (move.reason) path.reasons.set(move.reason, (path.reasons.get(move.reason) || 0) + 1);
    paths.set(key, path);
  }
  return [...paths.values()].sort((a, b) => b.count - a.count);
}

function attentionPathAnalysisHtml(path, projects) {
  if (!path) return "";
  const from = projects.find((project) => project.id === path.fromId);
  const to = projects.find((project) => project.id === path.toId);
  if (!from || !to) return "";
  const reasons = [...path.reasons.entries()].sort((a, b) => b[1] - a[1]);
  const explained = reasons.reduce((total, reason) => total + reason[1], 0);
  const missing = path.count - explained;
  if (missing) reasons.push(["Reason not captured", missing]);
  return `<div class="attention-path-analysis" aria-live="polite">
    <div class="attention-analysis-head">
      <div>
        <span class="mini-path"><span>${dotHtml(from.slot)}${esc(from.name)}</span><b aria-hidden="true">→</b><span>${dotHtml(to.slot)}${esc(to.name)}</span></span>
        <small>${explained} of ${path.count} ${path.count === 1 ? "switch" : "switches"} explained</small>
      </div>
      <strong>×${path.count}</strong>
      <button data-action="closeAttentionPath" aria-label="Close switching analysis">×</button>
    </div>
    <h3>Why attention moved</h3>
    ${reasons.length ? `<div class="attention-reason-breakdown">${reasons.map(([reason, count]) => `<div class="attention-reason-row${reason === "Reason not captured" ? " missing" : ""}">
      <div><span>${esc(reason)}</span><b>×${count}</b></div>
      <i aria-hidden="true"><span style="--share:${((count / path.count) * 100).toFixed(1)}%"></span></i>
    </div>`).join("")}</div>` : '<p class="attention-analysis-empty">No reason was recorded for this path yet.</p>'}
  </div>`;
}

function attentionMapHtml(moves, { focusProjectId = null, label = "Attention path map" } = {}) {
  const projects = attentionMapProjects(focusProjectId);
  const paths = attentionMapPaths(moves, projects, focusProjectId);
  const shown = paths.slice(0, 18);
  const selectedPath = paths.find((path) => path.key === selectedAttentionPathKey) || null;
  const switchTotal = paths.reduce((total, path) => total + path.count, 0);
  const aria = paths.length
    ? `${label}. ${paths.map((path) => {
        const from = projects.find((project) => project.id === path.fromId);
        const to = projects.find((project) => project.id === path.toId);
        return `${from ? from.name : "Project"} to ${to ? to.name : "Project"}, ${path.count} ${path.count === 1 ? "switch" : "switches"}`;
      }).join(". ")}.`
    : `${label}. No attention switches yet.`;
  return `<div class="attention-map-card">
    <canvas class="attention-map-canvas" width="420" height="420" data-focus-project-id="${focusProjectId ? esc(focusProjectId) : ""}" role="img" aria-label="${esc(aria)}"></canvas>
    ${attentionPathAnalysisHtml(selectedPath, projects)}
    <div class="attention-map-key" aria-label="Projects on the attention map">
      ${projects.map((project, index) => `<button data-action="openProjectHub" data-id="${project.id}" style="--pc: var(--cat-${project.slot}); --number-ink: ${projectNumberInk(CAT_HEX[project.slot] || "#3B6E8F")}">
        <i aria-hidden="true">${index + 1}</i><span>${esc(project.name)}</span>
      </button>`).join("")}
    </div>
    <p class="attention-map-note">${paths.length
      ? `Arrow direction shows where attention moved. Bolder arrows and × numbers mean more switches${paths.length > shown.length ? ` · strongest ${shown.length} paths shown` : ""}.`
      : "Switch between projects during a session to draw your first attention path."}</p>
    <span class="visually-hidden">${switchTotal} total switches represented.</span>
  </div>`;
}

function canvasRoundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function projectNumberInk(hex) {
  const value = hex.replace("#", "");
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return (red * 0.299 + green * 0.587 + blue * 0.114) > 165 ? "#212226" : "#ffffff";
}

function quadraticMapPoint(start, control, end, t) {
  const inv = 1 - t;
  return {
    x: inv * inv * start.x + 2 * inv * t * control.x + t * t * end.x,
    y: inv * inv * start.y + 2 * inv * t * control.y + t * t * end.y,
  };
}

function quadraticMapTangent(start, control, end, t) {
  return {
    x: 2 * (1 - t) * (control.x - start.x) + 2 * t * (end.x - control.x),
    y: 2 * (1 - t) * (control.y - start.y) + 2 * t * (end.y - control.y),
  };
}

// Draw a real, single-ended vector arrow as one filled outline. The shaft,
// shoulder, and destination point are one continuous shape rather than a
// stroked line with a separate triangle placed on top.
function drawOneEndVector(ctx, start, control, end, bodyWidth, fill, alpha, selected) {
  const direct = Math.hypot(end.x - start.x, end.y - start.y);
  const bend = Math.hypot(control.x - (start.x + end.x) / 2, control.y - (start.y + end.y) / 2);
  const estimatedLength = Math.max(1, direct + bend * 0.55);
  const headLength = Math.max(14, Math.min(24, bodyWidth * 2.8));
  const headT = Math.max(0.72, Math.min(0.93, 1 - headLength / estimatedLength));
  const left = [];
  const right = [];
  const steps = 20;
  for (let index = 0; index <= steps; index++) {
    const t = headT * (index / steps);
    const point = quadraticMapPoint(start, control, end, t);
    const tangent = quadraticMapTangent(start, control, end, t);
    const length = Math.hypot(tangent.x, tangent.y) || 1;
    const normalX = -tangent.y / length;
    const normalY = tangent.x / length;
    const half = bodyWidth * (0.52 - 0.07 * (t / headT));
    left.push({ x: point.x + normalX * half, y: point.y + normalY * half });
    right.push({ x: point.x - normalX * half, y: point.y - normalY * half });
  }
  const base = quadraticMapPoint(start, control, end, headT);
  const tangent = quadraticMapTangent(start, control, end, headT);
  const tangentLength = Math.hypot(tangent.x, tangent.y) || 1;
  const normalX = -tangent.y / tangentLength;
  const normalY = tangent.x / tangentLength;
  const headHalf = Math.max(8.5, bodyWidth * 1.65);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fill;
  if (selected) {
    ctx.shadowColor = "rgba(18, 19, 23, 0.2)";
    ctx.shadowBlur = 7;
  }
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (let index = 1; index < left.length; index++) ctx.lineTo(left[index].x, left[index].y);
  ctx.lineTo(base.x + normalX * headHalf, base.y + normalY * headHalf);
  ctx.lineTo(end.x, end.y);
  ctx.lineTo(base.x - normalX * headHalf, base.y - normalY * headHalf);
  for (let index = right.length - 1; index >= 0; index--) ctx.lineTo(right[index].x, right[index].y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawAttentionMap(canvas) {
  const focusProjectId = canvas.dataset.focusProjectId || null;
  const projects = attentionMapProjects(focusProjectId);
  const paths = attentionMapPaths(allSwitchMoves(), projects, focusProjectId).slice(0, 18);
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  if (!projects.length) {
    ctx.fillStyle = "#6a6a71";
    ctx.font = '600 13px "Quicksand", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("Add projects to build your attention map", width / 2, height / 2);
    return;
  }

  const size = Math.min(width, height);
  const cx = width / 2;
  const cy = height / 2;
  const radius = size * 0.355;
  const nodeRadius = Math.max(17, Math.min(23, size * 0.052));
  const nodes = projects.map((project, index) => {
    const angle = projects.length === 1 ? -Math.PI / 2 : -Math.PI / 2 + (index * Math.PI * 2) / projects.length;
    return {
      project,
      index,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    };
  });
  const byId = new Map(nodes.map((node) => [node.project.id, node]));

  ctx.save();
  ctx.strokeStyle = "rgba(59, 110, 143, 0.16)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([2, 7]);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  const drawn = [];
  const pathKeys = new Set(paths.map((path) => `${path.fromId}→${path.toId}`));
  for (const path of [...paths].reverse()) {
    const from = byId.get(path.fromId);
    const to = byId.get(path.toId);
    if (!from || !to) continue;
    const vx = to.x - from.x;
    const vy = to.y - from.y;
    const distance = Math.hypot(vx, vy) || 1;
    const ux = vx / distance;
    const uy = vy / distance;
    const roughStart = { x: from.x + ux * nodeRadius, y: from.y + uy * nodeRadius };
    const roughEnd = { x: to.x - ux * nodeRadius, y: to.y - uy * nodeRadius };
    const reciprocal = pathKeys.has(`${path.toId}→${path.fromId}`);
    const bend = reciprocal ? Math.min(28, size * 0.06) : 0;
    const normalX = -uy;
    const normalY = ux;
    const control = {
      x: (roughStart.x + roughEnd.x) / 2 + normalX * bend,
      y: (roughStart.y + roughEnd.y) / 2 + normalY * bend,
    };
    const startTangentLength = Math.hypot(control.x - from.x, control.y - from.y) || 1;
    const endTangentLength = Math.hypot(to.x - control.x, to.y - control.y) || 1;
    const start = {
      x: from.x + ((control.x - from.x) / startTangentLength) * (nodeRadius + 0.5),
      y: from.y + ((control.y - from.y) / startTangentLength) * (nodeRadius + 0.5),
    };
    // The arrow tip lands on the destination circle's outer edge. Nodes are
    // painted after paths, so their white contour joins the two cleanly.
    const end = {
      x: to.x - ((to.x - control.x) / endTangentLength) * (nodeRadius + 0.5),
      y: to.y - ((to.y - control.y) / endTangentLength) * (nodeRadius + 0.5),
    };
    const isSelected = selectedAttentionPathKey === path.key;
    const lineWidth = 2.8 + Math.min(5.8, Math.log2(path.count + 1) * 1.65) + (isSelected ? 2 : 0);
    const gradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
    gradient.addColorStop(0, CAT_HEX[from.project.slot] || "#3B6E8F");
    gradient.addColorStop(1, CAT_HEX[to.project.slot] || "#212226");

    drawOneEndVector(
      ctx,
      start,
      control,
      end,
      lineWidth,
      gradient,
      isSelected ? 1 : (selectedAttentionPathKey ? 0.3 : 0.78),
      isSelected,
    );

    const t = 0.5;
    const inv = 1 - t;
    drawn.push({
      path,
      isSelected,
      count: path.count,
      start,
      control,
      end,
      lineWidth,
      x: inv * inv * start.x + 2 * inv * t * control.x + t * t * end.x,
      y: inv * inv * start.y + 2 * inv * t * control.y + t * t * end.y,
    });
  }

  for (const marker of drawn) {
    const text = `×${marker.count}`;
    ctx.save();
    ctx.font = '700 11px "Quicksand", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const pillWidth = Math.max(27, ctx.measureText(text).width + 12);
    const pillHeight = 20;
    marker.pillWidth = pillWidth;
    marker.pillHeight = pillHeight;
    canvasRoundRect(ctx, marker.x - pillWidth / 2, marker.y - pillHeight / 2, pillWidth, pillHeight, 10);
    ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
    ctx.fill();
    ctx.strokeStyle = marker.isSelected ? "rgba(33, 34, 38, 0.46)" : "rgba(33, 34, 38, 0.14)";
    ctx.lineWidth = marker.isSelected ? 1.5 : 1;
    ctx.stroke();
    ctx.fillStyle = "#212226";
    ctx.fillText(text, marker.x, marker.y + 0.5);
    ctx.restore();
  }

  for (const node of nodes) {
    const color = CAT_HEX[node.project.slot] || "#3B6E8F";
    if (node.project.id === focusProjectId) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.24;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(node.x, node.y, nodeRadius + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.shadowColor = "rgba(18, 19, 23, 0.15)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x, node.y, nodeRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(node.x, node.y, nodeRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = projectNumberInk(color);
    ctx.font = '700 13px "Quicksand", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(node.index + 1), node.x, node.y + 0.5);
  }
  canvas._attentionPathHits = drawn;
  canvas._attentionMapNodes = nodes;
  canvas._attentionNodeRadius = nodeRadius;
}

function pointToAttentionCurve(hit, x, y) {
  let closest = Infinity;
  for (let i = 0; i <= 28; i++) {
    const t = i / 28;
    const inv = 1 - t;
    const px = inv * inv * hit.start.x + 2 * inv * t * hit.control.x + t * t * hit.end.x;
    const py = inv * inv * hit.start.y + 2 * inv * t * hit.control.y + t * t * hit.end.y;
    closest = Math.min(closest, Math.hypot(x - px, y - py));
  }
  return closest;
}

function attentionMapHit(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const hits = canvas._attentionPathHits || [];
  for (const hit of [...hits].reverse()) {
    if (Math.abs(x - hit.x) <= (hit.pillWidth || 27) / 2 + 8
      && Math.abs(y - hit.y) <= (hit.pillHeight || 20) / 2 + 8) return hit;
  }
  let best = null;
  let bestDistance = Infinity;
  for (const hit of hits) {
    const distance = pointToAttentionCurve(hit, x, y);
    if (distance < Math.max(13, hit.lineWidth + 7) && distance < bestDistance) {
      best = hit;
      bestDistance = distance;
    }
  }
  return best;
}

function activateAttentionPath(event) {
  const hit = attentionMapHit(event.currentTarget, event);
  if (!hit) return;
  selectedAttentionPathKey = hit.path.key;
  render();
  const panel = appEl.querySelector(".attention-path-analysis");
  if (panel) panel.scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "nearest" });
}

function setupAttentionMaps() {
  for (const canvas of appEl.querySelectorAll(".attention-map-canvas")) {
    drawAttentionMap(canvas);
    canvas.addEventListener("click", activateAttentionPath);
    canvas.addEventListener("pointermove", (event) => {
      canvas.style.cursor = attentionMapHit(canvas, event) ? "pointer" : "default";
    });
    canvas.addEventListener("pointerleave", () => { canvas.style.cursor = "default"; });
  }
}

// A color edit recolors the project's whole story. Snapshot colors remain as
// a fallback if the project is later permanently deleted.
function projectSlot(item) {
  const current = item.id
    ? state.projects.find((project) => project.id === item.id)
    : state.projects.find((project) => project.name === item.name);
  return current ? current.slot : (item.slot ?? 0);
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
      type: "seg", name: g.name, slot: projectSlot(g), start: g.start, ms: g.end - g.start,
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
  const projects = activeProjects();
  const archived = archivedProjects();
  const st = streakDays();
  const noteCount = allNotes().length;

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
          const tasks = projectTasks(p);
          const taskDone = tasks.filter((task) => task.done).length;
          const tasksOpen = expandedTaskProjectIds.has(p.id);
          const composerOpen = taskComposerProjectIds.has(p.id);
          const editorOpen = editingColorId === p.id;
          const colorPicker = editorOpen
            ? `<div class="project-color-editor" role="group" aria-label="Choose a color for ${esc(p.name)}">
                <span>Project color</span>
                <div class="project-swatches">
                  ${CAT_HEX.map((color, slot) => `<button class="project-swatch${p.slot === slot ? " selected" : ""}"
                    style="--swatch: ${color}" data-action="setProjectColor" data-id="${p.id}" data-slot="${slot}"
                    aria-label="${CAT_LABELS[slot]}${p.slot === slot ? ", selected" : ""}" aria-pressed="${p.slot === slot}"></button>`).join("")}
                </div>
              </div>`
            : "";
          const taskPanel = tasksOpen
            ? `<div class="project-task-panel" id="project-tasks-${p.id}">
                <div class="project-task-head">
                  <span>Tasks</span>
                  <span class="project-task-head-actions">
                    <span>${tasks.length ? `${taskDone}/${tasks.length} complete` : "Start with one small step"}</span>
                    <button data-action="openProjectHub" data-id="${p.id}" aria-label="Open ${esc(p.name)} project hub">Hub →</button>
                  </span>
                </div>
                ${composerOpen ? `<form class="task-add-form" data-form="add-task" data-project-id="${p.id}">
                    <label class="visually-hidden" for="task-input-${p.id}">Add a task to ${esc(p.name)}</label>
                    <input id="task-input-${p.id}" name="task" type="text" maxlength="80" autocomplete="off" placeholder="Add a task…" />
                    <button type="submit" aria-label="Add task to ${esc(p.name)}">${ICONS.plus}<span>Add</span></button>
                  </form>` : ""}
                ${tasks.length
                  ? `<ul class="project-task-list">${tasks.map((task) => `<li class="project-task${task.done ? " done" : ""}">
                      <label>
                        <input type="checkbox" data-action="toggleTask" data-id="${p.id}" data-task-id="${task.id}" ${task.done ? "checked" : ""} />
                        <span class="task-checkbox" aria-hidden="true"></span>
                        <span class="task-text">${esc(task.text)}</span>
                      </label>
                    </li>`).join("")}</ul>`
                  : `<p class="task-empty">No tasks yet — press + to add one.</p>`}
              </div>`
            : "";
          return `<div class="proj-item${tasksOpen ? " tasks-open" : ""}" data-swipe-item data-id="${p.id}" style="--pc: var(--cat-${p.slot})">
            <div class="project-swipe-shell">
              <button class="swipe-delete" data-action="deleteProject" data-id="${p.id}" aria-label="Delete project ${esc(p.name)}" tabindex="-1">
                ${ICONS.trash}<span>Delete</span>
              </button>
              <div class="proj-row" data-swipe-row data-project-toggle data-action="toggleProjectTasks" data-id="${p.id}"
                role="button" tabindex="0" aria-expanded="${tasksOpen}" aria-controls="project-tasks-${p.id}"
                aria-label="${tasksOpen ? "Collapse" : "Open"} tasks for ${esc(p.name)}" style="--pc: var(--cat-${p.slot})">
                <button class="project-color-trigger${editorOpen ? " active" : ""}" data-action="toggleProjectColor" data-id="${p.id}"
                  aria-label="Change color for ${esc(p.name)}" aria-expanded="${editorOpen}">${dotHtml(p.slot)}</button>
                <span class="p-name">${esc(p.name)}</span>
                <span class="p-meta">${tasks.length ? `${taskDone}/${tasks.length} tasks${all ? " · " : ""}` : ""}${all ? fmtHuman(all) + " all-time" : ""}</span>
                <button class="row-action task-toggle${composerOpen ? " active" : ""}" data-action="openTaskComposer" data-id="${p.id}"
                  aria-label="Add a task to ${esc(p.name)}" aria-expanded="${composerOpen}" aria-controls="project-tasks-${p.id}">${ICONS.plus}</button>
                <button class="row-action" data-action="archiveProject" data-id="${p.id}" aria-label="Archive project ${esc(p.name)}">${ICONS.archive}</button>
              </div>
            </div>
            ${colorPicker}
            ${taskPanel}
          </div>`;
        })
        .join("")}</div>`
    : `<div class="empty-card">Add the projects competing for your attention — then start a session and tap whichever one has it.</div>`;

  const archivedHtml = archived.length
    ? `<div class="archived-projects${showArchivedProjects ? " open" : ""}">
        <button class="archived-toggle" data-action="toggleArchived" aria-expanded="${showArchivedProjects}">
          <span>${ICONS.archive}Archived</span><span class="archived-count">${archived.length}</span>${ICONS.chevron}
        </button>
        ${showArchivedProjects ? `<div class="archived-list">${archived.map((p) => {
          const all = projectAllTimeMs(p.id);
          return `<div class="archived-row" style="--pc: var(--cat-${p.slot})">
            ${dotHtml(p.slot)}
            <span class="p-name">${esc(p.name)}</span>
            <span class="p-meta">${all ? fmtHuman(all) + " all-time" : ""}</span>
            <button class="row-action" data-action="restoreProject" data-id="${p.id}" aria-label="Restore project ${esc(p.name)}">${ICONS.restore}</button>
            <button class="row-action danger" data-action="deleteProject" data-id="${p.id}" aria-label="Permanently delete project ${esc(p.name)}">${ICONS.trash}</button>
          </div>`;
        }).join("")}</div>` : ""}
      </div>`
    : "";

  const atLimit = projects.length >= PROJECT_LIMIT;
  const addForm = atLimit
    ? `<p class="form-note">${PROJECT_LIMIT} projects max — the palette (and your attention) has limits.</p>`
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
    <div class="swarm-stage" aria-hidden="true">
      <canvas class="home-arrow-swarm"></canvas>
    </div>
    <section class="section" aria-label="Your projects">
      <div class="section-head"><h2 class="sec-label">Projects</h2><span class="count">${projects.length}/${PROJECT_LIMIT}</span></div>
      ${projHtml}
      ${projects.length ? `<p class="swipe-hint">Swipe a project left to delete</p>` : ""}
      ${addForm}
      ${archivedHtml}
    </section>
    <div class="start-wrap">
      <button class="pill pill-dark pill-block cta-start" data-action="startSession" ${projects.length ? "" : "disabled"}>
        ${ICONS.play}<span>Start session</span>
      </button>
      <p class="cta-hint">${projects.length ? "Then tap a project to begin focusing." : "Add a project first."}</p>
    </div>
    <button class="notes-wall-link" data-action="openNotes" aria-label="Open all notes, ${noteCount} saved">
      <span class="notes-wall-icon">${ICONS.note}</span>
      <span><b>Notes wall</b><small>Ideas captured without switching</small></span>
      <strong>${noteCount}</strong>${ICONS.chevron}
    </button>
    ${historyHtml}
  `;
}

/* ---------- Notes wall ---------- */

function noteCardHtml(note, { showSessionLink = true } = {}) {
  const project = noteProject(note);
  const slot = noteSlot(note);
  const projectName = project ? project.name : note.projectName;
  const sessionExists = state.sessions.some((session) => session.id === note.sessionId);
  return `<article class="post-it" style="--pc: var(--cat-${slot})">
    <button class="post-it-delete" data-action="deleteNote" data-id="${note.id}" aria-label="Delete note">×</button>
    ${projectName ? `<span class="post-it-project">${dotHtml(slot)}${esc(projectName)}</span>` : '<span class="post-it-project">Session idea</span>'}
    <p>${esc(note.text)}</p>
    <footer>
      <time datetime="${new Date(note.createdAt).toISOString()}">${fmtDay(note.createdAt)} · ${fmtTime(note.createdAt)}</time>
      ${showSessionLink && sessionExists ? `<button data-action="openSession" data-id="${note.sessionId}">Open session</button>` : ""}
    </footer>
  </article>`;
}

function renderNotes() {
  const notes = [...allNotes()].sort((a, b) => b.createdAt - a.createdAt);
  return `
    <div class="hub-nav"><button class="pill pill-quiet" data-action="goHome">← Home</button></div>
    <div class="notes-head">
      <span class="sec-label">All captured ideas</span>
      <h1>Notes wall</h1>
      <p>${notes.length ? `${notes.length} ${notes.length === 1 ? "idea" : "ideas"}, saved without interrupting attention.` : "Ideas you capture during a session will gather here."}</p>
    </div>
    ${notes.length
      ? `<section class="notes-wall" aria-label="All session notes">${notes.map((note) => noteCardHtml(note)).join("")}</section>`
      : `<div class="empty-card notes-empty">During a session, tap <b>Note</b>, write the idea, and keep focusing. It won’t add an attention switch.</div>`}
  `;
}

/* ---------- Project hub ---------- */

function renderProjectHub() {
  const project = state.projects.find((item) => item.id === projectHubId);
  if (!project) return renderHome();
  const tasks = projectTasks(project);
  const taskDone = tasks.filter((task) => task.done).length;
  const sessions = state.sessions.filter((session) => session.perProject.some((item) => item.id === project.id));
  const focus = sessions.reduce((total, session) => {
    const item = session.perProject.find((entry) => entry.id === project.id);
    return total + (item ? item.ms : 0);
  }, 0);
  const moves = allSwitchMoves()
    .filter((event) => moveProjectId(event, "from") === project.id || moveProjectId(event, "to") === project.id)
    .sort((a, b) => b.at - a.at);
  const explained = moves.filter((event) => event.reason).length;
  const slot = project.slot;

  const taskList = tasks.length
    ? `<ul class="project-task-list hub-task-list">${tasks.map((task) => `<li class="project-task${task.done ? " done" : ""}">
        <label>
          <input type="checkbox" data-action="toggleTask" data-id="${project.id}" data-task-id="${task.id}" ${task.done ? "checked" : ""} ${project.archivedAt ? "disabled" : ""} />
          <span class="task-checkbox" aria-hidden="true"></span>
          <span class="task-text">${esc(task.text)}</span>
        </label>
      </li>`).join("")}</ul>`
    : `<p class="task-empty">No tasks yet.</p>`;

  const recentSessions = sessions.length
    ? `<div class="hub-session-list">${sessions.slice(0, 8).map((session) => {
        const item = session.perProject.find((entry) => entry.id === project.id);
        return `<button data-action="openSession" data-id="${session.id}">
          <span><b>${fmtDay(session.startedAt)}</b><small>${fmtTime(session.startedAt)}</small></span>
          <strong>${fmtHuman(item ? item.ms : 0)}</strong>
        </button>`;
      }).join("")}</div>`
    : `<div class="empty-card compact">No completed focus sessions for this project yet.</div>`;

  return `
    <div class="hub-nav"><button class="pill pill-quiet" data-action="goHome">← Projects</button></div>
    <div class="project-hub-head" style="--pc: var(--cat-${slot})">
      <div>${dotHtml(slot)}<span class="sec-label">Project hub</span>${project.archivedAt ? '<span class="archived-chip">Archived</span>' : ""}</div>
      <h1>${esc(project.name)}</h1>
      <p>Tasks, focus activity, and every path that moved attention in or out.</p>
    </div>
    <div class="hub-stats">
      <div><b>${fmtHuman(focus)}</b><span>focus</span></div>
      <div><b>${sessions.length}</b><span>sessions</span></div>
      <div><b>${taskDone}/${tasks.length}</b><span>tasks</span></div>
      <div><b>${moves.length}</b><span>${explained} explained</span></div>
    </div>
    <section class="sum-section" aria-label="${esc(project.name)} focus activity">
      <div class="chart-head"><h2 class="sec-label">Focus activity</h2><span class="chart-max">last 52 weeks</span></div>
      ${heatmapHtml(projectDailySeries(project.id, 365), `${project.name} daily focus for the last 52 weeks`)}
    </section>
    <section class="hub-section" aria-label="${esc(project.name)} tasks" style="--pc: var(--cat-${slot})">
      <div class="chart-head"><h2 class="sec-label">Tasks</h2><span class="chart-max">${taskDone}/${tasks.length} complete</span></div>
      ${project.archivedAt ? "" : `<form class="task-add-form" data-form="add-task" data-project-id="${project.id}">
        <label class="visually-hidden" for="task-input-${project.id}">Add a task to ${esc(project.name)}</label>
        <input id="task-input-${project.id}" name="task" type="text" maxlength="80" autocomplete="off" placeholder="Add a task…" />
        <button type="submit" aria-label="Add task to ${esc(project.name)}">${ICONS.plus}<span>Add</span></button>
      </form>`}
      ${taskList}
    </section>
    <section class="sum-section" aria-label="${esc(project.name)} attention paths">
      <div class="chart-head"><h2 class="sec-label">Attention map</h2><span class="chart-max">in and out</span></div>
      ${attentionMapHtml(moves, { focusProjectId: project.id, label: `${project.name} attention paths` })}
    </section>
    <section class="sum-section" aria-label="${esc(project.name)} recent sessions">
      <div class="chart-head"><h2 class="sec-label">Recent sessions</h2><span class="chart-max">${sessions.length} total</span></div>
      ${recentSessions}
    </section>
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
  const projects = activeProjects();
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

  const cards = projects
    .map((p, i) => {
      const isActive = !brk && seg && seg.p === p.id;
      return `<button class="proj-card${isActive ? " active" : ""}" style="--pc: var(--cat-${p.slot})"
                data-action="tap" data-id="${p.id}"
                aria-pressed="${isActive}" aria-label="${isActive ? "Focusing on" : "Switch attention to"} ${esc(p.name)}">
        <span class="c-head">${dotHtml(p.slot)}<span class="c-name">${esc(p.name)}</span><span class="kbd" aria-hidden="true">${i + 1}</span></span>
      </button>`;
    })
    .join("");

  const addTile = projects.length >= PROJECT_LIMIT
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

  const captureProject = activeProj
    || pausedProj
    || (lastSeg ? state.projects.find((project) => project.id === lastSeg.p) : null)
    || projects[0]
    || null;
  const projectOptions = projects
    .map((project) => `<option value="${project.id}"${captureProject && project.id === captureProject.id ? " selected" : ""}>${esc(project.name)}</option>`)
    .join("");
  const openSessionTasks = projects
    .flatMap((project) => projectTasks(project)
      .filter((task) => !task.done)
      .map((task) => ({ project, task })))
    .sort((aItem, bItem) => (bItem.task.createdAt || 0) - (aItem.task.createdAt || 0));
  const currentSessionNotes = allNotes()
    .filter((note) => note.sessionId === a.id)
    .sort((aNote, bNote) => bNote.createdAt - aNote.createdAt);
  const taskFeed = openSessionTasks.length
    ? `<div class="session-capture-group">
        <div class="session-capture-group-head"><b>Open tasks</b><span>${openSessionTasks.length}</span></div>
        <ul class="project-task-list session-capture-items">
          ${openSessionTasks.map(({ project, task }) => `<li class="project-task session-capture-task" style="--pc: var(--cat-${project.slot})">
            <label>
              <input type="checkbox" data-action="toggleTask" data-id="${project.id}" data-task-id="${task.id}" aria-label="Complete ${esc(task.text)}" />
              <span class="task-checkbox" aria-hidden="true"></span>
              <span class="session-task-copy"><span class="task-text">${esc(task.text)}</span><small>${dotHtml(project.slot)}${esc(project.name)}</small></span>
            </label>
          </li>`).join("")}
        </ul>
      </div>`
    : "";
  const noteFeed = currentSessionNotes.length
    ? `<div class="session-capture-group">
        <div class="session-capture-group-head"><b>Session notes</b><span>${currentSessionNotes.length}</span></div>
        <div class="session-capture-items session-capture-notes">
          ${currentSessionNotes.map((note) => {
            const project = noteProject(note);
            const slot = noteSlot(note);
            const projectName = project ? project.name : note.projectName;
            return `<article class="session-capture-note" style="--pc: var(--cat-${slot})">
              <span class="session-capture-note-icon">${ICONS.note}</span>
              <span><p>${esc(note.text)}</p><small>${projectName ? `${dotHtml(slot)}${esc(projectName)} · ` : ""}${fmtTime(note.createdAt)}</small></span>
              <button data-action="deleteNote" data-id="${note.id}" aria-label="Delete note">×</button>
            </article>`;
          }).join("")}
        </div>
      </div>`
    : "";
  const captureFeed = taskFeed || noteFeed
    ? `<div class="session-capture-feed" aria-live="polite">${taskFeed}${noteFeed}</div>`
    : "";
  const captureForm = sessionCaptureMode === "task"
    ? `<form class="session-capture-form" data-form="session-task">
        <label for="session-task-project">Add task to</label>
        <select id="session-task-project" name="project">${projectOptions}</select>
        <label class="visually-hidden" for="session-task-text">New task</label>
        <input id="session-task-text" name="task" type="text" maxlength="80" autocomplete="off" placeholder="What needs doing?" required />
        <div class="session-capture-actions">
          <button class="pill pill-dark" type="submit">Add task</button>
          <button class="pill pill-quiet" type="button" data-action="closeSessionCapture">Cancel</button>
        </div>
      </form>`
    : sessionCaptureMode === "note"
      ? `<form class="session-capture-form note-form" data-form="session-note">
          <div class="session-note-context">
            ${captureProject ? `${dotHtml(captureProject.slot)}<span>While focusing on <b>${esc(captureProject.name)}</b></span>` : "Session idea"}
          </div>
          <label class="visually-hidden" for="session-note-text">Write an idea</label>
          <textarea id="session-note-text" name="note" maxlength="500" placeholder="Write the idea before it disappears…" required></textarea>
          <div class="session-capture-actions">
            <button class="pill pill-dark" type="submit">Save note</button>
            <button class="pill pill-quiet" type="button" data-action="closeSessionCapture">Cancel</button>
          </div>
        </form>`
      : "";
  const capturePanel = `<section class="session-capture" aria-label="Capture without switching">
    <div class="session-capture-head">
      <div><span class="sec-label">Capture without switching</span><small>Timer keeps running. This won’t count as a switch.</small></div>
      <div class="session-capture-tabs">
        <button class="${sessionCaptureMode === "task" ? "active" : ""}" data-action="openSessionCapture" data-mode="task" aria-expanded="${sessionCaptureMode === "task"}">${ICONS.task}<span>Task</span></button>
        <button class="${sessionCaptureMode === "note" ? "active" : ""}" data-action="openSessionCapture" data-mode="note" aria-expanded="${sessionCaptureMode === "note"}">${ICONS.note}<span>Note</span></button>
      </div>
    </div>
    ${captureForm}
    ${captureFeed}
  </section>`;

  return `
    ${dial}
    <p class="grid-label sec-label">Tap where your attention goes</p>
    <div class="proj-grid">${cards}${addTile}</div>
    ${capturePanel}
    <div class="controls-bar">
      <button class="pill pill-ghost" data-action="toggleBreak" ${started ? "" : "disabled"}>
        ${brk ? ICONS.play : ICONS.pause}${brk
          ? "<span>Resume</span>"
          : '<span class="lbl-long">Take a break</span><span class="lbl-short">Break</span>'}
      </button>
      <button class="pill pill-dark" data-action="endSession">${ICONS.stop}<span class="lbl-long">End session</span><span class="lbl-short">End</span></button>
    </div>
    <p class="key-hints"><span class="kbd">1</span>–<span class="kbd">9</span> switch project · <span class="kbd">Space</span> break</p>
  `;
}

/* ---------- Post-session switch reflection ---------- */

function renderReflection() {
  const rec = reflectionRecord();
  if (!rec || !Array.isArray(rec.switchEvents) || !rec.switchEvents.length) return renderSummary();
  let event = rec.switchEvents[reflectionIndex];
  if (!event || event.answered) {
    reflectionIndex = rec.switchEvents.findIndex((item) => !item.answered);
    event = rec.switchEvents[reflectionIndex];
  }
  if (!event) return renderSummary();

  const answered = rec.switchEvents.filter((item) => item.answered).length;
  const step = answered + 1;
  const fromSlot = switchEventSlot(event, "from");
  const toSlot = switchEventSlot(event, "to");
  const progress = Math.max(0, Math.min(1, answered / rec.switchEvents.length));
  const savedFeelings = savedSwitchFeelings();

  return `
    <div class="reflection-head">
      <span class="sec-label">Session reflection</span>
      <h1>What were you feeling?</h1>
      <p>Choose the feeling closest to the moment you switched.</p>
    </div>
    <div class="reflection-progress" aria-label="Switch ${step} of ${rec.switchEvents.length}">
      <span style="--f:${progress.toFixed(4)}"></span>
      <small>${step}/${rec.switchEvents.length}</small>
    </div>
    <section class="reflection-card" aria-label="Attention moved from ${esc(event.fromName)} to ${esc(event.toName)}">
      <span class="reflection-time">${fmtTime(event.at)}</span>
      <div class="reflection-path">
        <span style="--pc: var(--cat-${fromSlot})">${dotHtml(fromSlot)}<b>${esc(event.fromName)}</b></span>
        <span class="path-arrow" aria-hidden="true">→</span>
        <span style="--pc: var(--cat-${toSlot})">${dotHtml(toSlot)}<b>${esc(event.toName)}</b></span>
      </div>
      <p class="reflection-question">How did the switch feel?</p>
      <div class="reason-choices">
        ${SWITCH_FEELINGS.map((feeling) => `<button data-action="answerSwitchReason" data-id="${event.id}" data-reason="${esc(feeling)}">${esc(feeling)}</button>`).join("")}
        <button class="reason-other${reflectionCustomOpen ? " active" : ""}" data-action="openCustomReason" data-id="${event.id}">Write my own feeling…</button>
      </div>
      ${savedFeelings.length ? `<div class="saved-reasons">
        <span class="saved-reasons-label">Your saved feelings</span>
        <div class="saved-reason-cards">${savedFeelings.map((feeling) => `<button data-action="answerSwitchReason" data-id="${event.id}" data-source="manual" data-reason="${esc(feeling)}">${esc(feeling)}</button>`).join("")}</div>
      </div>` : ""}
      ${reflectionCustomOpen ? `<form class="reason-custom-form" data-form="switch-reason" data-event-id="${event.id}">
          <label class="visually-hidden" for="switch-reason-custom">What were you feeling?</label>
          <input id="switch-reason-custom" name="reason" maxlength="100" autocomplete="off" placeholder="Name the feeling…" />
          <button type="submit">Save feeling</button>
        </form>` : ""}
    </section>
    <div class="reflection-actions">
      <button class="pill pill-quiet" data-action="skipSwitchReason" data-id="${event.id}">Skip this one</button>
      <button class="pill pill-quiet" data-action="skipReflection">Skip the rest</button>
    </div>
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
        <td><span class="cell-name">${dotHtml(projectSlot(pp))}${esc(pp.name)}</span></td>
        <td class="num">${fmtHuman(pp.ms)}</td>
        <td class="num pct">${Math.round((pp.ms / rec.focusMs) * 100)}%</td>
      </tr>`
    )
    .join("");

  const shareBar = `<div class="share-bar" role="img" aria-label="Share of focus per project">
    ${rec.perProject
      .map((pp) => `<i style="--f:${(pp.ms / rec.focusMs).toFixed(5)}; --pc: var(--cat-${projectSlot(pp)})" title="${esc(pp.name)} — ${Math.round((pp.ms / rec.focusMs) * 100)}%"></i>`)
      .join("")}
  </div>`;

  const switchEvents = switchEventsFor(rec);
  const reflectionsHtml = switchEvents.length
    ? `<section class="sum-section" aria-label="Attention switch reasons">
        <h2 class="sec-label">Why attention moved</h2>
        <div class="switch-reason-list">${switchEvents.map((event) => {
          const fromSlot = switchEventSlot(event, "from");
          const toSlot = switchEventSlot(event, "to");
          return `<div class="switch-reason-row">
            <div class="mini-path">
              <span>${dotHtml(fromSlot)}${esc(event.fromName)}</span><b aria-hidden="true">→</b><span>${dotHtml(toSlot)}${esc(event.toName)}</span>
            </div>
            <span class="switch-why${event.reason ? "" : " missing"}">${event.reason
              ? `${event.reasonGroup ? `<small>${esc(event.reasonGroup)}</small>` : ""}<span>${esc(event.reason)}</span>`
              : "Reason not captured"}</span>
          </div>`;
        }).join("")}</div>
      </section>`
    : "";

  const sessionNotes = allNotes()
    .filter((note) => note.sessionId === rec.id)
    .sort((a, b) => a.createdAt - b.createdAt);
  const sessionNotesHtml = sessionNotes.length
    ? `<section class="sum-section" aria-label="Ideas captured during this session">
        <div class="chart-head"><h2 class="sec-label">Session notes</h2><span class="chart-max">${sessionNotes.length} ${sessionNotes.length === 1 ? "idea" : "ideas"}</span></div>
        <div class="session-note-list">${sessionNotes.map((note) => noteCardHtml(note, { showSessionLink: false })).join("")}</div>
      </section>`
    : "";

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
    ${reflectionsHtml}
    ${sessionNotesHtml}
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

  const yearSeries = dailySeries(365);
  const heatmapSection = `<section class="sum-section" aria-label="Focus activity, last 52 weeks">
    <div class="chart-head"><h2 class="sec-label">Focus activity</h2><span class="chart-max">last 52 weeks</span></div>
    ${heatmapHtml(yearSeries, "Daily focus activity for the last 52 weeks")}
  </section>`;
  const timeOfDaySection = timeOfDayHtml(hourlyFocusSeries(30));

  const allMoves = allSwitchMoves();
  const attentionPaths = allMoves.length
    ? `<section class="sum-section" aria-label="Attention switch paths and reasons">
        <div class="chart-head"><h2 class="sec-label">Attention map</h2><span class="chart-max">project to project</span></div>
        ${attentionMapHtml(allMoves, { label: "All project attention paths" })}
      </section>`
    : `<section class="sum-section" aria-label="Attention path map">
        <div class="chart-head"><h2 class="sec-label">Attention map</h2><span class="chart-max">project to project</span></div>
        ${attentionMapHtml([], { label: "All project attention paths" })}
      </section>`;

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
        <span class="bar-value">${d.focusMs ? fmtCompact(d.focusMs) : "—"}</span>
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
      const cur = perWeek.get(pp.id) || { id: pp.id, name: pp.name, slot: projectSlot(pp), ms: 0 };
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
      <p>Your focus rhythm, attention paths, and the reasons behind each move.</p>
    </div>
    ${tiles}
    ${heatmapSection}
    ${timeOfDaySection}
    <section class="sum-section" aria-label="Daily focus, last 14 days">
      <div class="chart-head"><h2 class="sec-label">Daily focus</h2><span class="chart-max">peak ${fmtHuman(maxFocus === 1 ? 0 : maxFocus)}</span></div>
      <div class="bars">${focusCols}</div>
    </section>
    <section class="sum-section" aria-label="Switch rate, last 14 days">
      <div class="chart-head"><h2 class="sec-label">Switches per hour</h2><span class="chart-max">lower&nbsp;=&nbsp;calmer</span></div>
      <div class="bars">${rateCols}</div>
    </section>
    ${attentionPaths}
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

/* ---------- Home arrow swarm ----------
   Adapted from Jovey's particle-field character: thin rounded confetti,
   staggered per-particle easing, shimmer, and independent twinkle. Here the
   swarm is summoned into three equal double-ended arrow segments, then keeps
   flowing along their paths so the mark never becomes a rigid illustration. */

let homeSwarmRaf = null;
let homeSwarmCanvas = null;
let homeSwarmCtx = null;
let homeSwarmParticles = [];
let homeSwarmLastT = 0;
let homeSwarmStarted = 0;
let homeSwarmW = 0;
let homeSwarmH = 0;
let homeSwarmObserver = null;
let homeSwarmVisible = true;
let homeSwarmReturnAt = 0;
let homeSwarmReturnStarted = 0;

const HOME_SWARM_RETURN_DELAY_MS = 620;
const HOME_SWARM_RETURN_MS = 1450;

const HOME_SWARM_PALETTES = [
  ["#F6D064", "#F4C461", "#EA6E3C"],
  ["#3C9088", "#1FA39A", "#25567C"],
  ["#E67673", "#C8427E", "#61257F"],
];
const JOVEY_PROJECT_SWARM_PALETTES = CAT_FAM;
const HOME_SWARM_ROTATION_SPEED = PARTICLE_ROTATION_SPEED;

function homeSwarmRgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function homeSwarmColor(stops, t) {
  const scaled = Math.max(0, Math.min(0.999, t)) * (stops.length - 1);
  const i = Math.floor(scaled);
  const k = scaled - i;
  const a = homeSwarmRgb(stops[i]);
  const b = homeSwarmRgb(stops[i + 1]);
  return `rgb(${a.map((v, n) => Math.round(v + (b[n] - v) * k)).join(",")})`;
}

function homeSwarmMixHex(color, base, strength) {
  const a = homeSwarmRgb(color);
  const b = homeSwarmRgb(base);
  return "#" + a
    .map((v, i) => Math.round(b[i] + (v - b[i]) * strength).toString(16).padStart(2, "0"))
    .join("");
}

function homeSwarmEase(t) {
  const x = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - x, 3);
}

function delayHomeSwarmReturn() {
  if (reducedMotion.matches) return;
  const delay = mobileMotion.matches ? HOME_SWARM_RETURN_DELAY_MS : 160;
  homeSwarmReturnAt = performance.now() + delay;
  homeSwarmReturnStarted = homeSwarmReturnAt;
}

function homeSwarmReturnStrength(ms) {
  if (reducedMotion.matches || !homeSwarmReturnAt) return 1;
  if (ms < homeSwarmReturnAt) return 0;
  const strength = homeSwarmEase((ms - homeSwarmReturnStarted) / HOME_SWARM_RETURN_MS);
  if (strength >= 1) {
    homeSwarmReturnAt = 0;
    homeSwarmReturnStarted = 0;
    return 1;
  }
  return strength;
}

function addHomeSwarmParticle(data) {
  const edge = Math.random();
  let x, y;
  if (edge < 0.25) { x = -15; y = Math.random() * homeSwarmH; }
  else if (edge < 0.5) { x = homeSwarmW + 15; y = Math.random() * homeSwarmH; }
  else if (edge < 0.75) { x = Math.random() * homeSwarmW; y = -15; }
  else { x = Math.random() * homeSwarmW; y = homeSwarmH + 15; }
  homeSwarmParticles.push({
    ...data,
    x: x + (Math.random() - 0.5) * 40,
    y: y + (Math.random() - 0.5) * 40,
    angle: Math.random() * Math.PI * 2,
    size: PARTICLE_SIZE,
    weight: PARTICLE_WEIGHT,
    ease: 0.025 + Math.random() * 0.055,
    phase: Math.random() * Math.PI * 2,
    pulse: 0.6 + Math.random() * 1.3,
    waveAmp: 1.2 + Math.random() * 3.6,
    waveAmp2: 0.6 + Math.random() * 2.2,
    waveSpd: 0.55 + Math.random() * 1.05,
    waveSpd2: 0.4 + Math.random() * 1.2,
    waveDir: Math.random() < 0.5 ? -1 : 1,
  });
}

function seedHomeSwarm() {
  homeSwarmParticles = [];
  const projects = activeProjects();
  const cx = homeSwarmW / 2;
  const cy = homeSwarmH / 2;
  const radius = Math.min(homeSwarmW, homeSwarmH) * 0.34;
  const projectPalettes = projects.length
    ? projects.map((project) => JOVEY_PROJECT_SWARM_PALETTES[project.slot])
    : HOME_SWARM_PALETTES;
  const segmentCount = projectPalettes.length;
  const step = (2 * Math.PI) / segmentCount;
  const gap = Math.min((18 * Math.PI) / 180, step * 0.18);
  const span = step - gap;
  const start = -Math.PI / 2 - span / 2; // first arrow centred at twelve o'clock
  // Three arrows retain the approved 396-particle model. Below or above
  // three, density scales smoothly with project count: every added project
  // increases the total without overcrowding its shorter arc.
  const densityScale = Math.sqrt(3 / segmentCount);
  const bodyCountPerArrow = Math.max(44, Math.round(76 * densityScale));
  const headCountPerLimb = Math.max(8, Math.round(14 * densityScale));
  const gradientStrength = projects.length
    ? Math.max(0.4, 1 - (segmentCount - 1) * 0.085)
    : 1;

  for (let segment = 0; segment < segmentCount; segment++) {
    const rotation = segment * step;
    const theta0 = start + rotation;
    const theta1 = theta0 + span;
    const sourcePalette = projectPalettes[segment];
    const palette = sourcePalette.map((color) =>
      homeSwarmMixHex(color, sourcePalette[1], gradientStrength)
    );
    const bodyCount = bodyCountPerArrow;

    // The flowing body: every particle circulates in the same direction so
    // every project arrow reads as one consistent rotational system.
    for (let i = 0; i < bodyCount; i++) {
      const u = (i + Math.random() * 0.7) / bodyCount;
      addHomeSwarmParticle({
        type: "body",
        segment,
        palette,
        theta0,
        span,
        radius,
        u,
        dir: 1,
        speed: 0.018 + Math.random() * 0.018,
        band: (Math.random() - 0.5) * radius * 0.16,
        color: homeSwarmColor(palette, u),
      });
    }

    // Two dotted limbs at each endpoint preserve the double arrowheads while
    // the body particles continue to fly through the arc.
    const headLength = Math.min(radius * 0.22, radius * span * 0.28);
    const headSpread = Math.min(radius * 0.15, headLength * 0.68);
    for (const [theta, atStart] of [[theta0, true], [theta1, false]]) {
      const tipX = cx + Math.cos(theta) * radius;
      const tipY = cy + Math.sin(theta) * radius;
      const tangentX = -Math.sin(theta);
      const tangentY = Math.cos(theta);
      const backX = atStart ? tangentX : -tangentX;
      const backY = atStart ? tangentY : -tangentY;
      const sideX = -backY;
      const sideY = backX;
      const color = homeSwarmColor(palette, atStart ? 0 : 0.999);
      for (const side of [-1, 1]) {
        const particlesOnLimb = headCountPerLimb;
        for (let i = 1; i <= particlesOnLimb; i++) {
          const u = i / particlesOnLimb;
          const legX = backX * headLength + sideX * side * headSpread;
          const legY = backY * headLength + sideY * side * headSpread;
          addHomeSwarmParticle({
            type: "head",
            tipX,
            tipY,
            legX,
            legY,
            headU: u,
            color,
          });
        }
      }
    }
  }
}

function homeSwarmTarget(p, t) {
  const rotation = reducedMotion.matches ? 0 : t * HOME_SWARM_ROTATION_SPEED;
  if (p.type === "head") {
    const cx = homeSwarmW / 2;
    const cy = homeSwarmH / 2;
    const baseX = p.tipX + p.legX * p.headU;
    const baseY = p.tipY + p.legY * p.headU;
    const dx = baseX - cx;
    const dy = baseY - cy;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const rotatedX = dx * cos - dy * sin;
    const rotatedY = dx * sin + dy * cos;
    // Like the locked SVG logo, arrowhead particles hold their formation and
    // point tangent to the circular direction of the complete rotating mark.
    const travelAngle = Math.atan2(rotatedY, rotatedX) + Math.PI / 2;
    const normalX = -Math.sin(travelAngle);
    const normalY = Math.cos(travelAngle);
    const waveNormal = reducedMotion.matches
      ? 0
      : Math.sin(t * p.waveSpd * p.waveDir + p.phase) * p.waveAmp;
    const waveAlong = reducedMotion.matches
      ? 0
      : Math.sin(t * p.waveSpd2 - p.phase * 0.7) * p.waveAmp2;
    return {
      x: cx + rotatedX + normalX * waveNormal + Math.cos(travelAngle) * waveAlong,
      y: cy + rotatedY + normalY * waveNormal + Math.sin(travelAngle) * waveAlong,
      angle: travelAngle,
    };
  }
  const theta = p.theta0 + p.span * p.u + rotation;
  const waveNormal = reducedMotion.matches
    ? 0
    : Math.sin(t * p.waveSpd * p.waveDir + p.phase) * p.waveAmp;
  const waveTangent = reducedMotion.matches
    ? 0
    : Math.cos(t * p.waveSpd2 + p.phase * 0.8) * p.waveAmp2;
  const r = p.radius + p.band + waveNormal;
  return {
    x: homeSwarmW / 2 + Math.cos(theta) * r - Math.sin(theta) * waveTangent,
    y: homeSwarmH / 2 + Math.sin(theta) * r + Math.cos(theta) * waveTangent,
    angle: theta + Math.PI / 2 + (p.dir < 0 ? Math.PI : 0),
  };
}

function drawHomeSwarmParticle(p, alpha) {
  homeSwarmCtx.save();
  homeSwarmCtx.translate(p.x, p.y);
  homeSwarmCtx.rotate(p.angle);
  homeSwarmCtx.globalAlpha = alpha;
  homeSwarmCtx.strokeStyle = p.color;
  homeSwarmCtx.lineWidth = p.weight;
  homeSwarmCtx.lineCap = "round";
  homeSwarmCtx.beginPath();
  homeSwarmCtx.moveTo(-p.size / 2, 0);
  homeSwarmCtx.lineTo(p.size / 2, 0);
  homeSwarmCtx.stroke();
  homeSwarmCtx.restore();
}

function homeSwarmFrame(ms) {
  if (!homeSwarmCtx || !homeSwarmCanvas || view !== "home" || document.hidden || !homeSwarmVisible) {
    homeSwarmRaf = null;
    return;
  }
  const t = ms / 1000;
  const dt = homeSwarmLastT ? Math.min(0.05, t - homeSwarmLastT) : 0;
  homeSwarmLastT = t;
  const dt60 = dt * 60;
  const summoned = reducedMotion.matches ? 1 : homeSwarmEase((ms - homeSwarmStarted) / 2200);
  const returnStrength = homeSwarmReturnStrength(ms);
  homeSwarmCtx.clearRect(0, 0, homeSwarmW, homeSwarmH);

  for (const p of homeSwarmParticles) {
    if (p.type === "body" && summoned > 0.82) {
      p.u = (p.u + p.dir * p.speed * dt + 1) % 1;
      p.color = homeSwarmColor(p.palette, p.u);
    }
    const target = homeSwarmTarget(p, t);
    const k = reducedMotion.matches
      ? 1
      : Math.min(1, p.ease * dt60 * (0.35 + summoned * 0.65) * returnStrength);
    const moveX = target.x - p.x;
    const moveY = target.y - p.y;
    p.x += (target.x - p.x) * k;
    p.y += (target.y - p.y) * k;
    // Follow the shortest angular path so every dash stays aligned with its
    // real direction of travel, including its own two-axis random wave.
    const movementAngle = reducedMotion.matches || Math.hypot(moveX, moveY) < 0.01
      ? target.angle
      : Math.atan2(moveY, moveX);
    const angleDelta = Math.atan2(Math.sin(movementAngle - p.angle), Math.cos(movementAngle - p.angle));
    p.angle += angleDelta * Math.min(1, k * 1.7);
    const twinkle = (PARTICLE_ALPHA_MIN + PARTICLE_ALPHA_MAX) / 2
      + ((PARTICLE_ALPHA_MAX - PARTICLE_ALPHA_MIN) / 2) * Math.sin(t * p.pulse * 2 + p.phase);
    // Fade through the recycle boundary so a particle disappears at the
    // arrow front and quietly returns at the rear instead of jumping backward.
    const recycleFade = p.type === "body"
      ? Math.min(1, p.u / 0.075, (1 - p.u) / 0.075)
      : 1;
    const alpha = reducedMotion.matches
      ? 0.72
      : twinkle * (0.38 + summoned * 0.62) * Math.max(0, recycleFade);
    drawHomeSwarmParticle(p, alpha);
  }

  if (!reducedMotion.matches) homeSwarmRaf = requestAnimationFrame(homeSwarmFrame);
  else homeSwarmRaf = null;
}

function stopHomeSwarm() {
  if (homeSwarmRaf !== null) cancelAnimationFrame(homeSwarmRaf);
  if (homeSwarmObserver) homeSwarmObserver.disconnect();
  homeSwarmRaf = null;
  homeSwarmObserver = null;
  homeSwarmCanvas = null;
  homeSwarmCtx = null;
  homeSwarmParticles = [];
  homeSwarmVisible = true;
  homeSwarmReturnAt = 0;
  homeSwarmReturnStarted = 0;
}

function observeHomeSwarm() {
  if (!homeSwarmCanvas || !("IntersectionObserver" in window)) return;
  if (homeSwarmObserver) homeSwarmObserver.disconnect();
  homeSwarmVisible = true;
  homeSwarmObserver = new IntersectionObserver((entries) => {
    const entry = entries.find((item) => item.target === homeSwarmCanvas);
    if (!entry) return;
    const nextVisible = entry.isIntersecting && entry.intersectionRatio > 0.04;
    if (nextVisible === homeSwarmVisible) return;
    homeSwarmVisible = nextVisible;
    if (!nextVisible) {
      if (homeSwarmRaf !== null) cancelAnimationFrame(homeSwarmRaf);
      homeSwarmRaf = null;
      return;
    }
    delayHomeSwarmReturn();
    homeSwarmLastT = 0;
    if (homeSwarmRaf === null && !document.hidden) {
      homeSwarmRaf = requestAnimationFrame(homeSwarmFrame);
    }
  }, { threshold: [0, 0.04, 0.2] });
  homeSwarmObserver.observe(homeSwarmCanvas);
}

function resumeHomeSwarm({ delay = false } = {}) {
  if (!homeSwarmCanvas || !homeSwarmCtx || !homeSwarmParticles.length) {
    setupHomeSwarm();
    return;
  }
  if (delay) delayHomeSwarmReturn();
  homeSwarmLastT = 0;
  if (homeSwarmVisible && homeSwarmRaf === null && !document.hidden) {
    homeSwarmRaf = requestAnimationFrame(homeSwarmFrame);
  }
}

function resizeHomeSwarm() {
  const canvas = appEl.querySelector(".home-arrow-swarm");
  if (!canvas || canvas !== homeSwarmCanvas || !homeSwarmParticles.length) {
    stopHomeSwarm();
    setupHomeSwarm();
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const nextW = Math.max(1, rect.width);
  const nextH = Math.max(1, rect.height);
  // Phone browser chrome resizes the viewport during scroll without changing
  // the swarm canvas. Ignoring that event prevents the visible particle reset.
  if (Math.abs(nextW - homeSwarmW) < 0.5 && Math.abs(nextH - homeSwarmH) < 0.5) return;

  if (homeSwarmRaf !== null) cancelAnimationFrame(homeSwarmRaf);
  homeSwarmRaf = null;
  const oldW = homeSwarmW;
  const oldH = homeSwarmH;
  const oldCx = oldW / 2;
  const oldCy = oldH / 2;
  const nextCx = nextW / 2;
  const nextCy = nextH / 2;
  const scaleX = nextW / oldW;
  const scaleY = nextH / oldH;
  const scale = Math.min(nextW, nextH) / Math.min(oldW, oldH);
  for (const particle of homeSwarmParticles) {
    particle.x = nextCx + (particle.x - oldCx) * scaleX;
    particle.y = nextCy + (particle.y - oldCy) * scaleY;
    particle.waveAmp *= scale;
    particle.waveAmp2 *= scale;
    if (particle.type === "body") {
      particle.radius *= scale;
      particle.band *= scale;
    } else {
      particle.tipX = nextCx + (particle.tipX - oldCx) * scale;
      particle.tipY = nextCy + (particle.tipY - oldCy) * scale;
      particle.legX *= scale;
      particle.legY *= scale;
    }
  }
  homeSwarmW = nextW;
  homeSwarmH = nextH;
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.round(nextW * dpr);
  canvas.height = Math.round(nextH * dpr);
  homeSwarmCtx = canvas.getContext("2d");
  homeSwarmCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  resumeHomeSwarm({ delay: true });
}

function setupHomeSwarm() {
  homeSwarmCanvas = appEl.querySelector(".home-arrow-swarm");
  if (!homeSwarmCanvas) return;
  if (homeSwarmRaf !== null) cancelAnimationFrame(homeSwarmRaf);
  const rect = homeSwarmCanvas.getBoundingClientRect();
  homeSwarmW = Math.max(1, rect.width);
  homeSwarmH = Math.max(1, rect.height);
  const dpr = Math.min(2, devicePixelRatio || 1);
  homeSwarmCanvas.width = Math.round(homeSwarmW * dpr);
  homeSwarmCanvas.height = Math.round(homeSwarmH * dpr);
  homeSwarmCtx = homeSwarmCanvas.getContext("2d");
  homeSwarmCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  seedHomeSwarm();
  homeSwarmLastT = 0;
  homeSwarmStarted = performance.now();
  homeSwarmReturnAt = 0;
  homeSwarmReturnStarted = 0;
  homeSwarmVisible = true;
  observeHomeSwarm();
  homeSwarmRaf = requestAnimationFrame(homeSwarmFrame);
}

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
  openSwipeShell = null;
  swipeGesture = null;
  stopHomeSwarm();
  appEl.innerHTML =
    view === "session" ? renderSession() :
    view === "reflection" ? renderReflection() :
    view === "summary" ? renderSummary() :
    view === "trends" ? renderTrends() :
    view === "project" ? renderProjectHub() :
    view === "notes" ? renderNotes() :
    renderHome();

  for (const heatmap of appEl.querySelectorAll(".heatmap-scroll")) {
    heatmap.scrollLeft = heatmap.scrollWidth;
  }
  setupAttentionMaps();

  const a = state.active;
  const inSession = view === "session" && !!a;
  document.body.classList.toggle("in-session", inSession);
  for (const name of ["home", "session", "reflection", "summary", "trends", "project", "notes"]) {
    document.body.classList.toggle(`view-${name}`, view === name);
  }

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
  setupHomeSwarm();
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
   Jovey-field confetti dashes orbiting the counting clock. Each earned
   dash keeps its project's colour and travels on an individual sine path
   across the shared orbital band. */

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
    size: PARTICLE_SIZE,
    weight: PARTICLE_WEIGHT,
    phase: Math.random() * 2 * Math.PI,
    pulse: 0.6 + Math.random() * 1.3,   // twinkle rate
    // Every dot follows its own sine wave across the orbital path. Different
    // amplitudes, frequencies and directions keep the field from moving as a
    // single rigid wheel while preserving the calm overall circulation.
    wavePhase: Math.random() * 2 * Math.PI,
    waveAmp: SINE_AMP_MIN + Math.random() * (SINE_AMP_MAX - SINE_AMP_MIN),
    waveFreq: 1.25 + Math.random() * 2.75,
    waveSpeed: 0.35 + Math.random() * 0.65,
    waveDir: Math.random() < 0.5 ? -1 : 1,
    orbit: ORBIT_SPEED * (0.85 + Math.random() * 0.3),
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
  for (const p of activeProjects()) {
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

function waveOffset(p, t, motion) {
  if (!motion) return { radial: 0, lean: 0 };
  const phase = p.ang * p.waveFreq + t * p.waveSpeed * p.waveDir + p.wavePhase;
  const radial = Math.sin(phase) * p.waveAmp;
  // The sine derivative gently steers the dash along its individual path.
  const slope = Math.cos(phase) * p.waveAmp * p.waveFreq / Math.max(1, ringR * p.band);
  return { radial, lean: Math.atan(slope) };
}

function drawDash(p, alpha, color, radialOffset, pop = 1, lean = 0) {
  const cx = ringSize / 2, cy = ringSize / 2;
  const r = ringR * p.band + radialOffset;
  const depth = p.depth || 1; // deeper-band dots drift more — parallax layers
  const x = cx + Math.cos(p.ang) * r + ringTilt.x * depth;
  const y = cy + Math.sin(p.ang) * r + ringTilt.y * depth;
  ringCtx.save();
  ringCtx.translate(x, y);
  ringCtx.rotate(p.ang + Math.PI / 2 + p.tilt + lean); // tangent to its sine path
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
    const sine = waveOffset(p, t, motion);
    let radialOffset = sine.radial;
    if (waving) {
      // the swap wave: a decaying ripple travelling around the ring
      radialOffset += WAVE_A * Math.exp(-waveT * 2.2) * Math.sin(p.ang * 3 - waveT * 12);
    }
    let alpha = motion
      ? Math.max(
          PARTICLE_ALPHA_MIN,
          (PARTICLE_ALPHA_MIN + PARTICLE_ALPHA_MAX) / 2
            + ((PARTICLE_ALPHA_MAX - PARTICLE_ALPHA_MIN) / 2) * Math.sin(t * p.pulse * 2 + p.phase)
        )
      : (PARTICLE_ALPHA_MIN + PARTICLE_ALPHA_MAX) / 2;
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
    drawDash(p, gray ? 0.4 : alpha, gray || CAT_FAM[p.slot][p.shade], radialOffset, pop, sine.lean);
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
  else if (view === "home") resizeHomeSwarm();
  else if (view === "trends" || view === "project") setupAttentionMaps();
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) tick();
  if (document.hidden && view === "home" && homeSwarmRaf !== null) {
    cancelAnimationFrame(homeSwarmRaf);
    homeSwarmRaf = null;
  } else if (!document.hidden && view === "home" && homeSwarmRaf === null) {
    resumeHomeSwarm({ delay: true });
  }
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

// Fullscreen must be requested directly from the Start button's user gesture.
// Unsupported browsers and denied requests simply keep the normal app view.
function requestAppFullscreen() {
  const root = document.documentElement;
  if (document.fullscreenElement || document.webkitFullscreenElement) return;
  const request = root.requestFullscreen || root.webkitRequestFullscreen;
  if (typeof request !== "function") return;
  try {
    const result = request.call(root);
    if (result && typeof result.catch === "function") result.catch(() => {});
  } catch (_) { /* unsupported or blocked by browser policy */ }
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

const SWIPE_DELETE_WIDTH = 92;
const SWIPE_OPEN_THRESHOLD = 42;
let openSwipeShell = null;
let swipeGesture = null;
let suppressSwipeClickUntil = 0;
let suppressSwipeItem = null;

function setSwipeOpen(shell, open) {
  if (!shell) return;
  const row = shell.querySelector("[data-swipe-row]");
  const deleteButton = shell.querySelector(".swipe-delete");
  shell.classList.remove("revealing");
  shell.classList.toggle("open", open);
  if (row) {
    row.classList.remove("swiping");
    row.style.transform = `translateX(${open ? -SWIPE_DELETE_WIDTH : 0}px)`;
  }
  if (deleteButton) deleteButton.tabIndex = open ? 0 : -1;
  openSwipeShell = open ? shell : (openSwipeShell === shell ? null : openSwipeShell);
}

function closeOpenSwipe(except = null) {
  if (openSwipeShell && openSwipeShell !== except) setSwipeOpen(openSwipeShell, false);
}

document.addEventListener("pointerdown", (e) => {
  const row = e.target.closest("[data-swipe-row]");
  if (!row || !e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
  // Buttons inside the row own their pointer gesture. Swipe-to-delete begins
  // only from the non-interactive body of the card.
  if (e.target.closest("button, input, label, a")) return;
  const shell = row.closest(".project-swipe-shell");
  if (!shell) return;
  closeOpenSwipe(shell);
  const startsOpen = shell.classList.contains("open");
  swipeGesture = {
    pointerId: e.pointerId,
    row,
    shell,
    item: shell.closest("[data-swipe-item]"),
    startX: e.clientX,
    startY: e.clientY,
    startT: performance.now(),
    base: startsOpen ? -SWIPE_DELETE_WIDTH : 0,
    offset: startsOpen ? -SWIPE_DELETE_WIDTH : 0,
    axis: null,
    moved: false,
  };
  try { row.setPointerCapture(e.pointerId); } catch (_) { /* capture is optional */ }
});

document.addEventListener("pointermove", (e) => {
  const g = swipeGesture;
  if (!g || e.pointerId !== g.pointerId) return;
  const dx = e.clientX - g.startX;
  const dy = e.clientY - g.startY;
  if (!g.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 11) {
    g.axis = Math.abs(dx) > Math.abs(dy) * 1.12 ? "x" : "y";
  }
  if (g.axis !== "x") return;
  if (e.cancelable) e.preventDefault();
  g.moved = true;
  let next = g.base + dx;
  if (next > 0) next *= 0.16;
  g.offset = Math.max(-SWIPE_DELETE_WIDTH, Math.min(10, next));
  g.row.classList.add("swiping");
  g.shell.classList.toggle("revealing", g.offset < -6);
  g.row.style.transform = `translateX(${g.offset}px)`;
}, { passive: false });

function finishProjectSwipe(e) {
  const g = swipeGesture;
  if (!g || e.pointerId !== g.pointerId) return;
  swipeGesture = null;
  if (g.axis !== "x") return;
  const dx = e.clientX - g.startX;
  const quickLeft = performance.now() - g.startT < 280 && dx < -28;
  const shouldOpen = g.offset < -SWIPE_OPEN_THRESHOLD || quickLeft;
  setSwipeOpen(g.shell, shouldOpen);
  suppressSwipeItem = g.item;
  suppressSwipeClickUntil = performance.now() + 360;
}

document.addEventListener("pointerup", finishProjectSwipe);
document.addEventListener("pointercancel", finishProjectSwipe);

// Suppress the synthetic click after a drag. When a row is already open,
// tapping the row closes it; only the revealed Delete button remains active.
document.addEventListener("click", (e) => {
  const item = e.target.closest("[data-swipe-item]");
  const control = e.target.closest("button, input, label, a");
  if (!control && item && item === suppressSwipeItem && performance.now() < suppressSwipeClickUntil) {
    e.preventDefault();
    e.stopImmediatePropagation();
    return;
  }
  if (!openSwipeShell) return;
  if (e.target.closest(".swipe-delete")?.closest(".project-swipe-shell") === openSwipeShell) return;
  if (e.target.closest("[data-swipe-row]")?.closest(".project-swipe-shell") === openSwipeShell) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  closeOpenSwipe();
}, true);

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el || el.disabled) return;
  e.preventDefault();
  const fn = actions[el.dataset.action];
  if (fn) fn(el.dataset.id, el);
});

document.addEventListener("submit", (e) => {
  const reasonForm = e.target.closest('[data-form="switch-reason"]');
  if (reasonForm) {
    e.preventDefault();
    const rec = reflectionRecord();
    const input = reasonForm.querySelector('input[name="reason"]');
    const text = input ? input.value.trim() : "";
    const event = rec && Array.isArray(rec.switchEvents)
      ? rec.switchEvents.find((item) => item.id === reasonForm.dataset.eventId)
      : null;
    if (!event || !text) return;
    event.reason = text;
    event.reasonGroup = "Feeling";
    event.reasonSource = "manual";
    event.answered = true;
    rememberSwitchFeeling(text);
    advanceReflection(rec);
    return;
  }

  const sessionTaskForm = e.target.closest('[data-form="session-task"]');
  if (sessionTaskForm) {
    e.preventDefault();
    const projectSelect = sessionTaskForm.querySelector('select[name="project"]');
    const input = sessionTaskForm.querySelector('input[name="task"]');
    const project = projectSelect
      ? state.projects.find((item) => item.id === projectSelect.value && !item.archivedAt)
      : null;
    const text = input ? input.value.trim() : "";
    if (!state.active || !project || !text) return;
    ensureProjectTasks(project).push({
      id: uid(),
      text,
      done: false,
      createdAt: now(),
      completedAt: null,
      sessionId: state.active.id || null,
    });
    sessionCaptureMode = null;
    save();
    render();
    toast(`Task added to ${project.name}.`);
    announce(`Task added to ${project.name}. Your attention stayed where it was.`);
    return;
  }

  const sessionNoteForm = e.target.closest('[data-form="session-note"]');
  if (sessionNoteForm) {
    e.preventDefault();
    const a = state.active;
    const input = sessionNoteForm.querySelector('textarea[name="note"]');
    const text = input ? input.value.trim() : "";
    if (!a || !text) return;
    if (!a.id) a.id = uid();
    const current = openSeg(a);
    const last = a.segments[a.segments.length - 1];
    const reference = current || last;
    const project = reference
      ? state.projects.find((item) => item.id === reference.p) || null
      : null;
    ensureNotes().unshift({
      id: uid(),
      text,
      createdAt: now(),
      sessionId: a.id,
      sessionStartedAt: a.startedAt,
      projectId: project ? project.id : null,
      projectName: project ? project.name : null,
      projectSlot: project ? project.slot : 2,
    });
    sessionCaptureMode = null;
    save();
    render();
    toast("Note saved. No attention switch added.");
    announce("Note saved. Your attention path and switch count did not change.");
    return;
  }

  const taskForm = e.target.closest('[data-form="add-task"]');
  if (taskForm) {
    e.preventDefault();
    const p = state.projects.find((project) => project.id === taskForm.dataset.projectId && !project.archivedAt);
    const input = taskForm.querySelector('input[name="task"]');
    const text = input ? input.value.trim() : "";
    if (!p || !text) return;
    ensureProjectTasks(p).push({ id: uid(), text, done: false, createdAt: now(), completedAt: null });
    expandedTaskProjectIds.add(p.id);
    taskComposerProjectIds.add(p.id);
    commit();
    const next = document.getElementById(`task-input-${p.id}`);
    if (next) next.focus();
    return;
  }

  const form = e.target.closest('[data-form="add"]');
  if (!form) return;
  e.preventDefault();
  const input = form.querySelector("input[name=name]");
  const name = input.value.trim();
  if (!name) return;
  const projects = activeProjects();
  if (projects.length >= PROJECT_LIMIT) return;
  if (state.projects.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    toast("You already have a project with that name.");
    return;
  }
  const used = new Set(projects.map((p) => p.slot));
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
  if (e.key === "Escape" && openSwipeShell) {
    closeOpenSwipe();
    return;
  }
  if (e.key === "Escape" && addOpen) {
    addOpen = false;
    render();
    return;
  }
  if (e.key === "Escape" && sessionCaptureMode) {
    sessionCaptureMode = null;
    render();
    return;
  }
  const projectToggle = e.target.closest("[data-project-toggle]");
  if (projectToggle && e.target === projectToggle && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    actions.toggleProjectTasks(projectToggle.dataset.id);
    return;
  }
  if (e.target.matches("input, textarea, select")) return;
  if (view !== "session" || !state.active) return;
  if (e.key >= "1" && e.key <= "9") {
    const p = activeProjects()[Number(e.key) - 1];
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
  if (view === "reflection" && !state.sessions.some((s) => s.id === summaryId)) view = "home";
  if (view === "summary" && !state.sessions.some((s) => s.id === summaryId)) view = "home";
  if (view === "project" && !state.projects.some((p) => p.id === projectHubId)) view = "home";
  render();
});

/* ---------- Boot ---------- */

render();
