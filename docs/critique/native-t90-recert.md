# Base T-90 first-party turret-armour re-certification

The active `t90` playable is entirely repository-authored procedural geometry.
The private comparison GLB was used only as a quarantined visual reference;
no comparison mesh, vertex/index payload, material, texture, rig, animation or
runtime wrapper enters the playable or this commit.

## Superseding post-loft armor and station refit — 2026-08-13

- Geometry hash: `9cf4471c` (67 meshes / 121,320 vertices)
- Evidence: `/private/tmp/t90-newshape-final-r5/t90`
- Integrity: 15 procedural appraisal + 15 yaw0 + 15 yaw90 PNGs, including
  elevated-left profile; 45 files / 45 distinct SHA-256 hashes
- Standard-order live first-party visual appraisal:
  `[9.3,9.3,9.2,9.1,9.1,9.1,9.2,9.3,9.3,9.4,9.3,9.4,9.3,9.4]`
  (floor 9.1; mean 9.26)
- Exact terminal band / shoe / strict sweep: `0/0`, `0/0`, `0/0`
- Parent audit: 0 stranded / 0 abutting / 0 dangling
- Winding: 0 reversed / 0 mixed, one visually null deficit pixel and zero
  yaw-stranded candidate pixels
- Runtime rig: 10/10; muzzle-bore contrast 101.2

The existing asymmetric pear loft remains the load-bearing shell; no sphere,
external geometry or imported data is introduced. Its narrow mechanical race
is now visually subordinate. Five unequal primary K-5 banks, four lower
returns, three crown returns and four diminishing aft leaves follow the final
cheek heights and plan taper. Shtora shoulders, six-tube smoke carriers and the
commander/night-sight mechanism are rebuilt on broader buried shoes around
that exact casting instead of retaining the retired round-turret datum.

All 45 frames show a genuine quarter-turn and continuous load paths. The
complete casting, armor, gun, Shtora, smoke, optics, cupolas, NSVT, antennas,
OPVT and rear package rotate together; hull and running gear remain fixed.

**PASS / KEEP `9cf4471c`; supersede `80b4b851`. Ordered blockers: none.**

## Superseding pear-casting equipment closeout — 2026-08-13

- Geometry hash: `80b4b851` (67 meshes / 118,488 vertices)
- Evidence: `/private/tmp/t90-armor-refit-final-r6/t90`
- Integrity: 15 procedural appraisal + 15 yaw0 + 15 yaw90 PNGs, including
  elevated-left profile; 45 files / 45 distinct SHA-256 hashes
- Standard-order live first-party visual appraisal:
  `[9.2,9.2,9.1,9.0,9.0,9.0,9.1,9.2,9.2,9.3,9.1,9.3,9.2,9.3]`
  (floor 9.0; mean 9.16)
- Exact terminal band / shoe / strict sweep: `0/0`, `0/0`, `0/0`
- Parent audit: 0 stranded / 0 abutting / 0 dangling
- Winding: 0 reversed / 0 mixed, one visually null deficit pixel and zero
  yaw-stranded candidate pixels
- Runtime rig: 10/10; muzzle-bore contrast 107.2

The hand-authored asymmetric pear loft remains the primary volume. Its four
main K-5 banks, three lower returns, three crown returns and four aft flank
leaves are broadened and moved onto the actual cast shoulder/falloff rather
than the retired round-turret datum. Shtora housings, carrier brows and cables
follow that same armor field. Both 902B banks use broader buried shoes and
braces. Commander cupola, NSVT, night sight, periscope bridge and antenna
collars are widened and shifted outward on the asymmetric crown.

All 45 frames show supported geometry and a genuine quarter-turn. The complete
casting, armor, gun, smoke, optics, command station, antennas and rear packs
rotate together; hull and running gear stay fixed. The missing historical GLB
is not restored: stale critic/evaluator/normalizer routes have been removed so
the evidence path is explicitly first-party procedural.

**PASS / KEEP `80b4b851`; supersede `54f4138`. Ordered blockers: none.**

## Superseding radial armor/equipment refit — 2026-08-13

- Geometry hash: `54f4138` (67 meshes / 116,472 vertices)
- Evidence: `/private/tmp/t90-armor-fit-final-r5`
- Integrity: 15 yaw0 + 15 yaw90 PNGs, including elevated-left profile; 30
  files / 30 distinct SHA-256 hashes
- Standard-order live first-party visual appraisal:
  `[9.1,9.2,9.0,9.0,9.0,9.0,9.0,9.2,9.1,9.2,9.1,9.2,9.1,9.2]`
  (floor 9.0; mean 9.10)
- Exact terminal band / shoe / strict sweep: `0/0`, `0/0`, `0/0`
- Parent audit: 0 stranded / 0 abutting / 0 dangling
- Winding: 0 reversed / 0 mixed, one visually null deficit pixel and zero
  yaw-stranded candidate pixels
- Runtime rig: 10/10; muzzle-bore contrast 107.7

The asymmetric pear-section casting remains unchanged. Its protection now
uses four unequal radial primary K-5 banks, three smaller lower returns, four
diminishing flank leaves and three shallow crown returns per side. Shorter
backers bury into the cast shoulder, the outer course steps inboard with the
aft taper, and a tapered cassette replaces the square cheek key. Both 902B
banks move forward onto the outer cheek shoulders with explicit carrier and
lower-brace contacts. The command/night-sight bridge is lowered and widened
into the crown; Shtora, cupolas, sights, periscopes, NSVT, antennas, OPVT and
rear packs retain broad turret-owned foundations.

All 30 frames show a genuine quarter-turn. The complete casting, K-5 field,
Shtora, smoke banks, gun/mantlet and roof/rear equipment move together while
the hull and native six-wheel course remain fixed. No armor plate or fitting
hangs over empty air, and no collision, duplicate turret mass, open sheet or
yaw-dependent wound is visible. This explicitly supersedes `2bdd5dd8`.

**PASS / KEEP `54f4138`. Ordered blockers: none for this refit.**

## Retired armour-to-casting candidate

- Geometry hash: `e9ad3e89` (67 meshes / 113,856 vertices)
- Evidence: `/private/tmp/t90-armor-fit-final-r4`
- Reason retired: the new pear casting was correct, but its protection still
  resolved as three oversized cheek slabs and several equipment roots retained
  the older aft/high station datum.

## Retired prior candidate

- Geometry hash: `2bdd5dd8` (repeatable twice)
- Meshes / vertices: 67 / 110,616
- Evidence: `/private/tmp/t90-shapefit-final-r3`
- Evidence integrity: 15 yaw0 + 15 yaw90 PNGs (the mandatory fourteen
  directions plus the elevated-left equipment profile); 30 files / 30
  distinct SHA-256 hashes
- Exact containment: terminal bands 0/0, shoes 0/0, strict moving sweep 0/0
- Parent audit: 0 stranded / 0 abutting / 0 dangling
- Winding: 0 reversed / 0 mixed; one visually null pixel (0.00%)
- Runtime rig: all 10 articulation/hierarchy/load checks PASS
- Muzzle: PASS, 108.3 contrast

## Authored armour and equipment fit

The rejected half-sphere primitive remains retired. The primary turret is one
explicit asymmetric pear/cast loft. This pass rebuilds the equipment around
that casting instead of preserving decoration laid out for the old shape.

The frontal Kontakt-5 blanket no longer uses six small repeated teeth per side.
It is now three broad overlapping clamshell leaves per side, with deep buried
roots, painted faces, narrow replacement seams and a visibly retained foundry
surface between banks. Two subordinate lower leaves close the mantlet/Shtora
valley. Two broad shallow crown returns and three falling flank leaves continue
that protection over the asymmetric pear casting without rebuilding a second
regular collar around it. The dark Shtora housings are enlarged to the correct
visual authority and buried into tapered shoulder roots instead of sitting as
small discs on detached-looking boxes.

Both 902B banks were moved aft onto compact tapered shoes with broad inboard
brackets. Their six tubes are shorter and use a tighter upward/outward fan, so
neither bank becomes an antler-like extension of the new cheek. The NSVT,
shield and support posts were scaled and lowered onto the commander cradle.
The night sight, hatch/periscope courses, two antenna collars and stored OPVT
tube remain on broad roof seats; rear bins and rack courses remain attached to
the casting.

## Pixel and mechanical review

All 30 final frames were inspected, including the standardized elevated-left
profile in both yaw states. They show a low pear-shaped cast turret, broad
planted armour leaves, compact cheek smoke banks and an asymmetric roof station
without a detached wrapper, repeated tooth collar, continuous rectangular belt
or sphere-like silhouette.

Every yaw0/yaw90 pair shows a genuine quarter-turn. Gun/mantlet, cast shell,
all main/lower/crown/flank cassettes, both Shtora units, smoke banks, cupolas,
night sight, NSVT, periscopes, antennas, OPVT and rear turret equipment rotate
as one supported package. Glacis, deck, skirts, rear service field, six-wheel
native course and tracks remain fixed. No fused duplicate turret, stranded
fitting, empty-air decoration, wheel/course collision, open sheet, sky-through
wound or yaw-dependent backface pop is visible.

The reference-mask geometry gate cannot currently be refreshed because the
quarantined comparison GLB is intentionally unavailable to the runtime. That
tooling limitation is not bypassed or optimized around: the first-party
geometry hash, yaw packet, exact track result, parent audit, winding audit,
runtime articulation, bore proof and visible load paths are the acceptance
evidence for this own-authored correction.

**PASS / KEEP `2bdd5dd8`; supersede `dcb1946c`, `27d1c5d8` and the stale
`692a0eb9` record. Ordered blockers: none for this turret-armour fit pass.**
