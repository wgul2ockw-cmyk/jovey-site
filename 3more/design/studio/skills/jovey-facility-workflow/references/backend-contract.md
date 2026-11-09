# Server integration contract — not deployed

## Scope and authority

Only `/3more` is authorized for repository edits. No provider call, external upload,
account creation or spending is authorized. This package has no HTTP client, API
key handling, live route or deploy step. A skill can guide an agent; it does not
create an autonomous AI service. Use the existing bot/auth worker's verified
identity and membership. Client `subject`, profile names and scope selectors are
never trusted. Every read, search, job, model URL and write needs server authorization.

Personal(owner) and Team(member) expose identical features. Search only the selected
workspace plus public catalog assets. Do not silently use a personal asset in Team,
even for the same owner; require an explicit authorized share/copy operation.
Dunk/Aim/Aum are mock profile names, not principals. Invite redemption and password
creation remain with the auth backend; collect no passwords in the studio.

## Logical operations for HTTP or MCP adapters

- `propose_plan(brief, workspace, expected_project_revision)`: authorized retrieval,
  agent proposal with cited sources, unknowns, stage dependencies and module mapping.
  Require user acceptance before generation; no implied completion.
- `search_assets(query, workspace)`: authorized catalog, geometry/semantic fit,
  immutable version, hashes, licence, style/review state. No private snippets leak.
- `request_asset(request)`: schema + authorization + plan revision + accepted plan.
  Server-owned grant binds exact request hash, provider, subject, workspace,
  data-sharing approval, credentials readiness and spending reservation.
- `get_job(job_id)`: same authorization as creation. Return same job for retries.
- `accept_asset(job_id, expected_revision)`: verify receipt, hashes, GLB, style review;
  atomically save source, derivative, provenance and stage binding to private storage.
- `get_asset(asset_id, version)`: authorize then issue short-lived storage URL.

Backend must derive authorized context independently. Helpers are offline building
blocks, not a deployed security boundary. JSON Schema rejects unknown fields and
invalid shapes; semantic validators catch dependency cycles, mode ambiguity, wrong
parent, material-only pretending to be geometry and reused geometry labeled new.
The geometry fingerprint includes decoded positions, indices, placement and scene.
It is a practical equality check, NOT canonical topology equivalence, originality,
semantic fit or engineering certification. Reordered vertices can change it.

## Durable jobs and concurrent navigation

Before dispatch, persist job with unique `(subject, workspace, idempotency_key)` and
canonical request hash. Same key + same hash returns existing job; changed payload
returns conflict. Atomically reserve budget before any billable request; cap is per
job and account quota must also be enforced. `provider_gate` only checks a supplied
server grant; it does NOT implement reservation, expiration, acceptance or billing.

States: queued -> submitting -> running -> review -> ready; explicit failure/cancel
branches. POST timeout after submission -> outcome-unknown. Never retry that POST
blindly. Reconcile provider receipt/task ID first. Poll failure keeps running and
resumes the same task; it is not failed generation. Cancellation may stop display
or storage without stopping provider billing; reconcile before releasing funds.

Bind UI results to subject + workspace + request ID + plan revision and navigation
sequence. Drop stale responses after workspace switches, edits, logout or superseding
jobs. Abort fetches where possible; abort is not proof a server job stopped. A
completed personal job must never appear in Team. Persist in its original authorized
scope even if UI navigates away. The prototype guards its local async model loads
with a navigation epoch; future adapter must preserve this invariant.

## Output and modes

Reuse retains exact source hash and parent reference. Adapt retains original source,
records `material-only` or `geometry-adaptation`, and makes a new immutable version.
Generate-new needs actual procedural/AI generation receipt, source file hash and
output review. Templates keep `procedural-template`; no seeded catalog entry is
AI-generated. Imported GLB keeps `user-import`. No success before validated bytes.
Validate GLB in an isolated worker (resource/time limits, no external URI fetches),
scan assets, verify bounds and retain a preview. The offline validator intentionally
accepts static, uncompressed triangle GLB only. A full glTF validator and visual QA
are required for production, especially unsupported extensions and complex assets.

## Optional future Meshy adapter (candidate only)

Parent verified official docs, no execution authorization. Server-only candidate:
POST `https://api.meshy.ai/openapi/v2/text-to-3d` with mode preview, model_type
smart-topology, ai_model meshy-t2.5, topology triangle, target_polycount 4000 and
target_formats [glb]. Object prompt limit 800 characters; polygon range 100–30000.
Preview is untextured geometry. 202 result is task ID; GET same endpoint/task ID.
Only SUCCEEDED yields model_urls.glb. PENDING/IN_PROGRESS keep polling;
FAILED is explicit failure. Respect Retry-After or 5-second polling. A transport
error is not provider failure. No provider idempotency header was verified.
Download completed assets promptly to private owned storage. Compose small facility
modules rather than complex whole campuses. Do not send the reference image or
private brief until provider/data-sharing/spend authorization covers that payload.

Sources to recheck when activating an adapter:
https://docs.meshy.ai/en/api/text-to-3d
https://docs.meshy.ai/en/api/task-lifecycle
https://docs.meshy.ai/en/api/errors

## Current blockers

Provider choice, credentials, payload sharing approval and spending cap are missing.
Private storage, durable job queue/database, authenticated API/MCP adapter and server
policy enforcement are not wired to this prototype. No paid/live generation occurs.
The local four GLBs are real procedural 3D geometry, not AI interpretation of a brief.
Recolouring in the UI is material styling, not topology generation. All outputs are
concept-only; CAD/engineering validation requires separate evidence and specialists.
