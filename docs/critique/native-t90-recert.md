# Base T-90 first-party turret-armour re-certification

The active `t90` playable is entirely repository-authored procedural geometry.
The private comparison GLB was used only as a quarantined visual reference;
no comparison mesh, vertex/index payload, material, texture, rig, animation or
runtime wrapper enters the playable or this commit.

## Frozen candidate

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
