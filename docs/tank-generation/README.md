# Tank generation handbook

Start here when an owner supplies model files, photographs, Gallery surface
markup, or a request to build another tank “the same way.” This is the
repository-local handoff for the source-study and procedural construction
workflow developed in the tank-generation conversation through 2026-09-07.
It is not a model importer, a claim that every previous tank passed, or a
transcript whose old commands should be replayed.

## Start a build

**Current urgent priority:** read the [fleet style and performance backlog](fleet-style-performance-priority.md)
before adding further tank detail. The 2026-09-07 owner request makes switching
cost, reusable primitives, return rollers, track thickness, chassis closure and
correct camouflage/accessory materials required work across all new tanks.
These are open issues, not completed fleet-wide fixes.

1. Read the root [agent index](../../AGENTS.md), [vehicle instructions](../../src/vehicles/SKILL.md),
   this directory's [procedure](SKILL.md), and the applicable build/gate laws.
2. Create a scoped worktree and copy [the run packet](templates/run-packet.md)
   to `docs/references/tanks/<id>.md`, or extend an existing packet. For a batch,
   put the batch contract in `docs/research/<batch>.md` and link its per-ID rows.
3. Resolve the intended target and preserve the supplied input before building:
   [workflow](workflow.md), stages 0–2. Do not substitute an attractive donor
   or a different file without documenting the owner's decision.
4. Build, compare, correct, and remeasure using [geometry methods](geometry-methods.md),
   the [tool map](tool-map.md), and [quality gates](quality-gates.md).
5. Finish with an evidence-backed preview and [handoff](templates/handoff.md).
   Commit/push only within the current authorized publication scope.

## Choose the route

| Request | Route and required distinction |
| --- | --- |
| “New tank from this GLB/OBJ/ZIP/folder; name it X” | Independent source study, new exact ID, old production model preserved; metadata reuse is not visual proof. |
| “Do the whole family” | One validated base plus an explicit per-variant delta/source matrix. Do not certify all variants against one configuration's oracle. |
| “Keep this as Proto; make a proper one” | Preserve the historical model separately; source fidelity and historical preservation are different comparisons. |
| “Make Mk10 based on Mk5 X” | Explicit first-party recipe reuse, adapted to Mk10 datums; no complete duplicate donor assembly under a second shell. |
| Exact surface JSON and “attach/move/shorten” | Map the selection in its local owner frame; the prose operation governs, not the export's generic `remove` field. |
| “Fix all barrels/tracks/ERA” | Reproduce the shared cause, define the affected ID set, preserve opt-in/default behavior, test actual animated/damaged states. |
| “Continue” | Reopen the latest run/handoff and inspect live tree state; don't restart completed work or revive superseded chat requests. |
| “Commit and push” | Audit exact scope, failures, generated assets, upstream delta and source exclusion. A previous batch's exception does not authorize this batch. |

Copyable agent briefs live in [the prompt pack](prompt-pack.md). These are
reconstructed operating prompts, not purported verbatim copies of unavailable
assistant messages. [Case studies](case-studies.md) preserve the significant
owner corrections, successes, rejected methods, and scope changes.

## Authority and chronology

- The current owner's explicit target/scope instructions govern the requested
  work. Repository runtime, ownership and safety constraints still apply.
- [BUILD-STANDARD](../BUILD-STANDARD.md) and [GEOMETRY-GATE](../GEOMETRY-GATE.md)
  own the general craft and measurement laws; the latter specifies gate math.
  Both retain historical August methods and thresholds. For **new reference-backed
  builds**, apply the newer **92-point** exemplar requirement from
  [vehicle instructions](../../src/vehicles/SKILL.md) and the
  [second-wave contract](../research/source-x-second-wave.md), not the legacy 90 floor.
- The newer supplied-file workflow freezes a **source-only rigid transform plus
  at most one declared uniform unit/size scale**. Old per-axis oracle warps,
  percentile-driven source reshaping, mask-only furniture, or score-counterweight
  recipes are not the starting procedure for new X models. Report contradictory
  requirements instead of modifying the reference to make the candidate pass.
- An owner can explicitly choose supplied-file proportions over real-vehicle
  proportions. That changes the documented visual target, not reality, the
  raw gate score, or the need to report a published-dimension conflict.
- Source files are private comparison/authoring inputs. Permission to study a
  supplied file is not permission to redistribute its meshes or textures.
  Runtime playables remain first-party procedural geometry.
- A dated publication exception preserves its failed statuses. It never becomes
  a quality pass or a standing waiver for another tank.

## What goes where

| Surface | Durable owner |
| --- | --- |
| Reusable procedure, prompts, troubleshooting, handoff templates | This directory |
| Build-wide craft laws / measurement definition | `docs/BUILD-STANDARD.md` / `docs/GEOMETRY-GATE.md` |
| Per-tank source identity, datums, decisions, run results | `docs/references/tanks/<id>.md` |
| Batch scope, variant mapping, integration and explicit exceptions | `docs/research/<batch>.md` |
| First-party authored runtime geometry / tests | `src/vehicles/` and the exact family/profile owner |
| Generated receipts, asset registry and technical cards | Their existing generators; never hand-edited to claim success |
| Source binaries, intermediate conversions, bulk screenshots/logs | Ignored comparison/QA paths; durable packets retain hashes and regeneration instructions |

Keep one current-status block above chronological checkpoints. Use `PASS`,
`FAIL`, `NOT RUN`, `BLOCKED`, or `NOT APPLICABLE (reason)` for individual checks;
separately state implementation, qualification, and publication status.
An old passing screenshot cannot certify later geometry.

## Maintain this handbook

When a failure repeats, add the generalizable method here and a regression at
its code owner; keep vehicle-specific numbers in that vehicle's packet. Do not
copy all 996 lines of historical build laws into every brief. When a command
or owner changes, update [the tool map](tool-map.md) and linked instructions.
Run `node docs/tank-generation/check.mjs --selftest` and
`node docs/tank-generation/check.mjs` after edits. These check the small checker,
documentation links and required handoff fields, not tank geometry or release
readiness. Run the repo's agent-docs doctor after instruction changes; keep
unrelated scaffold stubs out of a scoped handbook update.
