# m1a2 shaded-parity r3 — independent critic verdict (2026-08-03)

SECOND CRITIC ROUND vs the SEPv2 oracle (this file replaces the old-oracle r3
text at the standing replacement pattern — the retired mislabeled-Leopard
verdict survives in git history; new-oracle history: r2 FAIL 8.39, floors
8.0 x3).

Provenance: pairs re-rendered FRESH via `node tools/tmp-tank-critic.mjs
--id=m1a2` at 16:06 while HEAD was **27905c2** (the landed visual-r3 commit).
14/14 saved, zero console errors. Working-tree audit: only
`src/vehicles/tankFactory.js` dirty — the merkava agent's `cfg.chainHex`
opt-in with byte-identical default; abrams.js contains no `chainHex`, so the
scored pixels are the landed r3 build exactly. Scored ONLY
`shots/critic-m1a2/*.png`. `node tools/visual-evaluator.mjs --id=m1a2` run
per §D (camoSeed 4242): **RIG PARITY OK** — max yawProxy 1.2° @front, max
|dCentroid| 0.074 m; scoring proceeds. Measurement:
`tools/tmp-m1a2r3c-stats.py` (ITU-601 luma; bg |px−0x151b20| maxch ≤13;
enclosed-air flood with d≤1 TRUE-HOLE vs d2-13 paint discrimination) +
`tools/tmp-m1a2r3c-crops.py` (diagnosis crops only). Official standard-check
re-run: `contig 0 ✓ | decor mg1+0d ✓ | clip ?/?` (the r2-certified
instrument blindness on the hand-rolled track — containment judged on
renders below).

Registration audit: 13 of 14 pane bboxes within ±6px (view-top IDENTICAL
203x545 both panes); hero-toptilt proc dW+6 dH+16 touching frame bottom
(y639) and close-roof dH+8 pushing the proc camera back/lower — the known
per-model-bbox framing class, noted, not scored. BISTABLE GATE-REF law
honored: the ref M2/whip columns (z 1.25-1.80) are pose-dependent and were
not faulted (the evaluator's left/right Δtop −0.38/−0.41 m @z 1.44 flags
land in that band — discarded as pose).

## HEADLINE: FAIL — no view reaches 9.0. Floor 8.6 (close-roof, the only
## view below 8.7). Mean 8.74, up from 8.39; the r2 floors 8.0 x3 are CURED
## (view-top 8.7, hero-toptilt 8.7, close-roof 8.6). Graduation blocked.

All seven r3 orders verified DELIVERED or evidence-certified — this is the
second consecutive clean-claims round (every re-measured builder number
reproduced or reconciled to an identified instrument difference, below).
What separates 8.6-8.9 from 9.0 is no longer level or relief errors: it is
ONE form-language driver family (fused container-stack skyline, plain
works-field side faces, hard-cornered rack towers, CAD-pale seam grid) plus
two top-view identity gaps (sun-flank scallop brightness, rear-rack duffels
from plan) and small tone polish. The certified classes (slit floor, drum
caps, crate band, low-slung CROWS) are honored as bounds and not faulted.

## Per-view scores (r2 -> r3; builder self-read in parens)

| view | score | justification |
|---|---|---|
| view-front (8.8) | 8.5 -> **8.8** | Glacis anchor DELIVERED: rect (820,340)-(1100,430) L 55.4 (ref 53.4; r2 was +12.3, now +2.0) — the plate reads dark with the bolt row. Portal now a dressed embrasure (dark throat + rotor + cinch frame at (890,200)-(1060,330)). Zero true holes. Held under 9: skyline rows still one fused wall (ref opens 4-5 sky lanes; r2's +10..+33px width finding stands, unordered minor); CROWS at 1x is a dark item in a notch, not the ref's legible M2 (reads at 4x crop only). |
| view-frontleft (8.7) | 8.5 -> **8.7** | Glacis + saddle + grille flow through; scallop channel reads at the flank top. Boxy two-story skyline + crate band (certified) remain; CROWS tiny at 1x. Proc true-holes 63px = rack-basket gaps, ref-endorsed class (ref 36px). |
| view-left (8.7) | 8.5 -> **8.7** | Trackband BANKED number holds: proc (700,352)-(1120,392) L 52.6 sd 8.1 (r2 52.8/8.1; ref 56.0/7.3). SLIT now ROOTED: root bracket + step visible at the ref's own turret-bot line; enclosed TRUE-HOLE 137px at (1034,303)-(1055,311) vs ref's own 33px pocket at (396,280)-(402,285) — at the certified structural floor (instrument note below), ~4x ref daylight, reads as under-band shadow with a sky pin at 1x. Held under 9: fused container-stack skyline bustle-to-band (only ~4 slim notches vs the ref's wide lanes); works-field side faces plain. |
| view-rearleft (8.8) | 8.5 -> **8.8** | Grille fuse delivers from the quarter — the r2 bright louver-ladder echo on the rear flank is DEAD (dark fused face). Duffel row + jerry boxes read SEPv2-busy. Boxy corner tower + fused skyline hold it. |
| view-rear (8.8) | 8.5 -> **8.8** | ORDERED driver delivered: plate rect L 63.1 sd 4.7 (ref 61.1/4.4; ordered ≤64/≤6 HIT); door-field slat ladder DEAD — fine-pitch fused louvers, door fields clean of camo, ref-class texture. Residual found: the LOWER plate band still carries pale camo the ref keeps bare-dark — bright band rows 419-440 peaks L79-83 migrating x871->x849 (a diagonal patch edge) + 814px ≥L75 across (849..1056, 419-440); plate p95 75 vs ref 67 (order 7). Rack row remains the tank's best element. |
| view-rearright (8.8) | 8.5 -> **8.8** | As rearleft, mirrored. Proc true-holes 55px rack gaps (ref's own 233px). |
| view-right (8.7) | 8.5 -> **8.7** | Mirror of left: slit TRUE-HOLE 144px at (864,303)-(886,311) vs ref 46px at (523,295)-(554,296); band rooted, skyline fused, works sides plain. |
| view-frontright (8.7) | 8.5 -> **8.7** | As frontleft. Proc holes 51px rack class (ref 49px). |
| view-top (8.7) | 8.0 -> **8.7** | FLOOR CURED. Roof LEVEL parity: rect (880,220)-(1040,330) L 60.8 (ref 62.1; r2 −8.3, now −1.3), p95 71 vs 81. SADDLE pit cured to parity: (916,170)-(986,217) L 61.4 sd 4.8 p05 57 (ref 61.8/6.9/52) — the hard-edged pit is gone. Both stations read as WEAPONS from plan (M2 receiver+barrel diagonal on the octagon ring; M240 dark bar on the loader drum) with visible recess moats. Flank ladder EXISTS (28-link comb both sides; L-flank sd 9.0 vs r2 5.7). Zero true holes (3013 enclosed px all d9-13 paint). Held under 9 by: sun-flank brightness — proc R strip mean 49.8 sd 6.7 p95 60 vs ref 64.1/15.9/102 (top-lit scallop crowns unanswered); plan silhouette runs DEAD-STRAIGHT 5.39 m rails both sides (evaluator: proc edges 90°/90° len 5.39 m @x ±1.83 z −2.35..3.04 UNMATCHED — the ref's outer edge is the wavy scallop line, no straight match exists); ref's three fat rear-rack duffel sausages (rows ~85-130) answered only by a slat/frame grid; pale seam grid reads CAD-ish vs the ref's soft painterly deck. Bow chevron/shackle half remains near-exact (my bow band: proc 51.9 vs ref 55.2). |
| hero-frontleft (8.7) | 8.5 -> **8.7** | M240 dark curl on pale deck + CROWS box read at hero range; scallop channel reads through the tilt; racks busy; glacis rake foreshortens correctly. Boxy stacked-slab turret + plain works sides + hard tower corners hold it (evaluator: ref arc upper-rear r0.26 m span 104° @z −1.63..−1.34 y 2.33..2.37 NO proc match — the ref's rounded skyline masses). |
| hero-rearright (8.8) | 8.5 -> **8.8** | Busiest, best view: duffels + strap arcs + jerry slats + both guns + slat rails all read; grille dark from the quarter. Boxy towers + fused walls remain (evaluator: ref arc mid r0.99 m span 69.4° @x −1.50..−1.12 y 2.19..2.32 unmatched). Proc true-holes 83px (clusters ≤23px, rack gaps; ref's own 328px) — the 0.940 m² evaluator void is ADJUDICATED an artifact, below. |
| hero-toptilt (8.7) | 8.0 -> **8.7** | FLOOR CURED. The roof is no longer a drawing: CROWS rides a real raised drum with wall + rim shading and the M2 lying across; loader ring shows pale drum + dark moat crescent + collar step + dark M240 crown line; works walls cast real steps. Zero true holes: 1599 enclosed px ALL paint d11-13 — the evaluator's 6.676 m² void is a mask-topology artifact (below). Held under 9: ref drums carry 3-4x the relief (CERTIFIED 2.386/2.4425 caps bind — not faulted, but the visibility gap is real at this tilt); saddle capsules are 2.2 cm proud (invisible at tilt where the ref's sausages are the dominant rear-deck mass); boxy two-story stack; rack-from-top frame grid. |
| close-front (8.8) | 8.5 -> **8.8** | Glacis wears the ref's near-black plate class now; portal reads as a dressed gun embrasure (throat + rotor + braces); M240 clearly legible on the roofline, CROWS low behind it; moiré stays dead (smooth cheek planes at x2); track containment clean at the bow (wrap + grouser comb behind the skirt nose, shackle row clear). Held under 9: certified crate band owns the upper read where the ref shows doghouse + sky-backed M2; fused skyline. |
| close-roof (8.6) | 8.0 -> **8.6** | FLOOR CURED, still the weakest view. Proc pane now shows a MODELED roof: CROWS = drum base + massed receiver + pale cap + sky-crossing barrel (~45px run, ≥2px edges — unambiguous weapon at this range); loader = pale drum + moat + collar + dark M240 crown line; plateau steps + slots. But set against the ref pane's proud faceted cupola drum + open hatch ring + sight masses, the relief gap (3-4x, certified caps) dominates this inspection-range view; the plateau field between stations reads flat with pale seams. Framing: proc camera sits farther back/lower (bbox class, noted not scored). |

Mean 8.74. Every view reads "same vehicle, same tier" — the M1A2 SEPv2
identity question stays settled, and the three r2 floors are cured with
real modeling, not paint.

## Claims audit (§D — official pairs, re-measured)

- **Roof rect**: proc L 60.8 p95 71 — builder EXACT (60.8/71). Ref 62.1/81.
- **Saddle**: proc L 61.4 sd 4.8 p05 57 p95 66 — builder EXACT (57/59.4-61.4/
  4.8/66). Ref 61.8/6.9/52/69. Parity class as claimed.
- **Glacis**: proc 55.4 (claim 55.4 EXACT), ref 53.4 (claim 53.4 EXACT).
- **Rear plate**: proc 63.1/4.7 vs claim 62.7/4.3 (my rect is bbox-anchored;
  same class, ordered ≤64/≤6 still HIT). Ref 61.1/4.4 EXACT. In-field slat
  max: door fields clean as claimed; the ≥L78 content I find is the LOWER
  band camo wedge (rows 419-440), a real undisclosed residual (order 7) but
  not the slat-ladder class — the ladder is dead.
- **SLIT — instrument reconciliation (bank this)**: builder 117/116 was
  measured with `tmp-m1a2-holecensus.py` at **TOL 6**; my rig (and the r2
  numbers 147/159) use **TOL 13 + d≤1 classification**. Like-for-like: r2
  147/159 -> r3 **137/144** (−7%/−9%), single cluster per side at the same
  bbox. The −20%/−27% in the packet mixes instruments; the delivered slit
  sits AT the certified structural floor on either instrument. Future slit
  claims must state tolerance.
- **Flanks**: builder sd 6.9/10.8; my strips (outer 9%, rows 25-75%) read
  proc L 9.0 / R 6.7 vs ref 8.5/15.9 — different rects, same story: ladder
  present, sun-side crown brightness missing (proc R mean 49.8 p95 60 vs
  ref 64.1 p95 102). Builder's residual honest in direction, understated in
  size.
- **Bow parity**: builder proc 50.8 vs ref 50.1 on their rect; my bbox band
  (rows 80-92%) reads proc 51.9 vs ref 55.2 — close class, not exact on my
  rect; no order.
- **CROWS 6-view weapon-read**: verified STRONG at close-roof, hero-toptilt,
  view-top, hero-frontleft (crop-grade); MARGINAL at ortho front/frontleft
  1x (dark blob in a notch). Law satisfied (below); ortho legibility is
  order 8 polish.
- **M240 crown line**: verified — dark receiver+tube crossing the pale
  collar at close-roof/toptilt/close-front/hero views.
- **B2 sweep**: verified ZERO true holes on view-top (0/3013 enclosed),
  hero-toptilt (0/1599), view-front (0/806), view-rear (0/164), close-roof
  (0/2784), close-front (0/36). Quarters/side true-holes are the slit
  (certified) + rack-basket gaps 33-63px, a class the ref itself carries at
  36-328px. NO new hole class this round.
- **Warm census**: 0 strong-warm px on all probed proc panes — salmon kill
  holds.
- **Trackband bank**: holds to 0.2L (52.6/8.1 vs banked 52.8/8.1).

## Evaluator adjudications (§D citations)

- **RIG PARITY OK**: max yawProxy 1.2° @front; no RIG MISMATCH.
- **hero-toptilt "proc enclosed-void 6.676 m²" and hero-rearright
  "0.940 m²"**: ADJUDICATED FALSE POSITIVES for the §B2 law. The official
  render flood censuses ZERO d≤1 enclosed pixels in both panes; the voids
  are silhouette-mask topology (the sky wedge under the raised barrel /
  between rack overhang and tube closing in the tool's mask where the
  render keeps an open channel) — exactly the tool's own printed warning
  class ("barrel/deck gaps also read as voids"). No order.
- **top view angles**: 15 matched edges, 0 flagged — plan-form angle parity
  clean. The 5.39 m UNMATCHED straight rails @x ±1.83 are the scallop-
  silhouette finding (orders 4/5 context).
- **Front-slope law**: NO flagged segment in the glacis band (the digest's
  close-front flags sit at y 0.11-0.65 — blade/shackle/mudflap fittings,
  not the rake). Certified profile intact.
- **Rounded-structure gap, citable numbers**: rear paired arc proc r0.07 m
  vs ref r0.26 m (Δ−0.18 m, span 147.3°, @x −1.43..−1.31 y 1.96..2.07);
  unmatched ref arcs r0.20-0.26 m span 104-141° at front (@x −0.96..−0.61
  y 2.46..2.58 — the proud drum on the skyline, certified class), left
  (@z −3.20..−2.74 y 2.13..2.18), frontleft (@z −1.63..−1.34 y 2.33..2.37),
  hero-rearright (r0.99 m span 69.4°). These quantify the boxy-tower /
  missing-round-mass driver (orders 3/5).
- **Pose columns**: left/right Δtop −0.38/−0.41 m @z 1.44 = ref M2/whip
  mast, z 1.25-1.80 bistable band — NOT faulted per law.

## Standing checks (§B owner laws)

- **FRONT-SLOPE**: PASS. One-line raked glacis at close-front/front/heroes;
  evaluator shows no glacis-band angle flag (±0.2-0.6° noise on the long
  edges).
- **CONTIGUITY / NO HOLES**: PASS. §B2 census 0 true holes on every deck
  view (numbers above); standard-check contig 0 ✓; no NEW hole class; slit
  is the certified ref-endorsed exception at its structural floor; rack
  gaps are ref-class see-through.
- **DECORATION / MG PHYSICS**: PASS (upgraded from r2 FAIL). Two roof guns
  + stowed MAG fitting (census mg1+0d ✓; roof guns hand-authored under the
  packet's SS I clause). The M240 delivers the pale-deck inversion (dark
  crown-riding line over the recessed ring); the CROWS delivers receiver
  MASS + pale cap + barrel over the low left-cheek deck, reading as a
  weapon at every close/tilt/top view; sky-backed at close-roof with ~45px
  run and ≥2px edges. Residual: ortho-front 1x legibility is marginal
  (order 8) — a polish item, not a law breach.
- **TRACK CONTAINMENT**: PASS (renders; audit tool blind ?/? as certified).
  Bow: wrap + grouser comb stay behind the skirt nose and clear of the
  shackle row (close-front x2 crop); stern: notch wall + flaps clear in
  rear/quarter/hero views; no floating bands at any of the six relevant
  views.

## Fix orders (r4) — one driver family + polish; certs respected

DRIVER A — FORM LANGUAGE (all 8 side/quarter/hero views; the gap-to-9.0
everywhere):
1. **Open the ref's two sky lanes** in the container-stack skyline at the
   ref's own lane stations (left-ortho: between bustle towers and the
   cupola-zone works block ~z −0.8..−0.3, and between works block and
   doghouse/band ~z 0.6..1.1; front rows y140-180 mirror). Priced
   silhouette work: plan via vertex-workorder columns first; certified rows
   untouched; target = the ref's broken skyline read at 1x (4-5 lanes), not
   exact widths.
2. **Dress the works-field SIDE faces** (largest flat-slab surfaces on the
   tank): KIT strap/rib/handle fittings, stamped inside the turret AABB,
   tone per family mats — kills the "plain camo slab" read at left/right/
   quarters/heroes. Zero silhouette.
3. **Round the rack corner towers** toward the ref's radii: proc corner
   r0.07 m vs ref r0.26 m (evaluator pair, @x −1.43..−1.31 y 1.96..2.07);
   chamfer/fillet WITHIN existing crowns (no new height), re-check the rear
   whole/side bins.

DRIVER B — TOP-VIEW IDENTITY (view-top, hero-toptilt):
4. **Sun-flank scallop crowns**: dedicated pad-crown material lift on the
   sun side only — target strip class mean ~60 p95 ~85-100 (ref 64.1/102;
   proc today 49.8/60); away-sun side stays. Tone-only (the builder's L61
   detail-tone ceiling is the thing to break with a brighter slot, not
   geometry).
5. **Rear-rack duffel sausages from plan**: three fat rounded duffel masses
   riding INSIDE the existing rack rails (crowns ≤ the 2.318 rail class so
   no column moves), pale top term per cloth physics — answers the ref's
   dominant rear-deck trio (ref rows ~85-130 in the top pane). Plan-check
   the rear bins before landing; this also feeds hero-toptilt.

DRIVER C — POLISH (tone/material, zero silhouette):
6. **Seam-grid softening**: drop the pale plateau seam lines toward
   field+4 luma so the top read stops being CAD-wireframe (the ref's panel
   lines are darker and broken).
7. **Rear lower-plate camo wedge**: patch-mask the lower band (rows
   ~419-465; the diagonal pale edge peaking L79-83 at x849-871) — the ref
   keeps this face bare-dark; target plate p95 ≤70 (ref 67).
8. **CROWS ortho-front legibility**: strengthen the receiver pale cap /
   top licks within certified crowns so the station reads at 1x from the
   front the way the ref's M2 does.

CERTIFIED RESIDUALS (bind this critic and the next; NOT orders): sight-band
slit at its structural floor (137/144 TOL13 ≡ 117/116 TOL6; turret-mask
asymmetry law); ring-drum relief above the 2.386/2.4425 caps; r1-certified
crate-band massing; low-slung CROWS (no side-ortho sky silhouette); whip
antennas (orchestrator lane).

Gate notes for the orchestrator: orders 2/4/6/7/8 are tone/material/fitting
(zero silhouette); order 5 adds mass strictly under existing rack-rail
crowns (plan-check rear bins); orders 1/3 are the only priced silhouette
work — workorder plan first; the 0.4 pintle allowance is SPENT (r3 CROWS
crest/slew) — no further gun-silhouette spend. Instrument bank: hole-census
claims must state their bg tolerance (TOL6 vs TOL13 differ ~15-20% on
AA-fringed slits).

Verdict: **FAIL — graduation blocked; visual gate NOT met.** No view below
8.6, none at 9.0; mean 8.74 (r2 8.39). The r3 program landed everything it
promised — the remaining distance is a single coherent form-language round
(lanes, side dressing, corner rounding, flank crowns, rack sausages) plus
tone polish. If r4 delivers Driver A+B with the polish list, every view has
a credible 9.0 path within existing certs.
