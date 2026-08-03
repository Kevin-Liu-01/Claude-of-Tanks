# isu152 shaded-parity verdict — post-r4 (independent critic)

Date: 2026-08-03. Judged build: **46afbdc** (isu152 r4). Provenance verified:
pairs rendered 12:28 while HEAD was 46afbdc with `src/vehicles/profiles/
casemate.js` clean; HEAD later moved to ab83632 during adjudication but the
only vehicle-source change in 46afbdc..ab83632 is `profiles/leopard.js`, and
the now-dirty shared files (materials.js, modelLoader.js) have mtimes 13:19+
— AFTER the render. The scored pixels are the builder's r4 exactly.

Pairs: re-rendered fresh via `node tools/tmp-tank-critic.mjs --id=isu152`
(vite :7460, zero console errors, 14/14 saved 2026-08-03 12:28) →
`shots/critic-isu152/*.png`. Scored ONLY those files. Measurement:
`tools/tmp-isu152r4c-stats.py` / `-claims.py` / `-claims2.py` (ITU-601 luma,
bg discriminator |px−0x151b20| maxch ≤13). Registration audit: all 14 pane
bboxes within ±4px (view-left IDENTICAL 550×157 both; view-front 524×444 vs
520×443; view-top 186×546 vs 184×546; heroes touch the same frame edges in
both panes). Hue audit: B/G 0.60–0.65 warm family at every sampled fitting —
no blue-lift anywhere.

## HEADLINE: FAIL — no view reaches 9.0. Floors: view-rear 8.0,
## hero-toptilt 8.0; the twelve remaining views 8.5.

r4 is the most honest round this vehicle has had: **all five r3 orders are
delivered and, for the first time, every builder number I re-measured
reproduces on the official rig** (r3's window-sky claim did not). The r3
floor (close-roof 7.0, MG-law breach) is cured — the DShK is now a real
pintle gun. What remains is a uniform half-class gap that the five orders
never targeted: flank/gear-zone tonal flatness, rear composition drift, and
painted-flat-vs-cast material language at close/tilted range. Min 7.0 → 8.0,
mean 8.04 → 8.43.

## Per-view scores

| view | r3 | r4 | justification |
|---|---|---|---|
| view-front | 8.5 | **8.5** | Registration exact. De-lathe delivered (no bolt dots, single horn). Remaining: the ref's front face is DOMINATED by the ball-mantlet mass hanging below the crest; the proc gun emerges AT the crest from a light collar — proc x398 top y118 vs ref hump y102; mid-face reads emptier; bow cleat row a dark slot band vs ref's chunky bright combs. |
| view-frontleft | 8.5 | **8.5** | Same-vehicle read immediate; DShK adds a correct roof beat. Flank reads as a flat slab band (fender/skirt/hull one tone-plane, wheels sunk in murk) vs ref's layered open gear; boxy front bins (ribs barely read at this angle). Untouched by r4 orders — same deductions as r3. |
| view-left | 8.5 | **8.5** | Ordered items verified EXACTLY: muzzle sky-break present — cols x323–328 show [sky][GUN 2-3][sky 5-7][roof], 13 gun px / 32 sky px under (claim: 13/32/6, dead match); ground row y397/398 n 278, p50 94.4, 0.7% dark = ref-exact (ref y398 p50 94.2); slot band re-pitched irregular. Held under 9 by: window band sky 7.2% vs ref 25.1% (order-5 clause silently moved to carried-residuals — gaps read brown-murk, not sky), y396 row 40.2% dark vs ref's darkest row 21.2%, stern descent still a visible wedge-tooth cascade at 3×, flank band flatness. |
| view-rearleft | 8.5 | **8.5** | Envelope/crate/drums right; descent teeth softened per order. Same flank flatness + stacked-drum composition as the other quarters. |
| view-rear | 8.0 | **8.0** | Composition drift unchanged (was not in the five orders): TWO stacked drums per shoulder vs ref's ONE soft circle each side; center dominated by two plain crate slabs; crest band rows y124–136 proc 288–372px wide vs ref 233–297 (ratio 1.24–1.39) — the ref casemate tapers toward its rear in plan, the proc is a constant-width prism, so the rear reads shoebox vs trapezoid. Mottle-halving verified (lower plate calm now); bolt circle + twin oval covers fine. |
| view-rearright | 8.5 | **8.5** | Drum pile reads well (cap rings, brackets — best single element); donut repaint + tooth taper delivered. Crate slabs, second drum row, flank band hold it. |
| view-right | 8.5 | **8.5** | Mirror of left, same story; the ref's rear-fender curl horn (ref pane x560–595, y320–355) still has no proc counterpart. |
| view-frontright | 8.5 | **8.5** | As frontleft; cheek MG-port ring reads. |
| view-top | 7.5 | **8.5** | Order 3 delivered and it shows: full-width dark bars **0** (ref 0; r3 had 5–6), two intake-grid cell fields flanking the dome exactly as ref composes them, dome now a dominant circle (crescent + rim), crate-donut throat repainted BRIGHT (mirror rects p50 112.1/112.1; core 112.7 — brighter than the 94-class claim, ref zone 107.6), covers present. Under 9 because: grid cells read print-black (p05 46–65 in my rects, cartoon vs ref's rimmed mid-dark recesses), the mantlet plan-block is a thin collar vs ref's rectangular housing slab, cover placement drifts (one central ring + knobs vs ref's twin dominant circles on the lid), and the casemate roof plate is sparser than ref's rail-lined, double-ellipse roof. |
| hero-frontleft | 8.5 | **8.5** | Still the strongest hero: mass, stance, gun, drums, and now a visible roof MG. Flank murk + filled gear zone at 1.6× unchanged. |
| hero-rearright | 8.0 | **8.5** | All three named r3 crimes fixed: donut no longer black, wall/plate mottle halved, wrap teeth tapered. Crate-slab composition + stacked drums + flat flank keep it at 8.5. |
| hero-toptilt | 7.5 | **8.0** | Deck identity beats delivered (grids, dome, covers, no rail stripes, bright donut). Remaining: the two roof mounds read FLAT-PAINTED rings at tilt (X-disc + ring-with-stub) vs the ref's two chunky raised drums with rim shadows; intake cells print-black; the ref's louver slat band has no proc counterpart on the tall board. Not hollow, circles unbroken — a relief-class gap, not an emptiness one. |
| close-front | 7.5 | **8.5** | Order 4 delivered in full: single smooth three-segment taper, zero bolt-hole dots, bolted trapezoid frame reads (soft/cast per order), 5-rib comb bins, dark bore + stepped tip. Under 9: the ref nose is a huge spherical CAST BALL filling the face — the proc mantlet mass is ~55–60% of that projected mass and rides higher, so the nose signature is lighter than the ref's at inspect range. |
| close-roof | 7.0 | **8.5** | The r3 floor is cured. DShK is a REAL GUN: flanged pintle column, receiver box with pale top-lit face + dark under-gap, backplate, 12-deg barrel with cooling rings + booster (~46–52px run at this zoom, claim 45.9 consistent); MG-physics law MET. Stepped mounds exist with genuine rim shadows; dash-arcs gone; X-disc raised on its mound; wall-band mottle in ref family (proc p50 82.8/iqr 5.5 vs ref 82.7/3.8 zone stats). Under 9: the big roof plate still speaks paint, not casting — painted rings/dots where the ref runs raised bolt fields; the R-cupola cylinder has a DARK TOP face (top-lit physics says pale top, dark side slit); receiver separation shadow-carried (disclosed). |

## Claims audit (official pairs outrank builder row analysis)

Every r4 claim I re-measured REPRODUCES on the official rig — first round
where this holds:

- **[sky][gun][sky][roof]**: verified EXACTLY — 6 cols (x323–328), 13 gun px
  above the local roofline, 32 true-sky px under, 2–3 gun rows over 5–7 sky
  rows per column. Ref shows zero such columns (the ref model carries no
  comparable elevated MG — the gun is an owner-law addition, judged on its
  own physics).
- **45.9px close-roof run**: consistent (46–52px by crop reads).
- **Stepped mounds**: present with rim shadows; view-left top-profile deltas
  proc−ref within ±4px across the entire body — silhouette-height family.
- **Deck bars =1**: I measure **0** full-width dark bars (luma<60, >50%
  hull, crossing center) vs ref 0. Better than claimed.
- **Donut throat 94-class**: throat cores p50 112.7 both mirror rects (ring
  zone 112.1), ref zone 107.6 — bright family, tone-inversion dead.
- **Ground row 0.7% dark**: exact — y397/398 n 278, p50 94.4, dark 0.7%.
- **Honest residuals check out**: muzzle break small-but-real (2–3px rows at
  60px/m — visible, correct physics, capped by the two documented gate
  laws); receiver step shadow-carried; y396 is the one remaining dark run
  row (40.2% vs ref max 21.2%); flap-occlusion bottoms as described.
- **Dropped clause**: r3 order 5's "reclaim window sky toward ref's 27%" was
  NOT delivered (7.2% vs 25.1%, statistically unchanged from r3) — it was
  folded into the carried hollow-shell residual rather than worked. The
  disclosure is honest but the read is still murk-vs-sky; it stays a scoring
  item on all six side/quarter views + heroes.

## Owner laws

- NO EMPTY AREAS (top): PASS — plates carry paint/fittings, no bare voids.
- CONTIGUITY: PASS — no floaters in any pane (gate floaters 100 concurs).
- DECORATION MINIMUM / MG PHYSICS: **MET** — receiver mass, pintle column,
  elevated ringed barrel, pale top-lit faces; reads as a machine gun at
  close-roof, toptilt, and hero range; thin-but-correct at ortho side scale;
  end-on stub from the rear (physically right for a barrel on-axis).
- TRACK CONTAINMENT: PASS visually at bow and stern, both flanks, front and
  rear wraps — no hull solid intrudes into a wrap arc in any of the six
  relevant views.

## Fix orders (r5), in floor order

1. **view-rear 8.0 — composition**: (a) taper the casemate toward its rear
   in plan (the ref does): bring rear-view rows y124–136 to width ratio
   ≤1.2× ref (now 288–372 vs 233–297 = 1.24–1.39). Front-view crest is
   already ref-family — this is a rear/plan-only pull; watch stations 4–7.
   (b) ONE drum per shoulder on the rear face (ref: single soft circle each
   side, ref pane (95–170, 215–330) + mirror); delete or relocate the second
   stacked row — flag: rear station fill must be re-balanced. (c) dress the
   two plain crate slabs with the ref's center fittings (C-hook ring at ref
   (365–395, 270–290), thin handrail line at y≈255).
2. **hero-toptilt 8.0 — roof relief + deck tone**: (a) make both mounds read
   as raised drums at tilt: darken the under-shadow rings ~30% and add pale
   crown ellipses; wall growth below the 2.494 cupola line is FREE under the
   p95 two-column law — spend there, never above 2.5035. (b) lift intake
   cells from print-black to recessed-grate family: cell fill luma 55–65
   with bright rims (view-top proc rects x250–290/x350–385, y160–225).
   (c) add the ref's louver slat band on the tall board (ref view-top
   x300–340 y150–230; the proc board face is bare between its frame rails).
3. **The 8.5 pack** (each keeps multiple views under 9):
   (a) Window cells, all side/quarter views + heroes: if real openings stay
   banned by the hollow-shell bound, paint the six window interiors to
   near-bg (luma ≤45) so the band's dark+sky fraction reaches ref's ~30%
   (view-left rect x150–262 y366–384: proc sky 7.2% + dark 3.4% vs ref
   25.1% + 6.6%). Murk-vs-sky is the single biggest remaining 1× tell.
   (b) Mantlet mass (view-front + close-front): grow the root ball/cast
   shield so its silhouette drops ~0.15–0.2m below the crest on the front
   face (close-front proc collar (230–320, 255–310) vs ref ball (180–260,
   240–330)); keep the smooth horn. Ref fills those front rows itself —
   gate-neutral-to-positive per the r4 wall-refund precedent.
   (c) view-right: build the rear-fender curl horn (ref (560–595, 320–355)).
   (d) view-left/right y396: lift the 40%-dark shadow row into the ref's
   darkest-row class (≤21%).
   (e) close-roof material language: convert 6–10 painted dots/rings on the
   big roof plate into low raised studs with real normals (ref bolt fields
   (390–520, 250–300) ref pane); repaint the R-cupola cylinder top pale
   (top-lit) with the dark aperture as a SIDE slit (proc (920–955, 85–115)).
   (f) stern descent: one more wedge-taper pass or count thinning so the
   stern cascade reads as the ref's plate edges, not a sawtooth fringe.

Gate notes for the orchestrator: pintle spend already 0.35 of the 0.4
allowance — orders 2a/3b/3e are paint or below-2.494 relief (silhouette-
free); 1a/1b are real geometry with plan/station risk the builder must
price; nothing here requires geometry above 2.5035.

Verdict: **FAIL — graduation blocked; visual gate NOT met.** Floors 8.0
(view-rear, hero-toptilt). The trajectory is strongly up and the claim
discipline is now trustworthy; r5 is a composition-and-material round, not
an engineering one.
