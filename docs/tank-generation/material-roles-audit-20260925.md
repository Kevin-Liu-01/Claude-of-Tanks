# Material-roles audit — FSP-06 (2026-09-25)

Owner ruling (2026-09-25): **FSP-06 YES** — "Apply deliberate material roles: camouflage on painted vehicle
bodywork; distinct materials/colors for accessory equipment, cloth, bags and mechanisms"
([backlog row](fleet-style-performance-priority.md)). This is the census of the production roster
(192 ids, `PRODUCTION_TANK_IDS`), the vocabulary it needed, the hulls re-roled, and the candidates that
remain with a verdict on each. Base `8d1178d09`; lane branch `fleet/fsp06-material-roles`.

## Method

`node tools/material-roles-audit.mjs [--ids=a,b | --all] --json=<p> --md=<p> [--dump=<jsonl>] [--gate]`

- The factory builder port gained an opt-in **part census** (`createTank(..., { partCensus })`,
  `tankFactoryCore.ts`): every authored part is observed with the bucket it merges into *before* the merge erases
  part identity, together with the profile line that authored it (stack frames outside the factory). Builds are
  byte-identical when the option is absent. `bucketMaterialKey(bucket)` is the read-only view of the bucket →
  material table.
- **Finish of a bucket:** `hull`/`barrel` carry the camouflage map (camo); `wheels`/`detail`/`canvasCloth` are
  scheme-tinted solids; `dark`/`rubber`/`glass`/`wood`/`spareTrack`/`shadow` are fixed distinct finishes.
- **Classification is lexical evidence, not a verdict:** the words on the authoring line (its trailing comment or
  one stand-alone comment above it, camelCase identifiers split, geometry vocabulary and SCREAMING constants
  removed, `glass` parameters and orchestrator lines ignored) ask for a finish — cloth (bags, packs, bedrolls,
  tarps, nets, sandbags, curtains, mantlet boots), rubber (flaps, tires, hoses), glass (lenses, vision blocks,
  named optical windows), bare metal (tow cables, chains, MG bodies, exhaust pipes, tool heads, whips, antenna
  bases), wood (logs, planks, crates, tool handles), solid paint (jerry / fuel / ammunition cans). A part whose
  words ask for a distinct finish but whose bucket is camouflaged is a **camo-on-accessory candidate**; ERA / armor
  words exempt a part (armor stays camouflaged whatever its bucket). A part in a dark bucket whose words name
  painted bodywork is a **bare-bodywork candidate**.
- **Ranking:** bounding-box surface area of the part (m²) — what the chase camera reads at 15–25 m; every bucket
  involved is LOD0 stock. Sites ≥ 0.15 m² are *major*; smaller ones are hardware-scale.
- **Post-merge census** (objective): triangles per appearance role (`userData.appearanceRole`, `Decor_*` kit
  materials by key) and the number of distinct rendered materials per tank.
- **Precision:** the profiles' comments are dense with gate jargon ("window" = a mask column window, "receipt",
  "plank" as a shape word, helpers named for what they mount) — every major candidate was read in its code
  context and carries a verdict below. The census is a ranked evidence list for a reviewer, not a gate; `--gate`
  exits 1 while candidates remain and is deliberately not wired into the release check.

## Totals

| | before (base `8d1178d09`) | after (this branch) |
|---|---:|---:|
| production ids built | 192 | 192 |
| camo-on-accessory candidate sites (distinct authoring lines × tanks) | 173 on 96 tanks | 144 on 92 tanks |
| of which major (≥ 0.15 m²) | 101 | 77 |
| ERA-cluster overrides (by factory design, see below) | 175 | 175 |
| bare-bodywork candidates (all helper hardware, no violation found) | 30 | 30 |
| distinct rendered materials, fleet sum | 4445 | 4455 |

Materials per tank after: min 14, max 68, mean 23.2. Deltas: merkava1b/3c/3d/4b **+2** (the bound), merkava2b/2d
+1, every other hull 0.

Fleet role triangles after (merged tree, HIGH + decor): trackPad 6.02 M, wheelDish 3.53 M, armorPaint 3.01 M,
gunmetal 1.11 M, wheelTire 1.01 M, trackHardware 0.54 M, trackBand 0.48 M, decor:steel 0.27 M, machineGun 0.25 M,
canvas 0.24 M, fittingPaint 0.10 M, decor:cans 0.09 M, opticGlass 0.07 M, wood 0.017 M, canvasPale 0.007 M.

## Vocabulary added (materials.ts / tankFactoryCore.ts BUCKET_DEF)

| bucket | material | role | why |
|---|---|---|---|
| `hullCanvasPale` / `turretCanvasPale` | `canvasPale` — fixed sand-khaki canvas 0x66604a, roughness 0.97, weave bump, double-sided, never repainted | `canvasPale` | desert / IDF soft kit: the Merkava family's *pale kit* had ridden the hull camouflage because the only cloth was the OD canvas (their note: "pale sand kit + strap seams instead") |
| `hullFittingPaint` / `turretFittingPaint` | the existing scheme-tinted `detail` material | `fittingPaint` | small painted steel accessories (jerry cans) that a hull-scale camouflage tile splashes |
| `gunHousing('turretCloth')` (misc.ts) | existing `gunMountCanvasSkin` (LOD0 canvas) | `canvas` | a canvas mantlet boot that moves with the gun |

The shared-material rules from the wheel-paint round hold: the pale canvas is one material per tank, tagged, and
outside the running-gear normaliser (`FIXED_ROLE_COLOR` does not touch it), so nothing recolours it.

## Hulls re-roled (17) — one commit per family

| family / commit | ids | what moved | materials before → after |
|---|---|---|---|
| Merkava (`profiles/merkava.ts`) | merkava1b, merkava2b, merkava2d, merkava3c, merkava3d, merkava4b | 25 turret-side `pale ? 'turret' : 'turretCloth'` ternaries (bustle packs, rolled loads, shelf cloth, tarp crowns, chain-curtain vanes, kit rows) → `turretCanvasPale`; 3 hull-side `paleKit ? 'hull' : 'hullCloth'` (mid-shelf cloth, wing bags, chassis packs) → `hullCanvasPale`; the three hard-coded pale tarp crowns; the `bpB` re-parent mapper carries both buckets; the paired jerry cans → `hullFittingPaint` in both kits. The basket fill volume (`rackMat`), rails and plates keep their buckets. | 25→27, 23→24, 24→25, 24→26, 23→25, 22→24 |
| Leclerc / AMX (`profiles/misc.ts`) | leclerc, leclerc_xlr, amx56, amx30 | mantlet boot body, cap and shoulder chamfers → canvas (`gunHousing('turretCloth')` → `gunMountCanvasSkin`); AMX-30B rear-fender jerricans → `hullFittingPaint`; Leclerc whips stowed along the bustle roof → `turretDark` | 22, 21, 21, 23 (unchanged) |
| Korean pack (`modern3.ts`) | k2, k2b, k1a1 | K2B roof whip rod, the cable coils of its basket and rear reels (the tori that model the cable; reel flanges stay painted), K1A1 folded whip rods → `turretDark` | 25, 25, 25 (unchanged) |
| K1A1 X (`profiles/k1a1X.ts`) | k1a1_x | 42 cm tapered antenna base lathe → `turretDark` | 24 (unchanged) |
| Italian pack (`profiles/italy.ts`) | carro45t, ariete_c1, ariete_c2 | Carro 45 t bow-fender crowbar → `hullDark`; coiled cable service loops under the base-drum columns → `turretDark` | 23, 23, 23 (unchanged) |

Eye-check (tools/fleet-battle-views.mjs `--width=1280 --height=720 --quality=high`, rear-quarter chase camera
`--camera=-6,3,-10`, front-quarter `--camera=6,3,10`, before = base worktree, after = this branch):

- **Merkava 3C** (digital desert): the bustle pack behind the turret reads as one khaki canvas block with dark
  straps; before it carried the digital pattern like the armor. **Merkava 4B** (fleck): the basket loads are khaki
  canvas against the fleck hull.
- **Leclerc** (front quarter): the mantlet boot is one dark-OD canvas block under the gun base instead of
  camouflage blotches; body and turret unchanged.
- **K2B** (rear quarter): the basket reel shows a dark cable coil against painted flanges; the roof whips are dark.
- **Carro 45 t / Ariete**: hardware-scale (crowbar, cable loops) — confirmed by the census, below the eye at 12 m.

## Findings left open (with the reason)

1. **ERA-cluster overrides — 175 sites, by factory design.** `tankFactoryCore add()` routes every part
   authored inside `destructibleCluster` / `visualEraCluster` to the camouflaged `*ExternalArmor` bucket so the
   brick's covers, rims and seams collapse with it (T-90M Proryv turret/side/glacis clusters: turretCloth 22 m²,
   turretDark seams 7 m²; T-72B3M Relikt skirt cloth 13 m²; Russian cheek clusters). Re-bucketing them would
   change ERA ownership, which FSP-06 forbids; the profile-side workaround (emit dark hardware after the cluster
   closes) is recorded in the SKILL. A factory-level per-part finish inside clusters is the real fix — not this
   lane. Listed per id in the census md.
2. **T-72B3M turret pack band** (`profiles/t72.ts` `addTurretPackWorld`, `T72_TURRET_PACK_BUCKETS['hull'] → 'turret'`):
   the sagging mounds and piles of the bustle band are authored on the LOD0 camouflage bucket because their tops are
   silhouette anchors pinned by the fidelity masks; materials.ts already notes the family's "broad modeled canvas
   aprons and bustle packs" should stay map-free. Candidate for a LOD0 `turretCanvasSkin` bucket (precedent:
   `gunMountCanvasSkin`) once the mask receipts are re-based — left to the owner.
3. **X-study headlamps** (`markVehicleNightLens(cylZ(...), 'headlight')` on `hullDetail`, 0.2 m² per hull on the
   T-72/T-80/T-90/TOS X studies): housing and lens are one cylinder; a correct split (dark housing + glass lens)
   adds geometry — FSP-05 lane.
4. **Pioneer tools**: every family splits handles (dark / wood) from blades (painted) deliberately; real pioneer
   tools are usually painted with the hull, so the painted blades stay.
5. **Authored per-variant choices** (8 sites): ZTZ-99A2 / VT-4 skirt `rigid ? 'hull' : 'hullRubber'`, the Merkava
   Barak clevis `dark ? ... : ...`, the Merkava basket fill volume — the builders chose per variant; recorded, not
   changed.
6. **Bare bodywork**: the 30 candidates are helper hardware (cupola vision slits, stowage straps, T-90M track
   trim) — no painted bodywork was found bare.

## Remaining candidate sites after the round (92 distinct authoring lines), ranked by area, with verdicts

| area m² (sum) | tanks | class | bucket | site | evidence | verdict |
|---:|---:|---|---|---|---|---|
| 15.46 | 1 | rubber | hullFixedPaintedBodywork | `profiles/t72buX.ts:46` | P.addMudguard('t72bu-x-side-leaf','hullFixedPaintedBodywork',markFixedPaintedPanel(box(.011,top-low,b-a),'t72bu-x-side-leaf','hullRubber'),lane,(top+l | AUTHORED — fixed painted panel (fixedSourceSkirtPaint receipt); the marker names its class, not its finish |
| 13.20 | 2 | rubber | hull | `profiles/russia.ts:1033` | P.add('hull', box(options.th ?? 0.04, panelH - rubberBottomH, panelD * 0.94), | FALSE — identifier `rubberBottomH`; the skirt panel above the rubber drop is painted |
| 7.95 | 5 | metal | turretEquipment | `profiles/abramsSourceXEquipment.ts:64` | else C.P.addEquipment(bucket, geometry, ...xyz, 0, yaw, 0); \| emit(C, `WhipFoot${x}`, KIT.cylY(.020, .033075, .0944, 24), [x, 2.421745, -2.101085]); \ | minor — antenna whip feet (0.03 m² each) and a case the author calls "not a whip", behind a shared emitter |
| 4.02 | 1 | wood | hull | `profiles/ukraine.ts:1839` | // Stern: layered transom with louvre field, recovery eyes, log. P.add('hull', box(2.55, 0.58, 0.14), 0, 0.84, -3.46, 0.05, 0, 0); | FALSE — transom plate; the log is a separate hullWood part |
| 3.88 | 1 | wood | hull | `modern3.ts:5184` | P.add('hull', box(0.24, 0.05, 3.30), s * 1.475, 1.295, -1.72); // rear fender plank | FALSE — steel fender strip (a §D width anchor), "plank" is a shape word |
| 3.01 | 1 | wood | hull | `modern3.ts:5183` | P.add('hull', box(0.24, 0.05, 2.55), s * 1.475, 1.295, 1.60); // front fender plank | FALSE — steel fender strip (a §D width anchor), "plank" is a shape word |
| 2.59 | 1 | metal | hull | `modern2.ts:1709` | P.add('hull', box(1.76, 0.040, 0.68), 0, 1.45, -3.91); // backs the complete cable trough to z -4.25 | FALSE — painted mount, housing or plate named beside a distinct part |
| 1.52 | 2 | glass | turretDetail | `profiles/k1a1X.ts:450` | P.addEquipment(bucket, g, x, y - RING_Y, z - RING_Z, rx, ry, rz); \| // Source front lens is behind the front lips by12–38mm, not a black cuboid. turre | FALSE — painted mount, housing or plate named beside a distinct part |
| 1.41 | 1 | glass | hullHatch | `profiles/leclercClassicXHull.ts:126` | // The source driver's window is inset behind its own raised frame. P.addHatch('hull', box(.850255, .024, .607723), .5594245, 1.50, 1.9047535, .178); | FALSE — gate jargon (a mask column window), not an optical window |
| 1.34 | 1 | metal | hull | `profiles/ukraine.ts:727` | // fender tip + hanger bracket chain the front flap to the fender row P.add('hull', box(0.40, 0.115, 0.56), s * 1.245, 1.22, 2.66); | FALSE — painted hanger plate; the rubber drop is a separate hullRubber part |
| 1.32 | 3 | metal | turret | `profiles/afvFamily.ts:148` | P.add('turret', KIT.cylY(0.18, 0.20, 0.075, 16), x, y, z); \| // §B3 MG law | review — hardware-scale, evidence text as listed |
| 1.03 | 1 | rubber | hull | `profiles/merkava.ts:836` | P.add(fp.drops.mat ?? 'hullRubber', box(0.05, fp.y - 0.06 - fp.drops.bot, 0.30), | FALSE — painted mount, housing or plate named beside a distinct part |
| 1.00 | 1 | metal | turretCupola | `profiles/afvFamily.ts:333` | P.addCupola('turret', KIT.cylY(0.23, 0.18, mgRingBottomY - roofY, 18), | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.97 | 3 | glass | turret | `profiles/misc.ts:1501` | P.add('turret', slab( // bay ceiling strip: field surface over the well rear (lens zone) \| // cheek fills beside sleeve (tops 0.40 — under the field l | FALSE — gate jargon (a mask column window), not an optical window |
| 0.90 | 1 | cloth | turret | `profiles/abrams.ts:5560` | P.add('turret', box(0.46, 0.41, 0.30), 0.38, 0.522, -3.14); // rigid ammo crate \| // bedroll strap | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.85 | 3 | cloth | hullDetail | `profiles/misc.ts:1075` | P.add('hullDetail', box(rw, 0.035, 0.07), rxc, 1.5525, -3.525); // 90-ladder r1: rack rear top cross-rail SEGMENTED like the lower rails (top 1.570, z | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.83 | 2 | rubber | hull | `profiles/misc.ts:3000` | P.add('hull', box(0.145, 0.31, 0.13), s * 1.51, 1.295, -3.765); // §A REAR ANCHOR: mudflap pods (ref plan -3.76 @ x 1.52-1.56; rear body col ~-3.80, o | FALSE — painted hanger plate; the rubber drop is a separate hullRubber part |
| 0.83 | 2 | metal | turretDetail | `profiles/misc.ts:3455` | P.add('turretDetail', box(0.08, 0.42, 0.14), s * 1.11, 0.945, -2.16); // corner ANTENNA MAST (world x ±1.11, y 2.135..2.555, z -2.39..-2.34): the real | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.82 | 3 | metal | turretOpenLattice | `profiles/merkavaX.ts:107` | P.addEquipment(slot,geometry,x,y+frame.ground-frame.y,z-frame.center-frame.z,rx,ry,rz); \| // Real separated rail-and-chain equipment; open space remai | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.73 | 1 | metal | turretDetail | `profiles/t90BurlakX.ts:164` | P.addModuleVisual('optics',bucket,g,x-YAW[0],y-YAW[1],z-YAW[2]); \| // Actual Object_16 optical pedestal/body, distinct from Object_17's MG. optic(P,'t | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.69 | 2 | metal | hull | `profiles/patton.ts:1190` | P.add('hull', sph(0.12, P.q ? 16 : 10), F.bowMG[0], F.bowMG[1], F.bowMG[2]); | review — hardware-scale, evidence text as listed |
| 0.65 | 1 | metal | turretDetail | `profiles/ajaxX.ts:450` | P.addEquipment(b,g,x-p.x,y-p.y,z-p.z,rx,ry,rz); \| // Remote roof MG has a visible fork-to-pedestal load path. add('turretDetail',cylY(.10,.15,.39,P.q? | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.57 | 1 | metal | hull | `profiles/sweden.ts:833` | P.add('hull', box(0.24, 0.16, 0.62), -1.46, 1.44, 1.90); // fixed MG box | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.54 | 1 | metal | hull | `profiles/casemate.ts:406` | // fixed MG box on the left front fender (KsP 58 pair) P.add('hull', box(0.24, 0.15, 0.60), -1.50, 1.37, 1.95); | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.54 | 1 | metal | hull | `profiles/japan.ts:390` | // Driver's hatch, periscopes, twin light clusters, tow fixtures and cable. P.add('hull', cylY(0.23, 0.24, 0.040, 16), -0.48, 1.335, 1.64); | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.52 | 2 | metal | hullDetail | `profiles/uk.ts:2929` | spareTrackStrip(P, 'hull', s * 1.26, 1.38, -3.585, 1, 1.35); | FALSE — the links already ride hullTrack; the rails are painted |
| 0.51 | 3 | glass | turret | `modern3.ts:4373` | P.add('turret', box(0.16, 0.13, 0.22), 0.58, 0.36, 0.78); // (r4: z 0.87 -> 0.78 — the lens at | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.51 | 1 | metal | hullDetail | `profiles/china.ts:1361` | spareTrackStrip(P, 'hull', -0.74, 1.515, 1.73, 4, -0.18, 0); | FALSE — the links already ride hullTrack; the rails are painted |
| 0.46 | 3 | metal | hullDetail | `profiles/uk.ts:2165` | spareTrackStrip(P, 'hull', -0.55, 1.41, 3.05, 3); | FALSE — the links already ride hullTrack; the rails are painted |
| 0.39 | 3 | metal | hullDetail | `profiles/china.ts:750` | liftEye(P, 'hullDetail', s * 1.30, 1.42, 2.30); \| // bow lights on riser pods + tow points + routed cable ([-1, 1] as const).forEach((s) => { | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.38 | 1 | wood | hull | `profiles/leopard.ts:8648` | P.add('hull', slab( // over-track mudguard plank A; outer guard only, 27.5 mm clear of the shoe lane \| // pedestal cap (top 1.40 = ref 1.400-1.404 col | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.38 | 2 | glass | turretDetail | `profiles/poland.ts:1944` | // Four-corner laser-warning receivers with paired glass apertures. P.add('turretDetail', box(0.115, 0.105, 0.12), s * 1.18, shellY(0.58), 0.62, | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.37 | 2 | glass | hullDetail | `profiles/t90msX.ts:79` | P.addEquipment('hullDetail',markVehicleNightLens(cylZ(.066,.11,24),'headlight'),side*.774,1.108,2.858); | OPEN — lamp housing and lens are one cylinder; a split needs geometry (housing dark + lens glass) |
| 0.30 | 3 | metal | turret | `profiles/t80.ts:455` | // Collar-supported radio whip, raised with the rest of the corrected roof. P.add('turret', cylY(0.070, 0.076, 0.090, 12), -0.78, roofTopY - 0.015, -0 | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.30 | 1 | metal | turretDetail | `profiles/patton.ts:2415` | P.add('turretDetail', box(0.05, 0.042, 0.45), (Tp.x + machineGun.x) / 2, ly(3.175), zl((Tp.z + machineGun.z) / 2), | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.28 | 1 | metal | hullDetail | `profiles/misc.ts:2410` | spareTrackStrip(P, 'hull', 1.05, 1.20, 1.55, 2, -0.35, 0); | FALSE — the links already ride hullTrack; the rails are painted |
| 0.28 | 2 | metal | turretDetail | `modern3.ts:2287` | P.add('turretDetail', box(0.0396, 0.869, 0.0396), -1.4388, 0.9405, -2.0174); // LEFT whip MAST BASE — solid run seated THROUGH the rack shoulder | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.28 | 1 | rubber | hull | `profiles/russia.ts:2032` | // rear mud flap at the measured 1.505..1.655 hanger band P.add('hull', box(0.16, 0.26, 0.045), s * 1.73, 0.92, -2.94, 0.08, 0, 0); | FALSE — painted hanger plate; the rubber drop is a separate hullRubber part |
| 0.26 | 1 | metal | turret | `profiles/soviet-heavy.ts:1749` | P.add('turret', sph(0.105, 16), 0.53, 1.00, -1.56); // rear MG ball dome | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.26 | 1 | metal | hullDetail | `profiles/uk.ts:2914` | spareTrackStrip(P, 'hull', s * 1.26, 1.38, -3.585, 1, 1.35); | FALSE — the links already ride hullTrack; the rails are painted |
| 0.26 | 1 | rubber | hull | `profiles/russia.ts:1939` | // front mud flap over the raised idler (plan front line 2.99) P.add('hull', box(0.15, 0.26, 0.045), s * 1.72, 0.93, 2.89, -0.06, 0, 0); | FALSE — painted hanger plate; the rubber drop is a separate hullRubber part |
| 0.26 | 3 | metal | hullDetail | `profiles/china.ts:748` | // headlight pair lifted clear of the idler shoe sweep (§B4 voxel margin) headlight(P, s * 1.02, 1.18, 3.14, -0.24, 0.042); \| // bow lights on riser p | OPEN — lamp housing and lens are one cylinder; a split needs geometry (housing dark + lens glass) |
| 0.25 | 2 | metal | turretDetail | `profiles/leopard.ts:7519` | spareTrackStrip(P, 'turret', -0.30, 0.53, -2.54, 2, 0, 0); | FALSE — the links already ride hullTrack; the rails are painted |
| 0.24 | 1 | glass | hullDetail | `profiles/t72b3X.ts:103` | P.addEquipment('hullDetail',markVehicleNightLens(cylZ(.082,.104,24),'headlight'),x,1.144,2.777); | OPEN — lamp housing and lens are one cylinder; a split needs geometry (housing dark + lens glass) |
| 0.24 | 1 | metal | hullDetail | `france.ts:374` | P.add('hullDetail', box(0.12, 0.055, 0.10), xc2, yc, zc); // cable saddle/clip keeps the route visibly load-bearing | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.23 | 1 | wood | hull | `profiles/leopard.ts:8651` | P.add('hull', slab( // plank B (ends 3.20; wrap crests open past it — its 1.28-1.385 crown IS the ref's 1.29-1.32 line) \| // pedestal cap (top 1.40 = | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.23 | 1 | metal | turretEquipment | `france.ts:716` | P.addEquipment('turret', cylY(0.040, 0.045, 0.17, 10), x, 0.66, z); // roof socket bridges each antenna pot to the welded crown | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.22 | 1 | glass | hullDetail | `profiles/t72b3mX.ts:120` | P.addEquipment('hullDetail',markVehicleNightLens(cylZ(.076,.105,24),'headlight'),x,1.318,2.999); | OPEN — lamp housing and lens are one cylinder; a split needs geometry (housing dark + lens glass) |
| 0.21 | 1 | glass | hullDetail | `profiles/t72buX.ts:99` | P.addEquipment('hullDetail',markVehicleNightLens(cylZ(.0695,.1222,20),'headlight'),x,1.09069,2.70575); | OPEN — lamp housing and lens are one cylinder; a split needs geometry (housing dark + lens glass) |
| 0.20 | 3 | metal | turretDetail | `profiles/misc.ts:1736` | P.add('turretDetail', box(0.105, 0.09, 0.12), 0.8875, LH + 0.03, -0.822); // sight/mount block (carries the priced 2.427w front line; WIDENED x 0.835. | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.19 | 1 | metal | turretEquipment | `profiles/tos1aTagil.ts:146` | P.addEquipment(bucket, stock(geometry, name), x, y, z); \| fitting(P, 'turret', 'mg-foot', box(.22, .075, .27), -1.64, .246, .43); | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.19 | 1 | metal | hull | `profiles/soviet-heavy.ts:1246` | P.add('hull', sph(0.09, 14), 0.48, 1.478, 2.21); // bow MG ball dome (ref bump z 2.12..2.31) | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.19 | 1 | glass | hullDetail | `profiles/t90BurlakX.ts:87` | P.addEquipment('hullDetail',markVehicleNightLens(cylZ(.066,.11,24),'headlight'),x,1.108,2.858); | OPEN — lamp housing and lens are one cylinder; a split needs geometry (housing dark + lens glass) |
| 0.19 | 1 | glass | hullDetail | `profiles/t90AwX.ts:91` | P.addEquipment('hullDetail',markVehicleNightLens(cylZ(.066,.11,24),'headlight'),x,1.108,2.858); | OPEN — lamp housing and lens are one cylinder; a split needs geometry (housing dark + lens glass) |
| 0.17 | 1 | glass | hullDetail | `profiles/t80uX.ts:122` | P.addEquipment('hullDetail',markVehicleNightLens(cylZ(.0735,.074,24),'headlight'),side*.8475,1.28473,2.62253); | OPEN — lamp housing and lens are one cylinder; a split needs geometry (housing dark + lens glass) |
| 0.17 | 1 | metal | turretDetail | `modern3.ts:1231` | P.add('turretDetail', cableReel, x - s * 0.02, 0.42, z - 0.006); | review — hardware-scale, evidence text as listed |
| 0.17 | 1 | glass | hullDetail | `profiles/t72b1987X.ts:101` | P.addEquipment('hullDetail',markVehicleNightLens(cylZ(.075,.064,20),'headlight'),x,1.047,2.595); | OPEN — lamp housing and lens are one cylinder; a split needs geometry (housing dark + lens glass) |
| 0.15 | 1 | metal | hullDetail | `profiles/uk.ts:4297` | // British glacis kit: spare track links + tow cable run spareTrackStrip(P, 'hull', -0.45, 1.40, 2.72, 3); | FALSE — the links already ride hullTrack; the rails are painted |
| 0.15 | 1 | glass | hullDetail | `profiles/jagdpanzerE100X.ts:175` | P.addEquipment(slot,g,x-(gun?PITCH[0]:0),y-(gun?PITCH[1]:0),z-(gun?PITCH[2]:0),rx,ry,rz); \| // Central bow lamp has a recessed lens inside the cylindr | review — hardware-scale, evidence text as listed |
| 0.15 | 1 | metal | turretDetail | `profiles/leopardRevolutionPrototypeTurret.ts:83` | // A compact manual MG precedes the production remote weapon station. P.addEquipment('turretDetail', box(.22,.055,.22), .77,ROOF+.025,-.48); | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.14 | 1 | glass | gunMount | `profiles/ukraine.ts:1336` | P.add('gunMount', cylZ(0.125, 0.016, 16), -0.53, 0.26, 0.528); // inner lens ring (owner-absorb) | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.13 | 1 | cloth | turretDetail | `modern3.ts:5340` | // bustle basket, loaded (rails + mesh + bundles) P.add('turretDetail', box(1.10, 0.03, 0.03), 0, 0.44, -1.10); | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.13 | 1 | glass | hullDetail | `profiles/t62mv1X.ts:100` | P.addEquipment('hullDetail',markVehicleNightLens(cylZ(.061,.073,20),'headlight'),x,1.289,2.178); | OPEN — lamp housing and lens are one cylinder; a split needs geometry (housing dark + lens glass) |
| 0.13 | 1 | rubber | hullDetail | `profiles/t80.ts:1022` | headlight(P, -(o.hlX ?? o.w * 0.44), o.hlY ?? (yG + 0.10), zG + 0.14, -0.30, 0.05); \| ruGlacisKit(P, { w: 3.1, y: 1.1246, z: 1.55, eyes: false, hookX: | OPEN — lamp housing and lens are one cylinder; a split needs geometry (housing dark + lens glass) |
| 0.12 | 1 | metal | turretDetail | `profiles/leopard.ts:14996` | spareTrackStrip(P, 'turret', -0.30, 0.53, -2.54, 2, 0, 0); | FALSE — the links already ride hullTrack; the rails are painted |
| 0.12 | 2 | metal | turretDetail | `profiles/misc.ts:4466` | P.add('turretDetail', geometryXform(cylY(0.077, 0.077, 0.018, 12), 0, 0, 0, 0, 0, Math.PI / 2), mgX - 0.218, recY - 0.055, recZ - 0.02); // drum lid | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.11 | 1 | cloth | turretDetail | `profiles/abrams.ts:5561` | P.add('turretDetail', box(0.42, 0.012, 0.115), 0.38, 0.732, -3.215); // lid slats \| // bedroll strap | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.11 | 1 | cloth | turretDetail | `profiles/abrams.ts:5562` | P.add('turretDetail', box(0.42, 0.012, 0.115), 0.38, 0.732, -3.075); \| // bedroll strap | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.10 | 7 | metal | turretDetail | `profiles/abrams.ts:3122` | // Wind sensor kept low (p95 budget lives on the whip pair). P.add('turretDetail', box(0.03, 0.10, 0.03), -0.30, roof + 0.04, -0.62); | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.09 | 2 | metal | turretDetail | `profiles/misc.ts:4508` | P.add('turretDetail', cylY(0.034, 0.044, 0.09, 8), 0.78, 0.50, -1.58); // spare antenna pot (both fits) | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.09 | 3 | metal | hullDetail | `profiles/leopard.ts:4790` | P.add('hullDetail', box(0.07, 0.07, 0.02), s * 0.985, 1.648, -3.474); // cable end eyes | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.08 | 1 | metal | turret | `profiles/china.ts:1449` | // leaning whip antenna at the turret nose-left shoulder (planted collar). P.add('turret', cylY(0.055, 0.07, 0.08, 10), -0.858, 0.50, 0.78); | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.08 | 1 | metal | turret | `profiles/russia.ts:1429` | // Single source radio whip on the turret-rear shoulder. P.add('turret', cylY(0.055, 0.07, 0.08, 10), 0.968, 0.68, -0.48); | review — hardware-scale, evidence text as listed |
| 0.07 | 2 | metal | hullDetail | `profiles/misc.ts:4141` | P.add('hullDetail', box(0.09, 0.02, 0.15), 1.12, 1.601, -0.02); // shovel blade | AUTHORED — blade painted, handle dark (real pioneer tools are painted) |
| 0.07 | 1 | metal | gun | `modern3.ts:5047` | P.add('gun', cylZ(0.048, 0.14, 12), 0, 0, 3.18); // muzzle brake body, 3.11..3.25 | review — hardware-scale, evidence text as listed |
| 0.07 | 1 | metal | hullDetail | `profiles/abrams.ts:4741` | P.add('hullDetail', box(0.13, 0.02, 0.22), 1.52, 1.70, -1.46); // shovel blade | AUTHORED — blade painted, handle dark (real pioneer tools are painted) |
| 0.07 | 1 | glass | hullDetail | `profiles/abrams.ts:4702` | P.add('hullDetail', box(0.015, 0.10, 0.14), sx * 1.606, 1.52, 3.31); // mirror head \| // glass face | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.07 | 1 | metal | turret | `modern3.ts:1653` | P.add('turret', cylY(0.050, 0.055, 0.11, 10), 0.40, 0.555, -1.35); // buried whip pedestal | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.07 | 1 | metal | turretDetail | `profiles/afvFamily.ts:158` | P.add('turretDetail', KIT.cylY(0.032, 0.042, 0.060, 10), side * spread, y, z); \| // whips share the sight-tower | review — hardware-scale, evidence text as listed |
| 0.06 | 1 | metal | turret | `modern3.ts:1657` | P.add('turret', cylY(0.050, 0.055, 0.09, 10), -1.10, 0.535, -1.35); // buried left whip pedestal | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.06 | 2 | glass | turret | `profiles/italy.ts:598` | P.add('turret', box(0.26, 0.022, 0.032), 0.76, 1.036, L(0.381)); // lens sill | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.06 | 1 | metal | hullDetail | `profiles/abrams.ts:5189` | P.add('hullDetail', box(0.115, 0.018, 0.20), 0.98, 1.362, 2.52); // shovel blade \| // clamp strap | AUTHORED — blade painted, handle dark (real pioneer tools are painted) |
| 0.06 | 1 | metal | hullDetail | `profiles/abrams.ts:5432` | P.add('hullDetail', box(0.115, 0.018, 0.20), 1.20, 1.362, 2.60); // shovel blade \| // clamp strap | AUTHORED — blade painted, handle dark (real pioneer tools are painted) |
| 0.05 | 1 | glass | hullDetail | `profiles/abrams.ts:4700` | P.add('hullDetail', box(0.03, 0.026, 0.20), sx * 1.60, 1.485, 3.42); // mirror mast arm \| // glass face | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.04 | 1 | metal | hullDetail | `france.ts:403` | P.add('hullDetail', box(0.09, 0.02, 0.16), 1.10, 1.654, -0.02); // shovel blade | AUTHORED — blade painted, handle dark (real pioneer tools are painted) |
| 0.04 | 1 | glass | hullDetail | `profiles/soviet-heavy.ts:1375` | P.add('hullDetail', KIT.xform(cylZ(0.050, 0.018, 14), 0, 0, 0.058), -0.64, 1.615, 2.02, -0.3, 0, 0); // lens ring | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.04 | 1 | metal | turretDetail | `profiles/leopard.ts:8417` | // anemometer mast rear-left + twin whip antennas at the bustle corners P.add('turretDetail', cylY(0.013, 0.017, 0.26, 8), -0.85, 0.76, -1.38); | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.02 | 1 | metal | hullDetail | `profiles/abrams.ts:4743` | P.add('hullDetail', box(0.05, 0.024, 0.15), 1.30, 1.70, -1.44); // axe head | AUTHORED — blade painted, handle dark (real pioneer tools are painted) |
| 0.02 | 1 | metal | hullDetail | `profiles/abrams.ts:5191` | P.add('hullDetail', box(0.045, 0.022, 0.13), 0.84, 1.36, 2.52); // axe head \| // clamp strap | AUTHORED — blade painted, handle dark (real pioneer tools are painted) |
| 0.01 | 1 | metal | turretDetail | `modern2.ts:3128` | P.add('turretDetail', box(0.12, 0.026, 0.03), 0.765, 1.13, -1.72); // whip bracket off the shaft (bridges to the whip base) | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.01 | 7 | metal | hullDetail | `profiles/abrams.ts:3967` | P.add('hullDetail', box(0.032, 0.012, 0.014), 0.86, 1.451, WS - 0.035); // cable port | FALSE — painted mount, housing or plate named beside a distinct part |
| 0.00 | 1 | metal | hullDetail | `profiles/abrams.ts:4644` | P.add('hullDetail', box(0.032, 0.032, 0.014), 1.564, 1.22, -3.968); // cable port | FALSE — painted mount, housing or plate named beside a distinct part |

## Per-id census after the round (merged tree, HIGH + decor)

Shares are triangles by role family: camo = `armorPaint` (hull/barrel map); scheme paint = wheel dishes, fitting
paint, suspension links, decor kit paint; cloth = canvas, pale canvas, decor canvas/burlap/net; rubber = tires,
insets, decor rubber; glass = optics and decor lenses; wood; the remainder is track steel/pads, gunmetal, MG bodies,
decor steel and shadow. "candidate sites after" counts distinct camo-on-accessory authoring lines (major in
parentheses) — see the verdict table.

| id | nation | parts | materials (before → after) | camo % | scheme paint % | cloth % | rubber % | glass % | wood % | steel / track / other % | candidate sites after (major) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| aft10_x | China | 431 | 19 | 21.9 | 18.8 | 0.5 | 7.8 | 0.8 | 0.1 | 50.2 | 0 (0) |
| type100 | China | 238 | 14 | 9.5 | 20.2 | 0.0 | 7.8 | 0.2 | 0.0 | 62.2 | 0 (0) |
| type59 | China | 379 | 23 | 13.6 | 27.3 | 1.0 | 4.2 | 0.1 | 0.2 | 53.6 | 2 (1) |
| type96b_x | China | 261 | 20 | 11.2 | 40.4 | 0.2 | 7.5 | 0.2 | 0.0 | 40.5 | 0 (0) |
| type99a | China | 285 | 24 | 7.9 | 33.1 | 1.4 | 6.0 | 0.5 | 0.6 | 50.6 | 1 (1) |
| vt4a1 | China | 277 | 23 | 5.4 | 32.6 | 1.4 | 5.1 | 0.8 | 0.6 | 54.1 | 2 (0) |
| ztz100_prototype | China | 498 | 14 | 14.3 | 35.3 | 0.0 | 6.1 | 0.2 | 0.0 | 44.0 | 0 (0) |
| ztz100_x | China | 637 | 14 | 12.5 | 36.5 | 0.0 | 6.3 | 1.1 | 0.0 | 43.5 | 0 (0) |
| ztz85_iii | China | 339 | 25 | 6.9 | 35.1 | 0.7 | 5.6 | 0.2 | 0.2 | 51.4 | 0 (0) |
| ztz99a2 | China | 302 | 24 | 6.9 | 34.1 | 0.6 | 5.4 | 0.6 | 0.1 | 52.3 | 2 (0) |
| ztz99a2_prototype | China | 400 | 23 | 8.5 | 31.9 | 1.1 | 5.0 | 0.6 | 0.5 | 52.5 | 2 (0) |
| amx30 | France | 421 | 23 | 11.3 | 24.8 | 1.0 | 8.5 | 0.4 | 0.1 | 53.8 | 3 (0) |
| amx30_x | France | 271 | 23 | 11.2 | 24.8 | 0.7 | 9.1 | 0.8 | 0.2 | 53.2 | 0 (0) |
| amx30b2 | France | 558 | 24 | 15.6 | 22.9 | 1.1 | 8.3 | 0.4 | 0.0 | 51.6 | 3 (0) |
| amx40 | France | 521 | 24 | 13.5 | 26.3 | 0.6 | 9.2 | 0.3 | 0.0 | 50.1 | 3 (2) |
| amx40_x | France | 418 | 22 | 17.2 | 24.9 | 0.1 | 8.9 | 1.4 | 0.1 | 47.5 | 0 (0) |
| amx56 | France | 641 | 21 | 12.2 | 21.8 | 1.7 | 8.7 | 0.2 | 0.0 | 55.4 | 3 (2) |
| leclerc | France | 549 | 22 | 9.8 | 22.5 | 2.4 | 9.0 | 0.2 | 0.0 | 56.1 | 3 (2) |
| leclerc_classic_x | France | 350 | 21 | 16.2 | 22.9 | 0.2 | 8.9 | 0.9 | 0.0 | 50.8 | 1 (1) |
| leclerc_x | France | 294 | 22 | 16.4 | 23.9 | 0.2 | 9.2 | 0.0 | 0.1 | 50.1 | 0 (0) |
| leclerc_xlr | France | 651 | 21 | 11.2 | 22.0 | 2.1 | 8.8 | 0.3 | 0.0 | 55.6 | 3 (2) |
| jpz_e100_x | Germany | 284 | 19 | 23.6 | 11.8 | 0.1 | 16.3 | 0.2 | 0.0 | 48.1 | 1 (1) |
| kf41_lynx_x | Germany | 212 | 20 | 5.3 | 37.2 | 0.5 | 10.3 | 0.2 | 0.2 | 46.2 | 0 (0) |
| kf51 | Germany | 827 | 68 | 13.3 | 15.7 | 0.8 | 17.1 | 0.6 | 0.0 | 52.6 | 0 (0) |
| kf51_x | Germany | 201 | 20 | 9.8 | 11.0 | 0.4 | 12.0 | 0.3 | 0.2 | 66.3 | 0 (0) |
| kf51b | Germany | 627 | 24 | 12.8 | 7.4 | 1.6 | 8.4 | 0.3 | 0.2 | 69.4 | 0 (0) |
| leo1a5 | Germany | 364 | 23 | 11.7 | 20.8 | 2.0 | 6.8 | 0.3 | 0.4 | 58.0 | 0 (0) |
| leo2_revolution | Germany | 319 | 14 | 11.1 | 24.6 | 0.0 | 7.2 | 0.1 | 0.0 | 56.9 | 0 (0) |
| leo2_revolution_proto | Germany | 282 | 23 | 14.4 | 23.0 | 0.2 | 7.3 | 0.1 | 0.0 | 55.0 | 3 (2) |
| leo2a4 | Germany | 530 | 29 | 9.5 | 18.3 | 18.1 | 6.1 | 0.2 | 0.1 | 47.8 | 1 (0) |
| leo2a4_otco | Germany | 546 | 25 | 12.0 | 21.9 | 1.9 | 6.8 | 0.3 | 0.2 | 56.9 | 1 (0) |
| leo2a4m | Germany | 1039 | 23 | 15.8 | 20.3 | 2.1 | 6.5 | 0.2 | 0.1 | 54.9 | 1 (0) |
| leo2a4m_x | Germany | 404 | 20 | 9.6 | 23.1 | 0.6 | 6.6 | 0.2 | 0.0 | 59.9 | 0 (0) |
| leo2a5 | Germany | 715 | 32 | 15.7 | 24.2 | 2.1 | 6.1 | 0.2 | 0.7 | 51.0 | 1 (0) |
| leo2a5_a5nl | Germany | 911 | 32 | 17.5 | 22.6 | 2.4 | 5.8 | 0.8 | 0.5 | 50.4 | 1 (0) |
| leo2a5_x | Germany | 497 | 21 | 19.8 | 22.6 | 0.4 | 5.9 | 0.3 | 0.2 | 50.8 | 0 (0) |
| leo2a6 | Germany | 1004 | 23 | 20.9 | 18.5 | 2.2 | 6.0 | 0.2 | 0.4 | 51.9 | 0 (0) |
| leo2a6_x | Germany | 364 | 20 | 16.9 | 25.5 | 0.4 | 7.0 | 0.3 | 0.0 | 49.9 | 0 (0) |
| leo2a6m | Germany | 1263 | 23 | 21.3 | 19.3 | 0.4 | 5.9 | 0.2 | 0.3 | 52.5 | 0 (0) |
| leo2a6m_x | Germany | 566 | 20 | 14.4 | 22.7 | 0.5 | 6.9 | 0.3 | 0.0 | 55.1 | 0 (0) |
| leo2a7v | Germany | 722 | 24 | 18.4 | 19.4 | 1.1 | 6.3 | 0.3 | 0.3 | 54.2 | 0 (0) |
| leo2a7v_x | Germany | 513 | 22 | 12.5 | 26.2 | 0.5 | 5.9 | 0.3 | 0.2 | 54.4 | 0 (0) |
| leopard2_proto | Germany | 417 | 24 | 11.9 | 22.3 | 0.7 | 7.1 | 0.3 | 0.1 | 57.5 | 1 (0) |
| marder1a3 | Germany | 306 | 24 | 13.0 | 31.5 | 0.7 | 9.2 | 0.5 | 0.1 | 44.9 | 1 (1) |
| mbt70 | Germany | 278 | 24 | 13.1 | 22.6 | 1.6 | 6.8 | 0.2 | 0.4 | 55.3 | 0 (0) |
| spz_puma | Germany | 289 | 25 | 13.7 | 29.6 | 1.6 | 8.7 | 0.3 | 0.1 | 46.1 | 1 (0) |
| spz_puma_s1 | Germany | 221 | 22 | 8.8 | 28.9 | 0.5 | 8.9 | 0.6 | 0.1 | 52.2 | 0 (0) |
| merkava1b | Israel | 1245 | 25 → 27 | 16.6 | 9.1 | 3.3 | 8.8 | 0.2 | 0.0 | 61.9 | 1 (1) |
| merkava2b | Israel | 972 | 23 → 24 | 13.5 | 9.3 | 2.8 | 9.5 | 0.3 | 0.0 | 64.6 | 0 (0) |
| merkava2d | Israel | 1093 | 24 → 25 | 14.1 | 8.9 | 2.9 | 9.2 | 0.4 | 0.1 | 64.5 | 0 (0) |
| merkava3c | Israel | 1584 | 24 → 26 | 16.9 | 8.6 | 2.9 | 8.5 | 0.2 | 0.4 | 62.4 | 0 (0) |
| merkava3d | Israel | 1758 | 23 → 25 | 21.6 | 8.1 | 3.3 | 8.5 | 0.2 | 0.0 | 58.3 | 0 (0) |
| merkava3d_x | Israel | 348 | 22 | 12.5 | 10.6 | 0.4 | 10.8 | 0.1 | 0.0 | 65.6 | 1 (1) |
| merkava4_barak | Israel | 651 | 22 | 14.0 | 10.1 | 0.3 | 8.6 | 0.0 | 0.0 | 67.0 | 0 (0) |
| merkava4_trophy | Israel | 588 | 23 | 15.5 | 9.9 | 0.7 | 9.7 | 0.1 | 0.2 | 63.9 | 1 (1) |
| merkava4_x | Israel | 429 | 23 | 12.6 | 10.7 | 0.6 | 10.6 | 0.1 | 0.2 | 65.4 | 1 (1) |
| merkava4b | Israel | 1114 | 22 → 24 | 15.6 | 9.2 | 1.7 | 9.2 | 0.4 | 0.0 | 63.9 | 0 (0) |
| namer_ifv | Israel | 259 | 20 | 16.1 | 14.1 | 0.5 | 9.5 | 0.0 | 0.2 | 59.6 | 0 (0) |
| sabra_mk2_x | Israel | 300 | 20 | 16.1 | 19.0 | 0.4 | 12.5 | 0.7 | 0.1 | 51.2 | 0 (0) |
| ariete | Italy | 294 | 23 | 10.8 | 18.4 | 1.0 | 8.1 | 0.2 | 0.2 | 61.3 | 0 (0) |
| ariete_c1 | Italy | 405 | 23 | 12.9 | 18.5 | 0.5 | 7.7 | 0.3 | 0.0 | 60.2 | 1 (0) |
| ariete_c1_x | Italy | 541 | 20 | 21.4 | 21.4 | 0.3 | 6.9 | 0.6 | 0.0 | 49.4 | 0 (0) |
| ariete_c2 | Italy | 694 | 22 | 20.6 | 16.9 | 0.7 | 7.0 | 0.3 | 0.1 | 54.5 | 1 (0) |
| ariete_c2_x | Italy | 631 | 20 | 25.2 | 16.1 | 0.6 | 7.2 | 0.6 | 0.1 | 50.2 | 0 (0) |
| carro45t | Italy | 312 | 23 | 10.1 | 18.6 | 0.3 | 7.8 | 0.4 | 0.1 | 62.7 | 0 (0) |
| stb1 | Japan | 400 | 23 | 14.7 | 11.5 | 0.8 | 3.1 | 1.3 | 0.2 | 68.4 | 1 (1) |
| type10 | Japan | 383 | 24 | 9.2 | 10.6 | 2.1 | 8.9 | 0.3 | 0.0 | 68.9 | 1 (0) |
| type10_x | Japan | 374 | 22 | 23.1 | 12.7 | 0.9 | 10.3 | 0.7 | 0.2 | 52.0 | 0 (0) |
| type10b | Japan | 517 | 23 | 14.5 | 10.3 | 1.4 | 7.9 | 0.3 | 0.1 | 65.4 | 1 (0) |
| type74 | Japan | 172 | 24 | 9.7 | 12.1 | 1.9 | 3.4 | 0.6 | 0.0 | 72.3 | 0 (0) |
| type89 | Japan | 191 | 25 | 6.3 | 15.2 | 2.7 | 5.6 | 0.6 | 0.2 | 69.4 | 3 (2) |
| type89_light_tiger | Japan | 304 | 24 | 15.7 | 10.3 | 0.6 | 10.5 | 0.6 | 0.1 | 62.2 | 0 (0) |
| type90 | Japan | 257 | 24 | 11.9 | 14.4 | 1.7 | 5.3 | 0.2 | 0.2 | 66.3 | 2 (2) |
| type90_x | Japan | 176 | 21 | 16.7 | 14.5 | 0.1 | 4.7 | 0.7 | 0.2 | 63.1 | 0 (0) |
| type90a | Japan | 365 | 23 | 13.8 | 13.9 | 1.8 | 4.7 | 0.3 | 0.1 | 65.3 | 2 (2) |
| bwp1 | Poland | 346 | 24 | 16.0 | 10.7 | 1.2 | 9.4 | 0.7 | 0.4 | 61.6 | 1 (1) |
| pl01 | Poland | 449 | 23 | 11.1 | 11.3 | 0.8 | 10.4 | 1.0 | 0.1 | 65.3 | 1 (1) |
| pl01_105 | Poland | 462 | 25 | 11.6 | 10.9 | 0.8 | 10.1 | 0.9 | 0.3 | 65.4 | 1 (1) |
| pt91_twardy | Poland | 341 | 30 | 9.9 | 8.7 | 16.2 | 8.5 | 0.3 | 0.4 | 56.1 | 0 (0) |
| pt91m | Poland | 459 | 23 | 20.4 | 8.3 | 0.9 | 9.1 | 0.3 | 3.7 | 57.3 | 1 (1) |
| t72m1_jaguar | Poland | 579 | 23 | 16.5 | 9.3 | 0.4 | 9.1 | 0.5 | 0.2 | 64.1 | 1 (1) |
| upior | Poland | 154 | 23 | 12.0 | 11.4 | 1.0 | 11.5 | 0.1 | 0.2 | 63.7 | 1 (1) |
| bmp3 | Russia | 186 | 23 | 10.6 | 23.3 | 0.6 | 7.5 | 0.3 | 0.0 | 57.7 | 2 (1) |
| bmp3m_dragun125_x | Russia | 290 | 21 | 18.8 | 26.4 | 0.6 | 8.3 | 0.6 | 0.2 | 45.1 | 0 (0) |
| bmpt_t90 | Russia | 809 | 28 | 17.4 | 25.3 | 1.1 | 8.8 | 0.3 | 0.2 | 47.0 | 0 (0) |
| bmpt_terminator2 | Russia | 1556 | 26 | 11.3 | 26.9 | 0.3 | 10.4 | 0.1 | 0.0 | 51.0 | 0 (0) |
| kurganets25_x | Russia | 277 | 21 | 18.7 | 28.0 | 0.5 | 9.4 | 0.3 | 0.2 | 43.0 | 0 (0) |
| object695_x | Russia | 404 | 14 | 14.3 | 21.6 | 0.0 | 6.1 | 0.3 | 0.0 | 57.8 | 0 (0) |
| t14 | Russia | 472 | 22 | 14.4 | 8.8 | 0.2 | 9.8 | 1.0 | 0.1 | 65.6 | 1 (0) |
| t14_x | Russia | 809 | 19 | 17.6 | 8.2 | 0.5 | 8.6 | 0.2 | 0.0 | 64.9 | 0 (0) |
| t72b3_x | Russia | 282 | 21 | 9.0 | 27.1 | 0.1 | 10.0 | 0.0 | 0.1 | 53.7 | 1 (1) |
| t72b3m | Russia | 1437 | 30 | 25.7 | 20.4 | 4.2 | 8.1 | 0.1 | 0.1 | 41.3 | 0 (0) |
| t72b3m_x | Russia | 525 | 22 | 18.0 | 24.0 | 0.5 | 9.0 | 0.0 | 0.0 | 48.4 | 1 (1) |
| t90a | Russia | 623 | 28 | 16.9 | 24.7 | 0.4 | 9.0 | 0.4 | 0.1 | 48.5 | 0 (0) |
| t90a_vladimir | Russia | 645 | 23 | 16.0 | 25.9 | 0.2 | 9.4 | 0.3 | 0.0 | 48.2 | 0 (0) |
| t90a_vladimir_x | Russia | 390 | 23 | 19.7 | 10.1 | 0.9 | 9.5 | 0.2 | 0.0 | 59.6 | 0 (0) |
| t90a_x | Russia | 412 | 23 | 14.3 | 26.2 | 0.1 | 9.6 | 0.2 | 0.2 | 49.5 | 0 (0) |
| t90m | Russia | 1260 | 24 | 21.4 | 24.4 | 0.5 | 9.0 | 0.5 | 0.2 | 44.2 | 0 (0) |
| t90m_proryv | Russia | 1277 | 22 | 20.2 | 24.8 | 0.6 | 9.1 | 0.5 | 0.0 | 44.7 | 0 (0) |
| t90m_x | Russia | 690 | 22 | 18.7 | 25.1 | 0.6 | 9.2 | 0.2 | 0.0 | 46.2 | 0 (0) |
| t90sm | Russia | 583 | 23 | 16.3 | 26.3 | 0.3 | 10.0 | 0.3 | 0.2 | 46.7 | 0 (0) |
| t90sm_x | Russia | 481 | 22 | 20.2 | 24.0 | 0.6 | 8.7 | 0.2 | 0.0 | 46.2 | 0 (0) |
| tos1a_tagil | Russia | 439 | 14 | 12.2 | 25.9 | 0.0 | 9.8 | 0.0 | 0.0 | 52.1 | 2 (2) |
| bmp3_rok | South Korea | 349 | 25 | 13.7 | 24.4 | 0.5 | 7.7 | 0.7 | 0.0 | 53.0 | 1 (1) |
| k1a1 | South Korea | 316 | 25 | 10.4 | 18.4 | 3.5 | 4.2 | 0.4 | 0.4 | 62.7 | 2 (0) |
| k1a1_x | South Korea | 437 | 24 | 19.0 | 20.7 | 1.1 | 3.6 | 0.2 | 0.1 | 55.3 | 1 (1) |
| k2 | South Korea | 562 | 23 | 20.3 | 9.4 | 1.7 | 9.1 | 0.2 | 0.2 | 59.0 | 1 (1) |
| k21_x | South Korea | 436 | 22 | 16.7 | 26.4 | 2.5 | 8.4 | 0.2 | 0.2 | 45.7 | 0 (0) |
| k2_x | South Korea | 341 | 20 | 15.8 | 7.7 | 0.6 | 10.2 | 1.4 | 0.2 | 64.2 | 0 (0) |
| k2b | South Korea | 812 | 25 | 16.9 | 9.6 | 2.4 | 8.8 | 1.0 | 0.2 | 61.0 | 1 (1) |
| cv90 | Sweden | 130 | 25 | 8.6 | 10.5 | 0.5 | 10.6 | 0.4 | 0.3 | 69.0 | 0 (0) |
| cv90105_tml_x | Sweden | 223 | 20 | 12.3 | 12.5 | 0.6 | 13.6 | 0.2 | 0.2 | 60.4 | 0 (0) |
| cv90_mkiv | Sweden | 213 | 25 | 12.2 | 10.0 | 0.9 | 9.7 | 0.8 | 0.1 | 66.2 | 0 (0) |
| cv90_mkiv_x | Sweden | 283 | 19 | 11.7 | 11.8 | 0.5 | 13.7 | 0.5 | 0.0 | 61.8 | 0 (0) |
| strv103 | Sweden | 292 | 26 | 11.1 | 15.1 | 17.5 | 2.2 | 0.4 | 0.2 | 53.5 | 1 (1) |
| strv103a | Sweden | 151 | 25 | 7.7 | 17.9 | 17.5 | 3.4 | 0.3 | 0.2 | 53.0 | 1 (1) |
| strv122 | Sweden | 814 | 30 | 18.1 | 22.8 | 2.1 | 3.7 | 0.3 | 0.5 | 52.5 | 1 (0) |
| strv122_x | Sweden | 618 | 20 | 41.6 | 20.9 | 0.4 | 3.2 | 0.5 | 0.0 | 33.4 | 0 (0) |
| strv81 | Sweden | 447 | 24 | 12.0 | 19.1 | 1.6 | 2.9 | 0.7 | 0.3 | 63.4 | 2 (2) |
| udes03 | Sweden | 123 | 20 | 5.5 | 22.0 | 0.9 | 5.1 | 0.4 | 0.0 | 66.1 | 0 (0) |
| ajax_x | UK | 345 | 20 | 18.3 | 27.0 | 0.2 | 9.3 | 0.4 | 0.0 | 44.8 | 1 (1) |
| ares_apc_x | UK | 137 | 22 | 4.6 | 26.2 | 0.3 | 9.0 | 0.2 | 0.0 | 59.7 | 0 (0) |
| centurion3 | UK | 390 | 22 | 10.1 | 16.9 | 1.2 | 11.4 | 0.4 | 0.0 | 60.1 | 2 (2) |
| centurion5 | UK | 530 | 25 | 11.3 | 16.2 | 0.9 | 10.9 | 0.4 | 0.0 | 60.3 | 2 (2) |
| challenger1 | UK | 571 | 26 | 20.4 | 14.7 | 1.0 | 10.1 | 0.2 | 0.2 | 53.5 | 0 (0) |
| challenger1_x | UK | 396 | 20 | 16.2 | 13.4 | 0.2 | 9.4 | 0.3 | 0.1 | 60.4 | 0 (0) |
| challenger2 | UK | 1285 | 22 | 20.4 | 16.3 | 1.1 | 9.6 | 0.6 | 0.0 | 52.0 | 0 (0) |
| challenger2e | UK | 1397 | 24 | 19.2 | 17.2 | 1.1 | 9.5 | 0.5 | 0.0 | 52.6 | 0 (0) |
| challenger_3 | UK | 362 | 25 | 15.2 | 16.5 | 1.0 | 11.6 | 0.5 | 0.1 | 55.1 | 0 (0) |
| challenger_3x | UK | 898 | 24 | 22.5 | 15.1 | 0.9 | 10.6 | 0.5 | 0.0 | 50.3 | 0 (0) |
| chieftain5 | UK | 653 | 23 | 11.7 | 16.9 | 1.0 | 12.1 | 0.3 | 0.2 | 57.8 | 0 (0) |
| chieftain5_x | UK | 425 | 21 | 21.1 | 16.1 | 0.6 | 11.2 | 0.9 | 0.0 | 50.2 | 0 (0) |
| chieftain_mk10 | UK | 515 | 22 | 10.6 | 17.9 | 0.6 | 12.7 | 0.2 | 0.0 | 58.0 | 0 (0) |
| chieftain_mk10_x | UK | 688 | 20 | 22.0 | 15.8 | 0.5 | 11.0 | 0.6 | 0.0 | 50.1 | 0 (0) |
| fv4034 | UK | 1129 | 23 | 17.2 | 18.0 | 0.8 | 10.2 | 0.5 | 0.1 | 53.2 | 0 (0) |
| fv510 | UK | 499 | 22 | 14.0 | 23.0 | 0.7 | 7.4 | 0.4 | 0.0 | 54.5 | 0 (0) |
| fv510_milan | UK | 601 | 22 | 16.5 | 21.8 | 0.5 | 6.8 | 0.6 | 0.3 | 53.5 | 0 (0) |
| fv510_milan_x | UK | 283 | 21 | 16.0 | 33.9 | 0.1 | 8.5 | 0.7 | 0.0 | 40.7 | 0 (0) |
| vickers_mk1 | UK | 301 | 23 | 9.7 | 18.5 | 0.7 | 13.1 | 0.2 | 0.2 | 57.7 | 1 (1) |
| abramsx | USA | 1175 | 25 | 16.6 | 20.0 | 0.5 | 8.3 | 0.6 | 0.0 | 53.9 | 0 (0) |
| griffin50_x | USA | 226 | 19 | 13.6 | 25.5 | 0.5 | 12.3 | 1.7 | 0.0 | 46.4 | 0 (0) |
| griffin_viper | USA | 181 | 18 | 13.6 | 26.7 | 0.4 | 12.9 | 0.6 | 0.1 | 45.8 | 0 (0) |
| m1a1 | USA | 588 | 26 | 14.3 | 20.5 | 0.9 | 9.3 | 0.2 | 0.4 | 54.3 | 2 (0) |
| m1a1ha | USA | 969 | 27 | 22.0 | 18.6 | 1.0 | 8.4 | 0.3 | 0.3 | 49.5 | 2 (0) |
| m1a2 | USA | 1002 | 26 | 20.6 | 18.8 | 1.8 | 8.3 | 0.4 | 0.3 | 50.0 | 2 (0) |
| m1a2_sepv2 | USA | 993 | 27 | 21.9 | 18.4 | 2.0 | 8.1 | 0.3 | 0.3 | 49.0 | 7 (1) |
| m1a2_sepv2_x | USA | 1160 | 15 | 41.7 | 17.3 | 1.1 | 6.0 | 0.6 | 0.0 | 33.3 | 1 (1) |
| m1a2_sepv3 | USA | 1064 | 33 | 21.3 | 16.2 | 9.6 | 7.3 | 0.2 | 0.4 | 44.9 | 3 (0) |
| m1a2_sepv3_x | USA | 1403 | 15 | 39.5 | 17.5 | 1.1 | 6.2 | 0.6 | 0.0 | 35.1 | 1 (1) |
| m1a2_tusk | USA | 1179 | 28 | 25.2 | 17.2 | 2.1 | 7.6 | 0.5 | 0.4 | 47.0 | 7 (0) |
| m1a2_tusk_x | USA | 960 | 14 | 35.5 | 19.5 | 0.0 | 6.8 | 0.7 | 0.0 | 37.5 | 1 (1) |
| m1a2_x | USA | 603 | 14 | 28.6 | 22.1 | 0.0 | 7.7 | 0.2 | 0.0 | 41.5 | 1 (1) |
| m1a3 | USA | 602 | 23 | 18.4 | 19.7 | 0.5 | 9.7 | 0.2 | 0.0 | 51.5 | 0 (0) |
| m2a2_bradley | USA | 302 | 27 | 16.5 | 17.7 | 3.3 | 12.5 | 0.4 | 0.3 | 49.4 | 0 (0) |
| m3a3_bradley | USA | 560 | 27 | 19.9 | 17.3 | 1.3 | 11.5 | 0.4 | 0.3 | 49.4 | 0 (0) |
| m46_patton | USA | 492 | 29 | 10.1 | 14.8 | 0.6 | 9.0 | 0.4 | 0.0 | 65.2 | 1 (1) |
| m47_patton | USA | 439 | 27 | 9.5 | 15.3 | 0.9 | 9.3 | 0.5 | 0.2 | 64.4 | 2 (2) |
| m48 | USA | 378 | 23 | 10.7 | 14.8 | 2.2 | 9.5 | 0.5 | 0.0 | 62.2 | 0 (0) |
| m551_sheridan | USA | 270 | 23 | 11.0 | 13.5 | 4.5 | 9.8 | 0.3 | 0.0 | 60.9 | 0 (0) |
| m551a1_tts | USA | 583 | 21 | 16.3 | 13.0 | 4.0 | 9.4 | 0.4 | 0.0 | 57.0 | 0 (0) |
| m60a1 | USA | 505 | 24 | 10.8 | 14.1 | 0.9 | 9.3 | 0.6 | 0.4 | 63.9 | 0 (0) |
| m60a2 | USA | 453 | 24 | 12.6 | 14.6 | 1.2 | 9.0 | 0.5 | 0.1 | 61.9 | 0 (0) |
| m60a3 | USA | 619 | 24 | 11.0 | 14.2 | 0.9 | 9.1 | 0.6 | 0.3 | 63.9 | 0 (0) |
| bmp2 | USSR | 278 | 23 | 14.5 | 23.9 | 0.5 | 7.8 | 0.4 | 0.0 | 52.9 | 1 (1) |
| kv2 | USSR | 631 | 27 | 12.0 | 12.4 | 0.4 | 10.3 | 0.2 | 0.2 | 64.5 | 3 (2) |
| t62mv1 | USSR/Russia | 246 | 23 | 9.3 | 25.1 | 0.5 | 9.2 | 0.3 | 0.1 | 55.5 | 1 (0) |
| t62mv1_x | USSR/Russia | 205 | 21 | 7.4 | 25.7 | 0.2 | 9.3 | 0.0 | 0.0 | 57.4 | 1 (0) |
| t64bv1 | USSR/Russia | 479 | 23 | 15.4 | 27.6 | 0.2 | 10.9 | 0.2 | 0.2 | 45.5 | 2 (2) |
| t72b_1987_x | USSR/Russia | 332 | 22 | 15.8 | 25.5 | 0.6 | 9.4 | 0.0 | 0.1 | 48.5 | 1 (1) |
| t72bu | USSR/Russia | 506 | 25 | 17.8 | 25.5 | 0.4 | 9.4 | 0.3 | 0.2 | 46.3 | 0 (0) |
| t72bu_x | USSR/Russia | 224 | 21 | 8.4 | 26.7 | 0.4 | 9.8 | 0.0 | 0.1 | 54.7 | 2 (2) |
| t80 | USSR/Russia | 271 | 23 | 9.8 | 29.6 | 0.5 | 12.1 | 0.3 | 0.0 | 47.7 | 1 (0) |
| t80b | USSR/Russia | 279 | 25 | 10.4 | 29.5 | 0.4 | 11.9 | 0.3 | 0.2 | 47.4 | 1 (0) |
| t80bv | USSR/Russia | 485 | 23 | 19.0 | 26.8 | 0.4 | 10.8 | 0.2 | 0.1 | 42.8 | 1 (0) |
| t80u | USSR/Russia | 389 | 26 | 15.1 | 26.9 | 0.6 | 10.8 | 0.4 | 0.1 | 46.0 | 1 (1) |
| t80u_x | USSR/Russia | 164 | 21 | 6.0 | 29.1 | 0.3 | 11.5 | 0.0 | 0.0 | 53.1 | 1 (1) |
| t90 | USSR/Russia | 790 | 26 | 17.3 | 24.8 | 0.4 | 9.0 | 0.4 | 0.2 | 47.9 | 0 (0) |
| t90_x | USSR/Russia | 539 | 23 | 19.6 | 21.6 | 0.5 | 8.0 | 0.0 | 0.1 | 50.2 | 1 (1) |
| t90a_burlak | USSR/Russia | 753 | 26 | 16.7 | 26.3 | 0.5 | 9.5 | 0.4 | 0.1 | 46.5 | 0 (0) |
| t90a_burlak_x | USSR/Russia | 309 | 22 | 13.0 | 23.7 | 0.3 | 8.7 | 0.0 | 0.2 | 54.2 | 2 (2) |
| t90ms | USSR/Russia | 688 | 23 | 11.5 | 27.4 | 0.5 | 10.0 | 0.5 | 0.1 | 50.0 | 0 (0) |
| t90ms_x | USSR/Russia | 558 | 24 | 15.2 | 24.2 | 0.4 | 9.1 | 0.0 | 0.1 | 50.9 | 1 (1) |
| leo2a6_ua | Ukraine | 1416 | 31 | 17.8 | 15.3 | 21.0 | 4.8 | 0.2 | 0.1 | 40.9 | 0 (0) |
| t84 | Ukraine | 550 | 26 | 17.5 | 24.9 | 4.4 | 10.6 | 0.1 | 0.1 | 42.4 | 1 (0) |
| ua_challenger2 | Ukraine | 1486 | 23 | 19.9 | 16.8 | 0.7 | 9.3 | 0.5 | 0.1 | 52.6 | 0 (0) |
| ua_m1a1 | Ukraine | 1309 | 28 | 19.1 | 15.4 | 14.8 | 6.8 | 0.2 | 0.4 | 43.3 | 2 (0) |
| ua_m1a1_x | Ukraine | 1045 | 14 | 31.9 | 19.0 | 0.0 | 6.7 | 0.1 | 0.0 | 42.3 | 1 (1) |
| ua_m2a3_bradley | Ukraine | 367 | 26 | 20.3 | 16.8 | 3.5 | 11.5 | 0.3 | 0.4 | 47.2 | 1 (1) |
| ua_t64bv | Ukraine | 473 | 30 | 13.4 | 23.5 | 12.7 | 9.4 | 0.2 | 0.0 | 40.8 | 1 (1) |
| ua_t80bv | Ukraine | 504 | 22 | 14.4 | 27.1 | 0.5 | 11.0 | 0.2 | 0.1 | 46.6 | 1 (0) |
| ua_t80u_kursk | Ukraine | 435 | 23 | 10.9 | 28.0 | 0.5 | 11.5 | 0.2 | 0.1 | 48.8 | 0 (0) |
| ua_t84_oplot_m | Ukraine | 518 | 24 | 17.6 | 25.8 | 0.6 | 10.1 | 0.2 | 0.1 | 45.5 | 1 (1) |

## Receipts

- `tools/material-roles-audit.mjs --json --md` before (base) and after (this branch): the two totals rows above;
  `--ids` runs per family during the fixes; `--dump` JSON lines for the evidence.
- `src/vehicles/appearanceAudit.selftest.mjs`: FSP-06 block pins the role split on real builds of merkava3c /
  merkava4b / leclerc / k2b / carro45t and the +2 material bound (dated 2026-09-25).
- `src/vehicles/profiles/leclercGunHousingRig.selftest.mjs`: boot rows now in `gunMountCanvasSkin` (dated).
- `src/vehicles/tankFactoryStaging.selftest.mjs`: merkava1b material-inclusive golden repinned (dated).
- Paint / camo receipts unchanged and green: authoredPaintCatalog, brandCamo, broadFixedStockPaint,
  burlakFixedSidePaint, materialPainterWorker, camoPolicy, factoryCamo, garageWorkshopMaterials, materialQuality,
  battleGeometrySharing, runningGearFinish, wheelPaintFloor, t90XCanvasFinish and the Merkava / Leclerc / Ariete /
  K2 / K1A1 X / AMX family receipts (74 receipts, exit codes in the lane log).
- `npm run typecheck`, `npm run attribution:check`, `tools/public-repo-hygiene.selftest.mjs`,
  `tools/wheel-review.mjs --all --gate` (192 tanks, 0 flagged — the wheels' rubber is untouched).
- Per-id chain for the 17 re-roled ids: `presentation-centering --update --ids` (no anchor moved) →
  `gen-combat-anatomy` + `gen-vehicle-marking-seats` (only the Merkava groups changed: the pale kit had been
  authored on the `hull`/`turret` **armor** buckets, so moving it to canvas takes those tarps and packs out of the
  hit shell, matching the non-pale siblings that already carried them on `turretCloth`) → `genIcons` (angle / top /
  side for the 17, every view for the four Merkavas) → `tank:anatomy:check` (combat-anatomy current, marking
  seats current, combatAnatomy receipt, module-hit 0 FAIL, tank-assets-check re-run after the Merkava views) →
  `presentation-centering --check --ids` (PASS, 0.00 px residual).
