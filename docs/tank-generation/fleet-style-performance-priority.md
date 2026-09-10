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

That was 51 initial measurement targets, including the Revolution Proto control,
not a ceiling on the owner's all-new-tanks scope. The owner's reiterated
2026-09-08 request includes the nine recent non-X rebuilds listed below:
the required review now covers **59 vehicles**, with four separate controls.
Resolve further new or substantially rebuilt IDs from generation records before
rollout and append them to the ledger; do not silently omit non-X additions.
`challenger_3x` is not in the 43 source-X set. Original `abramsx`, `m1a2` and
`leclerc` are useful additional established-style controls, not authorization
to rebuild their silhouettes. Freeze and serialize the exact registry-derived
ID list before a run; fail on omitted IDs. Audit lower hull/chassis closure
across the entire playable fleet, reporting unmodified legacy defects separately.

### Exact required review manifest — 2026-09-08

This is an acceptance manifest, not runtime opt-in or a release receipt. It
matches the 59-ID review policy. The seven Abrams X builds have since been
published; audit their actual X IDs, not substituted original Abrams models.

| Group | Count | Required IDs |
|---|---:|---|
| First source-study wave | 13 | `leo2a7v_x`, `leo2a6m_x`, `leo2a4m_x`, `leo2a5_x`, `merkava4_x`, `merkava3d_x`, `k2_x`, `kf51_x`, `t90a_x`, `t90a_vladimir_x`, `t90m_x`, `t90sm_x`, `t14_x` |
| Second source-study wave | 23 | `leo2a6_x`, `k1a1_x`, `amx30_x`, `t62mv1_x`, `t72b_1987_x`, `t80u_x`, `leclerc_x`, `leclerc_classic_x`, `chieftain_mk10_x`, `t72b3_x`, `jpz_e100_x`, `type10_x`, `type90_x`, `amx40_x`, `ariete_c1_x`, `strv122_x`, `t72b3m_x`, `challenger1_x`, `t72bu_x`, `chieftain5_x`, `t90_x`, `t90a_burlak_x`, `t90ms_x` |
| Conventional Abrams rebuild | 7 | `m1a1_x`, `m1a1ha_x`, `m1a2_x`, `m1a2_tusk_x`, `m1a2_sepv2_x`, `m1a2_sepv3_x`, `ua_m1a1_x` |
| Revolution | 1 | `leo2_revolution` |
| Recent non-X rebuilds | 9 | `cv90`, `cv90_mkiv`, `type89_light_tiger`, `spz_puma_s1`, `vt4a1`, `type99a`, `ztz99a2`, `ztz99a2_prototype`, `t72m1_jaguar` |
| Older Challenger review | 6 | `fv4034`, `challenger2`, `challenger2e`, `ua_challenger2`, `challenger_3`, `challenger_3x` |

Separate controls: `leo2_revolution_proto`, `abramsx`, `m1a2`, `leclerc`.
The 53 new/rebuilt targets do not include the six older Challengers. A 53-ID
roller, paint or triangle receipt therefore cannot close their review.

### Current evidence boundaries and immediate work

Publication reconciliation, 2026-09-10 (verified against `origin/main`
`85aa9224a`): the older **27 unpublished tanks** inventory is historical,
not a current release queue. Do not repeat it without checking ancestry.

- `4aa008627` publishes Type 10 X's fourteen camouflaged fixed skirt/fascia
  panels and the canonical Shtora pass. `e4ca00b6c` publishes the recovered
  fourteen-tank wheel/roller/paint batch, including T-90 X Shtora. See
  [the complete release scope](../research/fourteen-tank-recovery-release-20260910.md).
  These are qualified bounded changes, not full track-gauge completion.
- Merkava Mk3D X/Mk4 X fitted rollers are published in `8ff6d7cf6`, and
  T-14 X rollers are published through `ff0f639d9` (geometry `a681223d4`).
  Their release records are
  [Merkava](../research/merkava-roller-release-20260910.md) and
  [T-14](../research/t14-roller-release-20260910.md). Do not recover the old
  mixed K2/T-14 branch wholesale: K2 X was excluded for its 90.8137 source
  score, below 92. These publications do not complete their track-gauge work.
- T-90A X's upper fender closure, selected assets and final verification are
  published through `c1142f59b`. The thicker-track/structural-wheel pilot is
  separate and remains local: retained-axle source score 74.6; raised-axle
  alternative 90.7, both below the strict 92 release floor. No pass waiver.
- Type 10 X's current follow-up reduces redundant folded-sheet tessellation
  and attaches its existing six rollers using shared spindle primitives.
  It is tracked separately in
  [the Type 10 cost/contact checkpoint](../research/type10-x-cost-contact-20260910.md).
  Its 35 mm carrier is still not matched to the original Type 10's 90 mm
  carrier; this checkpoint must not close FSP-04 or the whole 59-ID program.

The following older measurements remain useful baselines, not unpublished-
work counts or assertions about the latest published build:

- All 59 IDs have been built at HIGH and LOW in the expanded material
  observation census. Its 118 rows establish coverage, **not material
  correctness**. The older census missed registered `addMudguard` geometry
  and direct service-cover meshes; those paths must be observed explicitly.
- Burlak's eight fixed side sheets, Mk5 X's four folded skins and 22 fixed
  panels across seven further IDs have bounded material/geometry/native
  evidence in isolated checkpoints. This is not full-fleet finish approval.
  Remaining fixed stock versus flexible material classifications stay open.
- Older Challenger budget failures remain open, including excessive
  return-roller/shoe detail and ineffective HIGH-to-LOW reduction on CR3/CR3X.
  A cheaper primitive is rejected if its guide horns, wheel faces, continuous
  carrier or moving shoes intersect actual stock.
- An earlier unqualified T-90A X coupled-gear experiment measured roughly
  71k HIGH / 50k LOW triangles; its live nonflat contact failed. The later
  isolated structural-wheel checkpoint (local `be04a03b6`) instead measures
  83,452 HIGH / 72,390 LOW scene triangles and 61,768 / 50,952 gear triangles.
  It preserves all twelve road-wheel stations while replacing the distorted
  source tires with circular supported primitives. Its old 174-triangle
  links, LOW gear budget and HIGH-to-LOW ratio still fail. Neither candidate
  is admitted for fleet rollout; do not combine their best metrics.
- A later T-90A X native-stock pilot meets the local 60 mm pad / 20 mm crest
  dimensions but still measures only about 93 mm of outboard shoe stock
  at HIGH, versus 120 mm on the measured same-nation original controls.
  The separate inner-carrier-face to outer-crest assembly depth is about
  99.5 mm versus 152 mm. Those are different physical measurements, not
  competing estimates of one dimension; matching only one is insufficient.
  This is **not country-matched thickness**. The next fit must reproduce the
  effective visible tread gauge at both HIGH and LOW, while retaining fitted
  internal guide geometry, axle stations and positive moving-stock clearance.
  Placeholder-material construction timings are not camouflage creation or
  browser selection timings. Failed 15 Hz terrain-cache trials also remain
  excluded: a lower query count is not useful if real shoes enter a crest.
- Published construction-cost/resource-ownership checkpoints do not solve the
  whole switch issue. Prior native logs contain roughly 600 ms frame intervals,
  but idle/throttled Gallery ticks are not automatically rendering stalls.
  Attribute intervals to active selection and presented frames before claiming
  a switch freeze or speedup. Continue cold/warm/revisit and real selection-path
  measurements; JavaScript stage visibility is not the first presented pixel.

Every result must name its exact input revision, IDs, detail levels, checks
and unresolved failures. Do not erase failed physical gates or replace a full
release result with a collection of unrelated narrow passes.

## Urgent issues and required outcomes

| ID | Issue / required outcome | Status |
| --- | --- | --- |
| FSP-01 | Measure and reduce excessive geometry/construction cost; eliminate the reported tank-switch stalls. | OPEN — user report; causal profiling pending |
| FSP-02 | Use shared or newly authored, tank-appropriate primitives for road wheels and repeated fittings. Preserve distinct vehicle shapes. | OPEN |
| FSP-03 | Add and verify return rollers across the full fleet wherever the actual vehicle has them; preserve genuinely rollerless suspensions. | OPEN — the initial 11 zero-station cases require vehicle-specific eligibility and physical verification, not blanket additions |
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
  this is an inspection list, not proof of a defect: it neither excludes
  untagged merged shapes nor establishes that the real vehicle uses rollers.
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

The owner's later clarification explicitly prioritizes **fitted, efficient new
running-gear primitives** over preserving unsuitable source wheel/link topology.
Do not keep a distorted rotating tire or expensive copied-looking face solely
to satisfy a byte-preservation snapshot. Record the intended shape deviation,
retain road-wheel stations and hull/turret identity, and test the replacement's
actual stock, moving fit and cost independently. The source witness remains
documented; it must not be silently rewritten as if the new shape were original.

### FSP-03/FSP-04 — real rollers and substantial tracks

The owner's latest instruction (2026-09-08 local / 2026-09-09 UTC) supersedes
the earlier blanket-add rule: cover the full fleet, **except tanks that do not
have return rollers in real life**. Establish eligibility and the correct
variant's count/layout from a manual, manufacturer evidence or clear reference
views before changing geometry. Record unknowns as unknown; a missing config
entry or an incomplete supplied model is not proof that rollers should exist.
For example, the US Army's [FM 100-2-3, T-62 entry](https://www.trngcmd.marines.mil/Portals/207/Docs/MCIS/ITEP/RITC-East/FM%20100-2-3.pdf)
explicitly identifies a rollerless return run. Do not add fictitious rollers
to the T-62 / T-62MV-1 X to satisfy the old census. Concepts and fictional
vehicles need a documented donor/design decision, not a fabricated historical
claim.

For each eligible target, enumerate expected return-roller pairs and positions.
Check actual rendered geometry on **both sides**, including high/low and
animated suspension/track poses. A config number, name tag, hidden marker or
duplicate road wheel is not proof of a roller. Rollers must be mounted to the
running-gear assembly, remain on their axes and support the upper return run.
If the supplied model omits rollers that the actual vehicle has, document the
reference-backed correction. If the actual vehicle is rollerless, verify its
road-wheel-supported return path instead; zero rollers is then the correct
result. Never place dummy or hidden rollers just to make a count check pass.

Measure original-fleet track band, shoe web, pad, grouser and pin dimensions
in metres and select comparable control vehicles **in the same nation and
running-gear family**. The owner repeated this requirement on 2026-09-08;
one universal thickness setting is not proof of country-matched appearance.
Measure instantiated stock in its real rig/root scale, including the carrier,
web, pad and crest rather than just config values. Separate the visible
outboard tread gauge from inward guide horns; do not thicken hidden horns to
claim a visual match or reproduce an original LOW-detail thinning mistake.
For each comparison, retain the actual selected near/far mesh, detail level,
camera distance, track phase, signed outboard axial section and local loaded-run
normal. Report the shoe's own radial span and the inner-carrier-face to outer
crest depth separately, alongside its solid section, pin extrema and full
collision envelope. A hidden far LOD must not set the visible comparison.
Use the complete mesh/instance/rig/world transform, not `root.scale` alone:
the original FV4034's authored 1.1 factor appears inside that transform chain.
Adjust the actual smart
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
The owner clarified the preceding Abrams request: **close upper gaps; keep
lower wheels visible**. Do not ask again or hide the complete road-wheel faces
to satisfy it. Physical closure and source fidelity are separate checks with
separate raw results.

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

### Avoid duplicate validation work

- Start from current `origin/main` and reconcile the relevant candidate's
  ancestry once. Do not repeat a full worktree/recovery scan at each checkpoint.
- During iteration, run the changed profile's contact/material/shape tests.
  Do not add `wheelQuality.selftest.mjs` as a single-tank preflight: it builds
  the entire fleet and runs again in the mandatory release. Use the existing
  `auditTankWheelQuality` function on the selected actual model for iteration.
- Check types and strict selected source geometry before expensive asset and
  full-fleet regeneration. Freeze the composed source once those checks pass.
- Group compatible verified IDs into one checkpoint and one complete release,
  not one full npm lifecycle per ID. Use `COT_SELFTEST_WORKERS=4` on this host;
  preserve fresh child processes, complete suite coverage and exclusive native
  browser stages. Never wrap the full release or npm lifecycle in an outer
  capture lease.
- Publish a passing checkpoint immediately. A different tank's failed pilot
  stays saved locally with its precise remaining defect; it does not hold up
  the verified group. Queue waiting, summed worker CPU time and elapsed time
  are different measurements and must be reported separately.

The owner's coverage choice is to close upper shoulder/skirt gaps while keeping
lower road wheels visible. When thick tracks conflict with old link shapes,
prioritize fitted, efficient new running-gear primitives while preserving the
hull/turret silhouette and road-wheel stations.

The [2026-09-08 recovery record](../research/fleet-wip-recovery-20260908.md)
separates interrupted lifecycle results, bounded frozen passes, remaining
failures and the next verification/publication steps. This backlog remains
open; neither that record nor an independent documentation checkpoint certifies
the unfinished fleet changes.
