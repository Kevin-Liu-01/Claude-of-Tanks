# Tank-generation history and reusable lessons

This is the concise decision history behind the [handbook](README.md), not a
transcript, a current fleet certificate, or permission to repeat old shortcuts.
It consolidates the owner's supplied conversation and tracked research through
**2026-09-07**, at repository baseline
`099edfa49603bc473548f6986c8598267a24a4db`. Prompts below are paraphrases.

Read evidence labels literally:

- **Owner request** records intent, not proof that every requested change landed.
- **Recorded result** points to a dated implementation/verification packet.
- **Historical method** explains an earlier decision; newer source contracts and
  the current [build standard](../BUILD-STANDARD.md) take precedence.
- **Unqualified / published as-is** never means source-accurate or release-passed.

## 1. IFVs: identity and connected bodywork before more detail

**Owner requests, September 2–3:** the CV90, CV90 Mk IV, Type 89 Light Tiger and
Puma S1 repeatedly looked like one stretched base, with concave or broken
glacis surfaces, floating skirts, inadequate track shoulders and detached rear
closures. The requested direction was new vehicle-specific geometry, stronger
real proportions, joined glacis/shoulder/skirt surfaces, actual fenders, and
equipment physically seated on the resulting armor.

The PL-01 reference was a *body-continuity reference*, not authorization to
replace all these vehicles with a PL-01 hull. Likewise, later requests for
CV90 turrets inspired by ZTZ-99A2 explicitly retained CV90 representation and
identity. The owner's occasional express derivative requests superseded a
previous no-family-base instruction for that named vehicle only.

Specific corrections must remain local in scope:

- CV90 rear hull extension did **not** authorize longer tracks; a longer hull
  overhang and revised rear stowage were separate from the running-gear loop.
- Rear track returns had to wrap the actual rear wheel. Subsequent Jaguar
  instructions explicitly raised end wheels and the hull while keeping road
  wheels fixed. These are different constraints, not a whole-assembly scale.
- The Type 89 needed outward-seated side boxes, lower roof optics, a flatter
  mantlet-equipped front and a larger bustle. Puma S1 needed its own optic
  carrier, square launcher arrangement and thick sloping skirt design.
- CV90 Mk IV gun depth, CV90 gun-carriage reconstruction and later whole-IFV
  10% downscaling were distinct requests. Do not turn their numbers into
  defaults for a new tank.

**Reusable method:** solve the structural section and gear datums first; then
reseat fittings against the new surfaces. Check both sides, low/rear views,
normal winding and articulation. A dark seam is not automatically a hole, and
an added broad slab is not proof of a correctly joined body.

The chat alone does not establish a final qualification receipt for every
intermediate IFV revision. Older reference packets such as
[Type 89](../references/tanks/type89.md) and
[Puma](../references/tanks/spz_puma.md) are historical source context, not
certificates for all later owner-directed geometry.

## 2. Surface markup: selection data is not the requested operation

The owner supplied `tank-gallery-surface-markup` JSON repeatedly. Even when a
packet said `operation: "remove"`, the surrounding prose often said “attach,”
“center,” “move,” “make shorter,” or “merge.” For example, the M60A2 request
selected a gun-owned small face and a larger gun-owned mounting face, then
asked to attach and center the first onto the second—not delete both.

**Reusable method:** preserve the owner's prose operation, identify the named
tank and rig owner, and use local bounds, triangle witnesses, normals and the
recorded pose to locate the intended construction. Both local and world
coordinates matter when a selection was made at a rotated turret pose.
Runtime UUIDs and triangle indices identify that captured mesh revision; they
are not durable selectors after regeneration. Translate the selection into
named authored stock, explicit parameters and a regression witness.

Record whether a requested “gap” is missing structure, an intended aperture,
clearance for a moving part, or merely a shading/material problem before
editing it. This distinction became essential in the source-study batches.

## 3. Chinese tanks: chevrons must remain part of a believable turret

**Owner requests:** VT-4A1 and ZTZ-99A variants went through repeated changes
to the intended donor, height, forward seating and bustle. A rejected ZTZ-99A
rebuild was first restored; VT-4A1 was then explicitly derived from the A2
foundation with a new Leopard-like chevron front; later ZTZ-99A was expressly
made a derivative of the revised VT turret. The old A2 was eventually retained
as a Prototype and a new A2 requested. This is versioned design intent, not a
single instruction to reuse every Chinese turret indefinitely.

Recurring problems were consistent despite those changing configurations:

- Chevron faces were too compressed, too low, buried inside the turret or
  separated from it. The owner wanted prominent full-height front wedges
  joined to the permanent front and flank structure.
- Turret rear mass intersected the engine deck. The requested **0.50 m bustle
  extension and 0.42 m rising underside** were vehicle-specific clearance
  targets, not permission to stretch the entire turret or its fittings.
- Lamps, mudguard hinges and shoulder blocks floated beyond the hull; front
  shoulders and mudguards needed physical support, not only a visual overlap
  from one camera.
- The gun-mount taper faced the wrong way. Check the actual forward axis and
  front/rear radii instead of rotating the whole cannon to conceal the cone.
- Exploding all ERA exposed an implausibly empty turret. Removable outer
  armor must not be the only geometry defining the structural turret front.

**Reusable method:** author a complete permanent shell, genuine moving-part
clearances and a supported expendable layer. Validate intact, first hit, all
spent and reset states, with markings still supported. Later measured X work
demonstrated this through actual fitted-face and damage tests, not just a
static “ERA hidden” screenshot; see [initial X integration](../research/source-x-fleet-rebuild.md).

The [older A2 packet](../references/tanks/ztz99a2.md) documents an August build
and historical scores below the later raw-92 bar. It cannot certify these
September redesigns or exempt a future vehicle from their stricter contract.

## 4. Shared weapon and running-gear defects require owner-level repairs

The machine-gun request began with a T-80BV surface selection. The owner then
clarified that the incorrectly angled barrels affected **every tank**, through
a shared handler, while their receivers were not similarly angled. The correct
scope was therefore the shared barrel/receiver transform relationship—not a
single T-80 visual offset or arbitrary changes to all weapon poses.

The Jaguar sequence similarly separated hull elevation, end-wheel elevation,
road-wheel stations, track height, upper-glacis placement and gun/mantlet
height. Treat “a little higher” as a measured local datum change with a before/
after receipt, preserving explicitly fixed stations. Do not move wheels only
in the static mesh while leaving the animated track course behind.

The [historical Jaguar packet](../references/tanks/t72m1_jaguar.md) is useful
for earlier coordinate mistakes and buried-equipment failures, but contains
old source-warp and percentile-budget experiments. Those are **not current
source-registration or detail-placement recipes**.

## 5. Revolution: the first complete exemplar for this source-led series

**Owner request:** retain the inaccurate earlier model as Revolution Proto,
tier IX; author a new proper Revolution from the supplied archive and require
harsh visual/geometric comparisons. The follow-up specifically required the
large sight-window cutout and correct negative space.

**Recorded result:** the [Revolution source study](../research/leopard-revolution-source.md)
reports 94.0 overall fidelity, every registered canonical view above 92,
geometry minimum 92.2, strict track intersections zero, and successful complete
release checks for the new model and preserved Proto. These are overlap and
structural results, not “perfect mesh equivalence.”

What made this a reusable build example:

- Archive inventory identified an intact OBJ and rejected a damaged historical
  `.glb.bak` whose turret had missing walls. A similarly named file was not
  accepted as an interchangeable authority.
- Independent source islands, longitudinal sections and rig/equipment datums
  drove the new shell, rather than decoration on the old model.
- The roughly 0.55 m sight mouth has real floor, reveals and a rear bulkhead;
  rays reject a solid replacement cheek bridging its opening.
- The slat cage retained real inter-rail air. The continuity policy distinguishes
  explicitly tagged non-armor lattice from closed hull skin and has controls
  that still fail a genuinely missing body panel. Armor cannot self-exempt.
- Historical Proto comparison measures **preservation** against an immutable
  old first-party snapshot at a separate 99 floor. It does not prove source
  accuracy, and must not replace the new Revolution's source comparison.

**Do not copy the old normalization recipe uncritically.** That study records
separate longitudinal/exposed-barrel normalization. Later source-X work freezes
a source-only rigid/uniform frame and rejects candidate-fitting and piecewise
oracle deformation. Carry forward its measured construction and honest
negative-space checks, not superseded registration policy.

The owner also named [AbramsX](../references/tanks/abramsx.md),
[Challenger 2](../references/tanks/challenger2.md) and
[Leclerc](../references/tanks/leclerc.md) as quality exemplars. Their names are
comparison prompts; an agent must inspect the applicable evidence rather than
claiming a new vehicle has achieved their quality by association.

## 6. First thirteen X models: independent source measurements at batch scale

**Owner request:** repeat the Revolution workflow for thirteen supplied models,
preserve originals, temporarily suffix names with `X`, and accurately model
negative spaces—especially Leopard 2A7V and T-14. `X` was **not** an instruction
to assign every vehicle tier ten.

**Recorded result:** the [first X batch](../research/source-x-fleet-rebuild.md)
reports registered release qualification on September 6: all thirteen pass
their unchanged registered raw-92 source/geometry gates, track and continuity
checks, all 510 test files, anatomy/assets and both builds. It explicitly
discloses an optional A5 diagonal turret diagnostic at 91.5; “registered gates
passed” is not “every possible view exceeded 92.”

Important corrections found during that workflow:

- Fused sources cannot supply honest separate hull/turret/gun masks. Five
  segmented registrations supported component comparisons; eight did not.
- Source frame and joint datums must remain fixed. Candidate width changes
  from marking planes once rescaled a good KF51 gun and produced false failures.
- Decisions must use raw values: 91.996 is below 92 even if displayed as 92.00.
- Triangle/slab intersections corrected false zero-width projections of walls
  parallel to a clipping camera; this required independent controls, not a
  reduced geometry threshold.
- Exact ERA faces replaced rectangular envelopes protecting empty corners;
  coincident triangles must not charge one cassette twice. Fixed backing,
  spent-state support and original donor protection values remained intact.
- Gallery aspect-ratio fitting, portrait framing and technical-card gutters
  needed separate fixes. Presentation-camera repairs did not change source
  comparison cameras or vehicle dimensions.

See the [A7V](../references/tanks/leo2a7v_x.md) and
[T-14](../references/tanks/t14_x.md) packets for model-specific aperture and
articulation evidence. A good hero image alone cannot prove those openings.

## 7. Next twenty-three: an explicit target choice can expose a real conflict

The owner explicitly chose **two separately named Leclerc X versions**, asked
Type 10/Type 90 to match their supplied proportions with differences documented,
then extended that choice to four AI-tagged files: Ariete, Challenger 1,
Chieftain Mk.5 and Strv 122. These are supplied-file fidelity targets, not claims
that every supplied shape is an accurate real vehicle. The later Mk10 request
expressly reused the completed Mk5 foundation with Mk10-specific measurements;
it did not authorize overlaying two whole tanks or changing Mk5.

The [second-wave contract](../research/source-x-second-wave.md) records 21/23
passing raw shape checks and 16/23 passing the machine-standard checkpoint.
Its seven failures remained visible:

| Model | Retained qualification conflict |
| --- | --- |
| Challenger 1 X | Complete-source shape/geometry, four below-ground orphan panels, no roof gun |
| K1A1 X | Added photo-led gun conflicts with the unarmed file; component/geometry failures |
| C1 Ariete X | Three source-real openings and absent roof gun |
| Chieftain Mk.5 X | Absent source roof gun |
| Chieftain Mk.10 X | One source-real opening |
| T-72B3M X | 268 sampled openings; source comparison is not a waiver |
| T-90 X | Absent source roof gun |

The owner separately authorized publishing this exact batch as-is; commit
`099edfa49603bc473548f6986c8598267a24a4db` contains that authorization and the
failures. Source models, temporary QA and the separate Abrams batch were excluded.
Post-rebase compatibility checks passed, but were **not** a new full release
pass. This exception belongs to this batch only; “commit and push” in an
unrelated later task must not silently inherit it.

This batch also exposed invisible donor auxiliary armor outside the actual new
skins, including a phantom turret compartment on a fixed casemate. Visual and
main-module success did not prove correct shot collision. Test actual finite
segments against all retained armor families, preserve real inter-panel air,
replace unsupported donor surfaces with native ones, and retain intended combat
values. Removing all auxiliary armor is not a valid shortcut.

## 8. New Abrams family: documented work in progress, not a shipped exemplar

**Dated snapshot, September 7:** the separate Abrams worktree contained seven
conventional X prototypes based on a supplied SEP v2 OBJ. They were not included
in the published 23-model batch and had not passed release acceptance. This
section records lessons from that local work; its tools and receipts are not
assumed to exist on this handbook's baseline.

The selected loose OBJ and adjacent named archive were different exports.
Correspondence was proved before using archive names for identification; the
selected OBJ remained the authority. One rigid metric frame and source-fixed
camera matrices were retained. Six derivative configurations were not certified
by comparing only their SEP v2 sibling to one supplied model.

The final local review still recorded tracks **88.843094 below 92**, dimensions
**62.210478**, and shaded scores **8.5–8.9 with 0/14 reaching 9** despite overall
fidelity **96.532526**. These remain failures. The source itself had drive-tooth/
track penetration; correcting the native wrap was a disclosed source departure,
not permission to deform the oracle until both metrics passed.

Two useful diagnostic examples: a black lower glacis was confirmed solid by
source/native rays and was **not** hollowed out; an apparently complete Gallery
capture still contained the loading overlay, so actual settled visibility was
checked and recaptured without hiding UI. Small-window rear occlusion remained
a recorded limitation even after a larger viewport supplied missing coverage.

To resume such a branch, obtain its actual handoff and current status. Do not
treat this historical snapshot, settled screenshots or a high aggregate as
approval to publish it or as a claim that the full test suite passed.
