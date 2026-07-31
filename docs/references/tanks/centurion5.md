# Centurion Mk.5/2 (`centurion5`) — reference packet

Exact variant: Centurion Mk.5/2 — first L7 105 mm Centurion (Mk.5 hull, ex-20-pdr mount).

## Corroborated real dimensions
- Hull length 7.56–7.82 m; overall length gun-forward ≈ 9.83 m; width 3.38 m;
  height 2.94 m (same chassis family as Mk.3).
  Sources: https://en.wikipedia.org/wiki/Centurion_(tank) ,
  https://www.iwm.org.uk/collections/item/object/70000144 ,
  https://www.tankmuseum.org/museum-online/vehicles/object-e1949-338
- Gun: Royal Ordnance L7 105 mm L/52 ≈ 5.46 m tube WITH bore evacuator at ~2/3 tube;
  overhang past nose ≈ 2.2 m.
- Running gear/identity: as centurion3 (Horstmann bogies, 6 wheels, full armoured side
  skirts, long cast turret with rear bin); the Mk.5's L7 tube carries the distinctive
  evacuator drum, unlike the slim 20-pdr.

## Local GLB oracle (m_bergman print pack)
Width-normalized reference: hull z −3.94..+3.56, hull top 1.74, whole top 2.20.
**ORACLE DEFECT:** unassembled print layout — turret at ground level, barrel never clears
the hull bounds → turret component structurally ~25, gun structurally ~0–20 for honest
geometry (same userdrops6.js articulated() issue as charioteer). Hull + tracks components
legitimate.

## Procedural gaps identified (before edits)
- Same as centurion3: hull band too low (1.50 vs 1.74), skirts missing, L7 overhang was
  1.25 m — should be ≈ 2.2 m with an evacuator for identity.

**Oracle re-processed (repair_oracles_blender.py): turret seated** — cast
turret carved from the print skin and lifted +8.5 onto the ring; the L7 tube
segments on the bore line lifted to the throat (muzzle keeps its authored
+3.9 station); flat-pack plates parked inside the hull.

## Mismatch log — shaded-parity r2 (2026-07-30)
- All centurion3 r2 fixes apply (shared centurionBuild): cupola/loader pedestals (RWS read
  closed), clamped tow cable, bustle bin, lifting eyes, antenna base pots, canvas mantlet
  hood, glacis kit, louvre field + link rack, skirt gaps + handles, dished wheels.
- L7 identity: the prominent FAT mid-tube fume extractor is layered over buildGun's slim
  drum (r 0.100 vs tube 0.053, with taper rings); evac at 0.62 of the tube.
- Mk.5/2 now visibly differs from Mk.3: full 2x6 double-row smoke discharger banks per
  cheek (Mk.3 carries triples) + canvas stowage baskets on both bustle flanks.
- G stays 15: the repaired print keeps only partial tube segments on the bore line (cap;
  honest 5.45 m barrel kept). Fidelity 73.1 vs 73.4 committed.

## Round-3 log — oracle re-repair + re-seat (2026-07-30)
- ORACLE RE-REPAIRED from .bak: the r2 state ("L7 lies detached across the glacis") was a
  carve artifact — in the print the L7 is CO-AXIAL with the casting (bore x15.37 y12.60,
  muzzle authored at bow+3.9) and the whole TurretMesh is one assembled turret. The old
  recipe parked the entire casting inside the hull and lifted only tube slices. New
  recipe = one rigid move: basket ring c=(15.374,23.400) r7.0 onto the race
  c=(16.900,41.870) r7.2, dx +1.526 dz +18.470 lift 6.5, pivot [16.90,15.8,41.87].
  One assembled tank in all 9 views; fume extractor + discharger clusters all present.
- Headline 73.1 -> 75.8 (T 56.8* -> 59, G 15.2* -> 44 honest).
- Procedural: turret pivot -0.12 -> +0.40, gunLength 5.45 -> 4.98 (muzzle keeps the
  print's +6.0 station); cheek dischargers rebuilt as dark twin BINS per cheek on bracket
  arms (r2 "bead necklace" + "solid slab with surface tubes" both closed).


## Gate v6/v7 iteration (2026-07-31)
Retabled to the true-camera curves: high pointed prow (deck falling
1.68 -> 1.16 at the tip), two-step tail shelf, skirt hem 0.60 at the
committed +-1.685 plane, crown 2.74 with the cupola riser as the published
2.94 p95 anchor (2.92), long bustle bin raised to 2.50, deep breech mass
(0.86) matched inside the hull, 20-pdr/L7 at the published 9.83 overall
(muzzle 6.10 vs oracle 5.89 — small bounded cover). The oracle's hull length
matches published within 0.2% (best-conditioned UK print); its body sits
z-shifted ~1.0 which the hull-anchored registration absorbs.
dims 92.2, floaters 100 green; turretCurves still capped by the fused
breech/crown interplay (in progress, honest 0-18 today).
