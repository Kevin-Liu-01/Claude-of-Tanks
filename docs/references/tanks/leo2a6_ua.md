# leo2a6_ua — Leopard 2A6 UA, rebuilt on the source-measured 2A6 (264)

## Current status

- Updated: 2026-10-28 (leo2a6-ua-264 lane, branch `item/leo2a6-ua-264`, base `origin/main` cd5e206649).
- Owner request, verbatim (2026-10-28): "thewn we need to update the leopard 2a6 UA to have all of its cages and guns and
  stuff and more off of our new current actual leopard 2a6".
- IDs: `leo2a6_ua` ("Leopard 2A6 UA", Ukraine, tactical number "UA 26", digital scheme). Base build: `leo2a6` (the
  source-measured Leopard 2A6, `profiles/leopardA6X.ts`).
- Implementation: `profiles/leopardA6Ua.ts` builds `buildLeopard2A6X` and adds the field kit; the id moved from the
  `leopard` fleet group (the 2A6M/OTCO-rig build in `profiles/leopard.ts`, retired) to `leopardA6X`. Datums shared by the
  kit, its net (`ghillieSuit.ts`) and its roof dock (`missionAttachmentReceiver.ts`) live in `leopardA6UaLayout.ts`.
- Combat: mobility, gun, shells, the six ERA sectors and their values and dims 7.72/10.97/4.44/3.28 unchanged; since the
  264 balance lever (Main's ruling, fleetBalancePass.ts) its main plates, HP and cadence are the 2A6's, and since 264b
  its skirt and track plates sit on the 2A6's faces and the 2A6M donor's wedge pair is gone (see Decisions). The ring, trunnion and barrel follow the 2A6 rig (turret pivot [0, 2.148, 1.048], trunnion
  [0, 1.971, 1.419], barrel 5.72 m from the trunnion). One working roof gun, 7.62 mm, as before (now the 2A6's own loader
  MG3 instead of a bustle MAG).

- Owner follow-up, same day, verbatim: "lets add a ton of extra era and cages and ghillie on the actual tank parts
  themselves". Done inside the same rules: 164 Kontakt-1 cassettes (the old build had 144), all in the six existing ERA
  sectors at their values (skirts 51 a side over their whole length, turret flanks 15 a side in three courses, the
  wedges 20 and 12 including rows over their tops, outboard of the EMES and its view); a mesh screen over the upper glacis
  and nose plate (kept 25 mm under the gun's 9-degree sweep); the field net moved to the fleet field-net format
  (ghillieFleetSuits.ts) and laid on the turret roof, the cage roof, down the bustle, on the front deck and down the rear
  hull walls, with the builder's turret, gun, smoke and lens clearances. No screen can lie on the engine deck: the 2A6's
  tube, level and turned aft, passes 9 mm over its own fan rings.

## Sources (every addition)

- [A] 21st Separate Mechanized Brigade, photos by Oleksandr Bondar, 2025, published by the Ukrainian 10th Army Corps
  (collected at deaidua.org/footage/index.php?id=25, files 68653f8e…, 68653fa9…, 68653fca…, 68653ffa…): a tall welded cage
  over the turret under a camouflage net; welded square-mesh screens round the turret and along the front of the hull; a
  mesh box over the bow corner with a chain curtain; two courses of Kontakt-1 on the rear skirts; a welded steel box at
  the back; the barrel wrapped.
- [B] the same page, turret close-ups uploaded 2024-11 (files 67251b…): angle-iron frames with square wire mesh standing
  off the turret flanks round the smoke dischargers and round the bustle, a fringe of hanging chain on their bottom
  rails, a mesh roof frame over them; three-tone NATO paint under the screens.
- [C] Ukrainian Leopard 2 practice for turret-front and flank Kontakt-1 (Militarnyi 2023-09-10; Bulgarian Military
  2023-04-07; ArmyInform / Ruslan Tarasov photos on Wikimedia Commons, 2025-01, all Leopard 2A4s). No 2A6 photo shows
  turret ERA.
- Unit and service history: militaryland.net (2A6s with the 47th Mechanized Brigade in 2023, the survivors with the 21st
  Mechanized Brigade since 2024); Euromaidan Press 2025-07-05 (21st Brigade 2A6 at Pysarivka, Sumy oblast).
- Markings: 10th Army Corps 2024 photos show the trident and unit insignia; no consistent white crosses on the 2A6.
- Camouflage: every 2A6 photo shows the German three-tone NATO scheme (faded, mud-caked) or a near-uniform olive; none
  shows a digital pattern. The digital signature is kept per the brief; a three-tone signature is proposed to Main.
- Not seen on any 2A6 photo and so not added: jammers, extra machine guns or remote stations, logs, spare track, spare
  road wheels, slat (bar) armour.

## Decisions

- Turret ERA [C]: the gameplay sectors `ua_turret_cheek_era_{L,R}` and `ua_turret_side_era_{L,R}` stay (combat unchanged),
  drawn honestly as two Kontakt-1 courses on each wedge's outer face and on each flat flank. Proposed to Main: drop them.
- Skirt ERA [A]: `ua_skirt_era_{L,R}` — the photos show the rear half; the owner's follow-up extends both courses the
  skirts' whole length behind the hull's mesh boxes (a standing course of 33 under a lying course of 18 a side, round the
  boxes' brackets). Each cassette carries its own fitted hit face (the anatomy's eraPlates).
- Sector names follow the fleet's x sign (+x 'R'): eraSurfaceFrame.ts keeps only that side's points when it fits a
  sector's faces.
- Hull kit heights: the mesh boxes step down toward the bow (1.42, 1.405, 1.34, 1.29 m; the bow box 1.275 m) to stay
  25 mm under the main gun's swept underside at its 9-degree stop (leopardA6UaGunFloorY, with 25 mm for the turret
  seat): the gun-to-kit probe measures 47.7 mm at its nearest.
- The two roof remote stations of the old build were never working guns and no photo shows them: removed.
- Drone screens (`armor.droneScreens`, gameplay drone interception) are not given to the cage: proposed to Main.
- The kit is open lattice and equipment (`*OpenLattice*`, `*Detail`, `*Dark`, `*FittingPaint`, `*Cloth`): nothing enters
  the primary armour buckets.
- Existing cage helpers (`modernFieldCage`, `fieldRoofCage`, `attachedCage`) draw round-bar slat grilles; the photos show
  square wire mesh on angle frames and a tall roof cage, so the kit has its own box-bar mesh panel (12 triangles a bar,
  95 mm pitch at HIGH, 160 mm at LOW).
- The cage's upper bays carry a dark camouflage net from the screens to the eaves, flanks and rear [A: the 2025 cage is
  netted from its screens to its roof]; its front stays open for the sights and the gun, and stops behind the wedges as in
  [A]. Chain fringes are drawn as links turned a quarter turn in turn at HIGH (rods at LOW); the bow curtain keeps its
  length ([A] shows it hanging nearly to the ground).
- A Kontakt-1 seat ray that passes the seam between two skirt plates lands on the hull side behind the track's top run:
  no cassette is seated there (the strict track clip found the two the first build placed).
- 264b (Main's armour-truth audit, 2026-10-29): the UA's spaced and track plates sit on the 2A6 shell, as leo2a6's do.
  The 2A6M donor's one-piece spaced wedge pair (`turret_wedge_R/L`, 296/1,010 mm) stood at the 2A6M turret's height
  (0.08-0.90 m over the ring, the 2A6 roof at 0.196 m), out of the frontal range's path but in flank and top fire's; the
  2A6's main cells own its wedges, so no pair returns. The template skirts (x 1.88, y 0.45-1.15 m) take the 2A6's six
  thin leaves and four heavy panels (y 0.88-1.33 m, sourceXWesternAuxArmor.ts leopardSkirts) at the UA's own ratings
  (215/606 and 14/14), and the track faces the 2A6's fit of the Leopard 2 template (x 1.575, y 0.138-0.995 m).

## Visual review (blind critics, opus and sonnet, against the photos; the lower score counts)

| view | before | wave 0 (soft) | wave 1 (soft, fix round) | wave 2 (GPU, shipped) |
|---|---|---|---|---|
| front | 3 | 6 | 6 | 7 |
| side | 3-4 | 5 | 6 | 6 |
| front three-quarter | 3-4 | 6 | 6 | 6 |
| rear three-quarter | 3 | 5 | 6 | 6 |
| top | 2-3 | 5 | 5 | 5 |
| Garage | 4 | - | - | 6 |
| battle chase | - | - | - | 6 |

Wave 0 routed the shared defects (open upper cage, rod-like chains) to the fix round; waves 1 and 2 scored the fix round's
build. Residual, from both critics: the flat cage roof and its bright leaf net, chains that still read as rods at Gallery
scale, clean road wheels, the digital scheme (three-tone proposed to Main), low Kontakt-1 relief on the skirt.
