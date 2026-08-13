# Native T-72 family re-certification

## First-party scope and order

The live order is `t72b_1987`, `t72bu`, `pt91m`, `t72b3m`. Every playable is
repository-authored procedural geometry. Historical/community GLBs are
quarantined comparison oracles only; runtime receives none of their meshes,
vertices, materials, textures, rigs or animations.

Current deterministic freezes:

- T-72B obr. 1987 `9aa22fb4` (40 meshes / 118,415 vertices)
- T-72BU `c3fb25ec` (39 meshes / 110,099 vertices)
- PT-91M `6ae53930` (55 meshes / 93,702 vertices; unchanged)
- T-72B3M `f46418a4` (40 meshes / 163,031 vertices)

## Structural decision

The 1987 and B3M roster keys now route to the compact native T-72 builder,
not the long normalized-oracle builder. Their common low hull and pear/cast
shell carry variant-specific protection: dense irregular Kontakt-1 and an
armored NSVT/night station on the 1987 vehicle; broad pointed Kontakt-5,
Sosna-U, unequal low roof stations and supported flank/rear packs on B3M.

T-72BU now routes to the complete native obr. 1992 vehicle rather than the
legacy measured-hull/native-turret hybrid. Its broad pointed cheek blanket,
asymmetric Luna/1K13 and NSVT station, four unequal rear drums, wading mast,
backed transom and supported rear rails remain visibly distinct from both
sibling protection fits. PT-91M's already passing ERAWA/SAVAN model remains
unchanged.

## Course, seating and winding receipt

- Front free idler, six dished road wheels, return rollers and rear final-
  drive sprocket are separately readable on every side.
- One native linked-shoe course follows those stations; exact band, shoe and
  complete moving-sweep collisions are 0/0/0 for all four.
- Skirts are physically outboard of the lanes, hidden sponson floors clear
  the shoe crowns, and supported internal transom bridges close every former
  plan pocket. Top-down contiguity is zero holes.
- Parent audit is zero stranded, abutting and dangling parts. All turret-
  semantic armor, optics, weapons, smoke, antennas and rear packages rotate
  through a genuine quarter-turn; all hull-semantic kit remains fixed.
- Winding audit is zero reversed / zero mixed. The only nonzero FrontSide
  delta is PT-91M's stable 28 pixels (0.05%), with no exterior wound.
- Runtime articulation passes all 37 checks. Muzzle bores pass at 95.9,
  91.2, 101.0 and 97.5 contrast.

## Visual packet

`/private/tmp/t72-family-final-r3` contains 45 unique PNGs per variant: 15
paired, 15 yaw0 and 15 yaw90, including `profile-elevated-left`. Mandatory
14-view vectors are recorded in `docs/PROGRAM-STATE.md` §5.181; every view is
at least 9.0.

The legacy contour gate remains valid only for PT-91M (90.4). Its incompatible
fused masks are not used to force the three native T-72 vehicles toward
copied geometry. Their acceptance rests on the authored freezes, current
paired/yaw pixels and strict physical gates.

## Disposition

**PASS / KEEP all four freezes. Ordered blockers: none.**
