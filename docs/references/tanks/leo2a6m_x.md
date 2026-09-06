# Leopard 2A6M X — additive owner-source study

Status: **release-qualified — 2026-09-06T10:49:59.926Z**.
The final **2026-09-06T10:06:54.116Z** capture records raw fidelity
**94.8537886312249**, minimum whole view **93.44405802875751**, and raw
geometry minimum **93.44405802875751**: [exact fidelity](leo2a6m_x.fidelity.json),
[exact geometry](../../geometry-gate/leo2a6m_x.json).
All registered valid 92-point floors pass; strict band/shoe/full-sweep
intersections and continuity holes are zero.
Fused-source hull/turret/gun component scores remain N/A, not synthetic passes.
Mandatory anatomy/assets, 510 selftest files, typecheck and private/public builds passed in the composed
batch. The checkpoints below are historical; source-use restrictions and
acknowledged physical simplifications remain unchanged.

New first-party build: `buildLeopard2A6MX` in `leopardX.ts`; existing `leo2a6m`
is unchanged. This X follows the supplied Canadian slat-armor fit, with an
independent tub, compact wedge shell, L/55 and a single native gear assembly.

## Provenance / local-only boundary

Owner GLB SHA-256:
`c10680a8199c1c472fd38f4fbae8a4e1e5f7737f2e5e876116d7c4be86268dd5`.
Embedded metadata identifies Muhamad Mirza Arrafi / nazidefenseforceofficial,
[source upload](https://sketchfab.com/3d-models/leopard-2a6m-main-battle-tank-5129ec92ef914b3ea98abcee57e40562),
and a CC-BY-4.0 claim. The existing ATTRIBUTION adjudication records an
extraction-suspect account and `chassis_vlo` lineage, not a proven license to
redistribute upstream content. The existing owner-authorized local-only
measurement/influence exception applies; no source buffers, textures or
materials ship. The ignored oracle is
`public/models/community-candidates/leo2a6m_x_source.glb`.

## Measurements made before building

Axes `y,z,x` map imported source to +Y up, +Z forward. Ground source Y
−1.06682; hull `Object_4` center Z −0.09095. Width scale 0.8739569609 gives
3.98 m. Width-normalized hull / overall are 7.719802 / 10.984398 m; explicit
longitudinal scales 0.8739794139 (hull) and 0.8699473357 (beyond bow) give
7.72 / 10.97 m. Corrected stern is −3.94454 and muzzle +7.02546 m. There is no
independent Y warp. The 3.03 m dimension is the established over-equipment
datum, not an assertion that the bare shell roof is that high.

Actual component envelopes in the width-normalized frame:

| Component | Bounds / measurements, m |
|---|---|
| Main hull | X −1.6503..1.6656; Y .6304..1.8515; Z −3.7625..3.7035 |
| Turret core | X −1.2711..1.2831; Y 1.7409..2.5463; Z −1.6895..2.3687 |
| Rear bustle extension | Z −2.7018..−1.6904; chin 1.9116, roof 2.5418 |
| Turret bearing | center X .0060, Z .5076; radius 1.0362 |
| Cannon muzzle | X −.00051, Y 2.089435; diameter .18485 |
| Cage | full width 3.98; hull rear Z −3.9444; separate turret cage above |

Connected `Object_5` wheel islands 11–17/20–26 independently give normalized
stations −2.38862, −1.59159, −.80394, .02123, .82764, 1.62467, 2.42169 m;
diameter .71577 m and axle Y .45856 m. Rear sprocket center is
Z −3.07976 / Y .973265; forward idler Z 3.40111 / Y 1.010835. These physical
wheel islands, not builder configuration receipts, pin the focused tests.

[KNDS A7V](https://knds.com/de/produkte/systeme/leopard/leopard-2-a7) and
[Bundeswehr Leopard 2](https://www.bundeswehr.de/de/ausruestung-technik-bundeswehr/landsysteme-bundeswehr/leopard-2)
corroborate the L/55 10.97 m envelope. The Canadian configuration's exact
stand-off width is source-measured; it is not mislabeled as a basic A6 width.

## VLO / ownership adjudication

`Object_4` contains the clean hull and `Object_6` the turret shell/furniture.
`Object_3` fuses hull and turret cages. `Object_5/7` duplicate combined hull and
turret surfaces but carry the cannon. `Object_9/10` duplicate the only complete
wheel/track band; wholesale VLO removal would erase the running gear. The source
must not acquire invented component parents. Whole-model views and actual
triangle probes remain authoritative where split masks would lie. The native
cage consists of narrow bars, stand-off feet and genuine exterior air; it is
equipment, not a solid hull/turret filler slab.

## Initial verification contract — historical

Seven neutral source views inspected before authoring. Fixed-source ray/bounds
receipt is adjacent as `.source-measurements.json` and has no mesh payload.
92 on every registered component/view, independent shaded comparison,
attachments, articulation and exact track/band/shoe/sweep zero-overlap remain
required. No prior vehicle's capped score is inherited; no initial-build
pass is claimed.

The neutral review rejected the draft's unsupported tall roof tower. A full
connected-component census above Y 2.70 found only the panorama, two whips
and a low crew-hatch rail. The source rail is X −.76047..−.43672,
Y 2.65599..2.73974, Z .50033...56678; the native source-fixed test now
asserts this actual unarmed source fitting independently of weapon dressing.
The game's standing BUILD-STANDARD §B3 explicitly requires a roof MG even
when a reference lacks one. A low, forward-facing KIT pintle MG is therefore
an owner-required game-model augmentation, not a claim about this source.
Its complete pintle foot is seated directly on the measured roof/hatch at
X −.80, Y 2.546 and Z .12, alongside the retained source rail so its barrel
does not pierce that rail. There is no extra raised pedestal or compressed
weapon height. The focused test checks actual carrier contact, MG yaw
ownership, full barrel extent and maximum height below 2.78 m. All numerical
and track/continuity gates remain mandatory.
The small panorama upper box is .22729 × .19017 × .25523 m centered near
(−.2614, 2.903, −.281), not the larger rearward draft fitting. Both source
whip islands include .03355 m collars, but fixed shaft rays at Y 2.7, 2.8,
3.0, 3.2 and 3.35 reach Z −1.86816 / −1.87510: the actual shaft is only
.00694 m thick. The shaft starts at Y 2.598 and finishes at Y 3.389,
centered at X −.9885 / 1.0005 and Z −1.8716. The separate cylindrical
mount is Y 2.52588..2.59810, with Z −1.90249..−1.84127 at fixed Y 2.58;
an original small cylinder and short taper replace the generic oversized foot.
A .0015 m-tolerance triangle
probe protects the shaft independently of its wider foot. The silhouette P95 height
is 2.800 m; the recorded 3.03 m nominal over-equipment height metadata stays
unchanged. Neither value is the source's actual 2.5463 m turret-shell roof.

The panorama head's bounding box does not describe its actual rear crown:
fixed source rays at Z −.400/−.385/−.370 reach Y 2.97555/2.99083/2.99741.
An original closed five-section head preserves that chamfered rise. Its front
frame is at Z −.15351 while the center optical pane is recessed to −.16285;
separate side/top/bottom reveals leave that shallow cavity physically open.
Focused triangle probes protect the crown, the frame and the inset glass;
the former protruding flat glass was not source geometry.

The actual outer cage brace must also remain inside the source's X ±1.99 m
envelope. A draft crossbrace was 5 mm too wide on each side; normalizing that
3.99 m candidate against the source's 3.98 m width shifted the very thin
whip into a different raster column. Its physical .260 m brace now ends at
the source face, independently asserted on both sides. Neither the source
height target nor the full-height measured whip is changed to mask this.

Rear source `Object_4` contains a broad louvre field spanning X
−1.6459..1.6612 and Y 1.37125..1.84741, not two isolated exhaust boxes.
An original thin backing, twelve raked louvres and separate returned upper
skin now represent that equipment. At X 0, Z −3.8, source top/underside
rays are Y 1.82361/1.80415; the fixed native tests preserve this thin skin,
not a deep invented rear apron. Two original recovery ropes extend along
the deck at X about ±1.60 before crossing the stern and terminating at
the lower recovery eyes. The actual source cable section near Z −2.65
ends at Y 1.842; that source station is separately asserted.

Source rays at X .02, Z −3.85 contain no hull surface: this is exterior
air, not a hole through armor. The two named recovery tubes use only the
existing explicit open-lattice equipment role, like the separately owned
source cage. Both remain visible in whole/hull source comparison and
subject to strict track clearance; armor and ordinary detail stay in the
zero-hole scan. No shared continuity policy or threshold is altered.

Final shaded bow review found that the draft central glacis buried the real
spare-link row. Fixed source core roof rays at Z 3.3/3.4/3.5/3.6 are
Y 1.47173/1.38043/1.28914/1.19784; the core ends before Z 3.71, while
separate fenders continue farther forward. The original core now follows
those planes. Source link-backing rays at X .40468 reach Y
1.48430/1.39340/1.30249 at Z 3.3/3.4/3.5. Three upper links and a fourth
lower link per side use independent thin backings, side webs and end pins.
The actual circular lamp faces are X −.81505/+.83035, Y 1.3407,
Z 3.61059, with low carriers and separate open protective hoops. The source
fender underside is Y 1.37176 at X 1.32/Z 3.5, and its folded mudguard top
is Y 1.27862 at Z 3.8. These surfaces are fixed-ray tested independently
of the descending central nose.

The fender investigation exposed a mechanical error in this new build:
without return rollers, the generic native course
draped onto road-wheel crowns near Y .8165, while sharp end transitions
put outer shoe corners as high as 1.485. Source `Object_9`/`Object_10`
flat-course rays independently measure outer/broad-web/guide planes at
Y 1.35589/1.27548/1.16082 (X 1.34/Z 0), with the complete source running
gear reaching Y 1.36478. Its loaded-course outer/web/guide planes are
Y .00005/.08563/.19449. The native first-party paired-pad construction now
matches that .19449 total depth and .08563 outer-to-web depth; its belt
center, rather than its outer shoe envelope, is placed near Y 1.2968.
End-wheel rim and independently fitted belt pitch radii are separate.

Four small return rollers per side are explicitly **mechanical inference**:
the supplied fused/low-detail gear does not expose isolatable source roller
islands or exact longitudinal stations. Their crowns support the measured
high broad-web plane, and they remain native instanced running gear rather
than static camouflage boxes. All measured road-wheel and end-wheel axes,
rim radii, lane centers and suspension rest heights stay unchanged. Tests
check actual transformed moving-shoe ground/top vertices, total shoe depth,
the support census and support crown height; the full unchanged strict
front/rear/continuous band-and-shoe audit remains required. This is a
source-supported mechanical reconstruction, not a claim to copy invisible
source topology. Fine fasteners, microscopic tread sculpting and exact
occluded support shapes remain deliberately simplified first-party forms.

## Historical 02:41 scoped checkpoint

The historical component/view checkpoint was generated at **2026-09-06T02:41:42.081Z**. Fidelity is **94.88**, minimum
valid view **93.55**, and every registered 92-point floor passes. Fresh
primary geometry is **93.5**, dimensions **100**, floaters **100**. Official
front/rear band and shoes, complete sweep and enclosed continuity are all
**zero**; the supported MG census is **one**. Independent shaded review
closed the source-layout 3+1 bow links, lamps, guard supports and properly
seated high return course. Small occluded running-gear details remain explicit
mechanical inference. The profile remained frozen; full generated anatomy/assets
and final release checks subsequently passed.

## Subsequent gameplay ERA binding repair

The inherited upper-glacis and left/right cheek ERA names previously had no
visual depletion binding. Only the three already-outlined removable cover
skins are now partitioned from their native carriers. Each keeps its exact
exterior triangles and gets an 18 mm concealed vertical depth over permanent
closed backing. This depth and inherited reactive gameplay are explicitly
gameplay construction, not a new claim about the supplied Canadian reference.
The full turret, EMES recess, cage, structural hull and unrelated roof lids
remain permanent. Existing cover seams/bolts deplete with their own cover but
do not create independent armor faces. Exact triangle-index hit faces avoid
PCA rectangles across narrow cheek air. Source-fixed geometry and dense
closed-backing/depletion/reset tests pass in high and low detail. Earlier
render scores above predate this semantic partition; final generated receipts
and the composed release checks now include the partition and pass.
