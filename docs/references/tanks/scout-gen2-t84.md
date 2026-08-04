# T-84 Oplot — scout-gen2 reference packet (stub, 2026-07-31)

Scout status: MODEL FOUND: LastTriarius T-84 remix (effective CC BY-NC-SA) in candidates-gen2/t84/ — known inaccuracies (early-T80 engine deck, fuel-tank mounts)

## Published dimensions
| dimension | value |
|---|---|
| overall | 9.72 m (gun fwd) |
| hull | 7.08 m |
| width | 3.56 m |
| height | 2.22 m |
| weight | 46.0 t |

Dimension sources (secondary military references — cite the specific page at integration):
- https://tank-afv.com/modern/Ukraine/T-84.php
- https://www.militaryfactory.com/armor/detail.php?armor_id=304

## Orthographic / blueprint references
- https://www.the-blueprints.com/blueprints/tanks/tanks-t/
(the-blueprints.com links are letter-index pages — pick the exact sheet at integration; most of these tanks have a dedicated sheet there)

## Photo references
- https://commons.wikimedia.org/wiki/Category:T-84

## Integration checklist (for the fleet program, NOT this scout round)
- [ ] verify dims against a second source; fill missing (hull-only length, track width)
- [ ] geometry gate: model scaled to overall/hull length, width, height above
- [ ] dual-gate render judgment vs the photo references

## Oracle state (orchestrator, 2026-08-03)
Warped to published dims by repair batch-24 (roof was TRUE; Kord/sight
furniture knee 2.23; hull + FUSED tube stretched, muzzle pinned rear+9.72
— print has no gun node, so the game gun never elevates; fused-shell
class). Extract verifies 0.0-0.9% all axes. Buildable.
NOTE: batch-24 was DISABLED by the 2026-08-03 incident — the live oracle
is the PRISTINE short print again (overall 8.58 / hull 6.40, −11.8%).

## r30 FIRST BUILD (2026-08-04, russia agent): donor stand-in -> real profile
## 0 -> 15.4 min ×2 (hull 29.9 / whole 15.4 / turret 36.1 / stations 69.3 /
## dims 99.4 / floaters 100) — dims-sovereign vs the pristine SHORT print

buildT84 in src/vehicles/profiles/russia.js (RUSSIA_PROFILES.t84 replaces
the t80u donor stand-in). Spec dims sovereign: hull 7.08 / overall 9.72 /
width 3.56 / heightM 2.22 BARE-ROOF (unlike t54/t44 there is no MG
convention here — the print's 13-col 2.53-2.60 sight/Utes cluster is
score-carried, not dims-carried). standard-check: holes 0 ✓, mg1 ✓ (Kord
as compact FITTINGS.pintleMG, crest ~2.40 over ≤2 cols), clip 76/235
(strip/sponson fleet class).

BANKED LAWS FROM THIS BUILD (short-print class — read before the re-warp
round):
1. DO NOT STRETCH a short print's features to published dims: the gate
   registers BODY-SPAN MIDS, so a ×1.107 z-stretch put every feature
   0.1-0.35 off its registered pair (means 4-6% on every row — measured,
   reverted). Author features at PRINT-registered positions and carry the
   published dims as PURE END EXTENSIONS (they ride as ~3-9 cover
   columns, priced once).
2. END EXTENSIONS RE-REGISTER THE PAIR: adding the stern stack moved the
   hull body-mid (dAlong 1.11 -> 0.86) and silently re-seated the ref
   0.28 behind my turret (turret 33 -> 6 across two runs that "didn't
   touch the turret"). Re-derive turret/gun seats from a fresh digest
   after ANY hull-end change on a dims-short print.
3. Distribute the dims margin REARWARD where the print is tube-only
   forward: a bow extension paired against the ref's bare-tube columns
   (errs 0.3-0.6); the same margin at the stern rides as ONLY-PROC cover.
4. The unstretched end extensions are too THIN to count as hullLengthM
   body columns (12% band rule) — they need band-deep anchors (bow corner
   stacks + stern stack, t80 pattern) or dims under-reads by ~2%.

Registered print reads (authored frame = print mid at -0.24 after the
final registration; digest-derived): deck dip 1.21, engine plateau
1.33-1.38, ring deck 1.324, glacis 1.28@1.74 -> nose 0.96@3.20; tracks
grounded -1.89..2.27, rear wrap bottoms 0.65-0.74 (high stern fade, t80
class); welded turret: roof 2.13-2.21, bustle 2.11-2.23 to -1.58, cheeks
1.94-2.04, plan front 2.13/rear -1.80, apron 0.94; tube axis 1.845
r 0.105, evac 0.125 @ registered ~3.3; print tube ends ~5.4 (mine pinned
5.94 = stern -3.78 + 9.72; ~6 muzzle cols ONLY-PROC accepted).

Honest ceiling: the −11.8% print means ~9 permanent cover columns
(side_whole −8 class) + the sight-cluster carry (~8 cols ×0.3) until the
batch-24 re-warp relands gate-in-loop against THIS build (its "stretch to
pub dims" recipe would then meet a build already at pub dims — expect
side/plan rows to jump into the 60-70s).

## r31 RE-ANCHOR (2026-08-04, russia agent): post-warp rebuild -> GATE PASS
## 11.1 -> 90.9 min ×2 (hull 90.9 / whole 92.2 / turret 91.4 / stations 96.3
## / dims 99.1 / floaters 100) — standard-check PASS (clip 18/0, holes 0,
## mg1+2d), first russia-family geometric pass since t72b3m

Post-warp (batch-35, be7eb4f) the r30 short-print laws RETIRED: buildT84
re-authored 1:1 in the WARPED REF'S WORLD FRAME (extract hullMask −4.858..
+2.222, muzzle +4.863) — no end extensions, no cover margin, max |x|
EXACTLY 1.78 (kills r30's 0.9958 safeScale shrink). dAlong 0.000 on every
row; dims heightM 2.24 (grace), hullLength 7.00 (1.11%, −0.9 — quantized,
kept: the next 0.1213 bin either end costs −2.6 in side rows).

Done-gates (official rigs): geometry-gate ×2 = 90.9 PASS both;
tank-standard-check PASS; track-clip-audit --exact 18/0 (≤60 band — the 18
is an unnamed proxy-class sliver at y 0.58..0.66 z 1.94..2.0, no real
contact); visual-evaluator clean, parity yawProxy ≤0.8° all 14 views
(evidence shots/visual-eval-t84/); critic pairs shots/critic-t84/ + round
copies shots/russia-r31/. Graduates pt91m e6994e54 / t72b3m c19ec9f0
verified; siblings re-gated byte-stable (t90m 81.7, t80 82.5, t80b 81.6,
t80bv 35.5, t90a_vladimir 53.6, t64bv1 57.4 — all == committed ledger).

BANKED LAWS (r31):
1. RE-ANCHOR = REBUILD IN REF-WORLD FRAME. After an oracle re-warp to
   published dims, re-author IN the ref's own world coordinates (extract
   hullMask/box) instead of patching offsets — dAlong pins to 0.000 and
   every workorder column becomes directly authorable.
2. WORKORDER SIDE-Z BUG: the stock vertex-workorder derives its shared-box
   center while the gate page leaves models HIDDEN (floater-sweep state) —
   side-view z labels ran +0.54 off ref-world this round (y is
   ground-calibrated and safe). Fixed variant with visibility-restored box
   probe + full-row JSON dump: tools/tmp-t84-workorder-full.mjs.
   ORCHESTRATOR: consider patching vertex-workorder.mjs itself.
3. BIN-BOUNDARY LEDGER: side/plan pitch 0.1213 m, FRONT pitch 0.0405 m at
   this shared box. ~6 pts of this round were faces poking 2-25 mm past a
   column boundary (roof plates, carrier, bustle corners, collar, track).
   Keep faces ≥15 mm clear (§C) and RE-CHECK after any change that moves
   the shared box — the bins re-roll.
4. TRACK METAL PRINTS WIDER THAN trackW: instanced link-pad pin bosses
   +0.024/side, sprocket drum +0.030/side (measured — tools/
   tmp-t84-aabbprobe.mjs world-AABB probe). trackW 0.50 @ xc 1.24 fits the
   ref's 0.99..1.52 ground band inside the front bins.
5. INNER PIN ENDS CLIP THE TUB: the same overhang inboard (x 0.9635)
   clipped the ±0.98 wLo walls at both wrap zones (audit 268/302) — wLo
   tapers to 0.94 where the climbs pass; audit -> 18/0.
6. DRAWN-CLIMB EMPIRICS: buildRunningGear's departure ramp zeroes
   0.12-0.45 m PAST contactZ* (tangent overhang varies with idler
   distance) — pin contacts by measuring the drawn line, not trig.
7. FRONT-VIEW BOTTOM PROFILE IS FIRST-CLASS: the "anchor debt" craters
   were the front rows in BOTH oracles (18.3/11.1 pre- and post-warp).
   Center belly pan 0.23 (|x|<=0.835) / tub step 0.35 / ground band
   0.99..1.52 / flap+lip hardware bought ~30 front points. bellyCorners
   0.001 lines are usually TRACK content (min over x), not the tub floor.
8. FUSED-PRINT PLAN LAW: the ref's side band can exceed its plan width —
   evac authored as a BOX (tall/narrow, ±0.20 plan per the ref's own
   ±0.15/0.18 bins) and tube r 0.100 keeps the ±0.1015 plan bins dark
   while holding the 1.94..1.73 side band.
9. FENDER-BAY COVERS BETWEEN THE RUNS: top-down enclosed holes between
   track and skirt close with plates at y 0.805 (bottom run <=0.11, top
   run >=0.99) — zero clip voxels, zero silhouette change.

Variant tells (§H4): right-flank bustle stowage (print asymmetry, plan
−2.26@x0.87..1.09 / −1.87@1.10..1.20), LEFT pano-sight shoulder block
(front 2.243 to x −1.02 — left side only), Kord swung rear-left over the
plates, twin 5-tube Tucha banks inside the tube-band lane.

Honest residuals (worst columns, workorder frame): rear sprocket-wrap
−3.9..−4.1 proc 0.30..0.34 vs ref 0.36..0.40 (arc-vs-straight-ramp class,
~0.04 ×3); front climb 1.69..1.81 −0.04..−0.09 ×3; stern ramp step −4.32
−0.07 ×1; cheek base 1.58 vs 1.669 @ z W 0.2..0.32 (collar/chamfer trade,
−0.04 ×2); muzzle-tip col 2.23 top −0.055 ×1. Critic-lane notes: skirt
band reads shallower than the ref's full-depth side mass (wheel row
exposed dark — pt91m rubberBotH/material-split candidate); the mantlet
gun-slot notch (print-faithful, deck-backed, holes 0) may read dark from
hero angles.
