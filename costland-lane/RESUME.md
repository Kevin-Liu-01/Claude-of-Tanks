# costland handoff (2026-10-12 ~00:40, owner stand-down)
Lane: cost-and-landing for contact shadows (R267) and borders (R097). Nothing of mine is running; fifo2 is paused.

## What I own
- Contact shadows (vehicle ground contact), presentation only, never sim or wire:
  - `src/engine/vehicleGroundOcclusion.ts` with its `.selftest.mjs` and `.test-support.mjs` (the CPU twin).
  - `tools/vehicle-ground-occlusion.browser.{fixture,selftest}.mjs`.
  - `src/engine/contactShadows.ts`: `cotNormalAtGuarded`, `CONTACT_NORMAL_BREAK_PX`.
  - `src/engine/post.ts`: the aerial vehicle and ground branches, which call grime, the contact blend, the ground shade as RGB and the soil band, plus the rig gate in `updatePostLightFx`.
  - `src/world/groundPressure.ts` and `src/world/tallGrass.ts`: the fine 24 m grass-press field and the full-footprint stamp.
  - `src/main.ts` `worldFramePresentation`: the press is published while paused.
- Borders r7 landing: `borderLandform` `MAP_BORDERS` batch6, opt-in per map, plus `borderBatch6.selftest`.
- Lane tools, not in git; copied to backup branch `backup/20261012/costland-lab`:
  - `.qa-dev/contact-lab4.mjs`: same-frame A/B variants driven by `__LIGHT_TUNE` levers.
  - The wave builders (`wave/*/mkshots.py`) and the analysis scripts.
  - Cost units in fifo2: `costland-bnc`, `costland-r4v`, `costland-r6c`.

## Passed (SHA → gate)
- Contact r3 `cda00f45e`: wave 340 identity (no harm); v3 desert ACCEPT 8/8. LANDED (in main).
- Contact r4+r5, `visual/contact-shadows-r5` @ `2ece2dbc8`:
  - Waves 372a/b and 400a/b: flat, no view dropped by more than 0.5.
  - Receipts PASS: typecheck, `vehicleGroundOcclusion` + `shadeFill` + `runningGearGroundRun` selftests, the vgo browser receipt (worst 4e-6), late-fx browser, and 86 post/main readers (`rcpt/rD1`).
  - The owner's slab under the rear overhang is fixed: luma 10 on main → 23–26 (joint cap 0.35; 0.8 on snow).
  - Left: cost only.
- Borders r7, `visual/borders-r7-land` @ `8c94fa52f`:
  - Waves 313, 330 and 331.
  - Tier-1 receipts and typecheck PASS (`rcpt/rB-t1`, `-t1b`, `-t1c`).
  - Left: cost only.

## Pending (gate)
- `costland-bnc`, borders cost at stamp …245: `nv1–4` (Verdant) and `nc1–4` (coastal), rB (8c94fa52f) vs rM (main 62b2d2455).
- `costland-r4v`, contact r4+r5 cost at stamp …246: `dr1–4` (desert) and `dw1–4` (winter), rG (2ece2dbc8) vs rE (893bf78c9).
  - Coordinator ruling for both: accept at 4 cycles when every view's mean + 2 SE is under 0.6 ms GPU and 0.38 ms CPU; otherwise top up to 8.
  - Report: `python3 $SP/fifo2/bin/v3check.py report --fbp=$SP/costland/cost/v3:<map>:<prefix>`. Add `--scene-delta-ok=5,8` for nv/nc.
  - On ACCEPT, send f17 the drafts `costland/f17-borders-r7-draft.txt` and `f17-contact-r4-draft.txt`.
  - Load over 150 voids the CPU half of a cycle.
- `costland-r6c` (…292): frames plus the GPU check (`rh-vgo-browser2`) for r6.1, `visual/contact-shadows-r6` @ `62410905e` (rH). Not yet waved.
  - Builds on r5. Grass soil band in opaque clods (the grass's own brightness ×1.35, warm soil colour). Snow foot as opaque packed snow to an uneven 2.3–9.4 cm. The middle of the track keeps its steel. A lit snow ridge beside the track. Press over the hull's full footprint.
  - Receipts: selftest PASS, typecheck rc=0. The GPU check is queued.
  - Gate: capture → check the soil in shade and the snow foot from above → wave (r3eq vs full, owner case first) → v3 → receipts.

## Open defects and critic asks
- Snow (both critics, waves 340, 372, 400): flat untouched snow plane with a crisp straight edge — no rut, no berm, no tracks behind.
  - The real fix is terrain displacement from the press field's crush memory, render-only. Parked; not started.
- Round 6 as built (13e734b07) failed my own frame check: the soil came out mauve-grey, the snow foot looked painted, the berm was invisible. All three are fixed in r6.1, which nobody has looked at in frames yet.
- Grass (opus): ground already too dark; track pads lit brighter than the soil beside them. Covered by r4/r5 grime, the gear cap and r6.1 soil — r6.1 still unverified.
- Not mine; routed:
  - Penumbra on the vehicle's shadow edge: shadows lane, `visual/shadows-r3` @ 34d1dcb51 and r4 b9e007146.
  - Slat cages drawn as solid black slabs, faceted wheels, stepped camo, flat grass cards.
  - Garage "second turret": the garage lane.
- Merge rule: whichever of contact r6 and shadows r4 lands second adds `&& !cotStructPixel` to the `cotVehicleSoilBand` call.

## What I'd do next, one item at a time
1. Land r4+r5. Its review is done, it fixes the owner's own complaint, and only cost is left.
2. Land borders r7. Same position: review done, only cost left.
3. Judge r6.1 in frames before any wave, with the owner case first. If the snow still reads "flat plane", stop iterating on screen-space tricks.
4. Do snow/soil ruts as real render-only terrain displacement. All three critic waves point at missing deformation, not shading.

---
(history below)

# costland lane — RESUME (Fri 2026-10-09)

Brief: cost-and-landing for R267 contact shadows (nightsky 529e03d10) and R097 borders (b6 9e743d342 + rise 96591a17f +
slab 840f6060c). Protocol: $SP/LANE-PROTOCOL-20261009.md. Coordinator = "main" (SendMessage to: main). f17 = adfc0f4b4b146f0f7,
wave builder = aa82a418c089d23bb.

## Roots (APFS-cloned checkouts; mkroot.zsh / build.zsh; dist/media pruned after build)
- rA = origin/main f34f8751e (detached), measurement only. Lab tool: rA/tools/frame-budget-probe-lab.mjs (untracked):
  toggles vg-ao, face-trees, sward-edge, horizon-ring, lab-null; --toggle=a+b+c; COT_LAB_TOGGLE_ROUNDS env.
- rC = branch visual/contact-shadows-r2: main + 5222d5eab (cherry-pick of 529e03d10) + 97c072120 (lazy run reads).
- rB = branch visual/borders-r7-land: main + merge b6-head (be729964f, conflicts resolved: ring finish stage ports in
  terrain.ts, tallGrass union, horizon.ts imports) + merge rise (964cd832a) + merge slab (13e9f6d82).

## Queue (fifo2 lane "costland"; mkjob.py <kind> [--stamp=] [--submit])
- Band stamps granted by coordinator: …291 tgc1 (contact toggles), …292 tgb1 (borders toggles), …294 cc1, …295 bv1.
- cc2..cc8 submitted (priority, stamped when live). bv2+ and bm* held until tgb1 attribution.
- Old ccost4/dv6 withdrawn (coordinator OK). ccost3/dv5 ran on old roots: cc pooled +0.45 ± 1.7 (3 cyc), dv +1.51 ± 1.6 (5).

## Findings so far
- dv1-5 measured b2=638de8ae7 (round 3b) vs head, never the rise. Chase census: +7.2k tall-grass, +12.5k tufts(terrain),
  +15.5k vegetation instances; draws equal; no shader text change in b2.
- Contact: one hull with bots hidden; new GLSL read 3 knots per in-reach pixel; now lazy (lane/shoe branches only).

## Next
tgc1/tgb1 analysis (costland/tganal.py) -> trims -> v3 -> waves (wave-306 list for contact; Verdant-only + coastal/fjord
slab views for borders) -> receipts -> push branches -> sha to f17.

## 16:40 update
- tgc1 (block toggles) unusable: GPU contention, null swings ±5–14 ms. Replaced by frame-level interleave (lab tool
  --interleave=a+b, period-8 balanced flips; analysis costland/ilanal.py): ilc1 (…291), ilb1 (…292).
- Wave captures = split unit costland-wave at stamp …250 (coordinator), 11 parts: cw-battle/garage/studio (contact,
  A=rA B=rC, wave-306 views; mkshots.py builds shots.json) and bw{A,B}-{verdant,coastal,fjord,saltwind} (census tool
  copied to rA/rB .qa-dev; outputs wave/borders/<side>-<map>/frames/<map>/<view>.png). cw-garage done.
- Receipts: full closure too slow (9 h). Tiered: rB tier1 (world/horizon/collision, 141) running as rcpt/rB-t1;
  rB.t23.txt (333) later. rB1 partial: fleetPassHigh strv81 joint mismatch (no vehicle change in rB -> main red/flake),
  visual-census-lock rc=1 (lock timing, env/load).

## 18:30 update (end of turn; coordinator resumes me when fifo2 restarts)
- Contact r2: wave 329 = exactly no-harm (0.00 both critics). Branch visual/contact-shadows-r2 97c072120 PUSHED. Lands once
  cost clears: ilc1 (…291, interleave vg-ao on rA vs rC desert chase) + cc1..cc8 (…294 then band) still queued.
  Contact round 3 (coordinator, after borders): visible improvement — soft contact gradient tens of cm, sinkage/ruts/berm
  on soft ground (overlay or decals), snow-edge fix; coordinate desert shadow fill with shadows lane a0eabf6d19d47be2e;
  wave vs main must show a GAIN + v3.
- Borders: waves 330 (Verdant: sonnet −0.17 corner-ne, corner-ne-up) and 331 (coastal/fjord no drop; saltwind edge-e-band
  −0.14). Committed a414dcfb4 on rB: batch 6 OPT-IN per map (borderLandform.ts batch6/borderBatch6): coastal + fjord only;
  every other map = main's edge (tallGrass 474 cull, tufts _tuftEdgeM 474, relief legacyStands + no wind, no standAt /
  face trees / lone law, no far rise, hedges buildBorderHedgerowsLegacy = main's code). Slab fix unchanged (identical on
  inland maps; per wave 313 it changes only sea maps' apron/high views). Receipt src/world/borderBatch6.selftest.mjs
  (registered after horizonFarRise). Light receipts pass: borderLandform, horizonFarRise, borderHedgerows, tallGrass,
  borderBatch6. NOT yet: typecheck (CPU quiet), rebuild of rB (needs coordinator OK), push.
- Withdrew ilb1 (…292) and bv1 (…295): they measured Verdant b6, now moot. Reuse those stamps for: v3 on coastal + fjord
  (the opted-in maps; views chase + an edge/apron view) after rB is rebuilt in place (prune dist, build.zsh rB).
- Next after rebuild: (1) census capture Verdant + saltwind on new rB and pixel-compare to A (main) — target Verdant
  identical (no wave needed); saltwind = slab on apron only; (2) v3 coastal/fjord; (3) receipts tier1 rest + typecheck;
  (4) push visual/borders-r7-land; (5) send shas to f17 (adfc0f4b4b146f0f7) with the tankFactoryCore overlap note for
  contact (fix/vehicle-contact also edits it).
- Waves 279/280 (b6 rounds 1–3b vs PR head e65122a84) covered autumn, steppe, urban, alpine, frontier, monsoon (+verdant,
  fjord, coastal): all no drop >0.5 (autumn rim-n −0.5 sonnet borderline). Not waved: the other ~20 maps. Opting maps in
  is a one-line MAP_BORDERS change (batch6: true).
- Receipt run rB-t1 paused at 31/141 for CPU QUIET (resume with remaining list after "quiet over"; rerun mapLayoutBrief,
  collisionManifestDrift, visual-census-lock, dedicatedWorldCollisionMemory alone). strv81 fleetPassHigh = known main red.

## 18:40 update (parked again per coordinator)
- Rulings: saltwind = wave 313 stands (no re-wave); other maps stay on main tonight (opt-ins later, restyle maps first:
  autumn, steppe, monsoon, titan, skybridge, each with a wave vs current main); Verdant NE redesign = later round.
- rB rebuilt in place at a414dcfb4 (dist/BUILD_HEAD), via $SP/locks/build1 (costland/build-slot.zsh releases by python).
- Submitted: bwB2-verdant, bwB2-saltwind (identity census, …250 unit; compare with wave/borders/identity.py — target
  Verdant identical to A, saltwind identical except apron which is not in the set), bc1 (…292) + bf1 (…295) and bc2-8,
  bf2-8 (v3 coastal/fjord, views chase + edge-e-low, check v3check --fbp=costland/cost/v3:<map>:bc|bf --scene-delta-ok=5,8).
  ilc1 (…291) + cc1..8 still queued for contact.
- When v3 + identity are in: typecheck rB, finish tier-1 receipts (after quiet over), push visual/borders-r7-land, then
  send f17 both shas (contact 97c072120 pushed; note tankFactoryCore.ts overlap with fix/vehicle-contact).
- Then contact round 3 (visible gain wave + v3).

## 00:05 Sat 10-10 — URGENT owner ask (23:00): "super super dark rectangular shadows under tracks?? fix this"
- Cause (traced + shadows lane a0eabf6d19d47be2e agrees): vehicleGroundOcclusion's track-lane contact = occ 1 under the
  shoes; in the hull's shadow ambShare = 1 → ground keeps 1 − sBelly ≈ 7–15 % of sky → near-black slab (production:
  5 mm edge, any depth, 0.3 m past run ends). Fleet scan (rA/.qa-dev/lane-scan.mjs, res/lane-scan.jsonl): 220 tanks,
  lanes match shoes, no spill (only hull overhang flags).
- Fix = contact round 3 on branch visual/contact-shadows-r3 (rC, LOCAL, rebased on main 62b2d2455):
  4bbb0e5c1 (r2) + 5ea1b966c (lazy knots) + 18d2a1448 (r3: CONTACT_MAX 0.7, SPREAD 0.15 squared, RISE 0.25, GAP 0.10,
  max-join). vehicleGroundOcclusion.selftest PASS. rC built at 18d2a1448; rM = main 62b2d2455 built (A root).
- Queued (priority, stamps …251–257): lab3-id (same-frame toggles on rM: full/noao/nosscs/nobatch, verdant side/low,
  m1a2/spz_puma/challenger2e desert camo → wave/r3/id), lab3-bA/bB (battle verdant+desert side/low/rear → wave/r3/battle/
  {a,b}/<spec>/<map>/<view>-full.png), lab3-wA/wB (winter m1a2), cw3-garage (wave/r3/garage), rc-vgo-browser (GLSL vs
  CPU receipt). v3: cr1..8 (desert chase, …291) + cv1..8 (verdant chase) rM vs rC.
- Tool: rM/.qa-dev/contact-lab3.mjs (copy of nightsky contact-lab + --dists/--specs/--camo/--variants per dist).
- After frames: build shots json → wave builder (aa82a418c089d23bb) → verdict; v3; receipts (rC.affected list: run the
  vehicle/engine ones; tankFactoryCore touched); typecheck; push visual/contact-shadows-r3; sha to f17 (overlap note:
  fix/vehicle-contact also edits tankFactoryCore — now on main, rebased cleanly).
- Borders note: identity census Verdant 7/8 identical to main; corner-ne-up differs 3360 px (far-earth band of the slab
  fix 7cbf9b9bd on inland maps) → needs a Verdant view waved or gate the far-earth change to sea maps. Saltwind B2 pending.

## 02:55 update
- Same-frame toggles on main 62b (wave/r3/id, ratio maps wave/r3/ratio-*.png): noao removes 31–105k px of darkening;
  nosscs ≤157 px; nobatch 0 px → it is the vehicle ground AO. Near-black: the lane + the belly region seen between road
  wheels (ratio 0.03–0.08).
- r3 now = 18d2a1448 (contact cap 0.7 soft rim) + 2d1a0f58e (joint occ cap GROUND_AO_OCC_MAX 0.7). Pushed: 18d2a1448;
  2d1a0f58e local until frames. rC rebuilt at 2d1a0f58e.
- Before frames done (wave/r3/battle/a). After/winter/garage/vgo receipt re-queued in split unit costland-slab …223.
- Borders: visual/borders-r7-land 983ebe426 PUSHED (main 62b merged; Verdant+Saltwind opted in); rB rebuilt; v3 nv (…292),
  nc (…295), nf, ns queued vs rM. Contact v3 cr (…291) / cv queued vs rM (rC path → now measures 2d1a0f58e).

## 04:15 update
- r3 final (pushed) = 4bbb0e5c1, 5ea1b966c, 18d2a1448 (contact rim), 2d1a0f58e (joint cap), 87764820a (card sun test,
  hullSunShadow 3 boxes), cda00f45e (caps: contact 0.6, joint 0.55). rC built at cda00f45e.
- Frames: wave/r3/battle/{a,b}, garage/{a,b}; older b builds kept as battle-b-2d1a0f58e, battle-b-87764820a.
  Numbers: darkest AO main ~5 → r3 11–14 (noao 23–27); sunlit gaps 21–28 → 28–53.
- Wave: shots.json (18 pairs) sent to wave builder 04:15. v3 cr/cv queued (…291). Receipts rerun: rcpt/rC4.
- Owner screenshot path asked from coordinator (not reproduced exactly).

## 07:05 update
- Contact v3 cr: 2 cycles +0.58 ± 2.12 (POOL). cr2–8 + cv1–8 grouped as split unit costland-crv at …291.
- Borders: tier-1 receipts on 983ebe426 done: all pass except horizonRelief/borderFarmsteads (fixed in 8c94fa52f: opt
  their maps in via terrain.border.batch6) and the load flakes visual-census-lock / dedicatedWorldCollisionMemory (fail on
  main too under load). Pushed 8c94fa52f. Typecheck rB running (rB.typecheck2.log).

## 08:18 update
- Contact v3 cr: 6 cycles GPU -0.146 ± 0.825, CPU -0.083 ± 0.158 (POOL); cr7 running 08:15; cr8 + cv1–8 queued (…291).
- Borders rB typecheck (8c94fa52f) rc=0. Load-flake receipts still to rerun alone (visual-census-lock, dedicatedWorldCollisionMemory).
- DISK: 6.6 GB free, swap 31.4/32 GB. Pruned rA/dist (0.33 GB) and wave/contact (r2 frames, wave 329 closed; 0.18 GB).
  No builds. Alerted main 08:18. Wave 340 (contact r3) still unjudged; asked main.

## 08:36 update
- Contact v3 cr (desert chase): ACCEPT 8/8 — GPU -0.238 ± 0.616, CPU -0.053 ± 0.123 (res/v3-contact-r3-desert-chase.txt).
  cv1–8 queued (…291) behind roads-r6 ×3 + maprev-freight-gate-timing.
- vgo browser receipt on rC (cda00f45e) PASS 04:02 (wave/r3/vgo-browser.log: GLSL = CPU twin, worst 1e-6).
- Borders 8c94fa52f receipts rerun (rcpt/rB-t1c): visual-census-lock, borderFarmsteads, horizonRelief,
  dedicatedWorldCollisionMemory (direct + wrapper, 14 s) all rc=0. Typecheck rc=0. Remaining gate: v3 nv/nc/nf/ns.
- Disk 2.7 GB free 08:36; pruned wave/borders too (0.63 GB total). Alerted main twice.

## 09:59 update (coordinator 09:57: desert ACCEPT is enough for contact; cv doesn't block; borders lands on nv/nc v3)
- Contact r3: land cda00f45e when wave 340's verdict arrives (critics running). f17 draft: f17-contact-r3-draft.txt.
- Queue: borders nv1–8 + nc1–8 interleaved = split unit costland-bnc at …292 (live). cv6–9 moved to …294 (cv1 ENOSPC → cv9).
  nf/ns deferred extras. cv: 4 valid, GPU -3.3 ± 5.2, CPU -0.11 ± 0.72 (noisy: foreign headless Chrome).
- Both branches merge-tree clean on main 786e24b97.

## 11:25 update — CONTACT ROUND 4 (coordinator approved 10:59/11:05)
- r3 cda00f45e sent to f17 10:12 → merged clean into integ/213 (f17 10:2x). Wave 340 = identity/no-harm; desert v3 ACCEPT.
- r4 root rD = branch visual/contact-shadows-r4 (local, NOT pushed yet): 893bf78c9 (merge main c996f293c into r3) + 60228712a
  (round 4). Built (dist 60228712a). Base root rE = 893bf78c9 (built) for v3.
- r4 terms (levers __LIGHT_TUNE GROUND_AO_CORE/_BAND/_BERM/_GRIME/_WALL_SOFT/_NORMAL_GUARD; lab4 variants r3eq/nocore/...):
  core 0.75 (flat 1.8 cm, gone 4.5 cm) past the cap; shoe-band analytic sun shadow (10 cm band); broad share ×0.7 outside the
  footprint from its edge out; snow berm 4 cm/22 cm (albedo>0.55); grime ≤0.3 on vehicle pixels in the lane near the foot
  (none on snow); cotNormalAtGuarded (contactShadows.ts); main.ts publishes the grass press while paused (presentation only).
- Receipts: vehicleGroundOcclusion.selftest PASS (new section 11), groundPressure PASS, vehicleOcclusion PASS, contactShadows
  PASS, typecheck rc=0, browser vgo PASS 4 cases worst 4e-6 (rd-vgo-browser).
- Diagnosis tool: rM/.qa-dev/contact-lab4.mjs (views lowside/bay/owner; variants nocav/noall/r3eq/...; pose.press/light).
  Diag frames: wave/r4/diag (main a, r3 b), wave/r4/diagw (winter r3).
- Queued (…223 slab unit): lab4-r4-owner (leo2a6_ua desert verdant owner+lowside: a=main 62b, b=r3, c=r4 full/r3eq/noao →
  the OWNER THREE-UP the coordinator asked for), lab4-r4-battle-b/c, lab4-r4-winter, cw4-garage.
- v3 r4: dr/dv/dw 1–8 (A=rE, B=rD) unit costland-r4v at …294 (after bnc). cv6–9 moved to normal place (optional).

## 12:35 COLD-RESUME CHECKPOINT (owner leaving; coordinator: commit+push+resume notes)
### Branches (all pushed, plain pushes)
- contact r3: visual/contact-shadows-r3 @ cda00f45e — SENT to f17 10:12, merged clean into integ/213 (f17 will report landing).
- contact r4: visual/contact-shadows-r4 @ 60228712a (pushed 12:35; = 893bf78c9 merge of main c996f293c into r3 + round 4).
- borders r7: visual/borders-r7-land @ 8c94fa52f (pushed). All receipts + typecheck PASS. Gate left: v3 nv + nc (coordinator
  10:00: land on nv/nc only). When bnc decides ACCEPT → send f17 the sha 8c94fa52f + receipts (rcpt/rB-t1c, rB.typecheck2.log).
### Roots ($SP/costland; dists built): rM main 62b (borders A, owner main), rB borders 983ebe426 build (HEAD 8c94fa52f
  receipt-only), rC r3 cda00f45e, rD r4 60228712a, rE r4-base 893bf78c9. rA REMOVED (tools backed up in costland/lab/).
### Lab tools: rM/.qa-dev/contact-lab4.mjs (copy in costland/lab/): views side/low/rear/lowside/bay/owner/rearq/rearqhi/
  chase; variants full/noao/nocav/noall/r3eq/nocore/noband/noberm/nogrime/nosoft/noguard; --press=1 (default) stamps the
  player's grass press (harness never steps it); pose records press/light/ground shape/camera matrices.
### fifo2 queue (lane units):
- costland-slab (…223, live): lab4-r4-battle-c (rD full+r3eq), lab4-r4-winter (rC/rD), lab4-r4-owner3 (THE OWNER'S CAMERA:
  ua_m1a1_x + leo2a6_ua desert verdant rearq/rearqhi/chase, a=main b=r3 c=r4), cw4-garage (rC vs rD), rd-latefx-browser.
  DONE: rd-vgo-browser PASS (4 cases, worst 4e-6), lab4-r4-owner (low side three-up), lab4-r4-battle-b (rC).
- costland-bnc (…292): borders v3 nv1–8 + nc1–8 interleaved (A=rM, B=rB). Report: v3check report --fbp=costland/cost/v3:verdant:nv
  and :coastal:nc (both with --scene-delta-ok=5,8).
- costland-r4v (…294): r4 v3 dr/dv/dw 1–8 (A=rE, B=rD; desert/verdant/winter chase). Report --fbp=costland/cost/v3:desert:dr etc.
- cv6–9 (r3 verdant v3, optional) at normal place; nf/ns borders extras deferred.
### NEXT STEPS (in order)
1. When lab4-r4-owner3 ends: build the three-up from the rearq/rearqhi/chase frames (owner3/{a,b,c}/<spec>/verdant/<view>-full.png),
   compare with OWNER-SCREENSHOT-20261010.png (elevated rear-quarter, dark slab under the hull rear + along the track);
   measure the slab: edge hardness (10–90 % width in px/cm via pose.ground + pose.proj) and darkness vs open turf for main/r3/r4.
   Send the three-up + numbers to the coordinator (it shows the owner only if it clearly answers the screenshot).
2. Wave: run wave/r4/mkshots.py after battle-c/winter/garage end; put the owner rearq case FIRST (add it to mkshots: owner3/b vs
   owner3/c); send shots.json to the wave builder aa82a418c089d23bb + copy the coordinator. Before = r3 (rC), after = r4 (rD).
3. v3 r4 (r4v) must ACCEPT; receipts done (rcpt/rD1: 86/86 PASS; typecheck rD rc=0; vgo PASS). latefx browser pending.
4. Then r4 sha to f17 (overlap: post.ts +5 lines in the aerial vehicle branch; main.ts worldFramePresentation block; contactShadows.ts).
5. Borders: when bnc ACCEPTs → f17.

## 14:03 update — the owner's ORIGINAL screenshot (coordinator 12:22)
- File: wave/r4/owner/OWNER-SCREENSHOT-20261010.png (448×232): ELEVATED rear-quarter (~25° down), cage hull, sand wheels;
  the defect = near-black slab on the grass under the hull's rear overhang and along the run (luma ~10–13 vs grass 55–75).
- owner3 (rearq/rearqhi/chase; ua_m1a1_x + leo2a6_ua; a=main b=r3 c=r4 0.55) DONE → threeup-*.png in wave/r4/owner3/.
  slabmask.py (costland/): main slab luma 10 (0.12–0.25 of turf, edge step 2.8–3.8×); r3/r4 17–20 (0.21–0.42, 2.0–2.2×).
  r4 = r3 inside the footprint (cap 0.55 there). Sent to coordinator 14:02.
- NEW: a75daa4e8 (rD branch, PUSHED 14:04) = the joint cap as lever (uVehGroundR5.z, __LIGHT_TUNE.GROUND_AO_OCC_CAP;
  shipped GROUND_AO_OCC_MAX 0.55). Root rF = a75daa4e8 built (dist) for cap-variant captures.
- Queued: lab4-r4-caps (rF; variants full/cap45/cap35/cap25/noao; views rearqhi/rearq/chase/ownerq), lab4-r4-owner4b (ownerq/
  ownerq2; a/b/c; owner4 hung 57 min under load and timed out). battle-c running (rD 0.55).
- Withdrawn until the cap is settled: lab4-r4-winter, cw4-garage (recapture both with the final r4 build).
- NEXT: pick the cap from the caps frames (slab vs adjacent shadowed turf ≤ ~1.4× step, not near-black; contact core still
  reads), set GROUND_AO_OCC_MAX in rD (update selftest range assert 0.5–0.6 → new range), commit, push, rebuild rD AFTER its
  pending jobs (r4v v3 uses rD as B — rebuild before r4v starts or re-point r4v), recapture owner three-up (ownerq: a/b/final),
  battle (c), winter, garage; wave with the owner case first; v3; f17.

## 14:22 update — CAP CHOSEN 0.35 (coordinator 14:10 approved the sweep; criteria: slab a soft gradient, not the darkest thing,
## hull still sits on the ground; check noon / low sun / snow; then main/r3/r4-final from the owner's framing → coordinator)
- Cap sweep (wave/r4/caps, rF since removed): slab luma main 10 → r3 17–20 → 0.45 22–25 → 0.35 25–28 → 0.25 28–30 → no AO 33–36;
  edge 2.8–3.8× → 2.0–2.2× → 1.4–1.8× (0.35) vs 1.3–1.5× with no AO (the hull's own sun-shadow edge). capeval.py prints it.
- r4 FINAL so far: visual/contact-shadows-r4 @ 60399178f (pushed): 60228712a round 4 + a75daa4e8 cap lever + 60399178f cap 0.35.
  rD rebuilt at 60399178f (dist). Receipt vehicleGroundOcclusion.selftest PASS at 0.35 (rD.vgo-selftest2.log).
- Disk 32 GB (below 40): no more builds; rF pruned+removed.
- Queued (slab unit …223): r4f-owner (c: rearq/rearqhi/chase/ownerq full+noao; main/r3 for rearq/rearqhi/chase = owner3/a,b;
  ownerq main/r3 = owner4b), r4f-lowsun (a/b/c --time=sunset), r4f-snow (winter a/b/c), r4f-noon (desert a/b/c), r4f-battle
  (c verdant 5 specs × side/low/rear/bay; before = battle/b), r4f-winter (b/c), r4f-garage (b/c), rd-vgo-browser2,
  rd-latefx-browser2. owner4b still pending.
- NEXT: three-up main / r3 / r4-final (owner framing) + low-sun/snow/noon checks → coordinator; wave: update mkshots (owner3/a? no:
  before = r3 b frames, after = final c frames; owner case first: owner3/b vs final-owner/c for rearq/rearqhi/chase); then the wave
  builder; r4v v3 (B=rD final); latefx/vgo receipts; f17.

## 14:45 update (QUIET from 14:35: no CPU work; fifo2 paused; resume when the coordinator says "QUIET over")
- LAB BUG fixed 14:27: contact-lab4 forced GROUND_AO_OCC_CAP 0.55 on every non-capNN variant, so r4f-owner's "final" frames were
  at 0.55 (= r3). Now: capNN sets it, r3eq = 0.55, others leave the build's cap. r4f-owner frames pruned; r4f-owner2 queued.
  The cap sweep (caps/) stays valid (full there = 0.55 by intent).
- vgo-browser2 on rD 60399178f: PASS (4 cases, worst 4e-6). Typecheck at 60399178f still to run after QUIET (last rc=0 at 60228712a).
- mkshots.py rewritten: owner case FIRST = owner3/b (r3) vs final-owner/c (r4 final) for leo2a6_ua rearq/rearqhi/chase and
  ua_m1a1_x rearq/chase; then battle/b vs battle2/c, winter2 b/c, garage2 b/c. Run it when the r4f captures land.
- Map-content (adee09ec2a558ba9f) asked for set-piece contact shading (Whiteout Sno-Cat, Copper haul trucks): replied they add
  patches via buildVehicleContactShadows with SET_PIECE_SIZE footprint, alpha ≤ 0.45 core, soft 70→110 %, crease ≤ 0.6 at
  contact lines; no double-darkening (my term covers only nearVehicles tank hulls).

## 16:40 update
- SNOW FIX: a5a058101 (pushed) — on snow (snowWeight of ground albedo) cap 0.65 and no broad softening; grass/sand 0.35/0.7.
  (0.35 on winter lifted the under-hull shade to 0.84–0.86 of open snow vs main 0.64–0.74.) rD rebuilt at a5a058101.
- Owner three-up (grass, unaffected by the snow fix) SENT 16:20: wave/r4/threeup-final/ (main owner3/a, r3 owner3/b, r4 final-owner/c).
- Checks: low sun (final-lowsun) OK; desert noon (final-noon, sun 44°) no slab, cast shadow identical; snow → fixed, recapture.
- Mishaps: r4f-battle overlapped the rD rebuild (16:29) → boot timeout → requeued as r4f-battle2; owner4b crashed (target closed)
  — ownerq framing dropped (coordinator accepted the rear-quarter framing). latefx2 browser receipt PASS ("ok": true).
- Queued now (slab unit): r4f-snow3 (c, winter rearq/chase), r4f-winter3 (c, winter side/low/bay; before = winter2/b),
  r4f-battle2 (c, verdant 5 specs; before = battle/b), r4f-garage2 (b/c). mkshots.py updated (winter3/c).
- NEXT: when these land → snow numbers (under-hull vs open snow ≈ main's 0.64–0.74) → coordinator; run mkshots.py → wave builder
  (aa82a418c089d23bb, copy coordinator) with the owner case first; v3 r4v (B = rD a5a058101) after bnc; receipts at a5a058101
  (selftest PASS; typecheck PASS at 60399178f — only constants/uniform packing changed since; rerun typecheck once); then f17.

## 17:56 update
- r4 FINAL = visual/contact-shadows-r4 @ a5a058101 (pushed); rD dist = a5a058101. Typecheck rc=0, selftest PASS, vgo browser
  PASS (vgo-browser3), latefx browser ok. Snow: under-hull 0.68–0.74 of open snow (main 0.64–0.74, r3 0.74–0.78).
- WAVE SENT 17:55 to the wave builder (aa82a418c089d23bb), coordinator copied: wave/r4/shots.json (23 pairs; owner first).
  Await the wave number + verdict from the coordinator.
- v3 r4v (…294) queued behind bnc (…292). Offered the coordinator a stamp swap.
- f17 draft: costland/f17-contact-r4-draft.txt (fill wave + v3).

## 10-11 03:52 update
- Session was suspended ~18:15 → 02:30. No costland fifo2 job ran since 17:49 (timing band starved behind pictures).
- Coordinator 18:1x: r4 final a5a058101 approved (0.35 grass/sand, 0.65 snow); showing the owner the three-up; keep wave + v3 order.
- Wave packed as 372a (owner 5 pairs + 2× crops) + 372b (Verdant 10, winter 4, garage 4). 372a report: both critics found NO
  near-black slab under the overhang in before (r3) or after (r4); scores before≈after (4.0–4.8, lower critic 4.22). Their
  remaining defects are lighting (flat hull, slat cages cast no shadow on the hull), terrain materials, track-end contact on
  sunlit grass. 372b critics pending. Coordinator gives the verdict.
- main is ef03eedd8 (deploy 214 row); r3 cda00f45e NOT on main yet (213 pending?). merge-tree clean for a5a058101 and 8c94fa52f.
- Drafts: costland/f17-contact-r4-draft.txt, costland/f17-borders-r7-draft.txt.

## 10-11 07:33 TRIAGE (coordinator 07:25: the cost band holds ~42 h; keep only gating series, 4 cycles, early-accept)
- Withdrew 44 (copies in fifo2/withdrawn-20261011/): cv6–9, nf1–8, ns1–8, nv5–8, nc5–8, dr5–8, dw5–8, dv1–8.
- LEFT (16): costland-bnc nv1–4 + nc1–4 (borders r7 8c94fa52f; A rM, B rB) and costland-r4v dr1–4 + dw1–4 (contact r4
  a5a058101; A rE, B rD). Top up only if v3 undecided at 4 (re-submit from withdrawn copies with the same stamp/unit).
- Pruned rC/dist (no pending job names it). Disk 45 GB.
- Offered the coordinator to withdraw r4v if 372b also reads flat.

## 10-11 08:03 PARKED (coordinator: end the turn while waiting; a harness background wait is armed)
- Coordinator 07:4x: keep r4v (dr/dw). r4 lands if 372b shows no view dropping >0.5 (it carries the snow under-hull fix).
  bnc is the borders gate: nv + nc ACCEPT → send f17 8c94fa52f (draft costland/f17-borders-r7-draft.txt).
- Background waiter bdnlni1gi exits when wave372b's report appears or any nv/nc/dr/dw cycle ENDs (2 h limit).
- On wake: (1) v3 reports: python3 $SP/fifo2/bin/v3check.py report --fbp=$SP/costland/cost/v3:verdant:nv --scene-delta-ok=5,8
  (and :coastal:nc, :desert:dr, :winter:dw); top up only if undecided at 4 (resubmit from fifo2/withdrawn-20261011/ copies,
  same stamp/unit). (2) 372b: read gauntlet/waves/wave372b-report.md; no view < −0.5 → r4 OK. (3) Send f17 per drafts.

## 10-11 09:52 ROUND 5 (coordinator 08:55 approved the plan)
- Branch visual/contact-shadows-r5 @ d2f45b672 (pushed) in root rG (NOT built: disk 38 GB < 40 floor). Commits b27530f16 (round 5)
  + d2f45b672 (blend only on the grounded rig).
- Terms: no shoe skip (lever GROUND_AO_SHOE_SKIP=1 restores); gear cap 0.75 for cards in a lane along the ground run; snow cap 0.8 +
  cool cast (cotVehicleGroundShadeRgb); contact blend (cotVehicleContactBlend: 3 cm/0.6 grass, 7 cm/0.85 snow, ground 6 cm beyond the
  outer face, pre-pass colour × the block's ground shade); fine press field (GROUND_PRESSURE_FINE_WINDOW_M 24 m / 256 texels).
- Lab levers (contact-lab4: r4eq, shoeskip, nogear, noblend, nocool, nofine). Receipts PASS (list in commit); typecheck rc=0.
- Queued: rg-vgo-browser (no dist needed). Proposed to coordinator: re-point r4v to r4+r5 (B = rG) for one v3.
- NEXT when disk ≥ 40: zsh costland/build-slot.zsh rG; then submit r5 captures (owner rearq/rearqhi/chase d=rD vs g=rG + g:r4eq;
  Verdant bay/side/low 5 specs d vs g + g:shoeskip; winter side/bay/low d vs g; garage d vs g); measure; wave (before r4 → after r5).
- Garage "second turret" = main's 40946878c Abrams welding bay (routed to the garages lane by the coordinator).

## 10-11 09:58 coordinator: YES — re-point r4v at r4+r5 (B = rG vs A = rE), same stamp …294, land r4+r5 together after r5's wave
- Withdrew dr1–4/dw1–4 (r4-only; copies fifo2/withdrawn-20261011/costland-d?N.r4only.json). mkjob.py dr/dw now B = rG.
- rg-vgo-browser was SKIPPED (needs must name a dist): resubmit after the rG build with needs [rG/dist].
- Background waiter bvru5p2lf exits when disk ≥ 40 GB (or a bnc cycle ends). On wake:
  1. zsh costland/build-slot.zsh rG  (check df first; ≥ 40)
  2. resubmit r4v: cd costland; i=201; for k in 1 2 3 4; do for m in dr dw; do python3 mkjob.py $m$k --stamp=1791397983294
     --arrived=1791600000$i --submit; i=$((i+1)); done; done; then edit.mjs costland-<id> --split-of=costland-r4v for each.
  3. resubmit rg-vgo-browser (needs rG/dist) + the r5 captures (see 09:52 NEXT); measure; wave; then f17 (r4+r5 together).

## 10-11 11:25 update — the disk waiter (bvru5p2lf) hit its 2 h limit; NOT restarted (it had the max). Waiting on the coordinator's ping.
- Disk 29 GB (below even the 30 GB integration floor), load 200+. No costland job has run since 10-10 17:49; bnc nv1–4/nc1–4 pending.
- Pruned rD/dist (unreferenced after the r4v re-point) + every judged round-4 frame set (kept wave/r4/threeup-final incl. the
  OWNER-SCREENSHOT copy, the sheets/JPGs, logs, shots.json). ~1 GB.
- Dists now: rM + rB (bnc), rE (A for the r4v re-point). rG (round 5) NOT built. rC/rD dists gone.
- Lab: contact-lab4 r3eq on a round-5 build = round 3 on the same frame (round-4 terms off, cap 0.55, round-5 terms off); r4eq =
  round 4 (round-5 terms off, winter cap 0.65). So the r5 wave needs only the rG build: before = g:r3eq (≈ production 213),
  after = g:full; plus g:r4eq for the r4-vs-r5 read and g:shoeskip for the vehicle-pixel proof.
- ON THE COORDINATOR'S PING (disk ≥ 40): build rG; resubmit r4v (mkjob dr/dw now B = rG; stamp …294; split costland-r4v);
  resubmit rg-vgo-browser with needs [rG/dist]; submit the r5 captures (owner rearq/rearqhi/chase; Verdant side/low/bay 5 specs;
  winter side/low/bay; garage canonical) with variants g:full+r3eq+r4eq(+shoeskip on Verdant bay); measure; wave; f17 (r4+r5).

## 10-11 11:40 — exemption granted; rG BUILT (d2f45b672, dist 394 MB). Disk 28 GB: no other build until > 40.
- r4v resubmitted: dr1–4, dw1–4 (A rE 893bf78c9, B rG d2f45b672), stamp …294, split costland-r4v.
- Slab unit (…223): rg-vgo-browser2 (needs rG/dist), r5-owner (leo2a6_ua + ua_m1a1_x, verdant, rearq/rearqhi/chase,
  g:full+r3eq+r4eq), r5-verdant (5 specs, side/low/bay, g:full+r3eq+shoeskip), r5-winter (m1a2 + leo2a6_ua, side/low/bay/rearq,
  g:full+r3eq+r4eq). Outputs wave/r5/<name>/g/<spec>/<map>/<view>-<variant>.png.
- While the slab unit is live, bnc is "deferred (lane cap)"; it resumes after the captures.
- Garage: round 5 changes nothing there (the blend is off on the legacy rig; the gear cap/shoe skip act on grass cards; the fine press
  is tall grass) → no garage pairs in the r5 wave. The critics' "no tight contact line on the turntable" remains a round-6 item.
- NEXT on the captures: (1) shoeskip proof: |full − shoeskip| on vehicle pixels = 0 (Verdant bay/side); (2) owner slab metrics:
  r3eq vs r4eq vs full (slabmask on the r3eq frames as "main-like"? no: use r3eq as before); (3) gear-gap grass luma, snow under-hull
  ratio, the foot blend; (4) wave shots: before = g:r3eq, after = g:full (owner first, Verdant, winter) → wave builder + coordinator.

## 10-11 13:22 round-5 captures measured (wave/r5/{owner,verdant,winter}/g/...)
- vgo browser (rG d2f45b672) PASS. Shoe-skip proof: 257k changed px over 15 Verdant frames, 92.8 % green, 3.7 % straw, 0.1 % grey.
- Critics' "lime blade between the centre wheels" = the far-side sunlit meadow through both tracks' wheel gaps (unchanged r3/r4/r5).
- Owner slab: r3 18–19 → r4 24.5–25.7 → r5 = r4. Snow ground under the hull r3 0.76–0.98 → r5 0.66–0.84 of open snow.
- LAB BUG fixed: contact-lab4 forced GROUND_AO_WALL_SOFT 0.7 (r4 default) over the build's 1 on snow → earlier r4 winter frames were
  softer than the build. Now no wall-soft key unless r3eq/nosoft.
- Snow foot blend reworked (film → packed snow): 2ece2dbc8 (pushed): opaque over 0.55 of a 6 cm ± 45 % world-space uneven line.
- WAITING: coordinator exemption for one in-place rebuild of rG at 2ece2dbc8 (snow-only), then recapture r5-winter (4 views × full/
  r3eq/r4eq) with the fixed lab; then the wave (owner + Verdant frames already valid). Never rebuild while an r4v cycle runs.

## 10-11 13:30 coordinator: rebuild approved → rG REBUILT in place at 2ece2dbc8 (snow-foot packed snow). Disk 35 GB.
- Owner + Verdant frames (old build d2f45b672) stay valid (snow-only change; on grass the lab's old 0.7 = the build's value).
- Queued: rg-vgo-browser3 (GLSL compile + twin on 2ece2dbc8), r5-winter2 (m1a2 + leo2a6_ua × side/low/bay/rearq × full/r3eq/r4eq,
  fixed lab). Old winter frames pruned.
- NEXT: when r5-winter2 lands → look at the snow foot + numbers → python3 wave/r5/mkshots.py (20 pairs: owner 5, Verdant 10,
  winter 5) → send shots.json to the wave builder (aa82a418c089d23bb), copy the coordinator.

## 10-11 13:32 ROUND-5 WAVE SENT (wave builder aa82a418c089d23bb resumed; coordinator copied)
- Landing candidate: visual/contact-shadows-r5 @ 2ece2dbc8 (r3 + main c996f293c + r4 + r5). rG dist = 2ece2dbc8.
- Wave: wave/r5/shots.json, 20 pairs, before = g:r3eq (production 213), after = g:full. Owner 5 (d2f45b672 frames), Verdant 10
  (d2f45b672), winter 5 (2ece2dbc8). Winter metrics: ground shade r3 0.76–1.02 → r5 0.60–0.73 of open snow; foot packed snow.
- Receipts on 2ece2dbc8: vehicleGroundOcclusion.selftest PASS, typecheck rc=0, vgo browser PASS (rg-vgo-browser3); groundPressure/
  tallGrass/shadeFill/runningGearGroundRun/contactShadows/cinderYard/groundCoverCraters/groundRedux/swardTerrain/vegetationProgramKey
  PASS at b27530f16 (unchanged since except vehicleGroundOcclusion + post).
- Pending: wave verdict (coordinator), r4v dr1–4/dw1–4 (rG vs rE) after bnc; then f17 with costland/f17-contact-r4-draft.txt
  (now titled rounds 4 + 5). Borders bnc nv/nc → f17 8c94fa52f when ACCEPT.
- 13:40 wave builder: packed as waves 400a (owner 5 pairs + 2× crops moved onto the rear-overhang shade) and 400b (Verdant 10 + winter 5,
  a 2× crop of the Leopard's winter rear quarter); with the coordinator for launch. Expect owner full frames flat (~1 % px change);
  the crops carry the verdict. Verdict → read gauntlet/waves/wave400{a,b}-report.md; after-defects via gauntlet/afterdefects.py.

## 10-11 14:05 ROUND 6 (coordinator approved 1–3; 4 → shadows lane; ruts parked)
- Waves 400a/b (r4+r5 vs levers-off r3): FLAT, no drops → r4+r5 (2ece2dbc8) lands on r4v (dr/dw rG vs rE) ACCEPT alone.
- Round 6 = visual/contact-shadows-r6 in root rH (from 2ece2dbc8; NOT built; rG must stay as r4v's B until r4v completes):
  1. grass soil band at the track foot (terrain pixels only; lighter, warmer, textured; lane + 0.1 m beyond the faces, gone by
     ~0.28 m; grass maps only, by the ground albedo's green dominance; no darkening anywhere);
  2. press: stamp the hull's full footprint (dims.hullLengthM, widthM), splay outward along the track edges, edge zone ~0.35 m;
  3. snow: packed snow into the link recesses (pad faces keep steel) + stronger berm relief (wider, lit lip, shaded flank).
- (4) penumbra: REQUESTED from the shadows lane (a0eabf6d19d47be2e) 14:05 with the spec (3 cm at the base → 25 cm 4 m out,
  ground near hulls). My lane must not blur sun visibility.
- FUTURE (parked, no terrain lane running): real snow ruts/berms as terrain displacement — the terrain shader reading the fine
  press field's crush memory (GROUND_PRESSURE_FINE_WINDOW_M 24 m, 9.4 cm texels) for a render-only vertex/normal displacement on
  snow maps (and soil ruts on grass), never the heightfield the sim reads.
- Calibration (Verdant): shaded grass ground display (18,35,15) luma 30, sunlit (95,113,44) luma 105; light-model ground albedo
  verdant [0.21,0.18,0.11] (NOT green-dominant: use another grass test), winter [0.78,0.80,0.84], desert 0xad9b7c.

## 10-11 14:40 round 6 coded + pushed: visual/contact-shadows-r6 @ 13e734b07 (4a3d7fd80 round 6 + 13e734b07 press levers)
- Root rH NOT built (disk 29 GB; needs a coordinator exemption). rG stays r4+r5 (2ece2dbc8) for r4v.
- Shadows lane (a0eabf6d19d47be2e) owns the soft vehicle shadow edge: their visual/shadows-r3 @ 34d1dcb51 (3° light).
- MERGE NOTE for f17: when contact r6 and shadows r4 (b9e007146, `bool cotStructPixel`) meet, the second to land adds
  `&& !cotStructPixel` to the cotVehicleSoilBand call (keeps soil off bridge decks/slabs; the hue gate covers it meanwhile).
- Lab contact-lab4 (copy in costland/lab): per-variant press law + stamp (r3eq/r4eq/r5eq/oldpress = old law + contact rect;
  others = round 6 law + full footprint; fields cleared + re-stamped on change); levers nosoil, norecess, r5eq.
- NEXT when built: captures on rH: owner (rearq/rearqhi/chase), Verdant (side/low/bay, 5 specs), winter (side/bay/low/rearq),
  variants h:full+r3eq+r5eq; check soil band, pressed blades at the track edge, snow in the links, berm; then the r6 wave.
- 14:55 exemption → rH BUILT at 13e734b07 (disk 28 GB). Shadows lane noted the `!cotStructPixel` merge rule in their RESUME too.
  Queued: rh-vgo-browser, r6-owner, r6-verdant, r6-winter (variants h:full+r3eq+r5eq). wave/r6/mkshots.py ready (r3eq vs full).
- 15:25 r6 captures #1 (r6-owner/verdant/winter) were CONFOUNDED: the lab's press stamp called world.update(0.05)×6, which advanced the
  grass wind clock 0.3 s per re-stamp → every blade swayed between variants. Lab fixed (steps the two press fields directly).
  First looks anyway: the soil band shows as a grey-brown strip at the foot; pressed blades lie flat around the rear corners (owner
  rearq/rearqhi), the full-footprint stamp for leo2a6_ua is 3.86 × 2.22 m (its dims width 4.44 m includes the cages).
  Recapturing: r6b-owner (full+r3eq+oldpress+nosoil), r6b-verdant (full+r3eq+oldpress), r6b-winter (full+r3eq+norecess).
- 15:28 the cost-cycle waiter (bkmxznp0u) hit its 2 h limit; not restarted. LANE-CAP NOTE: every capture unit I queue at …223 defers
  bnc (borders' landing gate) and r4v behind it. After r6b lands, queue no new captures until bnc's cycles have started.
  Waiter bs42kim2m (r6b captures) still armed.

## 10-11 16:55 ROUND 6 CHECKED → ROUND 6.1 (62410905e, pushed on visual/contact-shadows-r6; rH dist still = 13e734b07)
- r6b findings (same-frame variants on rH 13e734b07): press OK (blades flat + outward round the hull, nothing else moves);
  SOIL read mauve-grey, not lighter (per-channel ratio greys a blue-green shade; partial green↔brown mix passes through grey;
  M1A2 side band luma 36.6→36.1); SNOW foot = paint (round 5's 6 cm ±45 % soft-topped line is a pale wash with the links drawn
  through it, a "white ladder" from above = opus' "pads painted white"; r6's luminance recess changed 0 px on the M1A2, 15k on
  leo); r6 BERM invisible (sun-share only; Frosthollow is sky-lit).
- r6.1 law: soil = grass luminance ×1.35 in one warm chroma (1.347,0.943,0.539; unit lum), opaque clods (soilNoise threshold
  -0.25→1.15 over 4→32 cm, soft 0.12): whole to ~12 cm, ragged to ~24, none by 28. Snow foot (law lever GROUND_AO_SNOW_FOOT,
  was _RECESS; R7.y) = opaque to an uneven level 6.5 cm × 0.35..1.45 (0.5 snowBlendNoise + 0.5 soilNoise), 8 mm edge; lane's
  middle (>5 cm in from both faces) capped at 2 cm (steel keeps); packed snow ±5 % in clods. Crest: ambient gain ≤ 0.12 beside
  the run, from 2.5 cm out, gone by 6 cm + 2×level (noise read at the face). Receipts: vgo selftest PASS (section 13 rewritten,
  round 5's line pinned on the lever 0), typecheck rc=0. Twin (test-support shade) mirrors the crest.
- Lab (rM/.qa-dev + costland/lab contact-lab4.mjs): lever GROUND_AO_SNOW_FOOT (+ GROUND_AO_RECESS alias for old builds);
  variant 'oldfoot' (= 'norecess').
- ASKED coordinator 16:52: (a) exemption to rebuild rH in place at 62410905e (disk 29–30 GB); (b) whether r6c captures may go
  before bnc's cycles start. READY (not submitted): jobs/costland-r6c-{owner,verdant,winter}.json (variants h:full+r3eq+r5eq,
  out wave/r6/{owner61,verdant61,winter61}) + jobs/costland-rh-vgo-browser2.json. wave/r6/mkshots.py now reads */h/* from
  owner61/verdant61/winter61 (r3eq vs full).
- After the rebuild: rh typecheck already done at 62410905e; run vgo selftest/groundPressure/tallGrass in rH again only if
  anything else changes.

## 10-11 17:08 coordinator: rH rebuild APPROVED → rH REBUILT at 62410905e (dist BUILD_HEAD 62410905e, 447 MB). Bands moved:
- bnc (borders r7: nv1–4 Verdant, nc1–4 coastal; rB vs rM) at …245 (219 band, behind roads rc7 …243, FX …244).
- r4v (contact r4+r5: dr1–4 desert, dw1–4 winter; rG vs rE) moved …294 → …246 (right behind bnc). rG must stay as is.
- SUBMITTED unit costland-r6c at …292: rh-vgo-browser2 (GLSL vs twin with the crest), r6c-owner/-verdant/-winter (variants
  h:full+r3eq+r5eq → wave/r6/{owner61,verdant61,winter61}). Then: check soil-in-shade + snow foot from above, python3
  wave/r6/mkshots.py, send shots.json to the wave builder (aa82a418c089d23bb), coordinator copied, owner case first.
- WAITER NOTE: jobs/done holds OLD costland-dr5..8/dw5..8/nc5..8 etc.; a waiter must test pending→gone or done-file mtime
  newer than its own start (bg0xb2kks fired on old files at once).
- On ACCEPT (v3check report): bnc → f17 8c94fa52f (costland/f17-borders-r7-draft.txt); r4v → f17 visual/contact-shadows-r5 @
  2ece2dbc8 (costland/f17-contact-r4-draft.txt; waves 372a/b + 400a/b flat, no drops).
- 19:05 COORDINATOR RULING (219 gates, queue ~12 h serial timing): EARLY ACCEPT at 4 cycles when every view's pooled upper
  bound (mean + 2 SE, v3check report) is under the LINE (GPU 0.6 / CPU 0.38) — looser than v3check's own early accept (<0).
  Units hold only 4 cycles per map (bnc nv1–4 + nc1–4; r4v dr1–4 + dw1–4): nothing to withdraw. Not decisive → top up that
  map to 8 at the same stamp. Report cmd: python3 $SP/fifo2/bin/v3check.py report --fbp=$SP/costland/cost/v3:verdant:nv
  --scene-delta-ok=5,8 (coastal:nc likewise; r4v: --fbp=…/cost/v3:desert:dr and winter:dw, no scene-delta flag).
  Waiter b69w6hjmu armed 19:00 (fires on any new done file of nv/nc/dr/dw 1–4, r6c-*, rh-vgo-browser2).
- 21:30 resumed after the ~21:20 system-wide stall (stream watchdog). Nothing of mine ran 19:00–21:30; bnc is 8th in line
  (7 picture jobs ahead), load 230 (CPU increments void over 150, slots void over 250 — may cost extra cycles). The previous
  waiter b69w6hjmu was killed at the harness limit. Re-armed b5hnzzbt9 (100 min self-limit, new-done-file test).
