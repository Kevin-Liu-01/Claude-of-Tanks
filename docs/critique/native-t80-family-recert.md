# Native T-80 family re-certification

T-80U candidate source blob: `c5cfd088f35c6644a764bd93ba0994b1f3b56ef6`.

## Provenance and preservation decision

- Every playable in the T-80 lineage is repository-authored procedural
  geometry. The isolated T-80U GLB remains a visual and measurement oracle;
  no source vertex payload, converted mesh array or runtime GLB node enters
  battle.
- The stronger T-80U hull, calibrated gun, turbine service deck and native
  six-wheel linked course are preserved. The weaker source-backed wrapper was
  rejected and removed.
- The T-80, T-80B, T-80BV and T-80U remain separate authored variants. Their
  turret protection and station grammar are not cross-copied or collapsed
  into a shared replacement shell.

## Current family receipt

| Vehicle | Fidelity | Required-view floor | Exact band front/rear | Exact shoes front/rear |
|---|---:|---:|---:|---:|
| T-80 | 93.75 | 94.07 | 0 / 0 | 0 / 0 |
| T-80B | 93.46 | 93.01 | 0 / 0 | 0 / 0 |
| T-80BV | 90.97 | 91.84 | 0 / 0 | 0 / 0 |
| T-80U | 91.51 | 90.20 | 0 / 0 | 0 / 0 |

T-80U component receipt: whole silhouette 92.88, hull 96.23, direct turret
83.21, gun 89.66 and native running-gear profile 94.32. Its repaired
rear-right view is 90.20; all other required views are above it.

## T-80U structural closure

- The primary pear casting remains a connected low authored volume. Broader
  low cast shoulders replace rectangular side towers and preserve the source
  cheek undercut without growing a slab wall.
- The former monolithic 1.44 m port K-5 roof rail is replaced by a shorter,
  lower planted course. That geometry change raises the isolated right-side
  turret score from roughly 76.6 to 81.4 and closes the rear-right 90 floor.
- The rear stowage course is shallower and supported by its basket/rails. The
  turbine exhaust field steps forward of its fixed lower log/drum/recovery
  cluster, while segmented skirts and terminal guards sit outside the live
  shoe envelope.
- Track clearance is exact: no smooth-band voxel, individual shoe, blind spot,
  bow penetration or stern penetration remains.

## Ownership, winding and evidence

- Turret-parent audit: 0 stranded, 0 abutting, 0 dangling.
- Winding audit for all four family members: 0 reversed and 0 mixed connected
  pieces. T-80U's worst FrontSide/DoubleSide difference is 38 pixels / 0.03%
  at top and is non-structural; all yaw candidate counts are zero.
- `/tmp/critic-t80u-native-r2` contains exactly 42 files / 42 distinct hashes:
  14 paired, 14 yaw0 and 14 yaw90.
- The complete T-80U gun, casting, K-5 courses, cupolas, sights, smoke suite,
  NSVT and supported rear package rotate together through a genuine quarter
  turn. Glacis, skirts, six-wheel course, turbine deck and transom remain
  fixed; the yaw90 evidence exposes one coherent hull deck with no duplicate
  turret mass or unsupported decoration.

## Recorded refinement debt

The family is standardized mechanically and clears the mandatory visual gate,
but T-80U direct-turret parity remains below the rest of the vehicle. Future
work should refine the authored cast shoulder curvature, protection pitch and
roof-station silhouettes in place. It must not replace this basis with source
geometry or a sibling T-80 turret.
