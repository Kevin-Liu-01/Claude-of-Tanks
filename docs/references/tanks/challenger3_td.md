# Challenger 3 TD (`challenger3_td`) — run packet

## Current status

- Updated: 2026-10-27 (release 262 lane `item/cr3td-262`).
- Owner request: 2026-10-27, verbatim: "add these new tanks using our rigoorous tank generation workflow". Main relayed
  the second ruling the same day, verbatim: "challenger 3 td should get a tonn of ghillie as well".
- IDs and display names: `challenger3_td`, "Challenger 3 TD" (aliases: Challenger 3 Technology Demonstrator,
  Challenger 3 ATD, CR3 TD, RBSL demonstrator).
- Implementation status: IN PROGRESS (see the round log).
- Qualification status: NOT RUN (see the evidence matrix).
- Publication status: lane branch only; integration through Main (release 262).
- Worktree / branch / baseline commit: `.claude/worktrees/dazzling-engelbart-21c8ce`, `item/cr3td-262`, from
  `origin/main` `7d045a7588`.
- Current next action: see the round log.
- Blocking choices / known failures: none blocking; the dimension conflicts below are recorded, not resolved.

## Scope and preservation

- Mode: **independent new tank from a supplied GLB** (README route "New tank from this GLB; name it X"). A new exact
  id; `challenger3` and `challenger3_proto` are preserved unchanged.
- Identity check (Stage 0, 2026-10-27). Neither existing Challenger 3 is the 2021 demonstrator:
  - `challenger3_proto` ("Challenger 3 Prototype", tier VIII, design status prototype) was `challenger_3`, built
    2026-08-06 from 42manako's CC-BY-NC "Challenger 3" print (`docs/references/tanks/challenger_3.md`): Trophy APS side
    modules, a roof RWS (an M2 in place of the print's Boxer 30 mm kit), a front-only skirt, a basket bustle. Its packet
    never names the demonstrator, DSEI or 2021.
  - `challenger3` ("Challenger 3", tier X, aliases CR3X) was `challenger_3x` (renamed in the 2026-09-15 naming pass):
    the same builder plus the fictional heavy package (`buildChallenger3XPackage`: glacis, skirt and turret ERA, slat
    cage, sensor mast; 76 t, 1,800 hp).
  - The TD oracle shows neither Trophy nor a roof weapon station, full-length stepped skirts, and the TD's sight fit.
  Main was told before the build (SendMessage, 2026-10-27).
- Owned files: `src/vehicles/profiles/challenger3Td.ts` (new); the TD's rows in the shared registries listed in the
  handoff. Integrator: Claude of Tanks Main.
- Protected originals: `challenger3`, `challenger3_proto` (builder `buildChallenger3` untouched; their spec rows
  untouched), every other Challenger family id.
- Explicitly excluded: the DSEI 2021 stand fit with the concept Trophy MV (that is `challenger3_proto`'s look), the
  2024 pre-production prototypes.

## Source and comparison contract

- Raw path: `~/cot-lanes/new-tank-refs-262/challenger_3_td_mbt.glb` (outside the repository; never staged).
- Raw SHA-256: `3a4b3fbbe52aad3e4d6f4d7d8b2ad0ba8952fc3498cf82cd05e960be60659f98`, glTF 2.0 binary, 24,684,964 bytes.
- Credits: "Challenger 3 TD MBT" by Jeyhun1985 (https://sketchfab.com/Jeyhun1985),
  https://sketchfab.com/3d-models/challenger-3-td-mbt-4deed3c5fafc4b7cbecc8fd51a4c7142, CC-BY-4.0 (the embedded asset
  extras; the page was not re-verified live). Measurement oracle only: no mesh, texture or derived render of it ships.
- Source limitations: an OBJ conversion (`Challenger 3 TD.obj.cleaner.materialmerger.gles`, Sketchfab 0.18.0): 27
  unnamed meshes `Object_2..Object_28` merged by material (16 materials, 36 textures), 158,400 triangles. No semantic
  hull/turret/gun nodes: component ownership is by material and bounds only (turret = `Object_22..26`, gun =
  `Object_20` + `Object_6`, coax `Object_3`, tracks `Object_5`/`Object_8`, whips `Object_19`); the turret material also
  carries the basket interior. Fused-ownership limits apply to any component gate.
- Approved target: the supplied model (the TD in its trials fit, no APS, no roof weapon), cross-checked against the
  real-vehicle sources below.
- Conversion: none; the GLB is read directly (three r-GLTFLoader with textures stripped).
- Frame (source-only): the Sketchfab root matrix (Z-up to Y-up) gives +Z forward (muzzle at +6.905), +Y up, +X the
  hull's left (commander's sight and cupola at -x, the vehicle's right, as in every photograph). Translation
  `[0, +0.007, +0.195]` (track underside to 0; the fender span 3.848 / -4.237 centred). One declared uniform scale,
  **1.10**: the Challenger family's installed size (the 248 combat-scale ruling; `challenger3` and `challenger3_proto`
  draw at 1.10 through their rig). The TD is authored directly at that size; it has no rig scale.
- Datums (oracle metres, before the shift): ground 0 (track underside -0.007); belly 0.575; sponson floor 1.33; deck
  1.76-1.79 forward, engine deck 1.85-1.92; nose 3.42 at 1.30-1.35; fenders 3.848 / -4.237; rear plate -4.02; drums to
  -4.884. Turret bearing (0, 1.80, 0.451) from the concentric race and basket circles (r 0.823 at 1.05, 1.118 at 1.45,
  1.151 at 1.60). Bore line y 2.031; trunnion inferred at z 1.55 (fused mesh: 0.85 m behind the mantlet face).
- Published dimensions versus source (conflicts recorded, not resolved):
  | Quantity | Published | Oracle (1.0) | Note |
  | --- | --- | --- | --- |
  | Length, gun forward | 11.55 m (MoD, CR3); 11.3 m (Calibre) | 11.15 to the fenders, 11.79 to the drums | within 3% either way |
  | Hull length | 8.33 m (CR2 family figure) | 8.09 over the fenders | -2.9% |
  | Width | 3.5 m over the skirts; 4.2 m with add-on armour (MoD) | 3.49 over the skirts, 3.70 over fittings | -0.9% |
  | Height | 2.50 m (MoD) | 2.58 roof edge, 2.75 roof crown, 3.43 sight head | roof +3..10% |
  | Weight | 66 t (MoD); TD not published | - | spec uses 66 t |
- Real references (sources): Rheinmetall press release, DSEI, 14 Sep 2021 ("Challenger 3 Advanced Technology
  Demonstrator with concept Active Protection System"; L55A1, temperature-independent KE and programmable HE; new turret
  structure and armour; improved long-range commander's and gunner's primary sights);
  armyrecognition.com DSEI 2021 report (the stand vehicle with Trophy and passive elements); overtdefense.com,
  2023-02-14 (demonstrator turret trials at Unterlüß, 22 Oct 2018); Pearson Engineering, 2023-02-16 (first-off
  demonstrator turret structure); army-technology.com and calibredefence.co.uk technical profiles (CV12-9A 1,200 hp
  retained, TN54E, third-generation Hydrogas, 60 km/h, Thales commander's panoramic and gunner's sights; 31 rounds,
  15 bustle / 16 hull).

## Construction work order (oracle metres; installed x1.10, shifted +0.195 z)

- Gross form: a Challenger 2 hull (two-course upper glacis, 22 then 13 degrees, steep lower glacis, flat sponson decks,
  raised engine deck, overhung upper rear plate, two transverse fuel drums) under a long flat-sided turret whose two
  raked cheeks stand either side of a deep central gun slot; a tall commander's sight on an octagonal pedestal at the
  roof's rear centre, the cupola right, the gunner's armoured sight box right front; full-length stepped skirts.
- Hull rows (z, belly, sponson floor, deck crown, deck edge): -4.19 1.78 1.79 1.87 1.87; -4.02 1.20 1.33 1.875 1.75;
  -3.86 1.00 1.33 1.89 1.75; -3.55 0.57 1.33 1.92 1.75; -2.65 0.575 1.33 1.895 1.75; -1.95 0.575 1.33 1.85 1.74; -1.60
  0.575 1.33 1.775 1.735; 1.95 0.575 1.33 1.785 1.745; 2.95 0.575 1.33 1.55 1.55; 3.08 0.60 1.33 1.497 1.497; 3.42 1.28
  1.30 1.375 1.375. Tub half-width 0.92 (track inner edge 1.094), sponson wall 1.707.
- Skirt: outer face 1.743 (plate 1.705-1.745), z -3.85..3.80; bottom 0.94-0.96; top 1.43 aft of -1.75, 1.55 forward;
  front panel 1.08-1.37 forward of 3.35.
- Running gear: six road wheels r 0.40 at y 0.478, z -2.571, -1.448, -0.537, 0.540, 1.434, 2.363 (uneven pitch);
  idler (3.304, 0.946) r 0.31; sprocket (-3.414, 0.859) r 0.35; return rollers z 1.945, 0.0, -2.0 at y 1.047 r 0.11;
  track x 1.094-1.679 (0.585 wide, centre 1.387); ground run 2.55..-2.75. The UK table's Challenger 3 wheel
  (`challenger-hollow-paired`, nationWheelSets.ts).
- Turret planes (n.p <= d): roof (0, 1, -0.0414, 2.6959); floor (0, -1, -0.0177, -1.8854); nose underside
  (0, -1, 1.2, 0.79); rear face (0, -0.258, -1, 3.3605); slot brow (0, 1, 0.25, 2.81); per side s: wall
  (0.62s, 0.053, 0, 0.9769), roof-edge chamfer (0.145s, 0.19, 0, 0.676), cheek face (s, 2.07, 1.53, 8.073), cheek brow
  (s, 5.93, 1.53, 17.145). The main body ends at the slot face z 1.66; the cheeks stand outside |x| 0.44.
  Checks against the oracle: side wall 1.415 at 1.9 to 1.362 at 2.5; cheek face plan line |x| = c(y) - 1.53 z with
  c(1.9) 4.14, c(2.2) 3.52, c(2.35) 3.21, c(2.5) 2.32; roof 2.70 front to 2.564 rear; nose z 2.43; rear -3.02.
- Roof furniture: gunner's sight box x -0.45..-0.90, z 0.40..0.72, top 2.83; cupola centre (-0.53, -0.65) r 0.45, top
  2.91-2.95; commander's sight pedestal centre (-0.125, -1.825), 0.65 across, to 3.03; head x -0.37..0.13, z
  -2.04..-1.64, top 3.42; whips (1.021 / -0.985, -2.25) 2.64..5.39; smoke dischargers 2 x 5 low on the cheek faces
  (x 0.9-1.05, z to 2.35).
- Gun: mantlet x +-0.42, z 1.40-2.40, y 1.80-2.42, front-top chamfer to 2.26; root jacket r 0.14 z 2.40-3.13; bore
  evacuator r 0.166 z 3.13-3.95; tube r 0.10, 0.08 at the muzzle face 6.905; clamp band r 0.111 at 5.40; coax port
  (0.285, 2.185).

## Evidence matrix

Use PASS / FAIL / NOT RUN / BLOCKED / NOT APPLICABLE (reason).

| Gate | Status | Revision / input hash | Exact command and artifact | Worst result / residual |
| --- | --- | --- | --- | --- |
| Source/conversion/frame integrity | NOT RUN | | | |
| Every registered silhouette / raw aggregate | NOT RUN | | | |
| Geometry components / dimension score / 3% check | NOT RUN | | | |
| Independent 14-view critic / actual Gallery | NOT RUN | | | |
| Winding, closure and intentional negative space | NOT RUN | | | |
| Physical seats and yaw/pitch/recoil ownership | NOT RUN | | | |
| High/low gear motion / strict band+shoe / duplicates | NOT RUN | | | |
| Actual return rollers / track thickness / chassis-side closure | NOT RUN | | | |
| Stored and instance-expanded triangles / build/draw/memory budgets | NOT RUN | | | |
| Cold/warm/rapid tank-switch latency and frame gaps | NOT RUN | | | |
| Primitive reuse / high-low reduction / accessory material roles | NOT RUN | | | |
| Live/spent/reset ERA / permanent backing | NOT APPLICABLE (no ERA on the TD) | | | |
| Main/aux armor finite rays / modules / crew | NOT RUN | | | |
| Markings, colors, bores, actual roof weapon | NOT RUN | | | |
| Original-model/record preservation | NOT RUN | | | |
| Anatomy update / freshness | NOT RUN | | | |
| Scoped assets / centering / source exclusion | NOT RUN | | | |
| Composed release / complete tests / typecheck | NOT RUN | | | |
| Public and private builds / attribution | NOT RUN | | | |

## Round log

- Owner, 2026-10-27, mid-lane, verbatim: "so yeah make a new version of this challeenger without the ghillie and with
  new remote machien gun tower systems and equipment and so on!!!! awesome this will be 2 nerrw tanks". The field fit
  is `challenger3_td_rws` (its own packet, `challenger3_td_rws.md`), an explicit derivative on this builder.
- r1 (build): `profiles/challenger3Td.ts` (hull loft, profile skirts, gear, three plane-bounded turret volumes, mantlet,
  L55A1, roof furniture, stern), spec `armorChallenger3Td`, registry rows. Node silhouette diff against the registered
  oracle (lane tool `silhouette.mjs`, 1 cm masks, suit excluded): side IoU 0.876 / top 0.952 / front 0.911.
- r2: the rear face plane's sign (the bustle ran 1 m aft), the diff tool's edge-on triangles (it painted a false slab),
  the commander's sight 7 cm right, the roof mast, the cupola's extent, the convex glacis rows, the rear lip, bins,
  drum cradle and stern pole, the mudguards' inner diagonal, skirt hooks, Hydrogas units: 0.927 / 0.973 / 0.935.
- r3/r4: the roof's front step at z 0.45 (two convex body pieces), the mantlet's sloped top and floor, an eccentric
  evacuator (the oracle's 2.063 centre), no muzzle box (the oracle has none), the gunner's sight plinth, final-drive
  covers and tow hooks; the glacis centre trough and the driver's well (|x| < 0.45, 0.14-0.19 deep; the oracle's 1.60
  floor at z 1.55-1.95, 1.59 at 2.3): 0.931 / 0.974 / 0.936. Residuals are centimetre-scale (track guide horns
  between the wheels are the fleet track standard; the oracle's rear lower plate and final-drive faces differ by
  5-30 cm in z at heights 0.6-1.1).
- Receipt `challenger3TdGun.selftest.mjs` (gunSlotProbe): PASS on the TD; the 15.0 mm minimum it first read was its own
  face cutoff, moved to 3 cm (the mantlet passes through the face).
- r5 (blind critic 1, 6.3/10): the mantlet's raked face and port, the slot cover and its hinge lugs, the shroud strip,
  the gunner's sight seated, the cupola's D-plate and dome, fanned dischargers, decals and the bustle roof plate off,
  fender lockers, tow cables, mudguard boxes, skirt joints and grilles on.
- r6 (receipts): the ghillie fleet receipt found a rear right skirt drape 2.0 cm off the armour. Under the bustle's sweep
  the suit ties its drapes low, and they hung plumb from the rear skirt rail's line (2.4 cm proud). The rail now stands
  flush (3 mm proud). The first depression sweep (no suit) read a standing mount conflict at yaw 6-48: the mantlet's
  lower edge (the oracle's 1.80) rode 12-16 mm over the hull deck once off the glacis trough, so no depression stop
  could cure it. The edge now stands at 1.84 (6 cm over the deck at level, still under the turret floor at the slot).
- r7 (blind critic 2 on Node renders: 7/10 against the oracle; each call checked against the oracle's depth maps before
  acting): the mantlet now has the oracle's raked body (|x| 0.42, 2.41 to z 1.84, then 37 degrees down to 2.02 at 2.32)
  and its nose over the jacket (|x| 0.18, 2.38 to z 2.12, down to 2.17 at 2.56); the hinge frame sits on its top edge
  at the slot face (posts at x 0.46, z 1.60, 2.50 tops), where it was 0.6 m back on a slot cover the oracle does not
  have; the visor strip is gone; the evacuator is 0.55 m (z 3.30-3.85), where it was a 0.82 m double cone; the cupola
  lid is flat (2.94 over a 2.91 ring), not a dome. At the front, the mudguards carry their front lip (to 1.10), the
  lamp blocks sit on the oracle's 1.54 band at z 3.2 (not boxes at 3.6), the forward skirt rail ends at 3.28 where the
  skirt drops, and the tow cables follow the hull top down the glacis edge (they floated up to 0.2 m over it).
- r8 (depression): `tools/gun-depression-sweep.mjs --no-suit` on the final mantlet: the full 10 degrees over the
  glacis trough (yaw 0), 8-9 to yaw 25, 4.7-6.2 at yaws 26-49 over the front deck's edges, the full 10 at 72-107,
  easing over the engine deck to +1.5 at 165-177 and +8.1 over the stern pole at 178-180; no mount conflict, nothing
  blocked at elevation. Published on both ids (`CHALLENGER3_TD_GUN_PITCH_BY_YAW_DEG`); `nationalGunClearance`
  holds them (the TD 24.91 mm with its suit at yaw 33, the field fit 26.31 mm).

- r0 (2026-10-27): intake, identity, measurement. Lane tools (ignored, `.qa-dev/cr3td/`): `oracle-load.mjs`,
  `depthmaps.mjs` + `oracle-dm.mjs` + `dmq.mjs` (2 cm orthographic depth maps of the oracle and their tables),
  `vstats.mjs`, `wheels.mjs`, `ring.mjs`, `raster.mjs` (the Centurion lane's Node renderer), `silhouette.mjs`
  (oracle-versus-build coverage masks at 1 cm).
