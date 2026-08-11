# T-90A Vladimir hull/turret de-fusion — independent re-certification

Date: 2026-08-10
Candidate: `52f98951` (41 meshes / 74,100 vertices)
Evidence: 42 distinct PNGs — 14 paired source views, 14 yaw-0, 14 yaw-90
Verdict: **PASS / KEEP**

## Independent 14-view scorecard

Order: front, front-left, left, rear-left, rear, rear-right, right,
front-right, top, hero front-left, hero rear-right, hero top-tilt,
close front, close roof.

`[9.1, 9.2, 9.1, 9.0, 9.0, 9.0, 9.1, 9.1, 9.2, 9.2, 9.0, 9.2, 9.2, 9.2]`

- Floor: **9.0**
- Mean: **9.11**
- Every-view law: **PASS**

## Adjudication

The former solid hull-fixed block beneath the turret is gone. Yaw 90 exposes a
clean deck and ring while the cannon, cast shell, buried collar, ERA, optics,
RWS, hatches, smoke fittings and antenna roots rotate as one seated package.
No duplicate turret wall, ring fragment or decoration remains stranded.

The replacement `rig_hull/mesh#17` service frame is legitimate hull-owned
geometry. It preserves open negative space, stays fixed at yaw, and has visible
side rails, a transverse tie and multiple posts returning into the deck. It
does not resemble armor, collide with the turret or bridge to a turret fitting.
All turret decorations meet pads, brackets, collars or the shell itself.

The source identity, native continuous six-road-wheel linked-shoe courses and
all visible surfaces pass. No donor track, empty-air attachment, missing face,
backface wound or yaw-dependent silhouette failure appears in the evidence.

## Machine receipts

- Gate: **90.4** — hull 90.4, whole 90.8, turret 91.1, stations 93.0,
  dimensions 96.2, floaters 100.
- Gate JSON SHA-256:
  `8f467675eb17c98ee05d69586413a6ae8e1045cca7203adb98de06a311dd3c5d`.
- Source GLB SHA-256:
  `3ceda4972aa0e4cdba9ecf0353ab584ed61b6cd22e1af75d4c077f75c4a67400`.
- Parent audit: stranded 0 / abutting 0 / dangling 0.
- Winding mode 1: reversed 0 / mixed 0 / deficit 0 pixels.
- `npm test` and `npm run build:private`: green.

Ordered blockers: **none**. Prior freeze `c13fec50` is retired.
