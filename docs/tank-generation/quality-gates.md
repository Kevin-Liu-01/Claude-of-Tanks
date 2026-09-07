# Quality gates and evidence

The bar is recognizable, measured, coherent geometry at the AbramsX,
Challenger 2 and Leclerc exemplar level—not decoration count or a flattering
average. The [build standard](../BUILD-STANDARD.md),
[geometry gate](../GEOMETRY-GATE.md), and newer
[source-X contract](../research/source-x-second-wave.md) remain the detailed
owners. Use the [tool map](tool-map.md) to check actual current coverage.

## Acceptance matrix

| Gate | Required evidence / failure condition |
| --- | --- |
| Scope and source | Exact IDs, approved target, immutable raw/canonical hashes, source-only transform and explicit ownership. Missing reference or wrong model/pose is unavailable evidence, never 100. |
| Gross proportions | Measured hull/turret/gun/gear datums plus front, both sides, rear and top. Wrong-family form or turret proportions fail before details. |
| Registered source fidelity | `qualityBar: 'exemplar'`; raw aggregate **≥92** and **every valid registered silhouette view ≥92**. No averaging away one failed view. |
| Geometric fidelity | Fresh quality-bar-aware geometry packet; **each applicable component ≥92** for the new exemplar build. Legacy 90 is not the requested new-build bar. Declare genuinely unavailable fused component evidence. |
| Dimensions | Declared comparison dimensions within **3%** plus the independent geometry dimension score. These are different conditions: meeting a 3% per-axis limit need not pass the score. Preserve published/source conflicts. |
| Independent visual review | Same revision, registered source and official 14-view board; **≥9/10 on every required view**. Native materials and actual Gallery inspection, not silhouette-only or builder self-rating. |
| Structural closure and real air | Closed actual hull/turret volumes, no accidental inward/missing faces or floating plates; preserve source-real recesses, suspension air and open mechanisms. Retain raw continuity failures pending adjudication. |
| Articulation and attachment | Yaw 0/90/180 and gun elevation/depression, with actual bracket/surface contact, correctly moving instanced equipment and no stranded/dangling furniture. Parenting alone is insufficient. |
| Running gear | One suspension-owned wheel set and one smart-shoe course; both high/low checks; strict band and visible-shoe overlaps **0**. Correct wrap tangency and end-wheel positions, no static duplicate geometry. |
| Weapon assemblies | Mantlet seated, barrel/coax/receiver frames coherent, circular or source-correct sections, real muzzle bore and correctly directed taper. Roof weapon is an actual weapon, not a marker-only census escape. |
| Damage and combat anatomy | Live/spent/reset ERA, permanent backing, fitted main and auxiliary armor, gun-owner armor, real plate-edge/gap shot tests, modules/crew and regenerated anatomy freshness. |
| Presentation and preservation | Exact lazy ID, no external mesh load, correct asset images/centering, markings/paint ownership, originals' high/low hashes and unrelated records unchanged. |
| Release | Composed release stages pass, plus typecheck, public build and attribution. Record all commands, exits, tree identity and artifacts; do not collapse partial runs into a clean full test claim. |

Historical preservation is a separate contract. The allowlisted Revolution
Proto comparison requires **99** per component/view against its hash-pinned
first-party baseline, not a source-fidelity claim. Do not opt other models into
this mode simply because their source comparison fails.

## Freeze the measuring instrument

Before optimization, pin raw source, conversion/selection, canonical hash,
source-world registration, component provenance, camera/projection, resolution,
seed, and thresholds. Save the exact candidate geometry fingerprint with each
result. Repeated runs must measure the same inputs; a source change is its own
audited revision and requires new evidence.

Do not:

- Rescale, warp or crop the source based on the candidate's errors.
- Move a height/width/percentile anchor or camera to hide a mismatch.
- Fabricate source hull/turret labels on an inseparable mesh.
- Hide inconvenient geometry under a shadow/proxy name to remove it from masks.
- Add antenna spikes, counterweights, filler faces or marker-only weapons for
  the score rather than the actual vehicle.
- Hand-edit the generated ledger, relax a threshold, relabel an unrun check,
  or certify missing reference data as a vacuous pass.

Ordinary sampling/AA limits and source defects can be diagnosed. Report the
raw result, location, source evidence, uncertainty and proposed correction.
A tested measurement bug fix must preserve unaffected controls and cannot be
a one-ID favorable exception. A source defect never justifies a dishonest pass.

## Compare real shapes, not only envelopes

The geometry gate measures hull/whole/turret curves, longitudinal sections,
dimensions and projected islands. Its minimum is the headline. Side, plan and
front errors expose different problems; matching a bounding box does not match
a two-stage brow, a sight recess, a wheel dish or a sloping underside.

Use absolute work-order columns and source stations, with frame conversion
recorded. Angle claims cite measured segment deltas and uncertainty; roundness
claims cite radius/span/residual plus actual visible faceting. Inspect the
reference render before treating a misleading row as an instruction to add mass.

DoubleSide masks may hide reversed slabs that disappear in the player's
FrontSide renderer. AABB parenting checks may miss merged or instanced content.
Projected island checks can miss a part that overlaps in projection but floats
in depth. Therefore silhouettes, normal-material views, world/local probes,
physical contact checks and pose sweeps are complementary, not substitutes.

## Negative-space adjudication

For each flagged opening, record:

1. The exact source/native view and bounded region.
2. Whether it is accidental missing armor, an inward face, a real optical
   recess with a back wall, or an open mechanism/channel.
3. A cross-section/ray and both-angle image proving its depth and ownership.
4. The raw tool output and the disposition, separately.

Close accidental openings with the vehicle's own metal geometry. Keep real
window mouths, baskets, slats, ring clearance and running-gear air. If the
current continuity checker rejects real source air, record **FAIL** with the
source-real evidence and seek a reviewed checker/target decision. “Source has
251 holes too” did not turn T-72B3M's 268-hole result into a pass. Never add a
broad hidden belly slab to appease the census.

## Physical and gameplay adversarial checks

- Rotate equipment and turret through non-neutral poses. Check front/rear
  contact at the local roof height, not a global peak datum.
- Scroll the tracks and test wheel/suspension motion. End-wheel moves change
  tangent paths and shoe envelopes even when road wheels stay fixed.
- Spend every ERA cluster, not one convenient panel; verify underlying solids,
  shot faces and markings, then reset.
- Shoot finite rays at plate interiors, just outside edges and through true
  negative spaces. Test main **and auxiliary** protection, with correct owner
  transforms and no duplicate charge through nested copies of one layer.
- Verify generated marks on real permanent surfaces in both LODs. A geometry
  preservation test may isolate genuine generated markings, but may not skip
  arbitrary meshes by a broad name match.
- Include unaffected production controls. Helper changes need byte-identical
  defaults or a separately authorized, fully recertified affected set.

## Independent critic contract

The reviewer receives the target, frozen source/frame, candidate revision,
full required view list, gate reports and known uncertainties—not an order to
reach a desired score. They inspect each image, mark missing views NOT RUN,
report the weakest view and identify exact failed features. Do not award a
9+ score because the model looks more detailed than an earlier poor draft.

The repository currently has a separate legacy visual-evaluator registration
table and no committed `tmp-tank-critic.mjs` at the handbook baseline. Verify
coverage for each X ID before promising an official 14-view comparison.
Missing registration/capture support requires a tested tooling change or an
honest blocked certification; diagnostic crops can guide fixes but are not
retroactively official evidence. The numeric visual evaluator itself is not
the independent critic.

## Evidence record and invalidation

Each run records ID set, tree/geometry hash, oracle hash, command and arguments,
tool revision, source/config paths, start/end, exit code, output files, per-gate
status and unresolved issues. Retain concise durable summaries and regeneration
recipes; bulk local captures can stay ignored, but missing artifacts must be
reported when another agent resumes.

| Change after a pass | What must be reconsidered |
| --- | --- |
| Geometry/datum/scale | Source/geometry comparisons, visual review, contact/track/armor tests, anatomy, markings, assets and release |
| Materials/equipment parenting | Native visual review and relevant masks/framing; contact/ownership, markings, assets; camo rebucketing may alter pixels |
| Oracle/camera/scorer | Every affected comparison; preserve earlier results as historical, never mutate them in place |
| Combat armor only | Shot/owner/ERA/module tests and anatomy/release; prove native geometry remains unchanged |
| Rebase/integration | Relevant fresh tests and generated freshness plus upstream/old-model preservation |

Do not use a chain of successful test prefixes as “npm test passed.” A stopped
composed release has passed earlier stages and NOT RUN later stages. Diagnose
the first failure, then rerun the required complete qualification after fixes.
Record interrupted runs as interrupted even if they contain useful successes.

## Qualification versus publication

`implemented`, `qualified`, and `published` are independent facts. A tank can be
implemented and published but unqualified. The 23-model batch at `099edfa49`
is the historical explicit-as-is example: seven retained strict failures,
not a new permissive standard. See [case studies](case-studies.md).

Default: do not publish failing or partially verified work. If the owner grants
an explicit scoped exception, record who approved which exact batch/failures,
what remains excluded, and the post-rebase compatibility checks. Preserve failed
statuses and raw receipts. Do not infer a waiver from “continue,” a past push,
or a broad quality request. Never transfer an exception to separate WIP.
