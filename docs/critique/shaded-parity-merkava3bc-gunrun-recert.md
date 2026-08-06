# merkava3b + merkava3c §B3.1 GUN-RUN — INDEPENDENT RE-CERT (graduate-change)

Date 2026-08-06. Independent critic for the §B3.1 gun-run graduate-change
(owner directive 2026-08-06: "the merkavas have those really ugly gun
rectangular prisms and dont look accurate"). Change under review: the
shared m.boxy branch (merkava.js, landed at 4009302) replacing the r8
boxy MG251 housing (0.34 x 0.3165 box + 6 drape-crown boxes) with the
ROUNDED-RECT CARRIER COLLAR — flat cardinal carrier slabs exactly on the
certified extents (side top 2.1465 / bot 1.8300, plan ±0.170) + four
r 0.125 corner cylinders (endIn 24 mm) + three r 0.0055 canvas crown
rolls (tops 2.1494) + 12 shoulder-arc creases + rounded-rect end ring +
trough seat. All renders and measurements below are my own runs on the
official rigs (§D), fresh this session, at the candidate hashes.

## VERDICT — RE-CERT PASS, both tanks

| tank      | §B3.1 read (before -> after)              | gate x2 (frozen row)   | floor | mean | re-freeze |
|-----------|-------------------------------------------|------------------------|-------|------|-----------|
| merkava3b | shoebox housing -> round-shouldered collar | 90.1 = 90.1 EXACT      | 9.1   | 9.19 | **8bb8d984** (37/145590) |
| merkava3c | shoebox housing -> round-shouldered collar | 90.5 = 90.5 EXACT      | 9.1   | 9.19 | **b7318b10** (37/145956) |

**RE-CERT PASS (re-freeze 8bb8d984)** — merkava3b.
**RE-CERT PASS (re-freeze b7318b10)** — merkava3c.
Orchestrator may land the packets + both re-freezes in one commit. No
coordinate orders.

## Provenance (§D discipline)

- Working tree at commit 4009302 (merkava.js committed; foreign WIP in
  abrams.js/leopard.js + gate JSONs untouched by me and empirically
  outside the merkava hash space — see bracket below).
- Hash bracket x2 (`tools/tmp-hashgeo.mjs`, before AND after every
  browser run in this verdict): merkava3b **8bb8d984** (37/145590),
  merkava3c **b7318b10** (37/145956) — EXACTLY the packet candidates;
  frozen sibs merkava1b **470f3665** (38/131562), merkava3d **6b97616c**
  (35/162836) byte-exact both runs. Every render below is hash-stamped
  at the candidates (§J).
- Gate x2 mine (runs 3+4 counting the builder's), both runs
  bit-identical and EXACT to the frozen ledger rows:
  - merkava3b min **90.1** — hull 91.1 / whole 90.1 / turret 90.4 /
    stations 93.6 / dims 100 / floaters 100 PASS
  - merkava3c min **90.5** — hull 91.9 / whole 90.5 / turret 90.8 /
    stations 92.3 / dims 100 / floaters 100 PASS
- Critic pairs re-rendered fresh by me on the official render path via
  `tools/tmp-b1b3-critic-batch.mjs --ids=merkava3b,merkava3c` (identical
  harness URL/viewport/waits to tmp-tank-critic.mjs, both ids inside ONE
  FIFO ticket per the b1b3 precedent, §F.1). 14 pairs per tank, zero
  console errors. Scored ONLY shots/critic-merkava3{b,c}/*.png (mtimes
  Aug 6 11:48, this session).
- §J yaw pairs re-rendered BY ME at the verdict hashes
  (`tools/tmp-merkava-b5-shots.mjs`, 4 sets in one ticket) ->
  shots/critic-gunrunyaw/{rest,yaw90}-merkava3{b,c}.
- Baseline for all diffs: my pre-render snapshot of the Aug-5-certified
  shots/critic-merkava3{b,c} sets (pre-round frozen state 36fc1c74 /
  a2805356, the boxy housing) — session scratchpad copy.
- Scratch tools this round: tools/tmp-gunrun-flood.py (§B2 flood,
  blue-signature + label-band law), tools/tmp-gunrun-diffloc.py
  (change-locality), tools/tmp-gunrun-crops.py (zoom strips).

## Standing checks (all mine, official rigs)

| check | merkava3b | merkava3c |
|---|---|---|
| (1) gate x2, frozen rows EXACT | PASS 90.1 both runs | PASS 90.5 both runs |
| (2) hashgeo x2 bracketing all renders | 8bb8d984 stable; sibs 470f3665/6b97616c byte-exact | b7318b10 stable; same sibs |
| (3) §J yaw-pair at verdict hash | PASS — full gun run + collar rotate whole; hull deck static | PASS — same |
| (4) standard-check | contig **0** holes; clip 0/0; decor mg0+0d = carried §I family justification | contig **0**; clip 0/0; same §I carry |
| (5) turret-parent audit | stranded 0 / abutting 0 / dangling 0 | 0 / 0 / 0 |
| (6) §B2 flood vs baseline (10 changed views) | enclosed-px delta **0 on every view** | delta **0 on every view** |
| (7) visual-evaluator rig parity | exit 0, no RIG MISMATCH, worst yawProxy 1.1° | exit 0, worst yawProxy 1.2° |

## 1. The §B3.1 read (the point of the round)

Zoom strips [BASELINE(boxy) | FRESH(collar) | REF-print] at 3x from every
changed-view diff bbox, plus 4x/6x corner-seam hunts (session scratchpad;
verdicts are reads of the official pair renders they were cut from):

- The shoebox is GONE in every changed view on both tanks. close-front /
  view-front / 3/4s: the housing's hard 90° corners are now r 0.125
  shoulder arcs; the crown carries the three canvas cinch rolls; the
  12 sag/cinch creases hug the arcs and read as cinched fabric; the dark
  end plate reads as a ROUNDED-RECT ring seating the sleeve — the whole
  station reads as the real MG251 mount's recessed cast/canvas collar
  entering the casting mouth, at 1x through 6x.
- CORNER-CYLINDER SEAM HUNT (the box-with-stuck-on-cylinders failure):
  6x crops of the collar corners in close-front and close-roof, both
  tanks — the arcs blend tangentially into the flat faces; no groove, no
  highlight discontinuity, no two-body read. Quantified (§D): the r 0.125
  20-segment rounds carry a 1.5 mm facet sagitta at the tangent — 0.13 px
  at elevation scale (86 px/m), <1 px even at the 4x close-front scale
  (~460 px/m): a polygonal/seam read is sub-resolution by construction,
  and the visual crops confirm smooth arcs.
- Pure sides (view-left/right): the certified silhouette is
  carrier-identical — the top/keel lines stay the same straight lines
  (the real collar's side profile is also near-rectangular); the round
  read arrives via the flank shading gradient + kept flank folds +
  re-seated pale fold hugging the arc. Correct §B3.1 behavior: geometry
  where it shows, mask-flat where certified.
- view-top / close-roof / hero-toptilt: planform front corners read
  rounded into the end ring; crown rolls stripe the crown as rolled
  canvas seams; shoulder creases read as strap ticks on the arc. The old
  drape-crown chips are gone.
- The trough seat fills the casting mouth behind the collar — no §B2 gap
  at the mouth in any view (flood delta 0, crops clean).

## 2. Change locality (fresh vs pre-round baseline, threshold >2/255)

Pixel-diff of all 14 pair views, split by half — REF half: **0 px on all
14 views, both tanks** (no framing drift, no reference pollution). PROC
half: every diff is ONE collar-zone bbox:

- merkava3b: close-front 1089 px (x866-947 y315-354) · view-front 825 ·
  frontleft 432 · frontright 598 · left 612 · right 751 · top 630 ·
  hero-frontleft 918 · hero-toptilt 522 · close-roof 3039 · rear **0** ·
  rearleft 306 · rearright 270 · hero-rearright 535.
- merkava3c: close-front 1082 · front 687 · frontleft 434 · frontright
  555 · left 577 · right 754 · top 550 · hero-frontleft 982 ·
  hero-toptilt 463 · close-roof 2726 · rear **0** · rearleft 296 ·
  rearright 277 · hero-rearright 507.

Zero pixels moved outside the collar zone in any view. NOTE (packet
correction, non-blocking): view-rearleft / view-rearright /
hero-rearright were listed "unchanged" but carry small collar-end deltas
(the collar front + wedges peek past the casting cheek in rear-quarter
perspectives). Spot-checked at 3x: the peeking end is now ROUNDED where
the box corner used to poke a hard step against sky — improved, silhouette
rows frozen (gate EXACT). view-rear is literally 0-diff as claimed.

## 3. §B2 flood (blue-signature + label-band laws)

Mask-method (|px−0x151b20| maxch<=13 AND B−R>=+8), border flood on the
PROC half, y13-21 label band excluded, fresh vs baseline per changed
view: enclosed-pixel census IDENTICAL (delta 0) on all 10 changed views,
both tanks (e.g. 3b close-front 183=183, 3c close-roof 99=99 — the
banked per-view residual censuses carry unchanged). A ~1k-3k px localized
pixel change introducing ZERO new enclosed sky anywhere is the §B2
optimum for a graduate change. Evaluator cross-check: proc holes [] on
9/10 changed views; the close-roof micro-holes (3b 1 x 0.001 m², 3c
0.009+0.002 m²) sit at bustle-zone centroids (z<0), outside the collar
zone, and the flood delta-0 proves them pre-existing certified classes.

## 4. §J yaw pairs (verdict-hash evidence)

rest/yaw90 x 14 views per tank, rendered by me at the bracket-proven
candidate bytes: the ENTIRE gun run — collar, rolls, creases, end ring,
wedges, sleeve, tube, muzzle — rotates with the turret; hull deck
furniture stays put; no stranded furniture at the mouth, no dangling
mid-air content, run continuous casting-to-muzzle at yaw. Matches the
builder's pairs (shots/merkava-gunrun/pairs), now hash-stamped per §J.

## 5. Evaluator numbers at the collar (§D citations)

- Rig parity: no RIG MISMATCH; worst yawProxy 3b 1.1° (front), 3c 1.2°
  (rear) — far under the 10° abort bar.
- Silhouette arcs: the evaluator finds NO new proc silhouette arc at the
  collar in any changed view — correct by construction: the shoulder
  rounds are interior to both masks (flat carriers own the silhouette,
  the AA-identical claim), and the gate x2 EXACT rows are the machine
  proof the outline did not move.
- Collar-zone flags, decoded (none are orders): 3c left/right carry
  procOnly/matched near-horizontal edges at y 2.147 / 1.819 = the crown
  and keel CARRIER lines themselves (certified band, frozen rows); the
  'right' matched Δ−12.9°/+6.2° pair (len 0.22-0.24 m) is the ref
  print's tapered-drum profile vs the certified flat band — the priced,
  frozen divergence, unchanged this round. 3b/3c close-front and
  close-roof refOnly edges at x −0.23..−0.34 (14-24°, len 0.12-0.23 m)
  are the print's own fat-drum/sight-hood features the certified masks
  already price. The 3b-vs-3c flag asymmetry on identical shared members
  is matcher bin-noise (see law bank).

## 6. §H.4 distinctness (gun-run identity across the family)

- vs merkava1b / merkava3d (frozen sibs, byte-exact this session; the
  builder's report renders verified "UNCHANGED clean" at those bytes):
  1b and 3d run the PLAIN branch — bare cylindrical mantlet drums
  (1b r0.125 x 0.40; 3d r0.150 x 0.51). The 3b/3c rounded-RECT canvas
  collar (flat rolled crown, rectangular section, round shoulders,
  end ring) is a structurally different mount class at a glance. Also
  distinct from 2b/2d's legacy triple-cylinder + canvas cinch drums.
- 3b vs 3c: the collar is shared-identical by construction (as the boxy
  housing was before — no distinctness regression from this round). Mark
  identity stays carried by the certified surrounding kit and reads
  clearly in every 3/4 crop: 3b's low pod row + open mouth trim vs 3c's
  taller casting wall, different mouth framing and pot layout, per the
  pod-round tells. No 'same tank re-badged' read.

## 7. Scores — changed views, graduation standard (>=9.0 bar, 1x-4x)

| view           | merkava3b | merkava3c |
|----------------|-----------|-----------|
| close-front    | 9.3       | 9.3       |
| view-front     | 9.2       | 9.2       |
| view-frontleft | 9.2       | 9.2       |
| view-frontright| 9.2       | 9.2       |
| view-left      | 9.1       | 9.1       |
| view-right     | 9.1       | 9.1       |
| view-top       | 9.1       | 9.1       |
| hero-frontleft | 9.3       | 9.3       |
| hero-toptilt   | 9.2       | 9.2       |
| close-roof     | 9.2       | 9.2       |

Floors 9.1 / means 9.19 both tanks — every changed view above the bar.
Rear cluster (unchanged/sliver views) spot-checked: view-rear 0-diff;
the three rear-quarter collar-end slivers read improved (rounded end vs
the old box corner); graduation verdicts carry.

## Residuals (declared, priced, non-blocking)

- Shoulder-crease strips read slightly stick-like at 6x in top-tilt
  views (two ~1x5 px marks at 1x) — attached on the arc, read as cinch
  straps; equipment grammar consistent, sub-visible at 1x.
- Pure-side roundness is shading-carried by design (flat carriers own
  the certified silhouette; the real collar's side profile matches).
- Ref-print drum/hood divergence at the mantlet (refOnly evaluator
  edges, §5) — the certified, gate-priced class, unchanged.
- Fleet-standing: decor mg0+0d (§I hand-authored-MG migration lane,
  packet-carried); track-clip shoe rear 18 rig_hull (§12.8 pre-existing,
  gear untouched by gun edits; standard-check aggregate 0/0 green);
  evaluator profile p95 Δ classes (registration-frame, fleet lane).

## Law discoveries (bank)

- CHANGED-VIEW LISTS ARE DIFF-DERIVED: the packet's "unchanged"
  rear-quarter views carried real 270-535 px collar-end deltas (the
  collar tip peeks past the casting cheek in perspective). Occlusion
  reasoning under-lists; a graduate-change packet should derive its
  changed-view list from a 14-view pixel-diff against the pre-round
  state — the list is the critic's scoring contract.
- ROUNDED-RECT SEG floor: corner rounds need facet sagitta <1 px at the
  largest critic zoom (4x close view) — r 0.125 at 20 segments gives
  1.5 mm (0.13 px side / <1 px close-4x), provably seam-free; bank
  sagitta-vs-zoom as the machine check for "no polygonal read" under
  the ROUNDED-RECT CARRIER law.
- EVALUATOR CROSS-MARK NO-FINDING FILTER: identical shared members can
  flag on one mark and not its twin (3c side-view carrier lines vs 3b
  silent) — matcher bin-noise; a same-member cross-mark comparison is a
  no-finding filter before ordering geometry.
- §B2 FLOOD-DELTA METHOD: fresh-vs-baseline enclosed-px per view
  (blue-signature + label-band laws) separates "new holes" from the
  banked per-view hole census — delta 0 under a localized pixel change
  is the clean §B2 re-cert signature; recommend as the standard §B2
  graduate-change check.

## RE-CERT PASS x2 — release to orchestrator for the single landing
commit: packet §B3.1 sections stand as written (with the changed-view
list correction noted above) + re-freeze merkava3b **8bb8d984**,
merkava3c **b7318b10**.
