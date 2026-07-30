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
