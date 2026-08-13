# Base T-90 first-party turret-armour re-certification

The active `t90` playable is entirely repository-authored procedural geometry.
The private comparison GLB was used only as a quarantined visual reference;
no comparison mesh, vertex/index payload, material, texture, rig, animation or
runtime wrapper enters the playable or this commit.

## Frozen candidate

- Geometry hash: `dcb1946c` (repeatable twice)
- Meshes / vertices: 67 / 121,272
- Evidence: `/private/tmp/t90-armor-final-r16/t90`
- Evidence integrity: 15 paired + 15 yaw0 + 15 yaw90 PNGs; 45 files / 45
  distinct SHA-256 hashes
- Exact containment: terminal bands 0/0, shoes 0/0, strict moving sweep 0/0
- Parent audit: 0 stranded / 0 abutting / 0 dangling
- Winding: 0 reversed / 0 mixed; one visually null pixel (0.00%)
- Muzzle: PASS, 105.3 contrast

## Authored armour and equipment fit

The rejected half-sphere primitive remains retired. The primary turret is one
explicit asymmetric pear/cast loft. This pass rebuilds the equipment around
that casting instead of preserving decoration laid out for the old shape.

The frontal Kontakt-5 blanket is now six unequal tapered cassettes per side.
Each cassette has a narrower nose, wider buried root, separate cap and side
seam, and follows one authored cheek plane. Four smaller lower-cheek stations
close the mantlet/Shtora transition without recreating a flat belt. Four crown
returns and five flank stations continue that cadence around the cast shoulder.
The Shtora housings are reduced, darkened and buried into tapered shoulder
roots rather than remaining bright discs on rectangular boxes.

Both 902B banks now sit on compact tapered shoes with broad inboard brackets.
Their six tubes are shorter and canted upward/outward so neither bank reads as
a horizontal wing or disappears inside the new cheek. The commander night
sight has a wide tapered foot, unequal supports and an explicit forward
aperture. Hatch/periscope courses, NSVT cradle, two antenna collars and the
stored OPVT tube were re-seated on the new crown. Rear bins and supported rack
courses remain attached to the casting.

## Pixel and mechanical review

All 45 final frames were inspected. The paired set includes the standardized
elevated-left profile. It shows a low pear-shaped cast turret, planted armour,
compact cheek smoke banks and an asymmetric roof station without a detached
wrapper, continuous rectangular armour belt or sphere-like silhouette.

Every yaw0/yaw90 pair shows a genuine quarter-turn. Gun/mantlet, cast shell,
all main/lower/crown/flank cassettes, both Shtora units, smoke banks, cupolas,
night sight, NSVT, periscopes, antennas, OPVT and rear turret equipment rotate
as one supported package. Glacis, deck, skirts, rear service field, six-wheel
native course and tracks remain fixed. No fused duplicate turret, stranded
fitting, empty-air decoration, wheel/course collision, open sheet, sky-through
wound or yaw-dependent backface pop is visible.

**PASS / KEEP `dcb1946c`; supersede `27d1c5d8` and the stale `692a0eb9`
record. Ordered blockers: none for this turret-armour fit pass.**
