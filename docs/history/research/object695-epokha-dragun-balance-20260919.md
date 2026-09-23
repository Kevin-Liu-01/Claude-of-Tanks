# Object 695 Epokha rebuild and Dragun assault-gun balance

Owner-directed roster update, 2026-09-19. These are procedural family derivation and gameplay decisions, not new historical claims.

## Object 695

The independently authored Object 695 hull and running gear remain unchanged. Its former generic turret is replaced by the corrected Kurganets Epokha construction through the narrow `profiles/epokhaTurret.ts` helper: short 57 mm cannon, four Kornet tubes, eight Bulat tubes, rounded sight housing, source-measured smoke carriers and four distinct roof fittings. Kurganets uses the same extracted builder without a geometry change.

The Object ring remains at `(0, 2.15, -1.10)`. The module is translated from Kurganets by `(0, -0.06, +0.17)` with no scale change. Its trunnion is `(-0.004, 2.857, -0.510)` and muzzle Z is `1.027`; the highest fitting is Y `4.11415`. A short turret-owned collar overlaps the retained hull receiver and module ring. Cannon recoil stock and pitching cradle remain distinct. The actual three sight surfaces publish turret-owned optics receipts.

The owner-authorized weapon channels are 57 mm APFSDS, Kornet, and Bulat. The existing Object primary cycle/damage and Kornet tuning stay intact; the former secondary cannon HE channel becomes the real eight-tube Bulat channel. Its 70 mm nominal caliber and soft-target effect are gameplay approximations, consistent with the existing Kurganets adaptation. Tube censuses are keyed by weapon, so a four-tube rack cannot incorrectly certify an eight-tube channel.

Exact native comparison preserves attributes, indices, mesh order, materials, transforms and instance arrays in both qualities: all authored Object hull/running-gear stock and the entire authored Kurganets vehicle. Generated interior fills are explicitly excluded from that preservation claim. The authenticated old filled meshes were also replayed byte-for-byte to establish the cost baseline.

| Selected native triangles | Prior | Rebuilt, fresh fill | Change |
|---|---:|---:|---:|
| HIGH | 83,386 | 82,162 | −1,224 |
| LOW | 79,098 | 75,860 | −3,238 |

The selected mesh counts are 42 HIGH / 40 LOW. The inherited chassis remains above the newer 80,000-triangle IFV budget and 75% LOW/HIGH target: its ratio improves from 94.86% to 92.33%. The bounded turret update preserves the running gear; it does not claim those performance gates pass.

The active comparison target now represents that authorized family derivation: the original Object hull and running gear, with nine complete Epokha source owners restored from the old 0.965 normalization and translated to the retained Object construction ring. The original reference remains unchanged and historical. The deterministic source-only recipe is [object695_x.json](../../references/source-assemblies/20260919/object695_x.json); `node tools/derive-object695-epokha-source.mjs` recreates the local target from its two authenticated parent exports.

The selected owners are Object_2, Object_4, Object_19, Object_25, Object_27, Object_29, Object_30, Object_31 and Object_32: 36,505 triangles. Their ordered source triangles correspond to the corrected Kurganets export within 0.000000285 m after undoing the old normalization. Only their node scale/translation changes. The entire original binary payload, all other nodes, triangle definitions, materials and textures are identical. The old source's omitted ramp stays omitted; no additional hull assembly change is implied.

Original Object SHA-256: `012dfef5a8aeb31031e58f786883e94f02210476a08c41c5166d764abf47c9b3`. Donor source: `a2b4074765a9f1765c35e3838bd775cfcc2657cb6bb6e7530dc71930f95630d0`. Derived target: `20598454a5f7e8ced5212bcd416c36287626b970af125dde6dc80eeb5d0c0cfd`.

Source-only full bounds retain width 3.985227942 m and length 7.226209164 m; the highest fitting rises from Y4.028141499 to Y4.114150258. Source Object_31 establishes muzzle Z1.027050002 after the ring translation. The gun datum is the existing independent Kurganets source datum plus `(0,-0.06,+0.17)`, giving `(-0.004,2.857,-0.510)`. These construction rings are inferred from receiving stock, not supplied animation pivots. No procedural bounds, image fit, camera, mask or score is an input. The existing 92 floor and 12 mm procedural datum tolerance are unchanged; the former Object gun datum correctly fails the new certificate.

## Dragun and Kurganets balance

Dragun previously combined BMP-3 chassis tuning with the ZTZ-99A2 125 mm gun. It now has a deliberate light assault-gun profile:

- 1,850 HP; 816 hp / 28 t; 72 km/h forward and 30 km/h reverse; 52°/s hull traverse.
- Physical glacis 45 mm, hull sides 25 mm; no added ERA or model changes. Armor ratings are game values.
- Retained 125 mm ammunition effects; 5.4 s single-round cycle, 1.65 s aim time, 0.31 base dispersion; 24 APFSDS, 10 HEAT, 6 HE.
- Faster settled aim and firing than the gun donor, with greater movement and post-shot bloom. The tradeoff rewards stopping to fire and avoids MBT durability.

Moving Kurganets to Tier X exposed genuine DPM/fire-control outliers under the existing balance test. Its declared combat peer is therefore Puma S1, while the existing fitted armor geometry/source frame remains based on its prior structure. Source caliber 57 mm and the four/eight launcher configuration stay unchanged. Final canonical values pass the unchanged fleet and IFV balance guards.

## Focused verification and limits

Passed: HIGH/LOW Object hull calipers; complete-scene four Kornet/eight Bulat terminal rays and four mast sections; actual recessed bore plus flush-cap negative; turret optics ownership; cannon recoil and fixed cradle at every legal pitch; Kurganets measured roof/receiver tests; Dragun real reload/inventory and repeat-sync checks; all source weapon channels; guided tube census; fleet balance; IFV balance; TypeScript/unused checks; strict changed-runtime complexity metrics.

Private receipts are under `.qa-dev/roster-polish-europe/`, including `preservation.json`, `native-before.json`, `native-before-cost.json`, `native-after.json`, `focused-checks-r2.log` and `metrics.json`. The parent integration owns refreshed anatomy, assets and release checks. Focused tests and the bounded visual pilot do not constitute a complete release qualification.

The historical fresh-filled author pilot actually inspected `hero-frontleft` and `close-roof`; rig parity is OK. Both show the complete rebuilt equipment arrangement. Raw edge/profile differences remain in `visual/report.json` against the older reference registration, predating the source-derived target above. `visual-review.json` pins the originals and explicitly limits this to two HIGH author views, without an independent all-view score. Final comparisons against the derived target are a separate acquisition.

The reference regression passes literal binary/body/material/selector/transform mutation controls, old-reference hash rejection and the unchanged 12 mm datum bound. The explicit `--source-proof` run additionally replays both actual local exports, requires exact derived output bytes and verifies the recorded full source dimensions. Existing source registration and assembly replay tests pass unchanged.

## Independent final fourteen-view review — 2026-09-19

All fourteen actual paired originals in `.qa-dev/roster-polish-europe/final14` were independently opened. The reviewer authored neither this exterior nor its hybrid source target. All image/report hashes verify; all 2,837 captured inputs are unchanged before/after and still match the reviewed checkout. Loaded fills, certified source-world registration, shared camera and rig parity are recorded. The separate articulation receipt completed successfully; this visual review did not replay it.

**The requested turret rebuild passes this neutral HIGH visual scope at 9.0 in each view.** The cannon/cradle, paired missile housings, raised small-canister bank, sight/roof fittings and aerials remain recognizable and seated, without an actionable visible regression in the changed turret.

**Whole-vehicle source-detail qualification remains open: minimum 8.0, not fourteen views at 9.0.** The deliberately retained hull has a conspicuous stern difference: dense source louver banks become tall plates with three widely spaced bars, and the broad chamfered source door becomes a narrower squared panel. Rear, rear-quarter and hero-rear views expose this most clearly. The retained bow/deck fixture layout is also simplified. These inherited hull discrepancies do not invalidate the scoped turret result, and this review does not authorize unrequested hull changes.

Exact paths, per-view scores and observations: `.qa-dev/roster-polish/final-fleet-visual-review/object695_x-review.json`, SHA-256 `28364bdf314242ee1a4e48edd9abddf7014507c71a831ae2610f3043dddfa13a`. No fresh Garage/LOW/night or full-release acceptance is claimed. No runtime, tool, source or metadata was modified during review.
