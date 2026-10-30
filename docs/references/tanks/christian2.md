# Christian II — run packet

Template: `docs/tank-generation/templates/run-packet.md`. Lane `item/christian2-262` (release 262).

## Current status

- Updated: 2026-10-30 (R7, the swept frontal modules).
- Owner request / latest superseding instruction (verbatim, 2026-10-27): "add these new tanks using our rigoorous tank
  generation workflow"; through Main: "the christian 2 is based off the leopard, take innnspo from japanese type 90. but
  dress it in a ton of netting and ghillie, which our strv 121 should also get a ton of btw to distinguishh it as
  swedish."; then to this lane directly: "that type90 is a leopard anyways so basee off of that type 90 pleasee. base all
  the leopard 2a1-3 based off of the type 90 variant which is our best model of leopards"; then, superseding it: "oh wait
  whoops i madee a mistake. the new leo annd leo changes should rightfully be based on the new model and use totally new
  tank generation. the type 90 is a separate tank". The last instruction governs: the Christian II is a fresh
  first-party build at the supplied model's measured proportions (a Leopard 2-pattern hull and seven-wheel gear) with its
  own Type 90-inspired turret; the Type 90 X is untouched. (The new Leopard 2A3 on the same construction is this lane's
  second item, Main 2026-10-27; it has its own packet.)
- IDs and display names: `christian2`, "Christian II" (new id; no production model replaced).
- Implementation status: built fresh (profiles/christian2.ts, datums in christian2Armor.ts); see the evidence matrix.
- Qualification status: concept route (first-party concept policy), no source score; see the matrix.
- Publication status / exact authority: lane branch only; Main integrates (READY to "Claude of Tanks Main").
- Worktree / branch / baseline commit: `.claude/worktrees/youthful-hypatia-16d3b5`, `item/christian2-262`, base
  `origin/main` 7d045a7588.
- Current next action: see the round log.
- Blocking choices / known failures: none open with the owner. Nation ruled by Main (below).

## Scope and preservation

- Mode: new first-party concept build (the handbook's fresh generation). The supplied model is a concept's proportions
  oracle only: its datums are measured, nothing of its surfaces is traced.
- Owned files: `src/vehicles/profiles/christian2.ts`, `src/vehicles/christian2Specs.ts`, `src/vehicles/christian2Armor.ts`,
  the release's shared Leopard 2-pattern hull (`src/vehicles/profiles/leopard2Hull.ts`, `src/vehicles/leopard2HullDatums.ts`;
  the Leopard 2A3 of the fourth batch rides it too),
  the `christian2` suit row in `src/vehicles/ghillieFleetSuits.ts`, `src/vehicles/profiles/christian2.selftest.mjs`,
  `docs/references/concepts/christian2-20261027.json`, this packet; one registration line each in the shared tables.
- Protected originals: `type90` (Type 90 X) and every Leopard 2 (`leopard.ts`) byte-identical to origin/main.
- Explicitly excluded: the oracle's own surfaces and details (Main 2026-10-27: "Treat it strictly as proportions, and don't
  trace its surfaces or details"), any reuse of the Type 90 X's stock (the selftest proves no mesh is shared), any
  production Leopard change (second item).

## Source and comparison contract

- Actual raw path: `~/cot-lanes/new-tank-refs-262/christian_ii_mbt.glb` (outside the repository; never staged).
- Raw SHA-256: `8e41ce95e6c280dde5b3e19e9bb82e2b54f37cfc22548e5aac8d9ea45924be0e`, glTF 2.0 binary, 31,374,984 bytes,
  30 meshes, 179,916 triangles, 21 materials, 54 textures.
- Credits / provenance: "Christian II MBT" by Jeyhun1985 (https://sketchfab.com/Jeyhun1985), Sketchfab page
  https://sketchfab.com/3d-models/christian-ii-mbt-8c056681198941bdb6e64f1d84132d17, embedded licence string
  CC-BY-4.0. The page's only description is "Christian II main battle tank from War Thunder": the mesh may be extracted
  from another game, so the CC-BY string is the uploader's claim and is not treated as conclusive. Reference-only; nothing
  from it ships, so no `docs/ATTRIBUTION.md` entry (none applies).
- Source limitations: fused material-merged meshes (no hull/turret/gun node ownership); a net/burlap wrap modelled over
  the gun and the turret face; game-style low-poly running gear.
- Approved target: owner-authored concept at the oracle's proportions, not the supplied model's surfaces.
- Registration (for proportions only): Sketchfab root matrix maps source (x, y, z) to game (x, z, -y): source -Y forward
  becomes +Z, Z-up becomes +Y; determinant +1, scale 1 (the source is in metres). The sight bay and commander's head sit at
  game -X, the world's right of a +Z hull, as on a real Leopard 2 (not mirrored).
- Oracle measurements (game frame, antenna meshes excluded): overall 9.875 m (z -4.177..5.698), width 3.640 m, turret
  roof 2.46-2.47 m (2.31 at its front edge), hull deck 1.63-1.70 m, ring centre z 0.37 m (radius 0.98 m), bore axis 2.00 m,
  breech z -0.17 m, muzzle z 5.70 m, turret front face z 1.66 m, side half-width 1.28 m stepping to 1.16 m over the bustle
  from z -1.2, bustle floor 1.85 m, seven road wheels.
- Built versus oracle: 9.866 m overall (-0.1 %), 3.672 m wide over the fore blocks' bolts (+0.9 %), roof 2.47 m (0 %),
  muzzle z 5.71 (5.70), bore axis 2.00 m (2.00), ring (0, 1.64, 0.37) (z 0.37), seven road wheels at the oracle's
  stations (mean of its staggered sides), the turret's side half-width 1.28 m stepping to 1.16 m over the bustle, the
  skirts hanging 0.46 m from the sponson's floor at 1.36 m.

## Concept (owner-authored; nation ruled by Main 2026-10-27)

- Nation / operator: Denmark, a fictional Danish Army concept (no real-world service history is claimed). Drawn as a
  Nordic node in the Sweden tech tree (`SWEDEN_TREE.nations` gains 'Denmark'; flagNation stays Sweden); it wears the
  Danish flag and markings, fights with the Swedish teams (`countries.ts` VEHICLE_COUNTRY), and the Nordic decor kit.
- Era / role: modern (2020s) main battle tank; precision doctrine (the netting is a concealment kit).
- Design rationale: a three-crew MBT on a Leopard 2-pattern hull and seven-wheel running gear, with a long slab-sided
  turret in the Type 90 manner: bolt-on frontal modules framing a box mantlet, the gunner's armoured sight box (right)
  and the commander's panoramic head and cupola with a working 12.7 mm (left), a stepped bustle autoloader (a three-round
  cycle) with blow-off panels feeding a 120 mm L/44; a permanent heavy field net with beech garnish; a DM53-class APFSDS.

## Construction work order

- Datums (`leopard2HullDatums.ts` for the hull, `christian2Armor.ts` for the turret; shared by the builders, the spec and
  the receipts): deck line z -3.80..3.45 (engine deck
  1.78-1.80, compartment 1.63-1.64, upper glacis from z 1.55 down to the nose at 1.25), belly 0.54, tub half-width 1.00,
  sponsons 1.67 with their floor at 1.36; seven road wheels r 0.348 at y 0.425 (z 2.417 .. -2.533), track centre 1.359,
  width 0.643, idler front (3.187, 0.895, r 0.26), sprocket rear (-3.20, 0.895, r 0.30), four return rollers; skirts:
  three bolted fore blocks (z 1.42..3.16, face 1.818) and six thin aft panels (face 1.72), tops 1.50. Turret ring
  (0, 1.64, 0.37); shell half-width 1.28 to the step at z -1.57, bustle 1.16 to z -2.73, roof 0.74 (front) .. 0.83,
  frontal modules swept back 33.8 degrees in plan from z 1.66 at a 0.71 m gun slot to the walls at the shell's front
  (z 1.04), their tops falling 7 cm to the tips; the box mantlet's face flush with the tips (gun z 0.60); trunnion
  (0, 0.36, 1.04), L/44 tube 4.29 m, r 0.084.
- Hull fittings (`leopard2Hull.ts`): armoured headlight pods with guards at the glacis's front corners, a V splash board,
  the driver's hatch and three periscopes set to the glacis's slope (right), radiator grilles over dark wells either side
  of an access plate and two fan covers on the engine deck, exhaust grilles at its rear corners (louvres here, round rods
  on the 2A3), lifting eyes, tail-light clusters, tow hooks, a convoy light and a tubular stern rack
  (R6; a stern box until then), a louvred exhaust band across the upper rear plate.
- Material roles: hull, skirts and turret shell painted armour; the frontal modules permanent armour; sights glass in
  armoured frames; bins, basket and rails painted fittings; the suit's net and garnish cloth/foliage (`open-lattice`).
- Gameplay plates (`christian2Armor.ts`): glacis 460 mm (KE 420 / CE 640), lower front, sponson and tub sides 80, rear
  45, roof 40; fore skirt blocks spaced (KE 60 / CE 220), aft panels 8; turret cheeks (KE 760 / CE 1100), box mantlet
  (KE 900 / CE 1050, gun-following), compartment sides (KE 300 / CE 420), bustle sides (KE 160 / CE 220), rear 60, roof
  40; modules and crew (driver right front, gunner right, commander left, autoloader in the bustle).

## Evidence matrix

See the round log; filled as each gate runs.

## Round log

- R1 (2026-10-27): first build on the Leopard 2A4 hull with an own turret, superseded the same hour by the owner's
  "base off of that type 90"; the Leopard hull split was reverted (leopard.ts byte-identical to origin/main).
- R2: Type 90 X derivative, side modules and bins; 78,758 triangles HIGH before the suit; bounds equal the Type 90's.
- R3 (2026-10-27, the owner's correction "the type 90 is a separate tank"): the Type 90 X derivative dropped (type90X.ts
  back to origin/main byte-identical); a fresh build at the oracle's proportions: Leopard 2-pattern hull and seven-wheel
  gear, own turret, own armour; the suit row refitted (drapes hang from over the turret walls' shoulders).
- R4 (blind critic 1 FAIL: barrel cloth fins, bare turret front, card-like drapes, the driver's hatch sunk in the glacis,
  a toy-like engine deck and rear, the M2 over the panoramic head, the ring slit, a fender whisker): the hull and gear
  split into the shared `leopard2Hull.ts` (per-mesh hashes identical before the fixes), the critic's hull fixes there; the
  cupola raised to stand its vision blocks 20 cm over the roof (their view cones had cleared the roof net and so the
  wall drapes' anchor), the M2 moved to the cupola's rear-outboard rim and laid outboard of the head, a ring guard; the
  suit's drapes re-laid (three long hull drapes a side, wall drapes ahead of the smoke banks, the frontal modules' faces,
  two wraps hugging the tube).
- R5 (blind critics 2 and 3): the skirts hang from the sponson's floor (1.36 m) so the upper hull's band shows; the heavy
  fore blocks bolted and stepped 10 cm out on their own rail; round fan covers, radiator louvres and access plates on the
  engine deck; exhaust louvres, tail lights and a stern box on the rear plate (R6: one exhaust band and a stern rack);
  the front fenders run out to the
  oracle's 3.70 m; a 14 cm splash board; the rail clear of the smoke banks; the M2 laid outboard of the head; plumb whips;
  wall stowage boxes. Suit: the barrel wraps and the module-face cards dropped, the roof net opened by the fittings' own
  shapes, the hull drapes overlapped with their tops 13 cm under the deck edge (the gun's full-depression sweep over the
  sides took the garnish there).
- Depression curve published (`gunPitchByYawDeg`, sweep at 26 mm, --no-suit): -9 degrees over the sides, -6.6 to -7.5 over
  the headlight pods (yaw 17-29), rising to about level over the engine deck (yaw 144-180).
- Fairness at VIII (the tier-fairness-259 round robin, 120 m, six seeds, 29 peers): mantlet 900/1050 and a 2.0/15.5 s cycle
  0.642 (7/29 in band); 800/1000 and 2.1/17 s 0.47 (10/29) on the R4 build, 0.42 (9/29) on the final one; 850/1000 and
  2.1/17 s 0.499 (9/29), adopted.
- R6 (the Leopard 2A3's blind critics on the shared hull): the last skirt panel a fender strip so the sprocket shows whole;
  one continuous exhaust band across the upper rear plate and a deck-level tubular stern rack to the oracle's 4.155 m
  instead of the stern box. Fairness re-run on the final build: mantlet 850/1000 and the 2.1/17 s cycle, 0.499 (9/29).
- R7 (2026-10-30, the owner on the lane's five-tank sheet: "christain 2 missinng thhe angled ness"): the supplied model
  sliced at heights (game frame, ~/cot-lanes/christian2-262-evidence/front-27/slice.mjs): its cheek faces vertical from
  the floor to 2.27 m, straight in plan from a 0.475 m slot to the walls and swept back 33.5 degrees (left) and 35.4
  (right), its roof rising 6 degrees back from their top edge, the box mantlet flush with their tips. R1-R6 had read
  the turret front at the roof's edge (z 1.66 world, 1.29 turret) and built square modules there. Now: each module one
  convex piece swept 33.8 degrees from turret z 1.66 at the slot to the wall at the shell's front, the seams and bolts
  square to the face; the mantlet's face brought forward to the tips (gun z 0.60), its underside rising 11 cm over its
  front 0.30 m (traversed astern, a square box would stand 1-3 cm into the engine deck's net at the +0.6 degree stop);
  the cheek plates on the swept face, the mantlet's plate 4 cm inside its face; the roof net to the tips. The
  Leopards' 27 degrees (leopard2CheekFrontDatums.ts) is the owner's fit to a real 2A4; this concept keeps its own
  model's angle.
