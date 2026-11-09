# GitHub publishing contract — v3

## Website and source

- Dashboard: https://jovey.co/3more/
- Repository: https://github.com/wgul2ockw-cmyk/jovey-site
- Branch: main
- Authoritative snapshot: `3more/data/dashboard.json`
- Browser: static HTML/CSS/JavaScript, no remote application runtime, sign-in or API server.
- Optional tooling: Node 22, no packages required. These tools run in the bot runner, not in visitors' browsers.

## Use a connected GitHub bot

Read the current snapshot with the GitHub connector and retain its blob SHA. Prepare the requested changes using the schemas/model in this folder. Validate before publication:

```sh
node 3more/bot/scripts/jovey.mjs --validate 3more/data/dashboard.json
```

The CLI can apply a tool to a local copy without publishing:

```sh
node 3more/bot/scripts/jovey.mjs --file 3more/data/dashboard.json --call create_project < request.json
```

Then use the GitHub connector's file-update operation for `3more/data/dashboard.json`, supplying the exact current blob SHA and the complete updated file. This publishes one atomic snapshot. A conflict means reread and reconcile, not bypass the SHA check. Do not use the source repository's root index.html or modify existing Jovey pages.

If the bot cannot execute Node, use the current schemas and preserve the same revision, validation and update-inbox rules when preparing the file. Keep a real change's project, update event and global snapshot revision together. Prefer the model/adapter where execution is available.

## Optional MCP or CLI adapter

Download the complete bot package, including `lib/`, `scripts/` and `references/`. Configure an MCP-capable client to run:

```sh
node /absolute/path/jovey-mission-control/scripts/jovey.mjs --stdio
```

The runner's secret environment supplies `GITHUB_TOKEN`, authorized for Contents read/write on `wgul2ockw-cmyk/jovey-site`. No token is included or required in the website. Public reads work without a token, subject to GitHub rate limits. `JOVEY_BOT_NAME` is an optional display label; GitHub records the actual publishing identity. Each bot needs its own authorized connection. Do not paste credentials in chat or commit them to the repository.

For direct CLI calls, omit `--file` to read/publish through GitHub:

```sh
node scripts/jovey.mjs --call create_project < request.json
```

The same 11 tools are exposed through MCP: read_project_dashboard, get_bot_guide, create_project, publish_project_update, set_project_vision, assign_project_people, set_project_roadmap, upsert_calendar_event, remove_calendar_event, read_team_updates, acknowledge_team_updates. Complete schemas: [tools.json](tools.json).

The adapter reads the latest snapshot, validates the requested change, and writes with the exact GitHub content SHA. A commit success is not yet a completed Pages deployment. Check the deployment or live snapshot revision before reporting the website updated. No running adapter or schedule is installed automatically by the public website.

## Requests and unknown values

Create a project before its vision is known:

```json
{"projectId":"new-initiative","updateId":"create-001","name":"New initiative","kind":"team"}
```

Missing vision, previous/meeting/next, outcome, assignments, stages and dates are left unknown or empty. Nothing is inferred from the project name. The immutable ID is a lowercase slug up to 40 characters; name, description and kind can be edited later.

Keep an open question:

```json
{"projectId":"new-initiative","expectedRevision":1,"updateId":"question-001","patch":{"goal":null,"next":null,"questions":[{"id":"purpose","question":"What change should this project make?","answer":null}],"updateNote":"Vision remains open."}}
```

General 3D workstream, only when authorized by the user's project plan:

```json
{"goal":null,"theme":"general","isMock":false,"progressKnown":false,"streams":[{"id":"discovery","name":"Discovery workspace","kind":"facility","stages":[],"completedStages":0,"next":null,"goal":null,"dependsOn":[]}]}
```

Pass this as the roadmap in create_project, or set_project_roadmap with projectId, expectedRevision, updateId and updateNote. The map displays unknown progress and a proposed footprint. It does not invent a vision or a finished facility.

Dates use YYYY-MM-DD in Asia/Bangkok. A proposed non-mock event uses `status: proposed`; a confirmed real date requires evidence links on the project. Unknown dates are questions, not fabricated appointments. An assignee requires name, role and isPlaceholder; use role “Unspecified” when responsibility is unknown.

## Snapshot and notifications

`schemaVersion` describes the snapshot format. `revision` increments for each saved snapshot change. Each project has its own revision. `updates` contains the latest 250 project publication events, saved in the same snapshot as the changed project. `appliedUpdates` keeps the latest 250 idempotency records (fingerprints, not secrets). `notificationStartRevisions` records the migration baseline so earlier mock revisions are not reported as missing notifications.

A stable projectId/updateId pair can be retried with identical arguments. Different arguments with the same retained ID are rejected. The global file SHA prevents two bots from silently replacing each other's changes. GitHub conflicts are never force-retried.

`read_team_updates({"botId":"claude"})` returns unread events, per-project cursor and historyGaps. Reading does not acknowledge. After processing, call acknowledge_team_updates with the returned cursor. Each bot's cursor is independent and monotonic. A later publication remains unread. Older history may be pruned; reread affected projects when a gap is reported. Bot read acknowledgements are repository writes but do not create a new project event.

The HTML viewer polls the same snapshot every 30 seconds. GitHub deployment and caching may add delay. It never sends chat messages, holds GitHub write credentials or runs an AI bot itself. External notifications require an authorized runner subscribed to GitHub push events or polling, plus actual destination access. Those receivers remain unconfigured; do not report external chat delivery as complete.
