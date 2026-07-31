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

## Mismatch log — shaded-parity r2 (2026-07-30)
- ORACLE DEFECT note above is STALE: tools/repair_oracles.py landed mid-round — the GLB now
  carries real `Turret`/`Gun` nodes (userdrops5.js maps them; pre-repair total 56.7 → 77.2
  with identical geometry). Component T/G scores are honest now.
- Rebuilt the turret as ONE cast lathe egg (r 1.08, plan stretch 1.32) + forward-leaning
  mantlet-less chin slabs; deleted the donor's faceted polyTurret + Stillbrew slabs whose
  flat cheek + smoke dots read as a welded box with drilled holes.
- L11 re-seated straight on the chin axis (cast collar → sleeve → evacuator → MRS/counter-
  weight collar). Four floating ground-level corner plates deleted; replaced with fender-hung
  deep rubber flaps (ref front mask shows filled track corners, so the plates existed to
  chase real geometry — they are now attached).
- Added Mk.5 skirt band (6 panels, hem at wheel-top line like the ref), NBC pack + rear
  basket, flank bins + rails to the full ±1.78 shoulder width, searchlight + glass, proud
  2x6 smoke clusters on brackets, antennas on bin-lid base pots (ref masts reach y≈3.77).
- Residual gaps (accepted): turret component score ~42 — the ref casting reads slightly
  wider at the shoulders and longer in plan than my egg+bins at equal silhouette total;
  ref masts sit closer to centerline. Whole-model total holds 77.1 vs 77.2 committed.

**Oracle re-processed (repair_oracles.py): rig mapping fixed** — the GLB's
'Turret' node (actually the chassis) renamed 'Chassis'; the real casting +
roof gear re-grouped under a new 'Turret' (ring pivot at the authored y=0
station) and the L11 under 'Gun' (trunnion origin); userdrops5.js adds
gunNode '^Gun$'. Crossed-mask defect above is historical.

## Round-3 log — turret casting rebuild (2026-07-30)
- r2 TC 3/10 ("still not the rounded Mk.5 casting — flat roof plane + slab cheeks",
  turret mask 41.9): the r1 lathe egg was too TALL and too SHORT. Rebuilt as the oracle's
  LONG LOW cast saucer: z-stretched main lathe (crown 0.79, span ~3.3), flat chin saucer
  carrying the recline to the gun collar, ONE shallow reclined face plane chin->crown;
  roof furniture (cupola + ring rail, loader ring, sights) dropped onto the low crown.
- r2 artifact #1 "teeth-mouth stud row" KILLED: the old smoke clusters sat half-buried in
  the casting face (tube tips = drilled studs). Rebuilt as dark solid discharger BINS on
  bracket arms off the chin cheeks, tubes short and outboard, below the brow line.
- Sponson bin row added at the fender line (hull bucket): the oracle carries TALL
  full-length bins there; the empty 1.45-1.85 side band was half of the turret-layer
  mask deficit. Tops capped at 1.80 so the yawing turret bins never clip.
- Headline 77.1 -> 78.2. NOTE: the turret component mask stays ~43 for a structural
  reason — the reference GLB ships its hull furniture (fenders, bins, skirts, deck kit,
  ~23k verts, heights to ~2.5 m) as a fused ROOT mesh, so the mask pipeline's hull layer
  occludes most of the true turret band and the reference "turret layer" is only the
  crown/cupola slice. Same defect class as m1a1_aim's turretless print: treat chieftain5
  T as capped evidence; judge the casting on the shaded board.


## Gate v6/v7 iteration (2026-07-31)
Full rebuild to the true-camera curves and published dims (hull 7.52 span
-3.735..3.735, overall 10.79 via a 6.30 m L11 + published-height p95 anchor
at the cupola ring 2.89; sight mast 3.70 (2 cols) + whip 3.78 (1 col) spend
the entire above-height budget). SPLIT-RIG ORACLE (certified): the GLB keeps
only the saucer CROWN + gun + masts in its turret node; the casting waist,
ring collar (2.43), fender bin tiers (2.27-2.32), cupola drum and IR
searchlight all read in its HULL mask — the build mirrors that split (static
collar/tiers/cupola in hull buckets, crown overlapping the collar so every
articulation pose stays connected). Asymmetric oracle (certified): left
fender runs full length to -1.70 with a 2.6-2.9 m bin sliver at +1.72 and
the body sits ~0.08 left; the build keeps the published symmetric width
plane (left lip at the committed 1.75) and eats the bounded row penalties.
WIDTH GUARD: v5 fender-bin lids breached to +-1.83 on a 3.5 tank (silent
3.5% shrink) — everything now inside +-1.75. dims 97.7, floaters 100 green;
curve rows capped ~34-59 by the 4.6%-short, x-shifted oracle.
