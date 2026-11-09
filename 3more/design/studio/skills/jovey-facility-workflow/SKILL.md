---
name: jovey-facility-workflow
description: Turn a Jovey project brief into a proposed roadmap and reusable faceted 3D facility concept; retrieve existing assets, adapt a source, or request genuinely new geometry with truthful provenance.
---

# Jovey facility workflow

Work only under `/3more`. This skill is a reusable agent workflow, not a connected
AI service. Never label the studio's templates or material recolouring as AI
planning or new geometry. Personal and Team use the same workflow; access differs.

## Brief to proposal

Read the current project, authorized workspace and the user's need. Preserve unknown
capacity, dimensions, dates, ownership and progress. Propose steps, dependencies,
facility modules and open questions as a **proposal**, with evidence for factual
claims. Bind modules to roadmap step IDs; buildings represent work, not completion.
Use the [schema](references/workflow.schema.json) to express the plan. The AI agent
may author the proposal itself; mark it `agent-proposal`, include its actual author,
and do not present it as an externally connected planner. Existing UI templates
remain `template`. Never infer a team member's role from a profile name.

Inspect the supplied reference pixels when accessible before claiming visual
fidelity. The [style guide](references/style.json) describes the inspected reference
and its translation to buildings; it is a direction, not proof that output matches.

## Choose a mode per module

- **reuse**: Search the authorized catalog first. Explain fit and missing features.
  Reuse the exact source hash. Do not relabel cached geometry as generated.
- **adapt**: Start from an authorized asset and record parent ID/hash. Distinguish
  `material-only` from `geometry-adaptation`. Preserve original bytes. Recolouring
  changes appearance, not geometry. Visual review remains required.
- **generate-new**: Propose a small, clearly described facility module when reuse
  cannot satisfy the brief. Record why. Real generation needs a worker receipt,
  validated GLB and geometry distinct from catalog candidates/parents. Calling a
  template builder is `procedural`, never `provider-ai`. A new filename or hash of
  changed colours is not proof of new geometry. Hash checks cannot prove originality
  or design quality; human review and provider provenance are still required.

Read the [backend contract](references/backend-contract.md) before planning any
external call or write. No provider is authorized in this package. Prepare requests
locally; stop before sending a brief/image, spending, account setup or credentials.
Meshy T2.5 is only a candidate. Never silently downgrade a generation request to a
recoloured template. Return `blocked` with exact missing authorization instead.

## Review, validate and retain

Run `scripts/workflow.py` for schema/GLB/catalog validation and authorized search.
Install `scripts/requirements.txt` only in a scoped environment if needed.
`python scripts/workflow.py check-catalog` checks the bundled public concept assets.
`python scripts/workflow.py validate plan plan.json` validates an agent proposal.
The Python functions provide request authorization and result validation for a
future backend; they are not an authentication service or provider adapter.

Review the generated geometry, style, recognizability and roadmap mapping. A visual
concept is never CAD/engineering-validated without separate specialist evidence.
Keep source, derivative, licence/provenance, generation receipt, file hash, geometry
fingerprint, style version and review together. Store private results in authorized
backend object storage, not public GitHub or this static site. A scope selector is
not authorization. Do not place private briefs or catalog records into this package.

Return: proposed roadmap, selected mode and reason per module, preview, provenance,
actual-vs-mock capability, validation results and exact blockers. Reuse accepted
assets in future work; do not overwrite earlier versions or publish implicitly.
