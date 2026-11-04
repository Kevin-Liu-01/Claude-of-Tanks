# Object 195 — run packet

## Current status

- Updated: 2026-11-04. Lane item/russia-152 (batch contract: docs/history/research/russia-152-269.md).
- Owner request: "make a new russian tank called object 195 (image 1)" (2026-11-04); the same day: "use our proper tank generation procedure and dont use the old t80 hull only
  use modern new hulls like the nnew t80 x hulll".
- ID and display name: object195, "Object 195"; tier X (Main 2026-11-04, with the smallest trim), Russia, next-generation, prototype.
- Implementation status: built on its own long hull (profiles/object195X.ts, profiles/russia152Kit.ts), registered; the tier X trim pending (armour trials after no HP, damage or reload trim reached two thirds fair).
- Qualification status: photo-class (docs/references/photos/russia-152-20261104.json, fixture
  src/vehicles/profiles/russia152.selftest.mjs); the round audits, the anatomy update and the release gate are owed.
- Publication status / exact authority: lane branch only; Main integrates. No deploy.
- Worktree / branch / baseline commit: ~/cot-lanes/russia-152, item/russia-152, base f98c38c63c (the 269 audio stack).
- Current next action: apply the trim; the round audits.
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
- Datums (src/vehicles/russia152Frames.ts): hull z -3.95..3.95, roof 1.60, ring 1.60 at z -0.30, trunnion 2.30 at z 0.95, muzzle 6.70 (10.6 m over the gun).
- Published dimensions versus native: 7.9 m hull (militaryrussia, btvt), about 10.6 m over the gun; the packet's envelope is the as-built Box3 (3.588 / 10.86 / 3.75).
- Unresolved conflicts: none blocking.

## Construction work order

- Hull: addHullTub stations, GLACIS_Z0 1.60 to the nose at 1.02, glacis seams, three hatches on the glacis.
- Running gear: seven T-90-type wheels at z +-2.58 (0.86 pitch).
- Module: half-width 0.95, top 1.20 over the ring, the front faces and lintel, stacked sight boxes, the square sight tower, the rear sight box, the commander's box, radar boxes, APS domes, smoke banks; the 30 mm object195_2a42 pod; the octagon shield, the trunnion block, the round mantlet and the 2A83.
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

## Publication receipt (only if requested)

- Not requested; the lane's READY to Main carries the branch, sha and receipts.
