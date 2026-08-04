# m1a2 shaded-parity r6 — GRADUATION critic verdict (2026-08-04)

FOURTH new-oracle critic round vs the SEPv2 oracle, adjudicating the r4
verdict's three orders as delivered by the r6 un-curtain round (landed
476aeae). New-oracle history: r2 FAIL 8.39 (floors 8.0 x3) -> r3 FAIL 8.74
(floor 8.6) -> r4 FAIL 8.94 (floor 8.8, ONE blocking protagonist) ->
**this round PASS — floor 9.0, mean 9.08, ALL FOURTEEN VIEWS >= 9.0.**

Provenance: pairs re-rendered FRESH via `node tools/tmp-tank-critic.mjs
--id=m1a2` (vite :7479) while HEAD was **476aeae** (the r6 build commit
itself — the scored pixels are the landed build exactly). 14/14 saved, zero
console errors. Working-tree audit: src/vehicles (abrams.js, kit.js,
tankFactory.js, specs.js, variants.js, modelLoader.js) and both official
rigs CLEAN at HEAD; dirty files are other lanes' docs/geometry-gate JSONs +
tool scratch, no shared-helper or export-surface edits. Scored ONLY
`shots/critic-m1a2/*.png`. `node tools/visual-evaluator.mjs --id=m1a2` run
per §D (camoSeed 4242): **RIG PARITY OK** — max yawProxy 1.279° @front, max
|dCentroid| 0.066 m, no flips; scoring proceeds. Official standard-check:
`91.5 | 93.1/92.5/91.5/93.5/100/100 | clip 0/0 ✓ | contig 0 ✓ | decor
mg1+1d ✓` — the builder's x2 gate line reproduced. Track containment:
`node tools/track-clip-audit.mjs --exact --ids=m1a2` -> front 0 / rear 0
(bands present and audited). Graduate freeze audit: m1a1 e500174c / m1a1ha
b14be581 / m1a2_tejas 526341c0 — EXACT, untouched. Instruments:
tools/tmp-m1a2r4c-stats.py + tmp-m1a2r4c-lanes.py (the banked r4 rig:
ITU-601, bg |px−0x151b20| maxch <= 13, enclosed-air flood d<=1 TRUE-HOLE vs
d2-13 paint), tools/tmp-m1a2r6c-wheels.py (order-1 done-gate re-derivation:
disc-row window world y 0.38..0.63, disc/gap contrast, wheel-pitch
autocorrelation vs half-pitch), tools/tmp-m1a2r6c-crops.py (diagnosis crops
only, never verdict evidence).

Registration audit: 13 of 14 pane bboxes within ±6 px; hero-toptilt dW+6
dH+16 and close-roof dH+8 = the known per-model-bbox framing class (noted,
not scored — third consecutive round). BISTABLE GATE-REF law honored (ref
M2/whip columns z 1.25-1.80 pose-dependent, not faulted).

## HEADLINE: **GRADUATION PASS** — floor 9.0, mean 9.08, all 14 views at
## or above 9.0 as an M1A2 SEPv2. The r4 protagonist (the skirt curtain
## occluding the wheel row) is DEAD: the r6 round proved it was ANATOMY,
## rebuilt the row to the print's small low discs over a dark bay, and the
## flank now carries the ref's own wheel language on all six flank-bearing
## views. All three r6 orders verified DELIVERED on the official pairs; all
## eight r4-banked deliveries reproduce to the pixel; zero new defect
## classes. Geometry gate 91.5 PASS x2 + this critic PASS = dual gate MET.
## §10 runs in the graduation commit — checklist verified below, freeze
## hash **bc225318** (meshes 46, verts 111608).

## Per-view scores (r4 -> r6)

| view | score | justification |
|---|---|---|
| view-front | 9.0 -> **9.0** | Certified massing holds byte-for-byte where it must: glacis anchor (820,340)-(1100,430) L 55.3 vs ref 53.4 — EXACT r4 hold; skyline band rows 140-180 carries 6069 sky px vs ref 6930 (88%, r4 87%); CROWS station + smoke tubes read; hem steps keep the certified front columns (front_hull 93.1 x2). Zero true holes (0/822 enc, all paint). Wheel band invisible dead-ahead — untouched by the round, held at 9.0 by the certified-rows front skyline residual (named since r4, priced). |
| view-frontleft | 8.9 -> **9.1** | The r4 hold-back ("near-flank curtain run") is gone: wheel row reads under the hem at the ref's stations — disc/gap contrast +9.4 vs the ref pane's own +9.2 (instrument parity), discs + bay + tabs visible at 1x. Quarter massing, dressed walls, flowing glacis all hold; enc 14 px (2 true) vs ref 54 — cleaner than ref. |
| view-left | 8.9 -> **9.2** | The order's primary view, delivered to the print: seven small low discs (r0.25 class) with hub/annulus anatomy at wheel pitch — disc L 59.1 / gap 44.3 (contrast +14.8; ref's own +9.4), AC(pitch 41.5px) +0.55 vs AC(half) −0.47 (true wheel periodicity, phase-locked; ref pane class), dark bay + skirt tabs + open tail bay with toothed sprocket + rising wrap, bow-end taper kills the flat stack. Banked features reproduce EXACTLY: skyline 2 notch-runs (799-863 d11, 988-1123 d24 — r4 stations), trackband parity 54.8/6.9 vs ref 56.0/7.3 at the banked rect, slit 137 px = certified floor (+3 px render noise), lane pocket 203 px at the certified station. |
| view-rearleft | 8.8 -> **9.1** | The r4 protagonist at its starkest is FIXED: the 4x curtain wall at z≈−2.25 is gone — open sprocket bay at the near corner (sprocket + teeth + wall shadow like the ref pane), wheel row down the flank (contrast +11.7; ref's own +5.1). Rack/duffel/jerry row busy; skyline notched; enc 7 px (2 true). The persisting evaluator Δbot −0.670 @z −2.17 is the certified corner-carrier class, NOT the curtain (see adjudications). |
| view-rear | 9.1 -> **9.1** | Order 3 delivered without disturbing the banked kill: verdict rect (849,419)-(1056,440) L 60.5 EXACT r4 mean hold, sd 0.0 -> 2.2, p95 63, >=L75 px 0; ref mirror-rect class 2.8 (the r4 9.6 residual figure was the full-row window whose variance lives on the ref's bright track sides, ge75 1753 there — builder's adjudication verified). Plate parity 61.7/4.0 vs 61.1/4.4. Both guns sky-crossing, louvers/grille hold. |
| view-rearright | 8.8 -> **9.1** | Mirror of rearleft: open bay + sprocket at the corner, wheel contrast +10.4 (ref +9.9), enc 47 px with 1 true (ref 275 true). Rack busy, skyline ref-parity. |
| view-right | 8.9 -> **9.2** | As left, mirrored: contrast +14.0 (ref +9.5), AC +0.51 vs half −0.44; skyline run-structure at REF PARITY (2 runs: 751-931 d39, 1056-1120 d14 — r4's exact stations/depths); slit 144 px = certified floor; lane pocket 311 px at station. |
| view-frontright | 8.9 -> **9.0** | Curtain resolved; anatomy correct and visible. The one honest flank residual lives here: the sun-side foreshortened quarter's disc pop is below the ref's (+5.0 vs the ref's sunlit +16.4) — wheels read but dimmer at 1x (shadow-plausible; the adjacent right ortho proves the discs are lit, +14.0). Front quarters were not in the r4 done-gate; polish class, not a blocker. Enc 291 px ALL PAINT (0 true) vs ref 337. |
| view-top | 9.0 -> **9.1** | Order 2 delivered from plan: duffel-crown rows 99-112 now carry three lobes at L 60-68 with inter-lobe dips to 41-47 (~20L class; was ~4L at r4; the ref's own class 12-15L) — separator sheets + dropped depth sheets did it without a column move. All banked rects hold: sun strip 58.1/16.4/p95 86 (ordered class 85-100; away-sun 50.2/8.5/69 banked), roof-mid 60.6/9.6/77 vs ref 62.1/9.9/81 (seam-grid kill parity), saddle 61.4/4.8 EXACT, rack rect 58.1/9.5 vs ref 59.1/11.1. Zero true holes (0/2967 enc). Certified plan bins honored (evaluator: the two 5.41 m dead-straight rails @x ±1.83 = the r1-certified residual; plan edge census byte-class with r4: 14 matched / refOnly 14 / procOnly 26). Residual (polish): the trio reads pale-band-plus-strap-ticks rather than the ref's soft baked rounds from plan — the ordered col-profile class is met; roundness lives in the heroes. |
| hero-frontleft | 8.9 -> **9.1** | The last-tenth curtain is gone: wheel row + dark bay read along the near flank at hero range under the certified hem. Rounded r0.16 shoulder, broken skyline, dressed works walls, M240 + CROWS, foreshortening correct. 26 px true = the r4-certified rack-gap class (ref's own 161). |
| hero-rearright | 8.9 -> **9.1** | Best-dressed view now also mechanically honest: strapped duffel rounds at the rail line, slat rows, vent slots, grille louvers, both guns, AND an open tail bay with sprocket teeth at the near corner + wheel row on the lower flank. 19 px true (ref 328). Evaluator voids 0.916/0.005 m² ADJUDICATED FALSE (census 19 true) — fourth consecutive round of the tool's barrel/deck-gap class. |
| hero-toptilt | 9.0 -> **9.0** | Roof reads modeled at tilt: CROWS drum + receiver + pale cap + sky-crossing M2, loader drum + moat + M240 crown, duffel trio as rounds (lobe dips now visible from tilt), scallop-crown ticks, wall steps shade. ZERO true holes (0/1597 enc; the 6.492 m² evaluator void = same false-positive class, census-proven). Drum-relief caps 2.386/2.4425 bind. Framing dW+6 dH+16 noted, not scored. |
| close-front | 9.0 -> **9.0** | Bow byte-untouched and it shows: glacis near-black raked one-line read, embrasure dressed, M240 + low CROWS behind, shackle row, moiré dead. CONTAINMENT reads clean: wrap + grouser comb + shoe stacks behind the skirt nose, flaps clear, bow-end taper tucks the run end (no flat stack). The detected proc bow-nose arc (span >110°) = the r4-adjudicated benign r0.16 fitting rounding. Zero true holes (0/46 enc). |
| close-roof | 9.0 -> **9.0** | The certified relief gap (ref's proud faceted cupola vs capped drums) BINDS and is not faulted; within certs the view keeps its r4 earn: CROWS = drum + massed receiver + pale cap + unambiguous sky-crossing barrel; loader = pale drum + moat crescent + dark M240 crown; plateau seams in panel-line language (roof-mid sd parity); rack tops busy. Zero true holes (0/3021 enc vs ref's own 743 true). Framing dH+8 noted. |

Floor 9.0 (view-front, view-frontright, hero-toptilt, close-front,
close-roof). Mean 9.08 (r4 8.94, r3 8.74, r2 8.39). Every view reads
same-vehicle/same-tier; the six flank-bearing views the curtain held at
8.8-8.9 all cleared with the anatomy fix, exactly as the r4 verdict
predicted.

## Claims audit (§D — official pairs, re-measured)

Every r6-round claim reproduced or reconciled; zero discrepancies:
- **Wheel-row done-gate**: builder disc/gap +23.9/+29.2 L with ref +5.8/+8.9
  (their raw disc-vs-gap samples) -> my smoothed-extrema instrument reads
  +14.8/+14.0 vs ref +9.4/+9.5 — same class and same ORDER (proc separation
  ~1.6x the ref's own; both instruments agree the discs read and the ref's
  read is weaker). AC at wheel pitch: proc +0.55/+0.51 on the sides with
  half-pitch NEGATIVE (−0.47/−0.44) = true wheel periodicity, not pad
  texture (pad-pitch dominance was the r4 failure signature). Quarters
  foreshortened: rearleft +11.7 / rearright +10.4 vs ref's own +5.1/+9.9.
  Hub-ring anatomy confirmed at 3-5x (dish/annulus/hub), tail bay open at
  the print's line with sprocket + teeth, bow taper present.
- **Order-1 physical fix**: the r4 4x read ("curtain wall descends
  vertically at z≈−2.25 to y0.86") does NOT reproduce — the wall is gone on
  both rear quarters; open bay + gear read in its place. VERIFIED FIXED.
- **Duffel lobes**: claim "three lobes L 60-68, dips 41-47, ~20L depth" ->
  measured rows 99-112 1px cols: lobes to 68, dips to 43-47 sampled (min 23
  at separator columns), depth ~20-25L. HIT (r4's ~4L weak signature dead).
- **Wood channel**: claim rect L 60.5 sd 0.0->2.2 ge75 0 -> measured 60.5 /
  2.2 / p95 63 / ge75 0. EXACT.
- **Banked-rect regressions** (all hold): glacis 55.3 EXACT; sun-strip p95
  86 (claim 85.5, class 85-100); away-sun 50.2/8.5/69 (banked 50.4/8.6/69.4);
  roof-mid 60.6/9.6/77 vs 62.1/9.9/81; saddle 61.4/4.8 EXACT; trackband
  banked-rect parity 54.8/6.9 vs 56.0/7.3 (the r4 56.2-vs-56.0 class; the
  builder's in-frame 46.2-vs-47.9 read is the same parity through the new
  band content); rear plate 61.7/4.0 vs 61.1/4.4; skyline runs L/R at the
  r4 stations and depths; front sky band 6069/6930.
- **Slit**: L 137 / R 144 (TOL13, at the r3 bboxes) = the certified floor
  (134/144 ≡ 117/116 TOL6; +3 px L is render-noise class at the same
  station).
- **B2 census** (TOL13 + d<=1): proc TRUE holes — top 0, toptilt 0,
  close-roof 0, close-front 0, front 0, rear 0; quarters 0-2 px; heroes
  26/19 px = the r4-certified rack-gap class (ref's own 161-328); sides =
  certified slit (137/144) + certified lane pockets (203/311) ONLY. NO new
  enclosed-air class. Warm census 0 strong-warm px on all five probed panes.
- **Gate/standard/containment**: 91.5 | 93.1/92.5/91.5/93.5/100/100
  reproduced; clip 0/0 exact; contig 0; decor mg1+1d; graduates x3 EXACT.

## Order-1 attribution correction — VERIFIED AND HONORED

The r4 verdict tied part of its order-1 done-gate to "the four evaluator
quarter Δbot rows (−0.65..−0.70 @z −2.2) go quiet". The r6 packet's
three-state A/B (r4 curtain / flat end / diagonal + taper) proved those rows
METER-STABLE across geometry states — they never measured the curtain; their
carriers are the ref's bustle-rack/fender overhangs vs our r1-r3-CERTIFIED
corner elements (tail-plate verticals, corner flaps at the ref's own 0.696
bin, wood skins, cert tail shoe). My fresh run corroborates: the rows
persist at fr −0.702 / rl −0.670 / fl −0.670 @z −2.15..−2.17 (packet's
three-state values to render noise) while the renders show the curtain GONE
and the bay open — a physically-removed wall cannot still be measured, so
the rows measure something else, exactly as the A/B said. Ruling: the four
quarter Δbot rows and the ~90° 0.83-0.84 m quarter corner edges are the
CERTIFIED CORNER-CARRIER class (bound by the r1 crate-band/rack envelope
certs); they cannot go quiet inside existing certs and are NOT faulted. The
r4 done-gate is satisfied on its physical clause (wheel discs visible at 1x
on left/right + both rear quarters — delivered) with the instrument clause
retired by evidence. Law for the bank (packet already carries it):
attribute instrument rows by A/B geometry experiments, never by visual
adjacency.

## Evaluator adjudications (§D citations)

- **RIG PARITY OK** (1.279° max @front, 11 ortho views, no flips) — scoring
  valid.
- **Enclosed voids** hero-rearright 0.916/0.005 m², hero-toptilt 6.492 m²:
  FALSE POSITIVES (official flood census: 19/0 true px) — the tool's own
  barrel/deck-gap warning class, fourth round running.
- **REFONLY arcs** (frontleft r? 1, left 1, rearleft 1, rear 1, frontright
  1, hero-fl 1, hero-rr 1; proc arcs front 2, rear 1, close-front 1, hero-fl
  1): certified drum/skyline classes + the BANKED CHORD-LIMIT LAW (clean
  procedural arcs below r~0.48 at <=110° spans decompose into 4 DP chords
  and are undetectable by design; the close-front span-162° detection proves
  the delivered rounding renders). Same adjudication as r4, banked.
- **Δtop +0.50..+0.58** front/rear @x ±1.49-1.63 and left/right +0.50/+0.51
  @z −3.33: certified works-wall verticals vs ref cheek cant + rack crown
  (crate-band class, r1-certified).
- **Δbot quarter rows**: certified corner-carrier class (see attribution
  section). front Δbot −0.722 @x 1.42 and close-front +0.330 @z 4.32: at
  vertical edges (tool's own cliff-offset annotation) — flap/track column
  handovers, the §C half-pitch class; front_hull 93.1 x2 and the clean
  close-front containment read bound them.
- **top plan rails** ±1.83 x 5.41 m UNMATCHED: the r1-certified dead-straight
  plan bins (certified residual, named since r1; the r6 tail diagonal
  deliberately kept the full ±1.83 plane to preserve them — verified by the
  byte-class plan edge census).
- **Front-slope law**: NO glacis-band flag on front/close-front (lower-edge
  flags at the flap/shackle fittings = the r3 adjudication, stands). PASS.

## Standing checks (§B owner laws)

- **FRONT-SLOPE**: PASS — raked one-line glacis read at front, close-front
  and both heroes; evaluator glacis band clean.
- **CONTIGUITY / NO HOLES**: PASS — zero true holes on every deck view and
  both closes; sides carry ONLY the certified slit + endorsed lane air;
  quarters 0-2 px; heroes at the certified class; the new mid-run bay slots
  census as d2-13 dark PAINT (L 26-37, deck/backer behind), not sky; the
  new tail bays read gear + wall shadow, not void. standard-check contig 0 ✓.
- **DECORATION / MG PHYSICS**: PASS — census mg1+1d ✓ (rack-floor MAG +
  spareTrackLinks; CROWS + M240 hand-authored under the packet SS I clause);
  CROWS barrel sky-crossing pale at close-roof; M240 dark crown-riding;
  §I dressing (links, coil, straps, conduits, junction) + duffels/jerries/
  boxes/whips dress every large face. Pintle allowance remains SPENT.
- **TRACK CONTAINMENT**: PASS — audit 0/0 exact ✓ with bands present;
  renders: bow wrap + comb + shoe stacks behind the skirt nose, tail
  sprocket + wrap clear in the open bay, flaps clear, no floating bands, no
  corridor daylight. The wheel retune moved NO certified wrap tangent
  (contactZF/ZR pin verified by the identical gate line x2).
- **VARIANT-DISTINCTIVENESS (§H.4)**: PASS, and the r4 anatomy caveat is
  RESOLVED — m1a2 no longer hides shared family anatomy; it renders its own
  print's wheel row (small low discs in a dark bay behind skirt tabs) while
  the three frozen siblings render theirs. Garage tells, four-up strip:
  m1a1 = bare-roof pintle M2, clean green scheme, big open wheel row;
  m1a1ha = red-brown two-tone, clean flanks; m1a2_tejas = long low turret,
  brick-streaked camo; m1a2 SEPv2 = proud CROWS station + loader M240 ring,
  duffel-loaded lane-railed bustle field, dressed works walls, skirt-tab
  hem over a dark bay with toothed sprocket, twin whips. No 'same tank
  re-badged' read anywhere in the family.

## Certified bounds verified binding (carried forward; graduate-change
## rounds re-inherit them)

Slit floor 137/144 TOL13 (≡117/116 TOL6; turret-mask asymmetry law);
ring-drum relief caps 2.386/2.4425; r1 crate-band massing incl. front rows
+ works-wall verticals; low-slung CROWS (no side-ortho sky silhouette —
skyline runs verify); whips (orchestrator lane); BISTABLE ref columns
z 1.25-1.80; certified plan bins (±1.83 dead-straight rails); BIN-EXTENT
rear-flank proud-dressing void (law-priced); chord-limit instrument law;
y-max 2.496 hoop / y-min 0.005 sag anchors; cert-bin byte-stability set
(grouser-tip 0.150, bow-ramp 0.399, idler-shoe 0.465-0.53, col-83 1.4438)
now pinned via the contactZF/ZR opt-in (byte-identical defaults); corner-
carrier quarter rows (this verdict). Honest residuals, ALL polish-class,
none order-worthy: front skyline band wall-like from dead-ahead (certified
rows), frontright sun-quarter disc pop below ref, duffel plan-roundness
(lobes delivered, softness differs), proc bay contrast ~1.6x ref's own
(deliberate visibility margin), roof-mid sd 9.6 vs ref's tighter works-lid
grid.

## §10 GRADUATION CHECKLIST (verified surfaces — execute in the pass commit)

1. **Retire the registration**: delete the `m1a2` glb block from
   `src/vehicles/specs.js` MODEL_SOURCE (path
   /models/tanks/community/recovered/m1a2_sepv2.glb) — procedural ships in
   every flavor. The PUBLIC-BUILD GATE block right below it (the
   `allowLocalRecovered … delete MODEL_SOURCE.m1a2` IIFE) exists only to
   quarantine that entry and retires with it. The GLB FILE stays on disk as
   the measurement oracle.
2. **modelLoader sepv3 guard** (`src/vehicles/modelLoader.js:2275`,
   `spec.id === 'm1a2' && /sepv3/.test(cfg.path)`): already inert against
   the sepv2 path; with the registration retired it becomes FULLY DEAD code
   — note or remove (applyModelFixes stays: it documents the m1a1/tusk
   variant-bake provenance).
3. **variants.js backfill check (NEW — VERIFIED SAFE)**: `m1a2` is NOT in
   VARIANT_TANK_IDS (['m1a1','t90a','m1a2_tusk'], line 98), no `m1a2` key
   exists in VARIANT_MODEL_SOURCE, and the guarded registration loop
   (`if (!MODEL_SOURCE[id]) …`) therefore CANNOT re-source the emptied
   slot. The m1a1 backfill retirement note (the 6bc126c lesson) is
   documented in place; m1a2_tusk keeps its own variant GLB legitimately
   (it is not a graduate). No code change needed — verify once more in the
   commit.
4. **Override maps (ALL THREE)**: add the m1a2 SEPv2 registration with the
   FULL retired config — path
   '/models/tanks/community/recovered/m1a2_sepv2.glb', turretNode
   '^Turret$', gunNode '^misc_b$', autoPivot true, yawOffset Math.PI,
   turretFollowers '^(?:ammo_(?:5|box)|armor_turret|ex_armoc|ex_armor(?!_body)|ex_era_turret|ex_decor_04|glsaa_[6-8]|hatch_0[34]|mg_aamount_h|misc_a|optic_commander)$',
   paintUntextured true — to: tools/procedural-fidelity.html
   LOCAL_REFERENCE_OVERRIDES, tools/tmp-tank-critic.html
   CRITIC_REFERENCE_OVERRIDES (local tmp), tools/visual-evaluator-page.html
   CRITIC_REFERENCE_OVERRIDES (committed — the §D evaluator aborts on
   graduates without it).
5. **Icons 5-only + restore**: regenerate exactly m1a2's five
   (m1a2_{angle,side,side_silhouette,top,top_silhouette}.png) from the
   procedural build with the §5.7 staging discipline; do NOT touch the
   m1a2_tejas_*, m1a2_tusk_*, or m1a2_sepv2_* sets.
6. **Packet freeze**: record graduation date + freeze hash **bc225318**
   (meshes 46, verts 111608, `tools/tmp-hashgeo.mjs --ids=m1a2`) in
   docs/references/tanks/m1a2.md; m1a2 joins the hash-frozen list (§F.2)
   as the program's 17th graduate.
7. **CUSTOM chip** in the garage roster metadata; ledger row stays
   (tool-written) as the frozen pass of record.

Verdict: **GRADUATION PASS — dual gate met.** Floor 9.0, mean 9.08, all
fourteen views >= 9.0. The r6 round delivered the one blocking order with
the correct root cause (anatomy, not hem), the two polish orders to class,
and every banked delivery intact. m1a2 is the program's 17th graduate
pending the §10 commit.
