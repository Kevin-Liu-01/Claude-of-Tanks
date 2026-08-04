# t84 shaded-parity r31 — FIRST FORMAL ADJUDICATION (2026-08-04)

Rig: fresh 14 pairs `node tools/tmp-tank-critic.mjs --id=t84` →
shots/critic-t84/ (zero console errors). Byte-discipline:
`tmp-hashgeo.mjs` t84 = **2c262e52** (41 meshes / 76600 verts) BEFORE and
AFTER every render on my watch; russia graduates frozen at their landing
hashes (pt91m **e6994e54** / t72b3m **c19ec9f0**). Official gate re-run:
**90.9 PASS ×2 bit-identical** (hull 90.9 / whole 92.2 / turret 91.4 /
stations 96.3 / dims 99.1 / floaters 100) — matches the 60a289f ledger
row exactly. `visual-evaluator.mjs --id=t84`: exit 0, **RIG PARITY OK**
(11 ortho views, max dYawProxy 0.8° @close-roof, max |dCentroid|
0.047 m, no flips), evidence shots/visual-eval-t84/. `track-clip-audit
--exact`: **18/0** (the known unnamed proxy-class sliver, box x ±0.98
y 0.58..0.66 z 1.94..2.0 — interior, no visual contact at 1x).
`tank-standard-check`: PASS (clip ✓ contig 0 ✓ mg1+2d ✓). Sibling
comparators re-rendered fresh on the same rig (shots/critic-t80/,
shots/critic-t80b/) for the §H.4 check. Measurements: my own sweeps on
MY fresh pairs (tools/tmp-t84-critic-measure*.py — ITU-601 luma rects,
mask-method bg |px−0x151b20| maxch ≤13, border-flood enclosed-sky
clustering); 3-5x crops diagnosis-only (scratchpad). All numbers below
re-derived this round with windows quoted. Pair frame: REF x [0,640),
PROC x [640,1280), same camera.

## HEADLINE: FAIL — floor 7.8 (view-right, hero-rearright), mean 8.01, no view at the 9.0 bar; ONE MANDATORY §B2 ORDER GROUP (enclosed see-through voids in 7 of 14 views — turret slot lane, right-side under-skirt tunnel, track-face slat ladders, skirt-pod flank columns)

front 7.9 · frontleft 8.2 · left 8.0 · rearleft 8.0 · rear 7.9 ·
rearright 8.0 · right 7.8 · frontright 7.9 · top 8.4 · hero-fl 8.1 ·
hero-rr 7.8 · toptilt 8.2 · close-front 7.9 · close-roof 8.0

This is t84's first independent verdict, one round after its first
geometric pass (90.9 ×3, the first russia-family pass since t72b3m).
The identity is genuinely RIGHT: registration is the cleanest I have
measured on a first adjudication (dAlong 0.000 rows; yawProxy ≤0.8° all
views), the dims carry, the welded-turret planform, deep-skirt hull,
bow pods, rear-left exhaust shelf, right-flank bustle stowage and the
Tucha lanes are all present and correctly placed. What fails is a tier
of finish the gate does not price: the build leaks SKY through four
distinct structural seams (owner law §B2: "no see-through voids … at
ALL angles" — the machine hole scan is top-down only and missed all
four), and a family of meshes renders in a RAW FLAT GRAY that reads as
unpainted primer from every rear/quarter angle. Both drivers sit on top
of the banked critic-lane predictions (the r31 packet flagged the
shallow skirt read and the gun-slot notch) — the notch is worse than
predicted: it is open sky, not dark. The fix vocabulary is t72b3m's
ladder + pt91m's tone laws; most of the roadmap is material/interior
lanes that never touch the mask.

## Standing checks (§B + §H.4)

- **CONTIGUITY / NO EMPTY AREAS: FAIL (owner law §B2, render-measured)**
  — machine contig 0 ✓ (top-down) but the border-flood enclosed-sky
  scan (bg mask-method, ring-tested, ≥12px, label text excluded) finds
  fully enclosed sky windows in SEVEN proc views where the ref has only
  its sanctioned ≤55px skirt-bottom wheel slots:
  - **V1 turret gun-slot lane**: view-left **304px** @ x932..950
    y270..285, view-right **307px** @ x969..987 y268..285 (≈0.33×0.28 m
    at 59.8 px/m; ref-world ≈ z −0.2..+0.1, y 1.7..2.0 — the slot lane
    between sight tower, roof plates and bustle). Same lane reads as
    sky notches at close-roof (**276px** @ x1114..1162 y278..290 +
    99/82px neighbors) and as the evaluator's **1.676 m²** enclosed
    void @ hero-rearright (x −1.00 y 1.80 z −0.72 — deck-backed from
    that angle: bg census 0/1 in my rect, med 56.5, i.e. the gray
    trench). REF turret band: solid both sides (zero clusters).
  - **V2 right-side under-skirt tunnel**: view-right **1794px** spanning
    x855..1177 y347..381 (world y ≈ 0.12..0.69 across most of the
    wheelbase — sky visible clean through the vehicle between skirt
    bottom lip and wheel tops), continuing at view-frontright
    (**1463px** x954..1187 y350..383). ASYMMETRIC: the left ortho has
    no counterpart (its band is backed) — consistent with the packet's
    wLo 0.94 taper zones.
  - **V3 track-face slat ladders**: dead-front and dead-rear, both
    tracks read as venetian-blind stacks — sky slit rows between shoe
    slats: view-front 418/404px @ x732..805 / x1114..1187 y349..362
    plus ~10 rows each side down y423..496 (94-250px per row);
    view-rear same class (105/105px rows @ y437, 52-56px @ y423..426).
    The §B4 two-layer system's inner chain does not back the wrap faces.
  - **V4 skirt-pod flank columns**: view-front **1212px** @ x1194..1220
    y317..364 and **1202px** @ x699..725 y317..364 (mirrored vertical
    sky columns between the outboard skirt-pod panels and the gray
    outboard rails); close-front 170px @ x811..839 y349..359.
  All four confirmed visually at 3-5x (scratchpad crops; V1 is
  unambiguous background-through-turret). This is the mandatory order
  group (ORDER 0).
- **TRACK CONTAINMENT: PASS** — audit 18/0 vs the ≤60 band; the 18 is
  the interior full-width sliver (x ±0.98 y 0.58..0.66 z 1.94..2.0),
  proxy class, and no view shows tooth-over-plate at 1x. Related read
  (not clip): the guide-horn teeth protrude PROUD of the wrap along the
  entire ground line and both climbs (spike comb at 3x, both side
  views) where the ref's bottom edge is smooth — ordered as 2c.
- **FRONT SLOPES: PASS** — evaluator: front 34 edges matched, worst
  flag Δ-5.3° ±0.4° is a 0.27 m track-band vertical @ x −1.59
  y 0.16..0.43, not the glacis; glacis-lane edges read Δ-1.8° ±0.3° /
  Δ+1.7° ±0.4° (hero-toptilt 1.35/1.28 m upper-front) and the 2.61 m
  close-front near-vertical Δ+1.6° ±0.1°. No flat-front violation.
- **DECORATION / MG PHYSICS: census PASS, read FAIL-in-part** — mg1+2d
  ✓ (Kord as FITTINGS.pintleMG, swung rear-left per print). But at
  close-roof the Kord reads as a 1px ANGLED ROD — no receiver mass, no
  cradle, no pintle post (§C: "receiver MASS not a stick"); at
  view-top it is a hairline. The commander cupola is a FLAT DARK
  ELLIPSE painted on the roof (zero rise — cupola zone sub-45 census
  4403 vs ref 478 in [430..620]×[195..290]+640; med 46.1 vs 52.6) where
  the ref carries a raised drum + hatch ring and BOTH siblings (fresh
  t80/t80b strips) carry proper cupola drums. Roof furniture density a
  class under the ref: view-top turret-roof edge-px 816 vs 1363, engine
  deck 248 vs 511, glacis deck 649 vs 1191. Ordered (group 3), not a
  §B3 absence.
- **VARIANT-DISTINCTIVENESS (§H.4): PASS** — fresh same-rig strips
  (t84/t80/t80b PROC halves, left/front/close-roof): (1) t84's long
  WELDED flat-face turret with the two-block roof cluster (sight tower
  + bustle) vs t80/t80b compact CAST domes with rounded shoulders; (2)
  t84 deep skirt band + rack rail vs the t80s' exposed full wheel row;
  (3) t84's boxy fused-print evac mid-tube vs the t80s' ringed evac;
  (4) t84 bow pods + full-width fender rail; (5) t80 wears "117" /
  t80b "225" turret numbers + t80b cheek appliqués. No re-badge read
  from any of the three angles. Caveat: the t84's roof loadout is
  currently THINNER than both siblings — order 3 restores the
  mark-appropriate Utyos/KT kit that is also the T-84's tell.
- FILL/CIRC: top-down decks filled ✓ (machine 0; view-top clean except
  sanctioned tick combs). Wheels read round in silhouette; the cupola
  reads as a DRAWN ellipse from above (order 3a; merkava 2d class).

## r31 builder-claims audit (§D; on MY fresh pairs)

1. "gate 90.9 PASS ×2 / standard-check PASS / clip 18-0 no real
   contact": ALL CONFIRMED (gate ×2 bit-identical to ledger; audit
   18/0 with the same box; no visual contact).
2. "visual-evaluator clean, yawProxy ≤0.8°": parity CONFIRMED (0.8°
   @close-roof) — but "clean" under-read the §D digest: the evaluator
   itself printed the hero-rearright 1.676 m² enclosed void and the
   proc-only ruler edges (left/right 90° × 6.24/6.23 m UNMATCHED @
   x ±1.78, top view) that became this round's findings V1/top-order.
3. Critic-lane note "skirt band reads shallower than the ref's side
   mass": CONFIRMED and measured (driver B below).
4. Critic-lane note "mantlet gun-slot notch print-faithful,
   deck-backed, may read dark from hero angles": topology confirmed
   (holes-0 top-down; hero canyon deck-backed bg 0/1) — but from BOTH
   side orthos and close-roof the lane is OPEN SKY (V1). The print's
   ref renders SOLID at those pixels; print-faithful does not cover a
   see-through read the ref never shows.
5. Packet law 8 (evac as box, tube r 0.100): the boxy evac is
   gate-certified; from view-top it prints its plan edges (evaluator:
   proc edge front 90° len 0.65 m UNMATCHED @ x 0.20 z 2.42..3.06) —
   carried as certified, softening candidate only within the ±0.20
   plan bins.

## The five measured drivers (all views)

- **A. §B2 VOID FAMILIES (geometry, mandatory)** — V1-V4 above. Worst
  single reads: the 322px-wide right-side tunnel (V2), the
  turret-through sky window at both side orthos (V1), the slat-ladder
  track faces dead-front/rear (V3).
- **B. SIDE-MASS DEPTH + GEAR SHADE (pt91m rubberBotH/material-split
  class)** — the ref side is ONE camo mass to near ground with pale
  streaks reaching the bottom; the proc exposes a wheel row over a
  near-black band. view-left whole lower band [100..400]×[346..386]
  (+640): sub-30 census **2405 vs REF 0**, pale≥95 **1 vs 93**; track
  rows y372..379 med **6.8 vs 55.4** (mean 15.8 vs 61.5); wheel-row p5
  **18.0 vs 51.6**, p95 74.6 vs 92.6. view-right (corrected rects
  x240..540): sub-45 **2092 vs 174**, pale≥95 **0 vs 246**, skirt band
  p75 62.9 vs 76.0 / p95 81.1 vs 94.7. Stern quarters inherit it:
  view-rearleft stern zone [710..840]×[310..390] p5 **3.0 vs REF
  60.9**. Plus the spike comb (2c) and the pale idler bolt-ring
  bullseye at the stern (merkava 1b lesson).
- **C. RAW-GRAY MATERIAL FAMILY (one-slot material fix)** — a set of
  meshes renders flat desaturated gray, no camo, no texture:
  - view-front turret-face LETTERBOX [215..425]×[258..285]+640: proc
    p25=med=p75=**63.1, sd 2.5**, rgb (66,65,56) → g−r **−1** vs REF
    med 66.8 sd 14.4 rgb (64,70,51) g−r **+6** — a dead-flat gray band
    spanning the whole turret face.
  - view-rear COLLAR slab [215..425]×[275..340]+640: p25=med=p75=
    **56.0, sd 5.2**, g−r +1, med −10L vs ref (66.2, sd 12.0, camo).
  - the hero-rearright canyon floor (med 56.5), the close-roof pano
    block, the bow pegs and outboard planks (crop-confirmed) — same
    gray class.
  The ref's same zones are camo-painted cast/welded steel with
  fittings. This is the single most jarring "unfinished" read.
- **D. ROOF FURNITURE DENSITY + MG/CUPOLA READ** — numbers under the
  standing check above; adds: bare rack rail on the right flank
  (close-roof), 1px Kord, flat ellipse cupola, empty camo plains with
  pale CAD bevel highlights (toptilt).
- **E. BOW FURNITURE INTEGRATION** — four RAW-GRAY cylindrical pegs
  dangle in free air under the bow pods (close-front/hero-frontleft at
  1x; 3x crop decisive); under-fender air +1052px vs ref in
  [330..480]×[355..430]+640 (bg 4931 vs 3879); the pods themselves are
  dims-band anchors and must not move (§A) — integration is fill +
  tone INSIDE their columns. The ref hangs one wide attached center
  flap and integrated fender ends.
- (F. GLACIS ERA READ — identity item, visual-structure evidence: the
  ref glacis carries the Kontakt-5 horizontal wedge banding; the proc
  glacis is a bare plane + one framed panel. Texture stats do NOT
  separate it (proc sd 22.1 vs ref 18.7 — camo dominates), so this
  carries as a structure read at 3x, no fabricated numbers; folded
  into group 3.)

## Per-view justifications (bar: ≥9.0 "same vehicle, same tier")

- **view-front 7.9** — registration/slopes/dims excellent (yawProxy
  0.135°, 34 edges matched, worst flag a 0.27 m track vertical). Held
  down by: V3 slat-ladder track faces both sides (+ V4 mirrored sky
  columns at the pod flanks), the C letterbox (sd 2.5 raw band clean
  across the turret), track faces med **31.4 vs 61.7** with p5 0.0 and
  pale≥95 **0 vs 837** (left) / 395 (right) — black slabs vs the ref's
  lit link faces; gray pegs visible at 1x under the pods.
- **view-frontleft 8.2** — same vehicle instantly; skirt rail, bow pod,
  glacis rake all read; smallest void load of the ring (64px @
  x973..992 y330..335 + slivers). Held by B (comb + dark band at
  glancing angle), C (letterbox + collar edges), D (empty deck from
  this height), evaluator flags Δ+17.6° ±0.3° (1.41 m upper-left roof
  edge @ z −1.68..−1.17 y 2.32..2.36 — the bustle/rack roofline) and
  Δ+6.3° ±0.5° (1.18 m fender lip @ z 0.90..1.28).
- **view-left 8.0** — deep-skirt T-84 profile, tube length, sight
  tower all right (yawProxy 0.044°, profile p95 Δtop 0.066 m). Held
  by: V1 sky window THROUGH the turret (304px), B at its worst
  (sub-30 2405 vs 0; track band med 6.8; spike comb full-length), C
  collar band, pale idler bullseye + black stern flap.
- **view-rearleft 8.0** — stern-left p5 3.0 vs 60.9 (black stack +
  comb + flap), collar gray, notch shadow; no large enclosed voids in
  this projection (13px max). Exhaust shelf placement reads (identity
  ✓). Evaluator Δ+8.5° ±0.3° (0.89 m upper @ z 0.33..0.88 y 1.50..1.55
  — engine-deck rail vs ref's raked stern line).
- **view-rear 7.9** — the C collar slab dead-center at its purest
  (uniform 56.0 band, sd 5.2, g−r +1, −10L vs ref camo) + the framed
  flat bustle panel vs the ref's ROUNDED cast bustle; V3 slit rows on
  both rear track faces; rear flap cliff (evaluator profile p95 Δbot
  0.405 m — flap/fender class). Footprint/width/yaw all right
  (yawProxy 0.59°).
- **view-rearright 8.0** — mirror of rearleft; stowage-recess dark
  slab on the right flank (variant tell, reads as recess not box);
  small windows only (20px); same collar/comb/B items. Δ-8.3° ±0.3°
  (0.90 m upper @ z 0.33..0.88).
- **view-right 7.8 — CO-FLOOR** — TWO owner-law void reads in one
  ortho: V2 tunnel (1794px, x855..1177 y347..381 — sky through the
  under-skirt band across the wheelbase) + V1 turret window (307px).
  Plus B (sub-45 2092 vs 174, pale 0 vs 246 — the side mass reads
  half-depth with a hollow black stripe) and C. Identity still clear;
  tier is not.
- **view-frontright 7.9** — V2 continues (1463px) + pod-flank gaps +
  letterbox; otherwise as frontleft (yawProxy 0.126°, Δ-11.3° ±0.7°
  short roof edge flag).
- **view-top 8.4 — BEST VIEW** — footprint/registration near-perfect
  (yawProxy 0.019°, dAreaPct 1.1), camo class matches, track tick
  combs match the ref's own, bustle stowage + Tucha lanes placed. Held
  by: proc-only RULER edges (left/right 90° × 6.24/6.23 m UNMATCHED @
  x ±1.78 — the ref's plan sides are broken by skirt/stowage
  serration), D (edge-px 816 vs 1363 turret / 248 vs 511 deck; sub-55
  15475 vs 6346 — darker-flatter), flat cupola disc + hairline Kord,
  boxy evac plan edges (certified).
- **hero-frontleft 8.1** — stance/proportions/camo integration good;
  bow pod pegs at 1x, V4 gap, comb serration, empty roof plains with
  pale bevel highlights, letterbox edge-on. Δ-4.9° ±0.3° (1.46 m
  front-right glacis-to-fender line) is the largest hero flag.
- **hero-rearright 7.8 — CO-FLOOR** — the turret disintegrates into
  kit boxes: V1 as the gray-floored CANYON (evaluator 1.676 m²; my
  rect med 56.5 vs ref 65.7 — walls+floor all C-gray), bustle box
  riding visible ledges, collar wrap, black gear band + comb + flap,
  bare rack rail. The single worst turret read of the set.
- **hero-toptilt 8.2** — deck layout coherent, skirt rail + pods +
  exhaust shelf read; flat-ellipse cupola + 1px Kord + empty plains
  (D), V1 sky notches small at this angle, pale CAD bevels on every
  plate edge vs the ref's soft cast edges.
- **close-front 7.9** — the C letterbox + RAW mantlet slot with bare
  cylinder root (ref: ringed thermal sleeve + camo mantlet mass +
  cheek ERA wedges), V4 gap at 1x, pegs dangling with sky beneath the
  pods, V3 ladder at the track edge, glacis missing the K-5 banding
  (F). Slopes fine (Δ+1.6° ±0.1° on the 2.61 m vertical; lower-front
  flags Δ-10.2° ±0.7° on a 0.58 m toe edge @ z 1.42..1.57 y 0.13..0.23
  — pod/flap step class).
- **close-roof 8.0** — V1 sky notches through the slot lane (276px+),
  cupola = flat ellipse (sub-45 4403 vs 478), Kord = angled stick
  (MG-physics read fail), pano block raw gray, empty plains, bare rack
  rail; deck tone tables otherwise close (med 50.0 vs 54.7, engine
  plane 41.9 vs 47.5).

## ORDERS (grouped by driver; geometry priced against whole 92.2 /
hull 90.9 — there is ~2.2 pts of hull headroom, far more than merkava's
razor, but every geometry edit re-runs the gate ×2 and invalidates this
verdict per §G)

**ORDER 0 — MANDATORY (§B2 owner law): close all four enclosed-sky
families. Done-gate for the group: border-flood enclosed-sky scan
(mask-method, ring-tested) = ZERO clusters ≥12px inside the vehicle
region in ALL 14 views (label-text excluded); gate PASS ×2; audit ≤60.**
- 0a. V1 turret slot lane: wall the slot's side apertures between
  sight tower / roof plates / bustle (deck-backed interior plates at
  the slot flanks, inboard of the cheek planes; the window columns
  currently paint NOTHING in the side masks where the REF IS SOLID —
  fill is gate-positive-or-neutral in the turret band). Also kills the
  close-roof notches and shrinks the hero canyon to a walled recess.
- 0b. V2 tunnel: back the skirt-bottom-to-wheel-top gap on the RIGHT
  side band (inner drop plates or dark backer INSIDE the existing
  silhouette; the left band is already backed — mirror its mechanism).
  Backers sit inboard (x < 0.94 taper zones) — no clip-band risk.
- 0c. V3 slat ladders: back the wrap faces at bow and stern with the
  inner-chain layer (§B4's second layer IS the backer) or tighten link
  pitch across the wrap arcs; keep inside the wrap AABB (audit ≤60).
- 0d. V4 pod flanks: join outboard pod panels to the fender/track line
  (bracket or side-plate fill inside the pod columns); close-front
  170px window closes with it.

**GROUP 1 — raw-gray material family (driver C; pure material/tone,
zero mask movement):** re-slot the flat-gray meshes (letterbox band,
ring collar, canyon walls/floor, pano block, bow pegs, outboard
planks) to family camo/dark-steel mats.
- 1a. Done-gates: view-front letterbox rect (855..1065, 258..285) sd
  ≥8 AND g−r ≥ +5; view-rear collar rect (855..1065, 275..340) med
  within ±5 of ref 66.2 with sd ≥9; close-roof pano block g−r ≥ +5.
- 1b. Mantlet dressing: sleeve rings/collar mass on the bare tube root
  (interior to turret silhouette) or slot-shadow retone so the front
  band reads mantlet-in-shadow, not billboard (ref: ringed sleeve +
  camo). Pintle-gun silhouette allowance ≤0.4 pts applies if any
  crown content changes (§C) — prefer inside-silhouette.

**GROUP 2 — side-mass depth + gear shade (driver B; pt91m
rubberBotH/material-split vocabulary, tone lane):**
- 2a. Lift the shaded track floor: view-left lower band sub-30 2405 →
  ≤250 (ref 0), track rows y372..379 med ≥35 (ref 55.4); do not touch
  the lit pad tops.
- 2b. Full-depth side mass: extend the camo material split down the
  skirt band so pale camo streaks reach the bottom edge like the ref
  (done-gate: pale≥95 in the lower band ≥60 left / ≥150 right, ref
  93/246; skirt-band p75 within 8L of ref 83.7/76.0).
- 2c. Spike comb: inset/shorten the guide-horn protrusion so the
  ground line and climbs read smooth at 1x (ref permit: none visible);
  audit unchanged (horns live inside the wrap volume).
- 2d. Idler bullseye + stern flap: dark-gear class (keep any ref-true
  pale front-sprocket cover if the print shows one — it does not:
  match the ref's dark occluded wheels).

**GROUP 3 — roof furniture / MG / cupola / ERA (driver D+F; §I KIT
fittings, zero-column, + two small interior geometries):**
- 3a. Cupola drum: raised cylinder + hatch ring under the Kord
  (family vocabulary: t80/t80b drums, my fresh strips) replacing the
  flat ellipse; height inside p95 budget (≤4 side columns above
  published height — mount at the print's 2.53-2.60 cluster knee, the
  score-carried lane, NOT dims-carried).
- 3b. Kord read per MG PHYSICS: receiver mass + cradle + pintle post
  (pale-deck inversion: dark crown-riding mass with ≥2px runs; 1px rod
  currently). Done-gate: 3x close-roof/toptilt crop reads
  gun-with-receiver; side-ortho skyline break preserved.
- 3c. Deck dressing from KIT.fittings: towCable run, spareTrackLinks,
  jerryCans or duffels ON the bare right rack rail, antenna base, KT
  box detail. AABB inside hull (§C/§I). Done-gate: view-top turret
  roof edge-px ≥1100 (ref 1363; now 816), engine deck ≥400 (ref 511;
  now 248); census mg≥1 + dressing ≥6.
- 3d. Glacis K-5 banding: low-relief ERA wedge rows on the glacis
  plane (≤15 mm proud, faces ≥15 mm clear of trace-column boundaries —
  §C AA-bleed law; front pitch 0.0405 m at this box) or a banded
  material split. Done-gate: close-front 3x reads ERA rows; gate ×2
  held.

**GROUP 4 — bow integration (driver E; tone + deck-backed fill inside
existing columns):**
- 4a. Pegs → dark-rubber flap class; join each peg pair with a flap
  plate INSIDE the pod silhouette columns (pods are dims-band anchors —
  outer profiles frozen, §A registration counterweight).
- 4b. Pod-to-fender contact shadow/bracket (with 0d). Done-gate:
  close-front/hero-frontleft 1x: no floating gray sticks; under-pod bg
  census within +300 of ref (now +1052).

## Residuals certified/priced this round (no orders)
- 18-voxel proxy sliver (interior, ≤60 band) — carried.
- Boxy evac + its plan edges (packet law 8, fused-print class) —
  certified; chamfer-within-bins is optional polish only.
- dims heightM 2.24 grace / hullLength 7.00 quantized (−0.9, next bin
  costs −2.6 side) — carried as landed.
- Ruler-straight plan sides at x ±1.78 — partially addressed by 2b/3c
  (material depth + rail stowage variety); full skirt serration is
  gate-priced and NOT ordered this round.
- Rear sprocket-wrap arc-vs-ramp residuals (−0.04 class ×3) and the
  other r31 packet worst-columns — gate-priced, honest, carried.

## Verdict

FAIL — floor 7.8 (view-right, hero-rearright), mean 8.01, ceiling 8.4
(view-top). Order 0 is mandatory §B2 law (four void families, all with
zero-or-positive expected mask impact by construction); groups 1/2 and
most of 3/4 are material/tone/fittings lanes that cannot move the
gate. This build's registration, dims, slopes and variant identity are
already graduate-grade — the gap to 9.0 is finish truth: no sky where
steel should be, no primer-gray where camo should be, a gear band lit
like the ref's, and a roof that carries the T-84's own kit. Clear
order 0 + group 1 + group 2 and the rear/side quarters jump half a
point on their own; land group 3 and this is a genuine 9.0-track
candidate on the next adjudication.
