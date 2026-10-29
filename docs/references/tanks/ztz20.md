# ZTZ-20 family (`ztz20`, `ztz20_prototype`, `ztz100`, `ztz100_prototype`) — run packet

Template: [docs/tank-generation/templates/run-packet.md](../../tank-generation/templates/run-packet.md). Concept record:
[ztz20-family-20261027.json](../concepts/ztz20-family-20261027.json) and its [explainer](../concepts/ztz20-family-20261027.md).

## Current status

- Updated: 2026-10-27 (release 262 lane `item/ztz20-262`).
- Owner request / latest superseding instruction: 2026-10-27 "add these new tanks using our rigoorous tank generation
  workflow" (ZTZ-20 from the supplied GLB); superseded the same day, verbatim through the coordinator: "the ztz 20 should
  be completely new, not based off of qilin, and the ztz 100 is its prototype, ztz 20 needs to be designed from scratch
  and then it should update the ztz 100 which is a bad model rn". Coordinator: do not reuse the Qilin, Kunlun or Yun
  builders or the current ZTZ-100 geometry; rebuild `ztz100` and `ztz100_prototype` as the ZTZ-20's prototypes on the
  same family base; prototypes never sit above their production type in tier. Later the same day, verbatim: "wait keep
  the ztz 100 prototype then add the ztz 20 and then have a ztz 20 prototype., how about that" — the ZTZ-100 Prototype
  keeps its missile turret, a new ZTZ-20 Prototype turret testbed joins between the ZTZ-100 and the ZTZ-20. Tiers
  approved ("wow great job. all apporoved."): all X.
- IDs and display names: `ztz20` "ZTZ-20" (new), `ztz20_prototype` "ZTZ-20 Prototype" (new: turret testbed), `ztz100`
  "ZTZ-100" (rebuilt: pre-production), `ztz100_prototype` "ZTZ-100 Prototype" (hull and gear rebuilt; the owner's
  2026-09-19 missile turret kept). Lineage: ZTZ-100 Prototype → ZTZ-100 → ZTZ-20 Prototype → ZTZ-20.
- Implementation status: implemented (profiles `ztz20Family.ts`, `ztz20.ts`, `ztz100Prototype.ts`).
- Qualification status: see the evidence matrix; source fidelity NOT APPLICABLE (owner-authored concept route).
- Publication status / exact authority: lane branch only; integration through Main (release 262).
- Worktree / branch / baseline commit: `.claude/worktrees/cool-blackburn-0840b0`, `item/ztz20-262`, origin/main
  `7d045a7588`.
- Current next action: see the handoff block at the end.
- Blocking choices / known failures: none blocking. Tiers approved (all X). Open: the ≥9 blind-critic bar (last round 6–8.5
  a view) and the composed release gate.

## Scope and preservation

- Mode: independent first-party concept (ZTZ-20) plus an explicit family derivation (the two earlier stages).
- Owned files: `src/vehicles/profiles/ztz20Family.ts`, `ztz20.ts`, `ztz20Family.selftest.mjs`, `ztz100Prototype.ts`
  (hull swap only), `src/vehicles/ztz20GunClearance.selftest.mjs`, the ZTZ rows of the shared registries (specs,
  facets, taxonomy, order, labels, roles, layouts, markings, camouflage default, decorations, tech tree, concept policy).
- Retired: `src/vehicles/profiles/ztz100X.ts` and `ztz100X.selftest.mjs` (the 2026-09-17 source-study build the owner
  called "a bad model"); the `ztz100` GLB comparison registration (fidelity overrides, source-world certificate,
  dimension-frame id, evaluator page). Its packet `ztz100_x.md` and measurements record stay as history.
- Protected: every other id. `type59` and `ztz99_longwei` belong to another 262 lane; nothing of theirs is touched
  (`chineseFrontline.ts` takes only the profile-record import swap).
- Variant matrix:

| ID | Stage | Hull/gear | Turret | Gun | Source support |
| --- | --- | --- | --- | --- | --- |
| `ztz20` | production | family hull, raised deck, tiles, three-band skirts, slat cage | arrowhead gun turret, hard-kill towers, twin-cell RWS, coax in the right-cheek housing, bins, slatted rear block | 105 mm, measured sleeve, flat ribbed brake, muzzle sensor | measured from the oracle |
| `ztz20_prototype` | turret testbed | family hull, raised deck, bare glacis, three-band skirts, stern bin | the arrowhead turret, ballast blocks for the pods, fixed periscope, no RWS/hard-kill/smoke, trials mast | the new 105 mm in an early box mantlet, bare tube + fume extractor, slotted brake | family derivation (deliberate departures) |
| `ztz100` | pre-production | family hull, raised deck, bare glacis, two-band skirts, stern bin + trials basket | same turret, blanked hard-kill seats, plain RWS, coax in the mantlet, trials mast | 105 mm, round brake | family derivation (deliberate departures) |
| `ztz100_prototype` | testbed | family hull, flat testbed deck, flush crew hatches, upper skirt band, stern bin | the owner's 2026-09-19 missile turret (unchanged) | HJ-P9 + 35 mm | family hull; owner-authored turret |

## Source and comparison contract

- Actual raw path: `~/cot-lanes/new-tank-refs-262/odztz-20_test-3.glb` (the same file the 2026-09-17 ZTZ-100 study
  used from `Downloads/`).
- Raw SHA-256 / format / size: `387d86557d36ab649825d55a7059f8a82deed8099063df4c7731fe495b35da5d`, glTF binary,
  23,209,352 bytes.
- Credits: "[OD]ZTZ-20 Test-3" by EXcaliburK117 (Sketchfab, sketchfab.com/EXcalibur117), CC-BY-4.0,
  https://sketchfab.com/3d-models/odztz-20-test-3-1df862f8ae2b4616ac6d2748f0487958. Reference-only measuring input; no
  mesh, texture or vertex ships (`NOTICE.md` / `docs/ATTRIBUTION.md` unchanged: nothing third-party enters the tree).
- Source limitations: 52 nodes, 50 unnamed material-merged meshes (`ZTZ-203.obj.cleaner.materialmerger.gles`), 464,332
  triangles; hull, turret, gun and gear mixed across meshes, so no component ownership; no articulation.
- Approved target: owner-authored concept measured from the supplied model (production stage); the earlier stages depart
  deliberately.
- Owner decisions: 2026-10-27 (above). The 2026-09-19 missile-turret decision for `ztz100_prototype` stands.
- Frame: the 2026-09-17 registration, unchanged: axes x,y,z (the glTF node matrices give +Y up, gun toward +Z), uniform
  0.92 (skirt planes to 3.70 m), translation (0, 0.00644, -0.12098) (lowest track vertex on y 0, structural hull centred
  on z 0). Canonical oracle hash of that bake: `7eeb985247a5a44bf4dcf6b573ac66d9fef1b0ce6ea42666d01bb1e85c8758f1`.
- Lane measurement: `.qa-dev/ztz20-262/depthmaps.mjs` (1 cm orthographic first-hit maps of the whole oracle, the hull
  set y ≤ 1.56 and the upper set y ≥ 1.43) and `.qa-dev/ztz20-262/q.mjs` (profiles, plans, sections, height maps).
- Datums (game frame): hull 7.13 m (stern plate z -3.55 to nose z 3.58), rear fender boxes to z -3.80; skirt planes
  ±1.85 forward / ±1.765 aft; roof 1.41, engine deck 1.465 (the oracle's 1.50 lowered 3.5 cm so the bustle clears it at
  every yaw), glacis 6.4° to the nose line y 1.20; turret ring (0, 1.41, -0.55); turret floor 1.48, bustle floor 1.50,
  rear plateau 2.30, flank pods ±1.51 between z -0.05 and -1.75; arrowhead cheek nose line at 1.62 from x 0.40 / z 0.97 to
  x 1.21 / z 0.505 in two stepped blocks (face tops 1.99 inboard of x 0.92, 1.93 outboard), cut at the housing side x
  0.31, crown 2.12; pods' front plates raked about 40 degrees; gun trunnion (0, 1.76, 0.55), muzzle z 5.175, tube radius 0.072; launcher towers at
  ±1.26 / z -0.82 (top 2.55); weapon station z -0.78; seven road wheels r 0.3135 at y 0.374 on the left stations
  -2.3375 … 2.1705 and the right side staggered 90 mm forward; sprocket z -2.961, idler z 2.9915, rollers z -0.933 /
  0.648; track 0.515 at x ±1.2485.
- Published dimensions versus source versus native: see the evidence matrix (concept rows).

## Construction work order

- Gross-form sentence: a long low hull with a 6° glacis under tiles and three-band skirts, carrying a low unmanned
  arrowhead turret: two raked cheek blocks closing on a narrow gun housing, flank pods, a 2.30 m rear plateau and a
  rear stowage block under three slat bays, a long 105 mm tube in an angular thermal sleeve.
- Hull: one 16-point station loft (`hullSection`) from the stern plate to the nose (chamfered belly, tub wall, sponson
  floor over the track, fender lip, chamfered roof), rear fender boxes, a recessed stern louvre bay.
- Turret: bustle and main-body lofts (undercut base, vertical side, chamfered roof), pods as lofts, cheeks and roots as
  convex hexahedra, the housing as a convex block; the mantlet and sleeve as lofts on the gun frame.
- Running gear: the China MBT wheel (owner 2026-09-22 nation table), `KIT.buildRunningGear`, fleet track shoe, two
  return rollers a side (real), one animated course.
- Material roles: painted bodywork camouflaged (`turret`/`hull`), dark stock for mechanisms, rubber skirt lip, glass on
  every optic, the turret's camouflaged paint on the bins and rear stowage block (they read as one body with the
  turret), `hullFittingPaint` for the stern bin and `turretFittingPaint` for the testbed's ballast, open-lattice
  buckets for the cage and the slat bays.
- Negative space kept: slat-cage air, recessed stern louvre bay, open muzzle bore. The rear stowage block is closed
  (the oracle's rear is solid under its slat bays).
- Gameplay: `modernArmor` envelopes; anatomy calibrates the plates to the built surfaces.

## Evidence matrix

Use PASS / FAIL / NOT RUN / BLOCKED / NOT APPLICABLE (reason).

| Gate | Status | Revision / input hash | Exact command and artifact | Worst result / residual |
| --- | --- | --- | --- | --- |
| Source/conversion/frame integrity | PASS | raw 387d8655… | `shasum -a 256`; recipe as 2026-09-17 | — |
| Every registered silhouette / raw aggregate | NOT APPLICABLE (owner-authored concept route) | | | |
| Geometry components / dimension score / 3% check | PASS (concept rows) | lane head | `node tools/first-party-concept-check.mjs --ids=<the four>`; `tools/first-party-concept-policy.selftest.mjs` | every concept datum within its row |
| Independent 14-view critic / actual Gallery | FAIL (open) / NOT RUN | r11 | seven blind-critic rounds on Node rasters beside the oracle (`.qa-dev/ztz20-262/raster.mjs`) | ≥9 every view not reached: last round 6–8.5 a view, nothing BROKEN; outline IoU 91–96 % (round 4) |
| Winding, closure and intentional negative space | PASS | lane head | `node tools/tank-sealed-check.mjs --ids=<the four> --ledger=docs/geometry-gate/sealed.json --gate` | open px 0 in 33 views each; see-through 0; bore masked |
| Physical seats and yaw/pitch/recoil ownership | PASS | lane head | `ztz20Family.selftest.mjs` (turret 0.9 cm over the hull at every yaw, HIGH and LOW; sweep negative control); `ztz20GunClearance.selftest.mjs`; `gun-barrel-align-census --gate` | gun 2.7 / 2.6 / 2.6 cm from the hull (25 mm floor); rigs 4/4 aligned, no rig rows |
| High/low gear motion / strict band+shoe / duplicates | PASS (fleet receipts) | lane head | `trackGlitchSimulation.selftest.mjs`; `ztz100Prototype.selftest.mjs` (HIGH/LOW articulation) | — |
| Actual return rollers / track thickness / chassis-side closure | PASS (construction) / NOT RUN (release probes) | | two real return rollers a side; closure in the sealed check | release-gate probes owed |
| Stored and instance-expanded triangles / build/draw/memory budgets | NOT RUN (release gate) | | sealed-check HIGH counts: ztz20 100,168; ztz20_prototype 91,793; ztz100 97,049; ztz100_prototype 98,024 | budgets owed to `tank:release:check` |
| Cold/warm/rapid tank-switch latency and frame gaps | NOT RUN | | | owed to the release gate |
| Primitive reuse / high-low reduction / accessory material roles | NOT RUN | | | owed to the release gate |
| Live/spent/reset ERA / permanent backing | NOT APPLICABLE (no ERA) | | | |
| Main/aux armor finite rays / modules / crew | PASS | lane head | `npm run tank:anatomy:check`; `crewSeats.selftest.mjs`; `fleetBalance.selftest.mjs` | 4 measured sim floors within 5 cm |
| Markings, colors, bores, actual roof weapon | PASS | lane head | marking-seat check; `remoteGunFleet`, `auxiliaryRoofGuns`, `ammunitionFlow`, `hudAmmoOut*` selftests | — |
| Original-model/record preservation | PASS | lane head | `ztz100Prototype.selftest.mjs` (8-cell missile turret unchanged), `missileConceptCombat`, `guidedLauncherTubes` | — |
| Anatomy update / freshness | PASS | lane head | ids-scoped chain (`.qa-dev/ztz20-262/chain3.zsh`): anatomy fixpoint on the second pass, fills, markings, seats, spare track, ledger, gun lines | `tank:anatomy:check` 223 current |
| Scoped assets / centering / source exclusion | PASS (centering) / see READY (icons, hero, drawings) | lane head | `presentation-centering.mjs --update --ids=<the four>`; `genIcons`, `genHeroCards`, `genDrawings` per id | nothing from the GLB ships |
| Composed release / complete tests / typecheck | NOT RUN (composed) / see READY | | targeted receipts (CN clearance, add-ons, stations; tier; tech tree; roster; product stats; shadow coverage) PASS | composed gate owed (load 350–880) |
| Public and private builds / attribution | PASS (attribution) / see READY (build) | lane head | `npm run attribution:check` | — |

## Round log

- r1 (2026-10-27): first family build; Node raster review against the oracle's renders. Fixed: the aft skirt plane
  inside the fender lip (lip to 1.72), the deck ramp inside the ring collar's sweep (ramp moved behind z -1.76), the
  body front standing proud of the cheek slope (body front to z 0.10, cheek roots carry the crown back), the rack's side
  rails running astern.
- r2 (2026-10-27): blind critic 5–7 a view. Fixed: a closed rear stowage block under the slat bays (the oracle is solid
  there), flush bins, a stepped mantlet and sensor post, the muzzle reference sensor, the weapon-station yoke and feed,
  cheek plates, chamfered cage corners, bow grilles; the ZTZ-100 depression curve; the tech-tree pin.
- r3: about 7.4. Fixed: swept arrowhead cheeks with the V-notch, the coax moved into a right-cheek housing (production
  only), a ribbed brake, a compact panoramic head, one weapon-station unit with a box launcher, chamfered bins, straight
  belly lines, skirt tops on the glacis line, visible bolts, a finer cage, plain deck panels. The ZTZ-100 Prototype's
  raised hatches sat 2.5 cm inside its missile platter's sweep: that stage now has flush hatches. The family selftest's
  negative-control block moved under the cheeks' sweep (it could never trip where it stood).
- r4–r5: about 7.1, then about 7.6 (whole views 7.5–8.5, outline IoU 91–96 %). The round-3 cheek tip stood 10 cm proud:
  reverted to the measured nose line (x 0.40 / z 0.97 to x 1.21 / z 0.505, two stepped blocks, the production coax
  slot). The oracle's turret views had been framed on (0, 1.8, 0), not the turret pivot: re-rendered on (0, 1.41, -0.55)
  with `raster.mjs --tp`. Raked pod fronts; the measured weapon station (U yoke, gun over the sight, launcher on the post
  box, feed arm); commander's sight; thermal sleeve and flat ribbed brake; tall mantlet sensor; periscope rings; bevelled
  tiles; framed slat bays; hard-kill drums on legs; lift stubs; stern-bin brackets; skirt handles.
- r6: about 7.3. The pods taper back to z -2.12 with the side bins behind them (measured from the depth maps), a squat
  mantlet sensor, sight pedestal, thin smoke plate, a seven-row cage, stern-bin mounting arms. Geometry frozen.
- r7: 6–8.5 a view, nothing BROKEN; critics contradicted one another, so each claim was checked against the oracle's
  depth maps before any change. Removed the chin ribs (not on the oracle). The measured sleeve gives the ZTZ-20 and
  ZTZ-100 a front depression of -5.6 degrees (was -7); full -8 across the flanks. The barrel radius is the drawn
  0.08 m at the brake's end cap (spec, concept row and rig agree; no rig row).
- Final chain (`.qa-dev/ztz20-262/chain3.zsh`): controls, rigs, anatomy (fixpoint on the second pass), rigs again,
  fills, marking seats, mission seats, spare track, ledger, gun lines, rigs gate 4/4.

## Handoff

- Open: the ≥9 blind-critic bar on every view (last round 6–8.5); the composed `tank:release:check --gate` (its
  budgets, switch latency and primitive probes); a live Garage and battle look at the four ids, HIGH and LOW. The
  fleet count moved 221 → 223 (`src/productStats.ts`, README, the Field Manual prerender): on a main merge that adds
  tanks, re-sum it.
- Logged in `~/cot-launch-state/streams/TESTS-OWED.md` under "ZTZ-20 family 262".
