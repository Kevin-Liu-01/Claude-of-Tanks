# Launch road completion: collision refresh, 2026-09-11

All 30 shards were freshly captured from the candidate native browser using
terrain seed1337, props2002 and vegetation2001. The capture session closed
normally. The dictionary codec retains exact numeric records; the independent
codec test round-trips all30 maps (42,034,095 to32,836,548 bytes).

Original-road vegetation admission retains the historical seeded tree/bush
population before excluding newly unsafe road/slope sites. Props use the
completed road surfaces. This changes the exact census below; it does not
change rejection tolerances or permit missing tree collider pairs. Nine maps
retain their previous census. Full record counts remain fixed assertions.

| Map | Movement delta | Shell delta | Concealer delta |
|---|---:|---:|---:|
| frontier | -1 | -2 | +0 |
| fjord | -31 | -31 | -25 |
| delta | -34 | -33 | -41 |
| badlands | +25 | +18 | +0 |
| monsoon | +2 | -5 | -5 |
| alpine | -17 | -27 | -12 |
| caldera | -19 | -19 | -4 |
| foundry | -5 | -11 | -1 |
| blackglass | -25 | +2 | -19 |
| titan_gorge | -3 | -1 | -5 |
| skybridge | +2 | +4 | -6 |
| polders | +2 | +2 | -1 |
| copper_mesa | -6 | -6 | -2 |
| airfield | +3 | +3 | +0 |
| oasis | -3 | -8 | -1 |
| whiteout | -3 | -5 | +0 |
| orchard | -4 | -9 | +0 |
| longleaf | +3 | +1 | +0 |
| mangrove | +1 | +1 | +0 |
| saltwind | -2 | -2 | +0 |
| reservoir | -47 | -49 | -53 |

Native capture: `.qa-dev/launch/collision-capture-r2.log`.
Validation: `.qa-dev/launch/environment-current-collision-validation-r4.log`
(all 30 dedicated collision fixtures) and
`.qa-dev/launch/environment-current-collision-validation-r5.log`
(480 placement routes, 90 vegetation clearance cases, index compaction and typecheck).
The initial validation correctly rejected the old Frontier census; it is retained
as r1. The exact native counts above replace those stale expected counts.
No blanket collision-record or census tolerance was added.

Coal placement remains guarded by the unchanged `coalSiteIsClear` checks.
Fresh native movement/shell pairs are Railyard7, Caldera7, Foundry5 (previous6),
and Skybridge5 (previous4). The original test caught these placement changes;
only these exact two census values changed. Packed convex shape identity,
sub-metre seating, projectile contact, independent-match ownership, adjacent
rail-lane clearance and no cover above the apex remain required assertions.

Longleaf retains both relocated flatbeds, their original exact heights (1.8867m
and 2.0051m), and loading bay centers. Four earlier accepted prop slots shift
their native IDs from268/280 to272/284. Contact, compound parts, breakability,
independent-match destruction and no phantom donor assertions remain intact.

## Qualification limits

All 30 current native map-quality checks pass. The matched candidate timing
run `.qa-dev/launch/maps-timing-candidate-r2/report.json` fails 14 frame-time
ceilings; its baseline is `maps-timing-baseline-r1/report.json`. Competing
interactive GPU work was independently detected by the native performance
probe. These timings are retained as failures, not accepted or waived.

Independent native review of all 30 establishing views, 14 details and four
matched full-resolution pairs accepts scoped biome identity and placement.
Far-root closeups and road-exit native evidence remain incomplete. Public
build passes. This checkpoint preserves source and collision work for review;
it is not a launch or performance certificate.

## Rim-road clearance follow-up

The18 native approach/overhead captures initially exposed rooted border trees in Alpine and Reservoir roads despite settled terrain. Border trees intentionally bypass interior planting admission. The corrected placement defers removal of rim candidates within the existing9m road margin until every RNG draw has been consumed, then compacts visuals, obstacles and concealment together. Other candidates retain object order and transforms.

All18 refreshed captures pass the independent scoped road-clearance/terrain-continuity review. Alpine road1/end1's approach camera is obscured by bank foliage; its paired overhead confirms an open road. Evidence: `.qa-dev/launch/road-exit-native-r2`. All30 collision shards were recaptured; each map's obstacle, collider and concealer reductions match (1–197 trunks permap). Wider30-map render review and refreshed navigation/collision checks remain pending; no timing-regression waiver is implied.

All30 current shards pass the exact frozen89784835d record comparison in
`.qa-dev/launch/rim-road-preservation-r1.json`: every non-tree movement/shell
record is unchanged; retained trees and concealment retain exact positions,
dimensions, metadata and order, allowing only tree-index compaction. Every
removed trunk lies within the actual9m road margin and has exactly one removed
concealer. The fixed census test retains its previous table and explicit
per-map removal counts. No tolerance or acceptance gate changes. Independent
review of all30 matched establishing pairs passes, with one-view/map limits;
all18 native views of the9 authored exits also pass rooted-road clearance.
Timing qualification remains open.

Final scoped revalidation passes: all30 exact server manifest censuses,
all30 maps ×5 game modes with2100 spawn placements and480 route validations,
map quality, and90 oriented vegetation exclusion fixtures. Current source
public build/typecheck also pass. Receipt logs: `rim-road-validation-r2.log`
(server census PASS, then harness-only wrong import path),
`rim-road-validation-r3.log` (remaining checks PASS), and
`rim-road-clearance-build-r1.log`. Full launch/performance is not certified.
