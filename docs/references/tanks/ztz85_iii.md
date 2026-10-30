# ZTZ-85-III — reference packet

## §263 ground-up rebuild on the published Type 85 record (owner 2026-10-28) — CURRENT

Owner, verbatim, on seeing the 262 renders: "yeah going to need a totally new ztz 85 III". The release 248-262 build
(below, kept as history) was lofted to a fused, low-confidence print: a 4.55 m slab turret reaching over the engine deck,
a bow 0.67 m short of the published nose, the first road wheel 1.48 m behind it and no ERA. It is retired whole.

Builder: `src/vehicles/profiles/ztz85iii.ts`; combat envelope `src/vehicles/profiles/ztz85iiiArmor.ts`; fixture
`src/vehicles/profiles/ztz85iii.selftest.mjs`; gun-in-mantlet receipt `src/vehicles/cnGunMantlet.selftest.mjs`.

### Sources
| Key | Source | Used for |
|---|---|---|
| TAFV-85 | tank-afv.com/coldwar/China/type-85-mbt.php | Type 80-derived hull lengthened to ~6.37 m; beak nose; breakwater removed for the ERA; headlights in armoured covers by the front mudguards; six panels of thick rubber skirts; blended hull stowage; raised engine deck; rear drums; six dual rubber-tyred wheels, the larger front gap, three return rollers, rear sprocket; welded hexagonal turret, "pig snout" mantlet under a tarpaulin, gunner's sight left on the roof, coax right, commander's cupola right; smoke dischargers on the front faces; 85-III (1995): 1000 hp, ERA package, the 125 mm of the 85-IIM |
| WP-80/88 | en.wikipedia.org/wiki/Type_80/88_main_battle_tank | hull 6.325 m; gun forward 10.369 m (85-III); width 3.372 m; height 2.29 m; 44 t; crew 3 (autoloader) |
| WT-85III | forum.warthunder.com "Type 85-III: The 85's last hurrah" | 2.3 m height, 3.4 m width, 42.5 t, 1000 hp, the raised engine compartment, the 12.7 mm on the commander's hatch |
| Photo P | SinoDefence, "Type 85-III prototype" (via TAFV-85) | left side from the front: six dual wheels, rear sprocket, upper run, angular front mudguards, the welded turret, its side basket and shoulder smoke dischargers, the 12.7 mm on the cupola |
| Photo E | "Type 85 with its distinctive welded composite armour turret and ERA" (via TAFV-85) | front: three rows of glacis bricks, two rows on each turret front face, deep ribbed rubber skirts, headlight pairs at the plate's upper corners |
| Photo M | "Type 85-IIM" (via TAFV-85), right side | proportions: six 0.70 m wheels at 0.89 / 0.92 / 0.73 / 0.73 / 0.78 m behind a 1.17 m bow overhang, idler and sprocket heights, turret over the third wheel, skirt to the wheel tops, the rear drum |
| Photo A | "Type 85-IIAP" front (via TAFV-85) | cupola with the IR searchlight and the 12.7 mm, the gunner's hatch, the canvas mantlet, the smoke banks |
| Plan T | "Type 85-II AP turret" plan drawing (via TAFV-85) | the hexagon: front faces about 40 degrees off the axis to a 0.8 m snout, width/length about 0.9 |
| Plates | TAFV-85 side plates "Type 85-III prototype", "Type 85-IIM ERA", "Type 85-II AP" | the turret's side baskets and smoke banks, the evacuator a little forward of mid-tube, the rear drum |

The photographs and plates are local study material only (`~/cot-lanes/cn-262-refs/z85-refs/`, never committed).

### Gap table (before = releases 248-262 on this branch's base; after = release 263)
| Item | Type 85-III source | Before | After |
|---|---|---|---|
| Hull length / gun forward | 6.325 m / 10.369 m | 6.40 m body (bow toe at +2.50, 0.67 m short) / 8.43 m drawn | 6.33 m stern plate to beak / 10.37 m to the muzzle |
| Width / height | 3.372 m / 2.29 m | 3.45 m / 2.30 m at a raked turret roof | 3.37 m over the fenders / roof 2.13 m, cupola crown 2.28 m, the 12.7 mm on its post above it |
| Nose and glacis | T-54-lineage beak, breakwater removed for ERA; two rows of large bricks on the upper glacis (Photo E) | 17-degree composite plate to a 0.90 m toe | 30-degree upper glacis meeting the lower plate 0.80 m off the ground; two rows of 0.40 x 0.38 m reactive bricks (10) over its upper part |
| Hull and deck | Type 80 hull; blended stowage; raised engine deck (1000 hp) | deck 1.41-1.44 flat to the stern | sponsons to ±1.56 with four compartment doors a side, roof 1.45, engine deck raised to 1.53 behind the turret's sweep, two louvred grilles, fan intake, rear louvre, exhaust on the left wall |
| Running gear | six dual rubber-tyred wheels, larger front gap, 3 return rollers, rear sprocket | 0.67 m wheels at +1.02..-2.88 | 0.70 m wheels at 1.99 / 1.10 / 0.18 / -0.55 / -1.28 / -2.06, idler 2.68, sprocket -2.87, three rollers, 0.55 m track on a 2.72 m gauge |
| Skirts and mudguards | the 85-III prototype (Photo P, Plates): no skirts, the upper run and three return rollers in the open under a narrow fender; front mudguards angled down toward the idler | 7-bay skirt at 3.45 m, bow flaps | fender shelves to ±1.685 with a 5 cm turned-down edge, the upper run and return rollers in the open; front guards sloping down and forward over the idlers; rear flaps |
| Turret | compact welded hexagon, "pig snout" mantlet; the roof falls toward the mantlet over the front 40% | 4.55 m polyMultiLoft slab over the engine deck, twin bustle racks | 2.44 m wide, 2.62 m long welded hexagon: front faces 40 degrees off the axis leaning back to a 0.50 m brow, a long shallow front slope rising to the flat 0.68 m roof, its belt 5 cm over the deck (clear of the driver's hatch at every yaw), ring over the third wheel |
| Turret ERA | two rows a face (1995 package) | none | a row of three bricks on each front face and a row of two on the front slope above it |
| Stowage | railed side baskets nearly the turret's height (horizontal rails on posts), rear basket, snorkel | twin bustle racks, slat baskets | five-rail baskets 0.48 m tall on the rear half of both walls and across the rear, rolls and the stowed snorkel; the fleet decor keeps off the roof and the turret sides and adds no second smoke kit, whip, lamp or drum |
| Roof stations | a broad raised commander's cupola right with the 12.7 mm on a tall cradle and the IR lamp; a low hooded gunner's sight left; one antenna and the wind sensor; 2x2 smoke clusters at the cheek corners | cupola right, ISFCS box, radio mast | a 0.84 m cupola ring right with its day/night sight, IR searchlight and the 12.7 mm on a 0.24 m post; gunner's low hooded sight on the front slope and his hatch left; vent; wind sensor; one antenna; a 2x2 smoke cluster at each cheek corner, raised about 30 degrees |
| Gun | 125 mm smoothbore, thermal sleeve, evacuator a little forward of mid-tube; a short canvas cover over the mount | 4.03 m tube | 6.195 m from the trunnion (bore axis 1.77 m), evacuator at 3.62-4.26, five sleeve clamps, the cast mount 7 cm proud and a 0.36 m canvas cover tapering 0.46 to 0.25 m under a clamp band |
| Rear | drums on the rear plate | stern log experiments | two 200 L drums across the stern on brackets, lights, tow hooks |

Combat envelope: the plates follow the new surfaces at the tier's former strengths (glacis 80, cheeks and mantlet 137,
the front slope 100, sides 40/51, rear 28/40, roofs 23; no skirts); first-generation reactive plates (KE -5%, CE
+280 mm, the Kontakt-1 class) cover the glacis bricks, both turret faces and the front slope's bricks.

Fairness (balance range, shown-tier I MBT peers; ~/cot-lanes/cn-262-refs/tools/fairline.mjs): before (the 248-262
build) mean 0.848, 3/11 pairs inside 0.2-0.8; after mean 0.894, 2/11. Stats unchanged; the pair moves are single-game
steps at 12 games a pair. Both builds outclass tier I: the 1995 125 mm autoloaded tank sits beside the T-62 and the
M48A5, so its placement (Main's and the owner's call) is the fairness lever, not its armour. Crew of three (driver front left, gunner left,
commander right); the carousel under the turret.

### Integrator reds on fa28861109 (264, Main 2026-10-29)
- **ERA registration** (`eraGameplayRegistration`, fleetPassLow): the slope pairs were drawn in the turret's visual cluster
  and bound by nearest plate after the L/R narrowing, so every brick went to `turret_era_L/R` and the single centred
  `turret_slope_era` zone had no visual cassettes. The pairs are now tagged explicitly (`destructibleCluster`) with
  their own `turret_slope_era_L/R` zones, one per side like the face rows.
- **Gun articulation** (`gunArticulation`): the tube began at 0.40 m, 0.10 m ahead of the cast mount's face (the audit's
  limit), so the pitching housing read as detached. The tube now runs back to 0.24 m inside the mount, under the cover.
- Blind critic on the mount junction (Node raster frames, ~/cot-lanes/cn-262-refs/z85-work/mantlet-fix*): the canvas
  cover's rear ring rose through the mount's top face and its mouth showed a dark slot round the tube. The cover's rear
  rim now sits inside the mount face (0.46 x 0.30 m), and the clamp band (r 0.137 m) closes the mouth over the cloth.

## History: the §5.248 build (releases 248-262), retired by §263

### Order
§5.248 owner order: donor-clone (type59 + kit package) replaced by a complete
first-party §K build. Spec true-up per the round brief (overall 9.82 -> 10.28,
Janes bracket).

### Instruments
- Print: public/models/community-candidates/ztz85iii_manako.glb — FUSED
  CC-BY-NC conversion, WHOLE-VIEW ONLY, hull LOW-CONF (ATTRIBUTION §5.248
  batch B). Orientation resolved this round: length on raw X, nose +X ->
  yawOffset -PI/2 (registered in tools/vertex-extract.mjs + the fidelity map).
- Published: docs/references/tanks/scout-gen2-type85.md (tank-afv.com +
  army-guide.com): overall 10.28 gun-fwd / hull 6.33 / width 3.45 /
  height 2.30 / 41.0 t.
- Measure artifacts: docs/references/vertex/ztz85_iii.json (post-yaw-fix).

### Spec true-up (src/vehicles/china.ts)
dims: 6.40 / 10.28 / 3.45 / 2.30 (was 6.40 / 9.82 / 3.45 / 2.45)
- silhouetteOverallLengthM 8.43: MUZZLE LAW (type59 precedent) — the tube is
  built to the print's extracted +4.43 muzzle; published 10.28 stays the
  gameplay/UI datum.
- silhouetteHeightM 2.53: t62mv1 DShK-height convention — the mounted W-85
  cluster carries the gate's P95 trace; its columns sit inside the print's
  own 2.5-2.75 roof-cluster band.
- variant() now strips donor-inherited silhouette* keys (t62mv1's
  7.06/9.96/2.74 rows had ridden type59 -> ztz85_iii and were silently
  gating the clone).

### Build (src/vehicles/profiles/china.js — buildZTZ85III)
Ground-up: loftHull station hull (deck 1.41-1.44 flat to the stern, 17-deg
composite glacis, belly 0.375), six-wheel running gear phased to the print's
contact line (-2.88..+1.02, rear sprocket, §B4-clear idler/flap spacing),
full-length fender shelf + 7-bay skirt at the 3.45 width datum, welded
polyMultiLoft turret (near-vertical belt -> raked flat cheeks; roof RAKES
REARWARD per the print: cheek apex 2.30 = published datum, bustle 2.18),
side + rear slat baskets, cupola-right W-85 (compact z-footprint), ISFCS-212
sight box, 2x4 smoke banks, staged radio mast + swept whip, 125 mm with
mid-tube evacuator and §B3.1 muzzle bore, '85-III' flank decals.

### Gate history (tools/geometry-gate.mjs; whole|dims|floaters)
- BASELINE (donor clone vs new print): min 0 — whole 15.3, dims 0, floaters 0
  (shots/china-wave/ztz85_iii-gate-baseline.json)
- first ground-up: whole 83.7, dims 0 (donor silhouette rows), floaters 100
- + orientation/scale/silhouette fixes, muzzle law, mast: 87.4 / 100 / 100
- FINAL (x2 BIT-IDENTICAL consecutive runs): min 87.4 = whole 87.4,
  dims 100, floaters 100 (shots/china-wave/ztz85_iii-gate-final.json)

### Reverted experiments (receipts)
- FAT vertical mast stack: whole 87.4 -> 85.6. REVERTED.
- Print-true AFT-RAKED mast: floaters 0 (thin raked rod breaks pose
  contiguity) + P95 3.93 volatility. REVERTED.
- Stern unditching log at -4.32 (print stern mass): whole 87.4 -> 86.7/87.0
  (its 1.28 line sits under the print's 1.41 band). REVERTED.
- Whip trim 0.95 -> 0.80: part of the -0.4 run-11 regression. REVERTED.

### Residual (documented instrument ceiling)
The print runs ~+9% tall against its own width datum in the turret band
(roof 2.5-2.59, cluster 2.75 vs published 2.30) and carries a 0.2 m-thick
fused mast rod and a gapless solid underbody. Published dims are the ratified
anchor (§K.1 / round brief: prints are WEAK silhouette instruments); the
remaining whole-view gap (87.4 vs 90) is print stylization the published
band forbids chasing. Every other gate component is 100.

### Guards
- type59 donor byte-held: tmp-hashgeo ea1ff837 before AND after (identical).
- type99a byte-held: 7f613788 before AND after (identical).
- Resident china kit (mount/armorCassette/addChineseRoofSuite/addSmokeBanks/
  addRearFuelDrums/addZTZ99AOraclePackage + the type99a profile row):
  byte-identical to HEAD.
- track-clip-audit --exact --strict: 0/0 (band + shoes + sweep).
- npm test: GREEN (final state).
- Final build hash: ztz85_iii b888d2f8 (54 meshes, 73547 verts).

### Evidence
- shots/china-wave/after/ztz85_iii/ — 14-view photoclass + hero/muzzle shots
- shots/china-wave/diag/ztz85_iii-*.png — harness ref|proc overlay masks
- shots/china-wave/ztz85_iii-gate-{baseline,final}.json

### §5.266 FIX ROUND (critic 7.2 -> ordered surgical list, 2026-08-17)
Verdicts context: identity landed (turret reads, family strip PASS); gap =
buried gear + hidden marks + nose doghouse + pale rim + bare lamps.
1. SKIRT RAISE: ruSkirtBand yBot 0.45 -> 0.80 (lip 0.78) — the six-wheel run
   reads side-on (before/after pair shots/china-fix1/).
2. MARKS VISIBLE: the mid-wall seats reseated onto the shell BEHIND the
   turretDark basket backing (the marking ray sees only the 'turret'
   bucket).  Star + both numerals re-authored on the exposed forward flank
   band (census receipts: insignia z +0.48..+0.68, numerals z +0.21..+0.55,
   both sides, below the smoke banks).
3. DOGHOUSE TUCK: saddle box shrunk/lowered (0.58x0.50 proud -> 0.54x0.40
   buried at z 0.36), brow plate deleted, IR pod tucked onto the shoulder.
4. CROWN RIM: crownRimTrim() dark weld-trim band dresses the pale
   polyMultiLoft lip (2 mm proud — mask-neutral).
5. LAMPS: twin guarded pods — brush-guard frames (uprights + wrap bars)
   around the white pair and the IR drum.
6. BASKETS: flank backing slatted open (4 slats, shell carries the mask).
   The REAR backing stays solid: a slatted rear was built and measured -0.3
   on the rear gate view (the print's bustle band is solid) — REVERTED.
Recovery work holding the gate at the raised-skirt state: fender bins up on
the print's 1.40-1.45 line + left-forward bin added, mast-foot junction box,
ISFCS head raised to 2.41 (P95-safe), deep stern corner flaps (§B4-clear),
silhouetteHullLengthM 6.47 row (flap-inclusive trace; print's own 6.49).
End-column 2 cm nudges were tried and REVERTED (-0.1 whole, no dims gain).
GATE: 87.4 held (x2 bit-identical), dims 100, floaters 100; §B4 0/0 strict;
npm test green; donors ea1ff837/7f613788 byte-held.  FINAL HASH: 13f0c8d7.

Blind critics (Agent subagents against Photos P, M, E, A, Plan T and the plates, renders at matched angles): round 1
6/10 and 6/10 FAIL (black skirts over the run, a long funnel mantlet, ERA bricks mirrored inside out so they read as
dark recesses, a level roof, a second decor smoke kit and roof cargo, a low MG); round 2 7/10 and 7/10 PASS; round 2's
notes taken (turret 5% wider, 6 cm taller and 0.13 m longer, 2x2 smoke clusters, taller baskets, a broader cupola,
sloped front guards, larger glacis bricks); round 3 7/10 PASS (its notes pull against earlier rounds' on the brick size
and the MG's height, so the geometry is frozen there). Kept by ruling: the national-standard road wheel (owner 2026-10-28: modern
tanks keep the national standard) and the game's drone stand and fleet field stowage.
