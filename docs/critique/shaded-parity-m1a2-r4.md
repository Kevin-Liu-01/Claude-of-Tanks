# m1a2 shaded-parity r4 — independent critic verdict (2026-08-04)

THIRD CRITIC ROUND vs the SEPv2 oracle, adjudicating the r3-verdict's eight
orders as delivered by the r5 build round (landed 1942768). This file
replaces the old-oracle r4 text at the standing replacement pattern (that
verdict survives in git history). New-oracle history: r2 FAIL 8.39 (floors
8.0 x3) -> r3 FAIL 8.74 (floor 8.6) -> **this round FAIL 8.94 (floor 8.8)**.

Provenance: pairs re-rendered FRESH via `node tools/tmp-tank-critic.mjs
--id=m1a2` at 00:57 while HEAD was **ca89622** (doc-only critic verdict on
chieftain5; the m1a2 r5 build is the last abrams commit, 1942768). 14/14
saved, zero console errors. Working-tree audit: dirty files are
merkava.js/misc.js/russia.js (other agents' family builders, no shared-helper
or export-surface edits) — abrams.js, kit.js, tankFactory.js all clean at
HEAD, so the scored pixels are the landed r5 build exactly. Scored ONLY
`shots/critic-m1a2/*.png`. `node tools/visual-evaluator.mjs --id=m1a2` run
per §D (camoSeed 4242): **RIG PARITY OK** — max yawProxy 1.3° @front, max
|dCentroid| 0.066 m; scoring proceeds. Official standard-check:
`91.5 | 93.1/92.5/91.5/94/100/100 | clip 0/0 ✓ | contig 0 ✓ | decor mg1+1d ✓`
(the r2 audit blindness is over — the §H rig's two DynamicDrawUsage bands
census exact). Instruments: `tools/tmp-m1a2r4c-stats.py` (ITU-601; bg
|px−0x151b20| maxch ≤13; enclosed-air flood, d≤1 TRUE-HOLE vs d2-13 paint),
`tools/tmp-m1a2r4c-lanes.py` (skyline top-profile + lane-sky scans),
`tools/tmp-m1a2r4c-crops.py` + `tools/tmp-m1a2r4c-family.py` (diagnosis
crops only, never verdict evidence).

Registration audit: 13 of 14 pane bboxes within ±6px (view-top 203x545 vs
203x544); hero-toptilt proc dW+6 dH+16 touching frame bottom and close-roof
dH+8 — the known per-model-bbox framing class, noted, not scored (same as
r3). BISTABLE GATE-REF law honored: ref M2/whip columns (z 1.25-1.80)
pose-dependent, not faulted.

## HEADLINE: FAIL — floor 8.8 (view-rearleft, view-rearright). Mean 8.94,
## up from 8.74. ALL EIGHT r4 orders verified DELIVERED or cert-capped —
## third consecutive clean-claims round on the visual orders. Graduation is
## blocked by ONE uncovered protagonist the r4 TRACK-RIG round introduced
## after the r3 verdict: the ROAD-WHEEL ROW the oracle renders mid-flank is
## fully curtained on the proc. Six views sit at 9.0+ already; the six
## flank-bearing views need exactly this one fix.

The r3 gap-to-9.0 inventory (fused skyline, plain side faces, hard corner
towers, CAD seam grid, sun-flank crowns, duffels-from-plan, wedge, CROWS
front) is CLEARED. What blocks 9.0 now was not visible at r3: the r4
track-rig round (887b29e, landed between verdicts) replaced the hand-rolled
band whose painted disc reliefs read as wheel hints with the §H shared rig —
real sprocket/idler/wraps/teeth now RENDER and read beautifully at both
ends, but the skirt curtain + flat-run filler occlude all seven road wheels
mid-hull on both flanks. The SEPv2 ref pane shows its wheel row plainly
(hem ~0.35 m higher, wheels + hub rings + scalloped hem); the three frozen
family graduates (m1a1, m1a1ha, m1a2_tejas — family strip, tmp-m1a2r4c-
family.py) all show theirs. No cert covers the skirt hem or wheel
visibility (r3's binding list: slit floor, drum caps, crate-band massing,
low-slung CROWS, whips — none touch the hull band). Ref-render-outranks
(§D) + §H.4 family anatomy make this the round's one real finding.

## Per-view scores (r3 -> r4; builder self-read in parens)

| view | score | justification |
|---|---|---|
| view-front (—) | 8.8 -> **9.0** | Certified massing honored (front rows can't drop; works walls vertical vs ref cheek cant = crate-band class, evaluator Δ-13.8° @x−1.63 not faulted). Skyline band rows 140-180 now carries 6022 sky px vs ref 6930 (87% — was "one fused wall"); lanes read as dark slots per the certified-rows law. CROWS station reads at 4x (pale ring + receiver bar + EO cap + smoke tubes; low-slung cert forbids the ref's sky-backed pop — capped, not faulted). Glacis anchor holds: (820,340)-(1100,430) L 55.3 vs ref 53.4 (r3 +2.0 class). Zero true holes (0/1007 enc). Wheel band not visible from dead ahead — unaffected by the protagonist. |
| view-frontleft (—) | 8.7 -> **8.9** | Orders read through the quarter: rounded r0.16 shoulder (soft crown roll vs r3's hard corner), lanes break the skyline, wall dressing visible, glacis flows. Proc enc 14px (6 true) vs ref 54 — cleaner than ref. Held under 9.0 by the near-flank curtain run (wheels absent where the ref shows them under its scalloped hem). |
| view-left (8.8) | 8.7 -> **8.9** | SKYLINE BROKEN as ordered: 2 open notch-runs (x799-863 d12, x988-1123 d24) + the lane-1 railed sky pocket 204px (963,257)-(984,267) vs r3's fused wall (ref: 5 runs — proc lanes fewer/narrower, order spec was "broken read at 1x", met). Works walls DRESSED (conduit pair, straps, junction, wall-lip trim; links/coil per packet). Trackband at parity: proc (700,352)-(1120,392) 56.2/6.1 vs ref 56.0/7.3 — the r4-track padHex consideration is RESOLVED (banked 52.6/8.1 superseded with the gear change). Slit 134px TOL13 = certified floor. Sprocket + teeth render at the tail. Held under 9.0 by the full-length curtain: seven ref wheels vs zero proc wheels in the band (rows ~362-384); pad/pin beading is good texture but the wrong anatomy. |
| view-rearleft (—) | 8.8 -> **8.8** | Rack/duffel/jerry row busy; skyline notched; 5px enc total. The tail corner is the protagonist at its starkest (4x crop): proc curtain wall descends vertically at z≈−2.25 to y0.86 (evaluator: proc edge 90° len 0.83m UNMATCHED; Δbot −0.66..−0.69 @z−2.17..−2.19) where the ref opens the sprocket bay under a scalloped hem (wheels + sprocket visible). Held at 8.8. |
| view-rear (8.9) | 8.8 -> **9.1** | ORDERED wedge DEAD: verdict rect (849,419)-(1056,440) L 60.5 sd 0.0 p95 60, ≥L75 px 0 (r3: 814px, peaks L79-83); full rows 61.2/3.6/67 vs ref 63.9/9.6/83 — builder numbers EXACT. Plate parity holds: 61.8/3.4 vs ref 61.1/4.4. Skyline carries both guns dark-on-sky + notched boxes; louvers fused; grille dark. Best view. Residual (minor, polish): proc lower band flatter than ref (sd 3.6 vs 9.6 — the wood skins are uniform where the ref keeps subtle texture). |
| view-rearright (—) | 8.8 -> **8.8** | Mirror of rearleft: tail-corner curtain (Δbot −0.65/−0.67 @z−2.19..−2.22, proc edge 89.8° 0.83m UNMATCHED); enc 55px (5 true) vs ref 275 true. Rack reads busy; skyline ref-parity. |
| view-right (8.8) | 8.7 -> **8.9** | Skyline run-structure at REF PARITY (2 runs vs 2, depths 39/13-14 at the same stations) + lane pocket 315px (935,251)-(957,267); links strip + wall dressing read; slit 144px = certified floor; 26px rack-gap sliver (1168,296) = ref-endorsed class. Held under 9.0 by the curtain (as left). |
| view-frontright (—) | 8.7 -> **8.9** | As frontleft mirrored; enc 284px ALL PAINT (0 true) vs ref 337. |
| view-top (8.8) | 8.7 -> **9.0** | ORDER 4 DELIVERED to its ordered class: sun strip (outer 9%, rows 25-75%) proc R 58.2/16.3/p95 86 vs ref 64.1/15.9/102 (claim 58.7/16.7/85.6 reproduced; r3 was 49.8/6.7/60 — the zebra now answers; away-sun L 50.4/8.6/69 banked). ORDER 5 tone parity from plan: rack rect 57.8/9.6/78 vs ref 59.1/11.1/80 with a weak 3-lobe signature (dips shallow — builder's named residual; the trio reads ROUND from heroes). ORDER 6: roof-mid (880,220)-(1040,330) 60.5/sd 9.6/p95 77 vs ref 62.1/9.9/81 — seam grid at sd parity (r3: p95 71, CAD read). Saddle EXACT hold (61.4/4.8 vs 61.8/6.9). Zero true holes (0/2944 enc; builder's "92 true" was a stricter-threshold count — mine reads cleaner). Lanes read as transverse dark channels from plan. Certified/priced residual honored: dead-straight 5.39-5.40 m plan rails @x ±1.83 (r1 plan bins; the r3 verdict chose the tone remedy, delivered). |
| hero-frontleft (8.8) | 8.7 -> **8.9** | Rounded shoulder + broken skyline + dressed walls + M240/CROWS all read at hero range; glacis foreshortens correctly. 28px true (ref 161). Curtain visible along the near flank holds it under 9.0. Ref arcs r0.10-0.26 span 104-120° REFONLY = certified drum/skyline classes; the banked chord-limit law covers the proc's r0.16 (undetectable by design at ≤110°; its close-front detection at span 162° proves the rounding renders). |
| hero-rearright (8.8) | 8.8 -> **8.9** | The best-dressed view: fat strapped duffels riding the rails, rounded r0.045 tower edges, slat rows, vent slots, grille louvers, both guns. 27px true vs ref 328. Evaluator voids 0.914/0.005 m² ADJUDICATED FALSE (census 27px true — mask-topology class, third consecutive round). Curtain on the lower flank costs the last tenth. |
| hero-toptilt (8.8) | 8.7 -> **9.0** | Roof reads modeled at tilt: CROWS drum + receiver + pale cap + sky-crossing M2, loader drum + moat + M240 crown line, duffel trio reads as ROUNDS, wall steps shade. ZERO true holes (0/1587 enc) — the evaluator's 6.781 m² void is the same mask-topology false positive (census 0). Certified drum-relief caps honored (2.386/2.4425 bind). Framing dW+6 dH+16 noted, not scored. |
| close-front (8.9) | 8.8 -> **9.0** | Glacis near-black class; embrasure dressed; M240 + low CROWS behind; shackle row; moiré dead. CONTAINMENT reads clean at the bow: wrap + grouser comb + shoe stacks behind the skirt nose, flaps clear. Certified crate band owns the upper read. Proc bow-nose arc r0.16 span 162° (z 4.54-4.74, y 1.39-1.56) NO-ref-match = benign fitting rounding, no order. |
| close-roof (8.7) | 8.6 -> **9.0** | The certified relief gap (ref's proud faceted cupola vs capped drums) BINDS and is not faulted. Within certs this view now earns it: CROWS = drum + massed receiver + pale cap + unambiguous sky-crossing barrel; loader = pale drum + moat crescent + collar + dark M240 crown; plateau seams broken to panel-line language (order 6, sd parity); rack tops busy. Zero true holes (0/3049 enc vs ref's own 743 true). Framing dH+8 noted. |

Mean 8.94 (r3 8.74, r2 8.39). Every view reads same-vehicle/same-tier; six
views at 9.0+; the six flank-bearing views are held at 8.8-8.9 by the single
wheel-row protagonist.

## Claims audit (§D — official pairs, re-measured)

Every r5-round claim reproduced or reconciled:
- **Lane pockets**: claim L 205 / R 317 -> measured 204 / 315 (TOL13, d≤1)
  at the claimed stations. EXACT (render noise 1-2px).
- **Slit**: claim 134 TOL13 ≡ 117/116 TOL6 floor -> measured L 134 / R 144
  at the r3 bboxes. AT THE CERTIFIED FLOOR, unchanged.
- **Sun strip**: claim 58.7/16.7/85.6 -> measured 58.2/16.3/86.0. HIT
  (ordered class "mean ~60, p95 85-100").
- **Wedge verdict rect**: claim 60.5/sd 0.0/ge75 0 -> measured EXACT.
- **Rows 419-440 full-x**: claim 61.2/3.5/66.8 vs ref 63.9/9.5/83.2 ->
  measured 61.2/3.6/67 vs 63.9/9.6/83. EXACT.
- **Roof-mid**: claim mean 61.1 vs ref 61.2 (builder's window) -> my r3
  window reads 60.5 vs 62.1 with sd 9.6 vs 9.9, p95 77 vs 81 (claim 77-78).
  Same class; sd parity confirms the seam-grid kill.
- **Glacis**: 55.3 vs 53.4 (r3: 55.4/53.4). Holds.
- **Saddle**: 61.4/4.8/p05 57 vs 61.8/6.9/52 — r3 EXACT hold.
- **Trackband**: 56.2/6.1 vs ref 56.0/7.3 — near-exact parity; the r3
  banked 52.6/8.1 is SUPERSEDED by the r4-track gear (packet's padHex
  retune consideration resolved; bank the new number).
- **B2 census**: proc TRUE holes — top 0, toptilt 0, close-roof 0, front 0,
  rear 0, close-front 0; quarters 0-6px; heroes 17-28px (rack-gap class,
  ref's own 96-328px); sides = slit (certified) + lane pockets (below).
  NO new hole class.
- **Warm census**: 0 strong-warm px on all five probed proc panes.
- **DISCREPANCY (the round's one)**: the r4-track packet self-check claimed
  "wheels + hub rings under the skirt line" on the critic pairs. NOT
  REPRODUCED: no wheel disc renders mid-hull on either flank at 1x or 4x
  (band rows ~362-384 carry skirt tabs + pin beading + pads only; wheel-
  pitch periodicity absent, pad-pitch 20px dominates). This is the
  protagonist behind order 1, and the claim goes to the discipline ledger
  as an unverified self-check line, not an r5-order breach (all eight
  ordered claims verified).

## Evaluator adjudications (§D citations)

- **RIG PARITY OK** (1.3° max, 11 ortho views) — no mismatch.
- **Enclosed voids** hero-rearright 0.914/0.005 m², hero-toptilt 6.781 m²:
  FALSE POSITIVES (official flood: 27/0 true px) — the tool's own
  barrel/deck-gap warning class, third round running.
- **REFONLY arcs** (front r0.20 span 141°, frontleft r0.26 104°, left r0.25
  132°, rear r0.26 120°, rearleft r0.14 169°, frontright r0.12 152°,
  hero-fl r0.10 120°, hero-rr r0.99 69°): certified drum/skyline classes +
  the BANKED CHORD-LIMIT LAW — the delivered r0.16/r0.045 rounding is
  radius-cited geometry, undetectable by design below r~0.48 at ≤110°
  spans; its one >110° exposure (close-front, span 162°) IS detected,
  proving the arcs render.
- **Δbot/Δtop columns**: the "at vertical edge — cliff offset" annotations
  honored. The four quarter Δbot −0.65..−0.70 @z −2.17..−2.22 and
  left/right Δbot +0.433 @z 3.47 are REAL (the curtain tail wall / bow
  wrap-window deltas — order 1 corroboration, confirmed in renders).
  Front/rear Δtop +0.50..+0.58 @x ±1.5-1.63 = certified works-wall
  verticals vs ref cheek cant (crate-band class).
- **Front-slope law**: NO glacis-band flag (close-front lower flags at
  y 0.12-0.66 = shackle/flap fittings, r3's adjudication stands). PASS.

## Lane-pocket adjudication (bank this class)

The two ordered sky lanes census as ENCLOSED TRUE-HOLE clusters (204/315px)
because the r3-certified sky-crossing CROWS M2 barrel (slew z 0.64->1.27)
crosses lane-1's window in side projection and seals the vent; the ref's
own lane carries ~226px of under-rail sky vented only through its rail's
AA breaks (visible as open sky in the ref crop, absent from its census).
Ruling: REF-ENDORSED LANE-AIR at the ref's own station — deliberate ordered
sky, NOT a §B2 contiguity breach. Slit + lane pockets are now the complete
certified/endorsed side-view enclosed-air inventory; anything new fails.

## Standing checks (§B owner laws)

- **FRONT-SLOPE**: PASS (evaluator-clean glacis band; raked one-line read
  at front/close-front/heroes).
- **CONTIGUITY / NO HOLES**: PASS — zero true holes on every deck view;
  sides carry only the certified slit + endorsed lane air; §B2 verify line:
  proc true 92px-class claim re-read as 0 true on my instrument (cleaner);
  ref's own daylight 95-767px per view. standard-check contig 0 ✓.
- **DECORATION / MG PHYSICS**: PASS — census mg1+1d ✓ (rack-floor MAG +
  spareTrackLinks; CROWS + M240 hand-authored under the packet's SS I
  clause); CROWS barrel sky-crossing pale at close-roof (~45px run class);
  M240 dark crown-riding on the pale drum; new §I dressing (links, coil,
  straps, conduits, junction) reads at 4x and busies the walls at 1x.
- **TRACK CONTAINMENT**: PASS — audit 0/0 exact ✓; renders: bow wrap +
  comb + shoe stacks behind the skirt nose, sprocket + wrap clear at the
  tail, flaps clear, no floating bands, no corridor daylight.
- **VARIANT-DISTINCTIVENESS (§H.4)**: PASS on loadout — the SEPv2 tells
  are legible in the garage strip: proud CROWS station + M240 loader ring
  + duffel-loaded lane-railed bustle field + dressed works walls vs
  m1a1's bare-roof M2, m1a1ha's red-brown clean flanks, tejas's long
  low turret. CAVEAT feeding order 1: family ANATOMY diverges — all three
  frozen siblings render their seven-wheel row; m1a2 alone curtains it.
  Variant variety must come from kit, not from hiding shared anatomy.

## Certified residuals (bind this critic and the next; NOT orders)

Slit floor 134/144 TOL13 (≡117/116 TOL6; turret-mask asymmetry law);
ring-drum relief caps 2.386/2.4425; r1 crate-band massing (incl. front
rows + works-wall verticals); low-slung CROWS (no side-ortho sky
silhouette); whip antennas (orchestrator lane); BISTABLE ref columns
z 1.25-1.80; certified plan bins (the straight ±1.83 rails); BIN-EXTENT
rear-flank dressing void (named, law-priced); arc-pairing instrument
limit (chord law); y-max 2.496 hoop / y-min 0.005 sag anchors.

## Fix orders (r5-visual) — ONE protagonist + two zero-risk polish items

1. **UN-CURTAIN THE WHEEL ROW** (the only 9.0 blocker; all six flank
   views). Make the seven road wheels + hub rings RENDER mid-hull on both
   flanks at the ref's own band rows (ref hem sits ~0.35 m higher than the
   proc curtain mid-hull; ref shows wheels + scalloped hem + open sprocket
   bay at the tail). Suggested lanes, builder's choice: raise the skirt/
   curtain hem toward the ref line mid-hull; trim the flat-run filler's
   top edge below wheel centers so discs read behind it; end the curtain
   at the ref's tail line (the z≈−2.25 vertical edge, 0.83-0.84 m,
   UNMATCHED on all four quarters) opening the sprocket bay; give wheels
   the family lit slots if shadow crushes them after exposure. GUARDRAILS:
   grouser-tip 0.150 / bow-ramp 0.399 / idler-shoe 0.465-0.53 / front
   col-83 1.4438 bins byte-stable; §B4 audit 0/0; hem work is
   silhouette-interior (track band owns the column bottoms) but verify
   gate x2 + re-run the d≤1 flood after any tone change (AA-blend law).
   DONE-GATE: wheel discs visible at 1x on view-left/right + both rear
   quarters; the four evaluator Δbot rows @z −2.17..−2.22 go quiet; gate
   line unchanged x2.
2. **Duffel plan-dips** (zero silhouette): deepen the separation shading
   between the three sausages from plan (crowns stay ≤2.318) — the trio's
   col-profile should show three clear lobes (today: weak, dips ~4L).
3. **Rear lower-band micro-texture** (zero silhouette): break the sd-0
   uniformity of the wood skins toward the ref's 9.6-class subtle panel
   variance; KEEP ge75 = 0 in the verdict rect.

TOUCH NOTHING ELSE: lanes, dressing, rounding, sun crowns, duffel tone,
seam trim, wedge kill, CROWS front, trackband tone, slit, saddle, glacis,
roof rects are all AT or better than their ordered classes and BANKED —
any regression re-opens its order. The 0.4 pintle allowance remains SPENT.

Verdict: **FAIL — graduation blocked; visual gate NOT met.** Floor 8.8
(rear quarters), mean 8.94. The r5 round delivered everything the r3
verdict ordered — the eight banked deliveries survive re-measurement to
the pixel. One anatomy fix (the wheel row the r4 track-rig round curtained
after the last verdict) separates this tank from fourteen 9.0s: with order
1 delivered and orders 2-3 as insurance, every view has a clear 9.0 read
within existing certs.
