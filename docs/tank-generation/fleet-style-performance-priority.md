# P0 — fleet style, construction cost and connected running gear

Owner request: Kevin B. Liu, 2026-09-07. **Priority: urgent, before further
micro-detail expansion. Status: OPEN.** This is an implementation backlog and
acceptance contract, not a claim that the fleet has already been optimized.

The owner reports noticeably slower, laggier tank switching and suspects
excessive triangle counts in the new tanks and older Challenger 2/3 builds.
The report is accepted as a user-visible issue. Triangle count is a suspected
contributor, not yet a demonstrated sole cause: construction, geometry merging,
camouflage baking, shader compilation, uploads, caching and disposal must also
be measured.

## Scope

Apply the style/mechanical audit to **every new source-study tank**, not only
Abrams, the current Gallery selection, or IDs containing a particular substring.
The integrated registry at `12a5b9aec317107782b5f6505065ada7c721f290` plus the
seven-model Abrams WIP resolves:

- 13 first-wave `SOURCE_X_IDS`.
- 23 `SECOND_WAVE_X_IDS`, including the separately named Leclerc studies.
- Seven `ABRAMS_SOURCE_X_IDS`.
- `leo2_revolution`; audit `leo2_revolution_proto` as a regression/style control.
- Older Challenger performance targets: `fv4034`, `challenger2`, `challenger2e`,
  `ua_challenger2`, `challenger_3`, `challenger_3x`.

That is 51 initial measurement targets, including the Revolution Proto control,
not a ceiling on the owner's all-new-tanks scope. Resolve any further new or
substantially rebuilt IDs from generation records before rollout and append
them to the ledger; do not silently omit non-X additions.
`challenger_3x` is not in the 43 source-X set. Original `abramsx`, `m1a2` and
`leclerc` are useful additional established-style controls, not authorization
to rebuild their silhouettes. Freeze and serialize the exact registry-derived
ID list before a run; fail on omitted IDs. Audit lower hull/chassis closure
across the entire playable fleet, reporting unmodified legacy defects separately.

## Urgent issues and required outcomes

| ID | Issue / required outcome | Status |
| --- | --- | --- |
| FSP-01 | Measure and reduce excessive geometry/construction cost; eliminate the reported tank-switch stalls. | OPEN — user report; causal profiling pending |
| FSP-02 | Use shared or newly authored, tank-appropriate primitives for road wheels and repeated fittings. Preserve distinct vehicle shapes. | OPEN |
| FSP-03 | Add and verify actual return rollers on every new X tank and Revolution. | OPEN — 11 probable missing cases in initial census; physical verification pending |
| FSP-04 | Thicken the new tracks to the established original-fleet visual standard, with correct moving-shoe and end-wheel clearances. | OPEN |
| FSP-05 | Complete lower hull/chassis side plates and connect hull sides, shoulders, fenders and skirts without accidental holes or floating panels. | OPEN |
| FSP-06 | Apply deliberate material roles: camouflage on painted vehicle bodywork; distinct materials/colors for accessory equipment, cloth, bags and mechanisms. | OPEN |

## Initial measured evidence — not an implementation pass

The [54-model baseline](../research/fleet-style-performance-baseline-20260907.md)
contains 108 high/low builds plus 35 repeated construction samples. It freezes
the exact input hash and ID manifest and separates stored geometry from
LOD-selected instance-expanded scene triangles:

- SEPv2 X: 229,128 high / 200,430 low visible scene triangles; only 12.5%
  reduction, and 67.8% of its high total is running gear. These are pre-frustum
  estimates, not measured GPU submissions.
- Eleven IDs have zero native roller stations and no roller-named scene stock;
  this is a probable-missing list, not proof excluding untagged merged shapes.
- `challenger_3x` took a median 2,267.7 ms across five warm Node construction
  samples. Node timing excludes browser textures, uploads and useful paint.

This is an unfinished integration snapshot, before the final Abrams authoring
resync. Do not reuse its input hash to certify newer geometry. Actual browser
switch latency, material finish, physical closure and optimization remain open.

### FSP-01 — performance is an acceptance gate, not a postscript

Record high/low geometry storage triangles, instanced/rendered triangles,
visible draws, mesh/material counts, geometry/texture memory and build time
per ID. Attribute costs to hull, turret, road wheels, end wheels, return rollers,
track shoes, ERA and equipment. Counting one instanced shoe only once is not a
rendered triangle count; counting invisible LODs as simultaneously rendered is
also wrong. Node construction timing is **not** browser switch latency.

Reproduce cold first selection, warm revisits, rapid cross-nation selection,
cache eviction and repeated cycles in both Gallery and Garage. Preserve exact
sequence, seed, viewport, graphics tier, CPU throttle, cache state, dwell,
build/tool revision and source hashes. Measure request-to-visible-*paint*, p50,
p95, worst frame gap, long tasks and phase timings. A hidden stage made visible
in JavaScript is an earlier event than the next presented frame; report both
where instrumentation permits. Never accelerate the measurement by bypassing
the actual production selection/construction path.

Choose explicit class/detail budgets from the measured established controls
**before** optimizing; record the budget decision and then keep it fixed.
Keep the existing resource, entry and convergence gates. The legacy switch
probe's default five-second ceiling is a diagnostic timeout/budget, not the
owner's definition of smooth switching. Do not invent favorable thresholds
after seeing a candidate or count an unrun browser benchmark as a pass.

### FSP-02 — reusable primitives, not a generic donor vehicle

Reuse or add parameterized wheel disks/dishes, hubs, rims, tires and face
patterns to the shared wheel vocabulary. Share repeated geometry where the
shape is identical; instance or merge by material and articulation owner.
Use quality-aware segment counts. The low tier must meaningfully reduce cost,
not emit the high-detail mesh under a different label. Repeated bolts, hinges,
optics housings, stowage and support frames should use the same approach.

Retain measured wheel count, radius, axle spacing, negative space and
vehicle-specific form. New primitives are first-party analytic constructions,
not remeshed source triangle payloads. Reuse geometry with correct ownership
and disposal; never dispose a shared primitive while another tank still uses
it. Preserve exact hull/turret identity rather than making all X tanks one base.

### FSP-03/FSP-04 — real rollers and substantial tracks

For each target, enumerate expected return-roller pairs and their positions.
Check actual rendered geometry on **both sides**, including high/low and
animated suspension/track poses. A config number, name tag, hidden marker or
duplicate road wheel is not proof of a roller. Rollers must be mounted to the
running-gear assembly, remain on their axes and support the upper return run.
If a supplied model has no rollers, record the owner's requested addition as
an explicit style/mechanical deviation instead of silently certifying it as
source-exact.

Measure original-fleet track band, shoe web, pad, grouser and pin dimensions
in metres and select comparable control vehicles. Adjust the actual smart
shoe/band primitives, not just a cosmetic outer belt. Recompute the whole
moving envelope, upper run and end-wheel tangency after thickness changes.
Keep one animated course, no clipping through wheels/hull/skirts, no doubled
static belt, and no unintended ground penetration. Road-wheel stations must
not move merely to conceal a thickness error.

### FSP-05 — closed bodywork with necessary mechanical air

Audit each actual hull from front, rear, both sides, low quarters and below.
Verify outward lower chassis sides, joined upper/lower hull, shoulder-to-glacis
continuity, fender-to-shoulder contact and skirt mounting/backing. Replace
accidental gaps with finite physical plates and seated joints. Check both LODs,
yawed turrets, moving running gear and all ERA-spent/reset states.

Do not use invisible/shadow-only filler, a giant internal box, or camouflage
to mask missing stock. Preserve optical recesses, exhaust/service openings,
turret-ring clearance and the space needed for moving suspension/track shoes.
The preceding Abrams request explicitly asks for no exposed wheel at the
shoulder/skirt areas. Record the chosen coverage extent; hiding complete lower
road-wheel faces changes the source silhouette and cannot be silently described
as merely repairing an upper seam. Physical closure and source fidelity are
separate checks with separate raw results.

### FSP-06 — deliberate camouflage and accessory materials

No accidental default-white, gray or bare-blue armor/bodywork. Hull, turret,
glacis, shoulders, painted guards and painted wheel faces use the vehicle's
camouflage-aware paint roles. Cosmetic accessories are **not all armor paint**:
cloth, canvas bags, tarps, straps, stowage and accessory equipment get deliberate
solid fabric/paint/material colors appropriate to the part. Optic glass,
rubber tires, track/weapon metal and unpainted mechanisms retain their proper
non-camouflage materials. Classify each part; do not satisfy “no un-camo parts”
by camouflaging glass, tires and canvas, or remove camouflage from actual armor
because its builder bucket happens to be called equipment.

Keep classification in the shared material/appearance system. Inspect the
actual native rendering in several camouflage schemes and both detail levels.
Material rebucketing must not change armor collision, ERA behavior, ownership
or attachment. Refresh affected portraits and technical receipts after the
geometry/material implementation is frozen.

## Implementation order and completion evidence

1. Freeze the ID manifest; take a full cost/roller/material census and paired
   original controls. Profile the worst measured switching paths.
2. Pilot a representative expensive X tank and an older Challenger, preserving
   their input baseline. Fix shared primitives and the measured bottleneck.
3. Validate the pilot's performance **and** recognizable shape/real air before
   rolling the same bounded helpers through every applicable target.
4. Complete rollers, track thickness, chassis closure and material roles per
   ID. Track each issue separately; no one-tank result closes the whole batch.
5. Run source/native views, geometry/contact/track/ERA tests, anatomy update and
   check, selected assets, full tests/typecheck/build, browser performance and
   the composed release gate. Retain explicit style/source conflicts as such.

Per-ID ledger fields: ID, profile owner, baseline/candidate hash, high/low costs,
roller geometry/count/contact, track dimensions/control, chassis/shoulder/skirt
closure, material roles, cold/warm/rapid-switch results, source deviations,
remaining failures, exact next action and responsible implementation owner.
Use PASS/FAIL/NOT RUN, not a decoration count or a blanket “audited.”

Existing routes: [tool map](tool-map.md), [performance architecture](../PERFORMANCE.md),
`tools/switch-latency-probe.mjs --sequence <csv> --cpu 4`,
`tools/garage-switch-probe.mjs`, `npm run perf:garage-entry`,
`npm run perf:resources:gate`, and the focused wheel/track/appearance tests.
Read the current CLI and queue ownership first. Diagnostic tools with debug
staging do not replace real-pointer selection/convergence checks.

## Recovery and verified checkpoint publication — 2026-09-08

The owner has authorized more frequent scoped commits and pushes to
`origin/main`: **“Yes—push verified checkpoints as they pass.”** Include the
requested Abrams/fleet material, running-gear and performance work with its
necessary tests/docs; exclude unrelated experiments, private source models and
temporary QA. This is not an as-is publication waiver or authority to weaken
existing quality gates.

The owner's coverage choice is to close upper shoulder/skirt gaps while keeping
lower road wheels visible. When thick tracks conflict with old link shapes,
prioritize fitted, efficient new running-gear primitives while preserving the
hull/turret silhouette and road-wheel stations.

The [2026-09-08 recovery record](../research/fleet-wip-recovery-20260908.md)
separates interrupted lifecycle results, bounded frozen passes, remaining
failures and the next verification/publication steps. This backlog remains
open; neither that record nor an independent documentation checkpoint certifies
the unfinished fleet changes.
