# Object 195 — run packet

## Current status

- Updated: 2026-11-08. Lane item/russia-152 (batch contract: docs/history/research/russia-152-269.md).
- Owner request: "make a new russian tank called object 195 (image 1)" (2026-11-04); the same day: "use our proper tank generation procedure and dont use the old t80 hull only
  use modern new hulls like the nnew t80 x hulll".
- ID and display name: object195, "Object 195"; tier X (Main 2026-11-04, with the smallest trim), Russia, next-generation, prototype.
- Owner looks rounds: 2026-11-05/06 on the module (round 2's tiered turret widened, with round 3's launchers, lamps and
  sensors: "well done. i fully approve", 2026-11-06, frozen); 2026-11-07 on the hull: "massively improve the object 195s
  hull to be more proportional and look better with its turret" (three builder rounds, critics r12-r14).
- Implementation status: built on its own long hull (profiles/object195X.ts, profiles/russia152Kit.ts), registered; the
  trunnion at 2.12 m (the hangar photograph); Main's lever applied (APFSDS 740 -> 820), and HP 2,800 -> 2,600 after the hull round (2026-11-08).
- Qualification status: photo-class (docs/references/photos/russia-152-20261104.json, fixture
  src/vehicles/profiles/russia152.selftest.mjs); the round audits, the anatomy update and the release gate are owed.
- Publication status / exact authority: lane branch only; Main integrates. No deploy.
- Worktree / branch / baseline commit: ~/cot-lanes/russia-152, item/russia-152, base f98c38c63c (the 269 audio stack).
- Current next action: the round-10 chain (regen on the merged tree, fairness fair/r22 at 12 and 24 seeds, the release gate), then READY.
- Blocking choices / known failures: none open; residual likeness notes in the round log.

## Scope and preservation

- Mode: independent build on its own hull (no donor geometry; the 2A83 from profiles/gun152.ts, T-90-type wheels at the T-90 X measures through KIT.buildRunningGear).
- Owned files: profiles/object195X.ts, profiles/russia152Kit.ts (shared with the Molot), the object195 rows of russia152Specs.ts and russia152Frames.ts (OBJECT195_FRAME).
- Protected original IDs: none (no shared builder is edited).
- Explicitly excluded: the 2008 fan drawing (owner image 1, Commons Ob'yekt_195.jpg): the build follows the prototype photographs.
- Variant matrix: object195 = the first prototype as Gur Khan photographed it (owner image 2): a 7.9 m hull on seven road wheels, a long sloped glacis with three crew hatches (the crew capsule), flat skirts, the tall unmanned module with the 2A83 152 mm, the stacked sight boxes, the 30 mm 2A42 roof pod (a working station). Uncertainty: two prototype photographs; the module's rear and the hull's stern are inferred.

## Source and comparison contract

- Actual raw path / archive member: NOT APPLICABLE (photographic target; no supplied model).
- Raw SHA-256 / format / size: NOT APPLICABLE (no supplied file).
- Source credits and limitations: Gur Khan (17 Oct 2018, gurkhan.blogspot.com/2018/10/95.html), bmpd (18 Oct 2018), militaryrussia, btvt; owner image 2 is the first prototype.
- Canonical oracle path and SHA-256: NOT APPLICABLE (photo route).
- Signed axis transform / handedness / uniform scale / translation: NOT APPLICABLE (no source mesh).
- Datums (src/vehicles/russia152Frames.ts): hull z -3.95..3.95, roof 1.70 (1.60 before the owner's hull round of
  2026-11-07: the deck as high as the 2A83's -7 degrees allows round the turntable), ring 1.60 at z -0.30, trunnion 2.12 at z 0.95
  (Gur Khan's hangar photograph: the gun leaves the module's lower half, about half a metre over the roof; 2.30 before
  round 5), muzzle 6.70 (10.6 m over the gun).
- Published dimensions versus native: 7.9 m hull (militaryrussia, btvt), about 10.6 m over the gun; the packet's envelope is the as-built Box3 (3.588 / 10.86 / 3.75).
- Unresolved conflicts: none blocking.

## Construction work order

- Hull (2026-11-07): the deck flat at 1.70 to z 2.45, the glacis at 19 degrees to (3.76, 1.24) with hinged panels and a
  bolted block row, the chin raked 27 degrees from (3.93, 1.12) to (3.60, 0.46) between the tracks (|x| <= 1.12); sloped
  fender wedges over the idlers (top 1.42 -> 1.335, a 42-degree face, an apron to 0.72) carrying round 19 cm headlamps
  with guards (headlight night lenses); an upper row of bolted blocks 6.5 cm proud (to x 1.80) over a lower skirt with
  eleven stepped plates and a rubber band (steel foot 0.72, band 0.60); three hatch coamings with periscope blocks;
  rails, bins, exhaust, stern stowage and the unditching log; a 6 cm collar round the turntable's foot.
- Running gear: seven T-90-type wheels at z +-2.58 (0.86 pitch), radius 0.42 (0.394 before 2026-11-07), wheelY 0.474;
  every hull floor clears the track's band and shoes by at least 1.9 cm (.qa-dev/r152/track-top.mjs).
- Module: half-width 0.95, top 1.20 over the ring, the front faces and the deep lintel over the gun (0.32 m from 0.86 to
  1.18 over the ring), stacked sight boxes, the square sight tower, the rear sight box, the commander's box, radar boxes, APS domes, smoke banks; the 30 mm object195_2a42 pod; the octagon shield, the trunnion block, the round mantlet and the 2A83.
- Plates: modernArmor (glacis [900,950,1250]); the crew in the hull's capsule (z 1.55-2.60).

## Evidence matrix

| Gate | Status | Revision / input hash | Exact command and artifact | Worst result / residual |
| --- | --- | --- | --- | --- |
| Source/conversion/frame integrity | NOT APPLICABLE (photographic target) | | | |
| Every registered silhouette / raw aggregate | NOT APPLICABLE (no registered oracle) | | | |
| Geometry components / dimension score / 3% check | NOT RUN | | node tools/photo-reference-check.mjs --ids=object195 | |
| Independent 14-view critic / actual Gallery | NOT RUN (round-3 build); rounds 1-3 PASS 3/3 | | ~/cot-lanes/russia-152-evidence/critics/r1..r3/TALLY.md | likeness partly / yes / yes |
| Winding, closure and intentional negative space | NOT RUN | | node tools/winding-audit.mjs --ids=object195 --check; tank-sealed-check | |
| Physical seats and yaw/pitch/recoil ownership | NOT RUN | | node tools/turret-parent-audit.mjs --ids=object195 | |
| High/low gear motion / strict band+shoe / duplicates | NOT RUN | | node tools/track-clip-audit.mjs --ids=object195 --exact --strict | |
| Actual return rollers / track thickness / chassis-side closure | NOT RUN | | | |
| Stored and instance-expanded triangles / build/draw/memory budgets | NOT RUN | | | |
| Cold/warm/rapid tank-switch latency and frame gaps | NOT RUN | | | |
| Primitive reuse / high-low reduction / accessory material roles | NOT RUN | | | |
| Live/spent/reset ERA / permanent backing | NOT RUN | | | |
| Main/aux armor finite rays / modules / crew | NOT RUN | | npm run tank:anatomy:update | |
| Markings, colors, bores, actual roof weapon | NOT RUN | | | packet: 1 roof MG |
| Original-model/record preservation | NOT APPLICABLE (own hull; no shared builder edited) | | scripts/mesh-digest.mjs base v lane | |
| Anatomy update / freshness | NOT RUN | | | |
| Scoped assets / centering / source exclusion | NOT RUN | | npm run tank:regen:changed -- --ids=... | |
| Composed release / complete tests / typecheck | NOT RUN | | npm run tank:release:check -- --ids=... --gate --lane | |
| Public and private builds / attribution | NOT RUN | | npm run attribution:check | |

## Round log

- Rounds 1-3 (2026-11-04): blind critics matched 3/3 each round; likeness partly / yes / yes in round 3: the module
  squat and plain (the photographs: taller and sharper, the sight box at the top left, launchers on the front face, domes
  along the base), the nose a pointed wedge, the skirts plain.
- Fairness at X (fair/levers/): HP, damage and reload trims r1-r5 reached at most 16/29 fair (r4, 2,400 HP and 680 damage:
  15/29, mean 0.642); the 195 beats the same fourteen opponents 0.83-1.00 whatever the trim, so armour trials follow
  (Main's ruling: armour only when none of those gets there, said in the READY).
- Diagnosis (a shell_hit probe in a source copy): the range fires level at each shooter's gun height. At 2.30 m the
  195's 152 mm put 35 of 53 hits on the Abrams X's turret roof, and its opponents hit only its module, never the glacis:
  glacis cuts g1-g4 changed nothing (11/29, 0.747). The trunnion was the datum fault, not the armour.
- Round 5 (ec4bdb9613): trunnion 2.30 -> 2.12, the lintel deepened to close the gap over the gun. Untrimmed at X: 15/29
  fair, mean 0.659 (fair/levers/o195-low-b0).
- Trim (53a7320c33): the 2A83's rounds at 0.946 (APFSDS 740 -> 700, HEAT 643, HE 851). On the range's 6 seeds 16/29
  fair, mean 0.639 (o195-low-c2), the most pairs fair of ten trials (HP 2,400-2,700, damage 680-700, reload 9-9.5 and their
  pairs: 12-16/29). On 24 seeds (lever-row --seeds=24) the 6-seed spread proves mostly noise: 700 gives 20/29 fair, mean
  0.561 (o195-low-24-d0-was700), 720 gives 18/29 (0.574), untrimmed 740 gives 17/29 (0.586). 700 is the smallest damage
  trim meeting both of Main's terms. No armour cut: the module's 320 mm cheeks are penetrated by every peer already.
- Later (Main, 2026-11-06): on the fresh anatomy the trim was lifted to a lever, APFSDS 820 (fair/r20: 20/29 at 12
  and 24 seeds).
- Module rounds (2026-11-05/06, critics r9-r11, solo, 5 critics each; MATCH at 6 per Main's re-anchor on the
  owner's-render control 6/6/6): 5/5 at 7 every round; the owner chose v11 (09bf5c133a) and approved it.
- Hull round 1 (da20677084, critics r12): 5/5 at 7; the owner's direction partly x5: a thin wedge nose with a hanging
  flap over the idler, one shallow side band over whole wheels, faint hatches.
- Hull round 2 (e90f13f64f, critics r13): 5/5 at 7; "now deep and heavy" (c4, c5); residuals: small square lamps,
  the lower side plain in elevation, boxy fenders, a flat chin, flat hatches.
- Hull round 3 (e416a0326a, critics r14): 5/5 at 7, no silhouette or identity fault; three rounds at 7, the instrument
  plateaued. Residual: the approved module reads tall over the hull (stacked tiers, roof sights, the full-width rear
  cage); the side armour's layering shows only as lines in pure side elevation.
- The regen's sim-floor drift (2026-11-08, accepted in docs/geometry-gate/sim-floors.json): the combat hull roof
  1.6 -> 1.7 (the deck) and the bow 4.0235 -> 3.955 (the old nose plate replaced by the raked chin); the turret floor
  0.065 -> 0.13 (the turntable seat on the 1.70 deck). The round-10 regen then passed (261de79879).
- Fairness on the deeper hull (fair/r22, 2026-11-08): 17/29, mean 0.529 at 12 seeds; 19/29, 0.506 at 24; five pairs over
  at 12 (the PT-84s, the ZTZ-20 prototype, the ZTZ-100 and, as always, the T-14; the Oplot-T at 24), the old unders still under (the Challenger 3 TDs, the
  Leopard 2A7s, the T-90M Proryv, the ZTZ-99A2: level rounds meet their roofs). Ladder (fair/r23): damage 740/760/780/800
  16-17/29; HP 2,700 18/29 at 12; HP 2,600 20/29, 0.461 at 12 and 22/29, 0.432 at 24 (HP 2,500 the same counts). The spec
  takes HP 2,600 and keeps APFSDS 820; fair/r24 reproduces it with --levers='{}'.

## Publication receipt (only if requested)

- Not requested; the lane's READY to Main carries the branch, sha and receipts.
