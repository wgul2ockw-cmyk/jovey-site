# Attention Switch — Engineering Handoff

## Current status

Attention Switch is a device-local, static web app published at
`https://jovey.co/attention/`. The production source lives in the Jovey site
repository under `attention/`. It has no backend, account system, database, or
build step. Optional Cloudflare Web Analytics visitor tracking is loaded only
when its site token is configured in `index.html`; it does not access app data.

This release adds session-safe capture:

- **Task** adds an item to any active project while a session is running.
- **Note** captures an idea against the current session and focused project.
- Neither action changes the active project, attention segments, attention
  path, or switch count.
- The home view links to a dedicated **Notes wall**, where ideas appear as
  color-matched Post-its.
- The running session shows all open tasks across active projects plus every
  note captured in that session. Tasks can be completed and notes deleted in
  place.
- Completed-session summaries include the notes captured in that session.
- Starting a session requests browser fullscreen when the platform supports it;
  unsupported or denied requests fall back to the normal app view.
- Launching an installed copy requests manifest-level fullscreen, with
  standalone display as the platform fallback.
- Fresh local storage starts empty. A compatibility cleanup removes only
  untouched legacy mock projects; any starter project with user activity or
  customization is preserved.
- Switch reflection asks for the feeling behind each move in one step. Manual
  feelings are retained locally as reusable tappable cards.

## Product model

The core product rule is simple: only an intentional project tap changes
attention. Task and note capture are side channels for recording work and ideas
without manufacturing a switch.

Primary flows:

1. Add up to nine active projects and optionally choose their colors.
2. Start a session and tap the project currently receiving attention.
3. Tap another project when attention moves; this creates a switch.
4. During the session, use **Task** or **Note** without interrupting tracking.
5. End the session, answer optional switch-reason prompts, and review the
   summary.
6. Use Trends for focus history and attention paths, project hubs for project
   details, and Notes wall for all captured ideas.

## Architecture and files

The app is intentionally framework-free:

- `index.html` — app shell, metadata, font loading, manifest, and script/style
  entry points.
- `app.js` — state, rendering, event delegation, session timing, trends,
  particle animation, tasks, notes, and persistence.
- `styles.css` — Jovey theme, phone-first responsive layout, session UI,
  attention visualizations, Post-it wall, and Mac/window layouts at 640px and
  900px breakpoints.
- `icon.svg` — animated particle logo. Its 2.7px display stroke is intentionally
  bolder than the 1.35px in-app visualization stroke. The formation renders at
  108% size and reuses its 396 source particles in a second inner layer, giving
  792 visible dashes while keeping the source animation compact. Arrow
  placement, colors, and motion remain identical between layers.
- `manifest.json` — installable web-app metadata.
- `sw.js` — offline stale-while-revalidate cache. Current cache generation:
  `attention-switch-v52`.
- `README.md` — product behavior and detailed particle-model documentation in
  the standalone source folder.

There is no compilation step. Files in `attention/` are served directly by
GitHub Pages.

## Persistence

All durable data is JSON in `localStorage` under:

```text
attention-switch:v1
```

Top-level state:

```js
{
  projects: [],
  active: null,
  sessions: [],
  notes: [],
  customFeelings: [],
  pendingReflectionId: null,
  theme: "auto"
}
```

Important records:

```js
// Running session
{ id, startedAt, segments: [{ p, start, end }], breaks: [{ start, end }] }

// Project task
{ id, text, done, createdAt, completedAt }

// Reflected attention switch
{ id, fromId, toId, answered, reasonGroup, reason, reasonSource }

// Session note
{
  id,
  text,
  createdAt,
  sessionId,
  sessionStartedAt,
  projectId,
  projectName,
  projectSlot
}
```

`load()` merges stored state with current defaults, so older installations gain
the `notes` array without a destructive migration. Notes snapshot project name
and color slot so they remain understandable if a project is later deleted.

## Critical invariants

- `actions.tap(projectId)` is the only UI action that intentionally moves
  attention and starts a new segment.
- Submitting `[data-form="session-task"]` may only append to `project.tasks`.
- Submitting `[data-form="session-note"]` may only append to `state.notes` and,
  for legacy active sessions, ensure the session has an ID.
- Task and note capture must never modify `active.segments`, close/open breaks,
  call `actions.tap`, or increment `switchCount()`.
- `renderSession()` must keep saved open tasks and current-session notes visible
  after their capture forms close; saving without visual feedback is a
  regression.
- Timing is timestamp-based (`Date.now()`), so background tabs and page reloads
  do not accumulate timer drift.
- Project colors use nine stable Jovey slots. Do not derive analytics identity
  from color; use project IDs.
- Whenever an asset changes, bump the cache name in `sw.js` so installed copies
  update cleanly.

## Session notes behavior

- A note captured while focusing snapshots the active project.
- A note captured on a break snapshots the last focused project.
- A note captured before the first project tap is saved as a general session
  idea.
- If a too-short session is discarded, its note remains safely available on
  the Notes wall but has no completed-session link.
- Deleting a session does not delete its notes.
- Deleting a note asks for confirmation and removes only that note.

## Local development

Open `index.html` directly, or serve the folder:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173/`.

Useful release checks:

```bash
node --check app.js
node --check sw.js
```

The session-capture regression check should verify all of the following in one
run:

1. Add a task during an active session and confirm it appears in the selected
   project.
2. Save a note and confirm it appears on the Notes wall and session summary.
3. Confirm both actions leave `active.segments` and the switch count unchanged.
4. Reload and confirm the running session, task, and note survive.
5. Check portrait and short landscape layouts on a phone-sized viewport.
6. Resize a desktop window across 480px, 760px, and 1200px widths. Home should
   move from one column to a two-pane workspace at 900px, sessions should place
   the dial beside their controls, and no view should gain horizontal scroll.

## Deployment and rollback

Production is the `main` branch of
`https://github.com/wgul2ockw-cmyk/jovey-site.git`. The deployable files are
under `attention/`; unrelated Jovey site files must not be staged with an
Attention Switch release.

Deployment procedure:

1. Copy the approved standalone app files into `jovey-site/attention/`.
2. Review `git status` and the scoped `attention/` diff.
3. Run syntax, functional, and HTTP smoke checks.
4. Stage only the intended `attention/` files.
5. Commit and push `main`; GitHub Pages publishes the update.
6. Verify `https://jovey.co/attention/` and its core assets respond normally.

Rollback trigger: the app fails to load, a running session cannot be resumed,
task/note capture changes the switch count, stored user data cannot be read, or
the production assets return errors. Roll back by reverting only the release
commit and pushing `main`. Never clear user `localStorage` as a rollback step.

## Known constraints

- Data stays on one browser/device; there is no sync, export, or recovery
  service.
- Clearing browser site data removes projects, sessions, tasks, and notes.
- Notes are limited to 500 characters and tasks to 80 characters.
- The UI supports up to nine active projects, matching the stable color system
  and desktop number shortcuts.
- Service-worker updates can require one refresh after a new worker activates.

## Recommended next checks

- Run a keyboard and screen-reader pass over the new Task/Note forms and Notes
  wall.
- Add an explicit export/import flow before introducing any state migration.
- If cross-device sync is added later, preserve the local-first experience and
  use stable record IDs for conflict resolution.
