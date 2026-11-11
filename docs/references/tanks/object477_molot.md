# Object 477 Molot — run packet

## Current status

- Updated: 2026-11-08. Lane item/russia-152 (batch contract: docs/history/research/russia-152-269.md).
- Owner request: "Object 477 \"Molot\" (image 3 and 4)" (2026-11-04); the same day: "use our proper tank generation procedure and dont use the old t80 hull only
  use modern new hulls like the nnew t80 x hulll".
- ID and display name: object477_molot, "Object 477 Molot"; tier IX (Main 2026-11-04, no lever), USSR, next-generation, prototype.
- Owner looks rounds: 2026-11-05 (the full rebuild); 2026-11-07: "add shotra eyes to the molot and a machine gun to it"
  (critics r12-r13).
- Implementation status: built on its own high hull (profiles/object477Molot.ts, profiles/russia152Kit.ts), registered;
  Main's lever applied (HP 2,550 -> 2,800).
- Qualification status: photo-class (docs/references/photos/russia-152-20261104.json, fixture
  src/vehicles/profiles/russia152.selftest.mjs); the round audits, the anatomy update and the release gate are owed.
- Publication status / exact authority: lane branch only; Main integrates. No deploy.
- Worktree / branch / baseline commit: ~/cot-lanes/russia-152, item/russia-152, base f98c38c63c (the 269 audio stack).
- Current next action: the round-10 chain (regen on the merged tree, fairness fair/r22 at 12 and 24 seeds, the release gate), then READY.
- Blocking choices / known failures: none open; residual likeness notes in the round log.

## Scope and preservation

- Mode: independent build on its own hull (no donor geometry; the 2A73 from profiles/gun152.ts, the T-80UD-type running gear at the T-80U X wheel, shoe and roller measures through KIT.buildRunningGear).
- Owned files: profiles/object477Molot.ts, profiles/russia152Kit.ts (shared with the 195), the molot rows of russia152Specs.ts and russia152Frames.ts (MOLOT_FRAME).
- Protected original IDs: none (no shared builder is edited).
- Explicitly excluded: the post-1991 "Nota" paper continuation.
- Variant matrix: object477_molot = high hull with a long sloped glacis on seven road wheels, the multi-barrier skirts, a low turret, the 152 mm 2A73 in an armoured casing on its roof, the 30 mm GSh-30 to its right (a working station), Shtora-1 (two OTShU-1-7 dazzlers in the turret's front corners, two TShU-1-11 heads) and the commander's remote 12.7 mm NSVT behind his sight (a working station, molotCommanderMgStation; the BTVT profile drawing). Uncertainty: no photograph of the vehicle is published beyond one poor print; the btvt profile and two game artworks guide the look only.

## Source and comparison contract

- Actual raw path / archive member: NOT APPLICABLE (photographic target; no supplied model).
- Raw SHA-256 / format / size: NOT APPLICABLE (no supplied file).
- Source credits and limitations: Yu. Apukhtin, memoir (topwar.ru, August 2018) and diaries; btvt.info (A. Tarasenko); one poor photograph; two owner-supplied game artworks (look only).
- Canonical oracle path and SHA-256: NOT APPLICABLE (photo route).
- Signed axis transform / handedness / uniform scale / translation: NOT APPLICABLE (no source mesh).
- Datums (src/vehicles/russia152Frames.ts): hull z -3.55..3.75, roof 1.60, ring 1.60 at z -0.10, trunnion 2.088 at z 0.80 (btvt's 2,088 mm line of fire), casing top 2.434 (btvt), muzzle 7.10 (btvt's 10,650 mm over the gun).
- Published dimensions versus native: btvt 10,650 mm over the gun, 2,434 mm to the turret roof; the packet's envelope is the as-built Box3 (3.578 / 10.825 / 3.2).
- Unresolved conflicts: none blocking.

## Construction work order

- Hull: addHullTub stations to the prow (noseY from z 1.60 at 1.60 down to 0.92 at 3.75), glacis seams, the driver's hatch at z 1.36.
- Running gear: seven wheels at z -2.45..2.45 (0.817 pitch), sprocket -3.05, idler 3.20.
- Turret: the low body, the casting stations z -1.72..1.66, the gunner's sight, the commander's dome sight, the 30 mm molot_gsh30 (muzzle z 2.35), the mantlet and the 2A73.
- Plates: modernArmor (glacis [520,760,1100]); crew driver ahead, gunner and commander low under the turret (internalLayoutRegistry molot).

## Evidence matrix

| Gate | Status | Revision / input hash | Exact command and artifact | Worst result / residual |
| --- | --- | --- | --- | --- |
| Source/conversion/frame integrity | NOT APPLICABLE (photographic target) | | | |
| Every registered silhouette / raw aggregate | NOT APPLICABLE (no registered oracle) | | | |
| Geometry components / dimension score / 3% check | NOT RUN | | node tools/photo-reference-check.mjs --ids=object477_molot | |
| Independent 14-view critic / actual Gallery | NOT RUN (round-3 build); rounds 1-3 PASS 3/3 | | ~/cot-lanes/russia-152-evidence/critics/r1..r3/TALLY.md | likeness "partly" x3 |
| Winding, closure and intentional negative space | NOT RUN | | node tools/winding-audit.mjs --ids=object477_molot --check; tank-sealed-check | |
| Physical seats and yaw/pitch/recoil ownership | NOT RUN | | node tools/turret-parent-audit.mjs --ids=object477_molot | |
| High/low gear motion / strict band+shoe / duplicates | NOT RUN | | node tools/track-clip-audit.mjs --ids=object477_molot --exact --strict | |
| Actual return rollers / track thickness / chassis-side closure | NOT RUN | | | |
| Stored and instance-expanded triangles / build/draw/memory budgets | NOT RUN | | | |
| Cold/warm/rapid tank-switch latency and frame gaps | NOT RUN | | | |
| Primitive reuse / high-low reduction / accessory material roles | NOT RUN | | | |
| Live/spent/reset ERA / permanent backing | NOT RUN | | | |
| Main/aux armor finite rays / modules / crew | NOT RUN | | npm run tank:anatomy:update | |
| Markings, colors, bores, actual roof weapon | NOT RUN | | | photo document: 2 roof weapons (the 30 mm pod and the NSVT; was 1 before the owner's round) |
| Original-model/record preservation | NOT APPLICABLE (own hull; no shared builder edited) | | scripts/mesh-digest.mjs base v lane | |
| Anatomy update / freshness | NOT RUN | | | |
| Scoped assets / centering / source exclusion | NOT RUN | | npm run tank:regen:changed -- --ids=... | |
| Composed release / complete tests / typecheck | NOT RUN | | npm run tank:release:check -- --ids=... --gate --lane | |
| Public and private builds / attribution | NOT RUN | | npm run attribution:check | |

## Round log

- Rounds 1-3 (2026-11-04): blind critics matched 3/3 each round; likeness "partly" x3 in round 3: the hull's top line
  level (the drawing: a thicker five-panel front section and a lower rear), the casing a thin wedge (the drawing: tall,
  centred, forward), the commander's sight high at the rear.
- Rounds 4-7 (2026-11-05, the owner's looks round): matched 3/3 every round; r7 likeness partly / yes / yes. Residual:
  the gun's housing reads as a tier of the turret more than a separate armoured box.
- Shtora and NSVT round 1 (da20677084, critics r12, solo, 3 critics): 3/3 at 7; Shtora partly x3 (plain dark boxes,
  low and close in), the NSVT yes x3.
- Round 2 (79462895ad, critics r13): 3/3 at 7; Shtora yes x3, the NSVT yes x3. The dazzlers at (+-.62, .37, 1.505),
  scale .95, hull-painted housings with hoods so the red lens reads; the NSVT seat .94 -> .86 on a low boss, a full
  circle at full depression (no tables). The left eye's lid holds the GSh-30 to .075-.078 rad from 14 to 2 degrees
  inboard (was up to .18) and .12 at 1-0 degrees; its arc and the rest of its table are unchanged (re-measured with
  .qa-dev/r152/station-table.mjs). The 12.7 mm fires the B-32 12.7x108 (auxiliaryWeapons.ts vehicleHeavyAmmunition).
- The release gate's decor census (2026-11-08) counted two roof weapons against the photo document's one: the
  document now declares 2 (docs/references/photos/russia-152-20261104.json, with the owner's words as the authority).

## Publication receipt (only if requested)

- Not requested; the lane's READY to Main carries the branch, sha and receipts.
