# Chieftain Mk.5 (`chieftain5`) — reference packet

Exact variant: FV4201 Chieftain Mk.5, Royal Ordnance L11A5 120 mm rifled gun.

## Corroborated real dimensions
- Hull length 7.52 m; overall length gun-forward 10.77–10.79 m (gun overhang ≈ 3.25 m);
  width 3.50 m over skirts (3.66 m over tracks); height 2.90 m to cupola.
  Sources: https://en.wikipedia.org/wiki/Chieftain_(tank) ,
  https://www.historyofwar.org/articles/weapons_chieftain.html ,
  https://www.steelbeasts.com/sbwiki/index.php?title=Chieftain_Mk.5
- Gun: L11A5 120 mm rifled, L/55 → ≈ 6.6 m tube, full-length thermal sleeve on Mk.5,
  fume extractor at ~60% of tube. No muzzle brake.
- Running gear: 6 paired road wheels per side (Horstmann bogies, 3 per side), rear drive
  sprocket riding high, front idler low, 3 return rollers, exposed upper run under shallow
  track guards with long fender stowage bins.
- Distinctive: mantletless "needle-nose" cast turret (gun collar emerges directly from the
  casting), long cast turret with big rear stowage basket, flank turret bins, No.15 commander
  cupola on the LEFT, IR searchlight box on left cheek, very shallow reclined driver position
  and one continuous flat glacis line, low engine deck.

## Local GLB oracle (shots/procedural-fidelity/boards/chieftain5.png + measured boxes)
Width-normalized reference (scale ×1.008): body z −5.22..+1.97 (hull ≈ 7.19 long, origin at
the turret ring, NOT centered), L11 tube y 1.70..2.16 reaching z +5.22 → barrel overhang
3.25 m ✓ real. Turret roof ≈ 2.74; twin antenna masts to y 3.77.

**ORACLE DEFECT (component masks only):** the GLB's node named `Turret` is actually the
LOWER HULL + running gear (y 0..1.71, full length); the real turret + upper hull + gun tube
live in the sibling `Chieftain_MK-5_Main_Battle_Tank` group which stays under `rig_hull`.
`MODEL_SOURCE` (src/vehicles/userdrops5.js: `turretNode:'^Turret$'`) therefore seats the
CHASSIS in `rig_turret`, so fidelity hull/turret masks are crossed, ref gun mask is empty
(gun component is structurally 0) and the tracks band is measured on the upper assembly
(structurally ~20). Whole-silhouette views are unaffected and are what this pass optimizes.
Fix belongs in userdrops5.js (invert the mapping or drop `turretNode` to fuse) — outside
UK-family file ownership.

## Procedural gaps identified (right/left views 81.9/82.8 before edits)
- Procedural barrel ends at z 6.64 vs ref 6.98-equivalent (≈0.17 m short) and reads thinner
  than the sleeved L11 (ref tube silhouette ≈ 0.30 m thick).
- Procedural hull nose overshoots low-forward (cyan lower-nose spill in side views).
- Ref bustle/basket reaches farther aft; ref cupola/antenna cluster taller.

**Oracle re-processed (repair_oracles.py): rig mapping fixed** — the GLB's
'Turret' node (actually the chassis) renamed 'Chassis'; the real casting +
roof gear re-grouped under a new 'Turret' (ring pivot at the authored y=0
station) and the L11 under 'Gun' (trunnion origin); userdrops5.js adds
gunNode '^Gun$'. Crossed-mask defect above is historical.
