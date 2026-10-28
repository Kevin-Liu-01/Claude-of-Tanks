# ZTZ-20 family (`ztz20`, `ztz100`, `ztz100_prototype`) — run packet

Template: [docs/tank-generation/templates/run-packet.md](../../tank-generation/templates/run-packet.md). Concept record:
[ztz20-family-20261027.json](../concepts/ztz20-family-20261027.json) and its [explainer](../concepts/ztz20-family-20261027.md).

## Current status

- Updated: 2026-10-27 (release 262 lane `item/ztz20-262`).
- Owner request / latest superseding instruction: 2026-10-27 "add these new tanks using our rigoorous tank generation
  workflow" (ZTZ-20 from the supplied GLB); superseded the same day, verbatim through the coordinator: "the ztz 20 should
  be completely new, not based off of qilin, and the ztz 100 is its prototype, ztz 20 needs to be designed from scratch
  and then it should update the ztz 100 which is a bad model rn". Coordinator: do not reuse the Qilin, Kunlun or Yun
  builders or the current ZTZ-100 geometry; rebuild `ztz100` and `ztz100_prototype` as the ZTZ-20's prototypes on the
  same family base; prototypes never sit above their production type in tier.
- IDs and display names: `ztz20` "ZTZ-20" (new), `ztz100` "ZTZ-100" (rebuilt: pre-production), `ztz100_prototype`
  "ZTZ-100 Prototype" (hull and gear rebuilt; the owner's 2026-09-19 missile turret kept).
- Implementation status: implemented (profiles `ztz20Family.ts`, `ztz20.ts`, `ztz100Prototype.ts`).
- Qualification status: see the evidence matrix; source fidelity NOT APPLICABLE (owner-authored concept route).
- Publication status / exact authority: lane branch only; integration through Main (release 262).
- Worktree / branch / baseline commit: `.claude/worktrees/cool-blackburn-0840b0`, `item/ztz20-262`, origin/main
  `7d045a7588`.
- Current next action: see the handoff block at the end.
- Blocking choices / known failures: none blocking; tiers await the owner's review (proposal sent to Main first).

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
| `ztz20` | production | family hull, raised deck, tiles, three-band skirts, slat cage | arrowhead gun turret, hard-kill towers, twin-tube RWS, cheek bank, bins, rack | 105 mm, slotted brake | measured from the oracle |
| `ztz100` | pre-production | family hull, raised deck, bare glacis, two-band skirts, stern bin + trials basket | same turret, blanked hard-kill seats, plain RWS, cheek cover, trials mast | 105 mm, round brake | family derivation (deliberate departures) |
| `ztz100_prototype` | testbed | family hull, flat testbed deck, upper skirt band, stern bin | the owner's 2026-09-19 missile turret (unchanged) | HJ-P9 + 35 mm | family hull; owner-authored turret |

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
  rear plateau 2.30, flank pods ±1.51 between z -0.05 and -1.75; arrowhead cheek face x 1.21 / z 0.42 to x 0.34 /
  z 0.97, knee 1.81, crown 2.12; gun trunnion (0, 1.76, 0.55), muzzle z 5.175, tube radius 0.072; launcher towers at
  ±1.26 / z -0.82 (top 2.55); weapon station z -0.78; seven road wheels r 0.3135 at y 0.374 on the left stations
  -2.3375 … 2.1705 and the right side staggered 90 mm forward; sprocket z -2.961, idler z 2.9915, rollers z -0.933 /
  0.648; track 0.515 at x ±1.2485.
- Published dimensions versus source versus native: see the evidence matrix (concept rows).

## Construction work order

- Gross-form sentence: a long low hull with a 6° glacis under tiles and three-band skirts, carrying a low unmanned
  arrowhead turret: two raked cheek blocks closing on a narrow gun housing, flank pods, a 2.30 m rear plateau and an
  open rear rack, a long 105 mm tube in an angular thermal sleeve.
- Hull: one 16-point station loft (`hullSection`) from the stern plate to the nose (chamfered belly, tub wall, sponson
  floor over the track, fender lip, chamfered roof), rear fender boxes, a recessed stern louvre bay.
- Turret: bustle and main-body lofts (undercut base, vertical side, chamfered roof), pods as lofts, cheeks and roots as
  convex hexahedra, the housing as a convex block; the mantlet and sleeve as lofts on the gun frame.
- Running gear: the China MBT wheel (owner 2026-09-22 nation table), `KIT.buildRunningGear`, fleet track shoe, two
  return rollers a side (real), one animated course.
- Material roles: painted bodywork camouflaged (`turret`/`hull`), dark stock for mechanisms, rubber skirt lip, glass on
  every optic, `turretFittingPaint`/`hullFittingPaint` for bins, open-lattice buckets for the cage and racks.
- Negative space kept: slat-cage air, open rear rack, recessed stern louvre bay, open muzzle bore.
- Gameplay: `modernArmor` envelopes; anatomy calibrates the plates to the built surfaces.

## Evidence matrix

Use PASS / FAIL / NOT RUN / BLOCKED / NOT APPLICABLE (reason).

| Gate | Status | Revision / input hash | Exact command and artifact | Worst result / residual |
| --- | --- | --- | --- | --- |
| Source/conversion/frame integrity | PASS | raw 387d8655… | `shasum -a 256`; recipe as 2026-09-17 | — |
| Every registered silhouette / raw aggregate | NOT APPLICABLE (owner-authored concept route) | | | |
| Geometry components / dimension score / 3% check | NOT RUN | | | |
| Independent 14-view critic / actual Gallery | NOT RUN | | | |
| Winding, closure and intentional negative space | NOT RUN | | | |
| Physical seats and yaw/pitch/recoil ownership | NOT RUN | | | |
| High/low gear motion / strict band+shoe / duplicates | NOT RUN | | | |
| Actual return rollers / track thickness / chassis-side closure | NOT RUN | | | |
| Stored and instance-expanded triangles / build/draw/memory budgets | NOT RUN | | | |
| Cold/warm/rapid tank-switch latency and frame gaps | NOT RUN | | | |
| Primitive reuse / high-low reduction / accessory material roles | NOT RUN | | | |
| Live/spent/reset ERA / permanent backing | NOT APPLICABLE (no ERA) | | | |
| Main/aux armor finite rays / modules / crew | NOT RUN | | | |
| Markings, colors, bores, actual roof weapon | NOT RUN | | | |
| Original-model/record preservation | NOT RUN | | | |
| Anatomy update / freshness | NOT RUN | | | |
| Scoped assets / centering / source exclusion | NOT RUN | | | |
| Composed release / complete tests / typecheck | NOT RUN | | | |
| Public and private builds / attribution | NOT RUN | | | |

## Round log

- r1 (2026-10-27): first family build; Node raster review against the oracle's renders. Fixed: the aft skirt plane
  inside the fender lip (lip to 1.72), the deck ramp inside the ring collar's sweep (ramp moved behind z -1.76), the
  body front standing proud of the cheek slope (body front to z 0.10, cheek roots carry the crown back), the rack's side
  rails running astern.
