# M551A1 TTS turret attachment seats — 2026-09-29

## Owner request

Attach the two marked cast cheek lugs and the lower cheek ERA pieces to the
M551A1 TTS turret. The four Gallery selections were made at −84° turret yaw.
Their `remove` operation is a selection label; the owner's prose requests
retaining and attaching the complete assemblies.

## Cause and correction

The selected parts already belonged to the turret rig. The two three-layer
lugs were below and ahead of the curved casting, and the lower ERA course used
constant height and yaw-only placement. Merely changing parenting would not
close these physical gaps.

The TTS variant now seats both complete lugs on measured points and normals of
its bare procedural casting. Each lower ERA cassette has an individual steel
foot that follows the actual asymmetric lower cheek, including pitch and roll.
The foot's rear corners penetrate the casting; its front overlaps the cassette
by 12 mm. The narrower 140 × 90 mm feet keep their entire contact face inside
the curved mounting surface. All eight cassettes and both three-layer lugs are
retained. The original M551 Sheridan's authored geometry is unchanged.

No frame-loop work or new unmerged attachment meshes are introduced. Seats use
the existing turret equipment material bucket; ERA stays in its existing left
and right damage sectors. The upper TTS protection, weapons and running gear
retain their positions and behavior.

## Regression evidence

`src/vehicles/profiles/sheridanTtsAttachmentSeats.selftest.mjs` independently
ray-tests the bare casting at the attachment stations. Every mounting foot's
rear corners and center must be embedded in actual armor. It also checks lug
layer contact, cassette/foot overlap, survival in the merged runtime meshes,
HIGH and LOW quality, −180°, −84°, 0°, 84° and 180° traverse, fixed hull pose,
and destruction/reset of both ERA sectors. The test loads the committed
interior fills and is registered in the normal selftest suite.

The regression fails on the retained pre-repair tree (zero attachment seats).
The initial larger feet failed this corner-contact test; the geometry was
corrected without relaxing its thresholds. Both the new physical regression
and the existing Sheridan family test pass. Fresh interior fill generation
reports 288 boxes, 3,456 triangles and zero residual diagnostic voxel volume.
This diagnostic is separate from the sealed-view and release gates.

HIGH geometry is 98,164 triangles (previously 97,636); LOW is 79,196
(previously 78,668), including instanced stock and interior fills. Mesh counts
remain 55/54, respectively. Both original M551 Sheridan geometry hashes remain
byte-identical at HIGH and LOW. The actual garage retains its static batching
and returns the same cached vehicle root after selecting another tank.

Actual garage HIGH/LOW, front and −84° yaw captures are saved under
`/Users/kevinliu/.codex/visualizations/2026/09/29/sheridan-seats/`. These views
were inspected after the repair.

## Release evidence

The scoped standard reports zero front/rear/sweep band and shoe intersections,
zero continuity holes, and two verified roof weapon fittings. The sealed gate
passes all 33 views with zero open and see-through pixels. Module visual
alignment passes. Garage HIGH/LOW and the marked −84° pose were inspected.

The composed release invocation exits 1 because `m551a1_tts` has no registered
comparison model. The standard's numerical comparison is N/A and fidelity is
UNAVAILABLE. These are retained statuses, not a new source qualification.
After the missing comparison and pending scoped exception were disclosed,
Kevin explicitly instructed: "now commit an dpush origin main evedrything".
This authorizes publication of this completed attachment repair while retaining
the N/A/UNAVAILABLE comparison statuses; it does not establish source fidelity.
All seven remaining physical probes pass: centering, module visual alignment,
module hits, asset freshness, track duplication, visible muzzle bore and barrel
circularity. Module hits retain one pre-existing dimension-drift warning, with
no failures or out-of-envelope modules. The full anatomy/marking/diagram chain,
type checking and public/private builds pass. The broad code run completed
1,276 entries with thirteen fleet integration failures, all subsequently
corrected and passing focused reruns; the Sheridan contact regression passed
in the broad run. The post-rebase integration also passes the Sheridan contact
regression, asset checks, type checking and public build. Publication is
authorized onto main above the already-published fleet batch `28845013e`.
