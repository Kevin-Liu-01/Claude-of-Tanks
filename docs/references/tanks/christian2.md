# Christian II — run packet

Template: `docs/tank-generation/templates/run-packet.md`. Lane `item/christian2-262` (release 262).

## Current status

- Updated: 2026-10-27.
- Owner request / latest superseding instruction (verbatim, 2026-10-27): "add these new tanks using our rigoorous tank
  generation workflow"; through Main: "the christian 2 is based off the leopard, take innnspo from japanese type 90. but
  dress it in a ton of netting and ghillie, which our strv 121 should also get a ton of btw to distinguishh it as
  swedish."; then to this lane directly: "that type90 is a leopard anyways so basee off of that type 90 pleasee. base all
  the leopard 2a1-3 based off of the type 90 variant which is our best model of leopards". The last instruction governs:
  the Christian II is an explicit first-party derivative of the Type 90 X build. (The Leopard 2A2/2A3 rebuild is this
  lane's second item, Main 2026-10-27; it has its own packets.)
- IDs and display names: `christian2`, "Christian II" (new id; no production model replaced).
- Implementation status: built (profiles/christian2.ts over profiles/type90X.ts); see the evidence matrix.
- Qualification status: concept route (first-party concept policy), no source score; see the matrix.
- Publication status / exact authority: lane branch only; Main integrates (READY to "Claude of Tanks Main").
- Worktree / branch / baseline commit: `.claude/worktrees/youthful-hypatia-16d3b5`, `item/christian2-262`, base
  `origin/main` 7d045a7588.
- Current next action: see the round log.
- Blocking choices / known failures: none open with the owner. Nation ruled by Main (below).

## Scope and preservation

- Mode: explicit first-party derivative ("Make X based on Y": the Type 90 X recipe reused, with the Christian II's own
  deltas). The supplied model is a concept's proportions oracle only.
- Owned files: `src/vehicles/profiles/christian2.ts`, `src/vehicles/christian2Specs.ts`, `src/vehicles/christian2Armor.ts`,
  the `christian2` suit row in `src/vehicles/ghillieFleetSuits.ts`, `src/vehicles/profiles/christian2.selftest.mjs`,
  `docs/references/concepts/christian2-20261027.json`, this packet; one registration line each in the shared tables.
- Protected originals: `type90` (Type 90 X) stays byte-identical: `buildType90X` is only exported, not changed.
- Explicitly excluded: the oracle's own surfaces and details (Main 2026-10-27: "Treat it strictly as proportions, and don't
  trace its surfaces or details"), its seven-wheel Leopard running gear (the owner chose the Type 90 base), any new
  production Leopard work (second item).

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
- Approved target: owner-authored concept (Type 90 X base), not the supplied model.
- Registration (for proportions only): Sketchfab root matrix maps source (x, y, z) to game (x, z, -y): source -Y forward
  becomes +Z, Z-up becomes +Y; determinant +1, scale 1 (the source is in metres). The sight bay and commander's head sit at
  game -X, the world's right of a +Z hull, as on a real Leopard 2 (not mirrored).
- Oracle measurements (game frame, antenna meshes excluded): overall 9.875 m (z -4.177..5.698), width 3.640 m, turret
  roof 2.46-2.47 m (2.31 at its front edge), hull deck 1.63-1.70 m, ring centre z 0.37 m (radius 0.98 m), bore axis 2.00 m,
  breech z -0.17 m, muzzle z 5.70 m, turret front face z 1.66 m, side half-width 1.28 m stepping to 1.16 m over the bustle
  from z -1.2, bustle floor 1.85 m, seven road wheels.
- Built versus oracle: the Type 90 X base measures 9.80 m overall (-0.8 %), 3.618 m wide (-0.6 %), roof 2.459 m (0 %),
  six road wheels (owner's choice of base).

## Concept (owner-authored; nation ruled by Main 2026-10-27)

- Nation / operator: Denmark, a fictional Danish Army concept (no real-world service history is claimed). Drawn as a
  Nordic node in the Sweden tech tree (`SWEDEN_TREE.nations` gains 'Denmark'; flagNation stays Sweden); it wears the
  Danish flag and markings, fights with the Swedish teams (`countries.ts` VEHICLE_COUNTRY), and the Nordic decor kit.
- Era / role: modern (2020s) main battle tank; precision doctrine (the netting is a concealment kit).
- Design rationale: a three-crew MBT on the Type 90 X's hull, running gear and slab-sided turret, with its bustle
  autoloader (a three-round cycle) and Rh 120 L/44, uprated with bolted spaced side modules along the compartment walls,
  flank stowage bins on the bustle and a permanent heavy field net with beech garnish; a DM53-class APFSDS.

## Construction work order

- Gross form: the Type 90 X unchanged (hull 7.80 m, six 0.357 m road wheels, three return rollers, turret pivot
  (0, 1.682, 0.157)), plus three spaced modules a side (world z -0.58..0.02, 0.07..0.66, 0.71..1.20; 55 mm standoff,
  75 mm plates, y 1.80..2.26, following the wall's plan line), on spacer blocks with bolt heads; bins 0.15 x 0.29 x 0.46 m
  on the bustle flanks (z -1.80..-1.34) on a shelf, clear of the smoke banks and whip pots.
- Material roles: modules are permanent external armour (camouflaged), bins are painted fittings, the suit's net and
  garnish are cloth/foliage (`open-lattice`).
- Gameplay plates: six spaced plates (`christian2_side_module_{R,L}{0..2}`, 70 mm, KE 130 / CE 340) on the modules'
  outer faces, from the same datum table the builder draws (`christian2Armor.ts`).

## Evidence matrix

See the round log; filled as each gate runs.

## Round log

- R1 (2026-10-27): first build on the Leopard 2A4 hull with an own turret, superseded the same hour by the owner's
  "base off of that type 90"; the Leopard hull split was reverted (leopard.ts byte-identical to origin/main).
- R2: Type 90 X derivative, side modules and bins; 78,758 triangles HIGH before the suit; bounds equal the Type 90's.
