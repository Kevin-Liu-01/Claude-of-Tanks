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
