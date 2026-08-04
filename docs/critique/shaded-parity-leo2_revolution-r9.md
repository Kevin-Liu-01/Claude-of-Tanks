# leo2_revolution shaded-parity r9 — ROUND-2 ADJUDICATION (2026-08-04)

Rig: fresh 14 pairs `node tools/tmp-tank-critic.mjs --id=leo2_revolution` →
shots/critic-leo2_revolution/ (this session, zero console errors, favicon
404 only). Byte-discipline: `tmp-hashgeo.mjs` leo2_revolution =
**f6a1d3c0** (58 meshes / 111368 verts — exactly the r9 landing hash from
eb47120) verified BEFORE rendering and re-verified AFTER all evidence runs
(bookend clean; leopard.js working tree clean at eb47120 throughout — the
concurrent r10 builder never touched the file on my watch, no STOP
condition). Graduates frozen on my watch both bookends: leo2a5
**50c34724**, leo2a6 **80b76338**, kf51 **77020c58**.
Official gate re-run by me: **min 90.7 PASS ×2 BIT-IDENTICAL** (hull 91.5 /
whole 90.7 / turret 91.8 / stations 90.8 / dims 99.5 / floaters 100 —
cmp-clean between runs; exactly the r9 landing line).
`visual-evaluator.mjs`: exit 0, **RIG PARITY OK** (max yawProxy 0.852°
@front, 0.847° @close-front; no skew flip, no axis break), evidence at
shots/visual-eval-leo2_revolution/ (my run, 22:28Z). Measurements:
tools/tmp-rev-critic-r9-measure.py (§D refined mask: maxch ≤13 AND
B−R ≥ +8, the banked r7 law) + tmp-rev-critic-crop.py (crops
DIAGNOSIS-ONLY) + tmp-rev-critic-strips.py (§H.4).

TONE-DRIFT CHECK (the fleet-camo caution): my fresh renders are
**pixel-identical** (maxdiff 0 on left/rear/top) to the builder's archived
shots/leopard-r9/ set — no materials-agent constant landed between eb47120
and my run; my renders are the shipping truth AND the builder's evidence,
byte-for-byte. No tone caveat applies this round.

PIPELINE: no lock incidents — /tmp/cot-shots.lock free at start, FIFO
tickets acquired and released normally on every browser run.

## HEADLINE: FAIL — floor 7.7 (close-front), ceiling 8.2 (toptilt), mean ≈7.9; no view at the 9.0 bar, every view up from r7 (floor +1.1, mean +1.0). All six r9 drivers verified delivered in my windows — the projection band (~7.8-8.2) landed exactly. What remains is one refinement tier: visibility polish on four delivered mechanisms (RWS barrel, MAG, deck cables, fan screen-read), ONE mis-positioned delivery (the D2 cable-X is occluded behind its own D1 lattice — invisible dead-rear), the carried E3 air slot, and the geometry-parked classes (bow strata, cheek verticality, wheel row) that cap the close/hero views until the §B4 round and/or an owner pricing call. Round 2 of the projected 3-4.

front 7.9 · frontleft 7.9 · left 8.1 · rearleft 8.0 · rear 7.8 ·
rearright 8.0 · right 8.1 · frontright 7.9 · top 8.0 · hero-fl 7.8 ·
hero-rr 7.8 · toptilt 8.2 · close-front 7.7 · close-roof 8.0

## Claims audit (§D — every r9 packet done-gate re-derived on MY rig)

- Gate 90.7 ×2 bit-identical, components to the decimal: **CONFIRMED**.
- Hash c5d9e131 → f6a1d3c0 (58/111368): **CONFIRMED** both bookends.
- Evaluator parity ≤0.9°, no RIG MISMATCH: **CONFIRMED** (verdict OK).
- **D3 flood TO THE DIGIT** (refined mask, PROC halves): front 92 (=label
  glyphs only), rear 101 (label+9px hairline y248..255 x94..95), rearleft
  92, rearright 92, frontleft 92, frontright 92, left 119 (label+27),
  right 125 (label+33), top 122 (label+30), toptilt 94 (label+2) — every
  view ≤ label-noise+33, both r7 mandatory channels (x ±1.55..1.64) and
  the 137px quarter pocket CLOSED. REF's own halves for scale: front 3320,
  top 4752, toptilt 1417, left 797, right 529. The proc decks are cleaner
  than the print's.
- **B1 band strip** view-left proc [120:500]×[372:392]: med 56.0 **p5
  51.4** sd 4.77 (gate p5 ≥40, med 48..58; ref gear zone med 53.0 p5
  51.1) — CONFIRMED to the digit; right band [140:520]: med 51.1 p5 44.1
  — both sides inside the gates. The r7 merkava-signature 6.8 black void
  is gone; towers/boards/wraps read olive at 1×.
- **F1 jacket** proc [120:500]×[305:355]: med **68.0** vs ref same-rect
  67.4 (Δ+0.6; r7 was +8.3 hot) — CONFIRMED.
- **D1 tail panel** view-rear proc [190:447]×[338:372]: med **77.3** p95
  89.6 **sd 12.50** vs ref slat band [230:430]×[255:305] med 78.6 p95
  95.6 sd 13.65 (gate 70..85 / ≥10) — CONFIRMED to the digit; at 3× the
  panel reads pale slats + dark through-slots + frame + camo bleed.
- **D2 wall rowmean-sd 5.59**: NOT reproduced — the r7 window doesn't
  transfer to my frames (framing shifted with the new furniture; my
  same-rect pairs read proc 3.16 vs ref 2.69 at [150:500]×[390:480] —
  local relief parity). Adjudicated on the render instead: see the D2
  finding below.
- standard-check: gateMin 90.7 | **clip 98/429 — the documented §B4 carry
  TO THE DIGIT** | contig 0 ✓ | decor **mg1+4d** ✓: CONFIRMED (exit-1 is
  solely the documented clip carry, as at r7/r9 landing).
- §B5 stranded 3 / abutting 0 / dangling 0: CONFIRMED, and all three
  boxes match the packet's adjudicated false positives exactly — driver
  periscopes (−0.68..−0.29 × 2.00..2.03 × 1.72..1.85, overlap 100%),
  merged hull (±1.42, 50%), merged hullDark whole-bucket (±2.00, 30%, the
  E2 deck-seam class). PASS.
- plan_turret cam +1.61 flicker: not observed in my two gate runs (both
  in the same state, bit-identical) — the packet's documented ref-side
  bistability class, carried.

## §B standing checks

- **§B2**: PASS — see the flood digits above. The left/right/top
  residual blobs are 1-2px-wide seam hairlines (e.g. left 8px y290..293,
  top 18px y190..207 x231), sub-visible at 1×; the r9 packet's "every
  view ≤ label+33" holds exactly.
- **§B4 carry (visibility judgment only, per the packet)**: the
  tucked-wrap dip class is still visible but subtle — dark ledge/step
  under the rear corners at quarter views, front −1.01 column bottoms
  (evaluator front Δbot −0.703 @x 1.55 / rear +0.708 @x 1.59 — identical
  mechanism and digits to r7). Priced to the queued §B4 round, not here.
- **§B5**: PASS (adjudicated false-positive class, boxes verified above).
- **§B6**: PASS — \\________/ reads both sides; both end wheels raised,
  kit ramps visible at both ends (geometry untouched this round: B1 was
  material-only, clip digits unchanged confirm).
- **§B3**: census mg1+4d machine-PASS. Visual weapon-read: the RWS
  station (A2) now carries it — tub walls + head box + OPTIC GLASS (the
  strongest new read, unmistakable blue panel at 2×) + pedestal parse in
  front and toptilt/close-roof; the front-face barrel relief is FAINT
  (bounded by the ordered all-inside-AABB constraint — as-ordered, cited
  for refinement). The stowed MAG stays marginal as a weapon at 2×
  (pale cap + co-rod present on the wing top, sub-pixel from the side,
  faint in plan) — the §C pintle allowance is still unspent.
- **§B1 slopes**: gate-certified 90.7; the four measured flats are the
  E1 ledger-parked classes, re-confirmed by my evaluator digest
  (frontleft worst Δ+13.3°, hero-fl Δ+15°, top Δ+10.5°, rearleft
  Δ−10.7°) — E1 seam engravings landed and DO suggest the rake at close
  range (visible on the beak at close-front) but thin out at 1×.

## §H.4 VARIANT VARIETY (three graduates, fresh strips
shots/critic-leo2_revolution/crops/h4r9-rev-vs-{a6,kf51,a5}.png)

- vs **leo2a6 (80b76338)**: PASS — a6: seven-wheel row + scalloped
  skirts, proud blister, L/55 mid-step, louvre grille + clusters + V
  splash board rear; rev: closed jacket cliffs, slab bow, lattice tail.
- vs **leo2a5 (50c34724)**: PASS — a5: scalloped skirts + wheels, raked
  turret face with mantlet dead-front, slatted bustle rack + wall
  cable-X + markings rear; rev: full-height AMAP courses, corner posts,
  pale lattice grille tail, RWS tub deck.
- vs **kf51 (77020c58)**: PASS — different silhouette family (hex-arch
  skirts, chevroned glacis, muzzle brake, SEOSS tower, black ERA pads).
- The r7 adverse note is answered: distinctiveness survived the finish
  tier — the tells are geometric (jacket, posts, tub, lattice band) and
  all held. No re-badge read anywhere.

## Per-view justifications (bar ≥9.0)

- **front 7.9** (was 6.7): A1 dark muzzle circle + collar READ at 2×
  (dark disc ~17px, verified 4×); A2 tub + optic glass + head parse; B1
  corner towers olive/textured; D3 slit closed; boards camo. Held by:
  boxy vertical cheeks (parked geometry), lattice wings still partial
  (segmented solid masses, no front-facing grid — packet-cited), RWS
  barrel faint, bow strata at 1×.
- **frontleft 7.9** (6.9): band + ramps + camo parity strong; deck
  furniture reads. Held by: bow strata + blunt jacket nose (Δ+13.3°
  evaluator), one-plane flank (E2 seams only read close), plan-edge
  serration visible at the tabs.
- **left 8.1** (7.2): outline honest; band gates hit (51.4/56.0);
  jacket Δ+0.6; corridor closed; collar on tube; course seams. Held by:
  wheel-row absence (one hub disc vs ref's seven pale rims — the
  strongest side foreignness; §B4-queued window), dead-straight hem
  (priced), no evacuator (priced), low-key pod roofline.
- **rearleft 8.0** (7.0): tail lattice reads from the quarter; corridor
  closed; posts/undercut/rails right. Held by: §B4 dip ledge, invisible
  wall X (below), panel regularity.
- **rear 7.8** (6.6): D1 lattice window + texture parity (77.3/12.50 vs
  78.6/13.65); wall tone matched; D3 channel closed (9px hairline
  remains); clusters + shackles present (subtle at 1×). Held by: **the
  D2 cable-X is INVISIBLE** — both towCable runs sit at z −3.836..−3.842
  with the slat faces at −3.877 in the SAME y-band (1.19..1.66): the
  lattice occludes them dead-rear (6× hunt over the slit rows: nothing).
  The ref's most prominent wall feature (the crossed cables with
  shackles, LOWER wall) still has no visible proc counterpart; plain
  flap slabs.
- **rearright 8.0** (6.9): as rearleft; the old 137px pocket closed;
  the panel edge-on now reads lattice, not floating grey wing.
- **right 8.1** (7.2): mirror of left; band 44.1/51.1 inside gates;
  fore-roof Δ−7° class carried.
- **frontright 7.9** (6.9): mirror of frontleft (Δ+11.8° flagged edge).
- **top 8.0** (6.7): TWIN FANS read as two circles at 1× (rim + blades
  + hub, well recess) — the deck signature is back at the documented
  r 0.36 bound (~65% of the ref arches, priced in the packet); C2
  draped run + tail runs present but FAINT (2px camo-on-camo); intake
  housings dress part of the tab serration; fill 122 vs ref 4752.
  Held by: fan size/style delta (spoked wheel vs the ref's chorded
  slat-screen arch), cable subtlety, plan toe flat (parked), remaining
  serrated tab runs.
- **hero-frontleft 7.8** (6.8): de-CAD plate quilt + tub + seams break
  the r7 "barge" read; identity solid. Held by: one-plane flank + bow
  strata at hero magnification (worst Δ+15°), fan absence from this
  angle is fine (rear deck hidden).
- **hero-rearright 7.8** (6.7): panel lattice + deck fan + clusters +
  jacket camo carry it. Held by: the under-wing air slot REMAINS —
  evaluator 0.741 m² @(−2.34, 1.98, −1.02) vs r7 0.767 (E3 was NOT in
  the r9 delivery list; order stands), gun/wing air window, largest
  flats still planar.
- **hero-toptilt 8.2** (7.2): fans + tub + clusters + plate tints; fill
  94 = label+2 (ref's own 1417); smoke clusters read as launchers.
  Held by: camo blobs finer than ref's broad flow, seam grid slightly
  CAD-regular, fan style. (The evaluator's 3.528 m² is the ref-matched
  tilt-projection air class; its new 0.311 m² @(−0.87, −0.74, −3.57) is
  under-belly §B4-zone air, not a deck hole — flood 94 confirms.)
- **close-front 7.7 — FLOOR** (6.6): A1 collar + muzzle at frame edge;
  E1 rake seams VISIBLE on the beak faces and do suggest the missing
  lines; boards camo; band textured; periscopes glazed. Held by: the
  ledge-stack bow vs the ref's single dominant wedge — at maximum
  magnification the strata still dominate (geometry pinned by the
  dAlong law; only shading can chase further), clamp jaw still reads
  pale-plank, RWS barrel faint.
- **close-roof 8.0** (6.8): plate-quilt + tint breaks (the wing cover
  is no longer one grey rectangle), tub + optic + head parse, hatch
  rings round, pods clean. Held by: MAG not weapon-legible at 2×
  (faint pale hardware), print-grain gap vs the ref cast texture
  narrowed but present, fore-quarter launcher absent (F3 declined —
  priced, fine).

## ROUND-2 ORDERS (for the next build round; grouped by driver.
Constraints unchanged: dims 99.5 headroom thin, whole 90.7 binder,
NO tube/length changes, §B4 lane untouched, zero-mask mechanisms
preferred; every geometry item re-runs gate ×2 + flood + stations)

**DRIVER A — weapon-read completion:**
- A2b. RWS BARREL LEGIBILITY (inside the pod AABB, front-face relief
  only): darken/thicken the barrel relief + muzzle ring on the head
  front face and add the elevation-arm shadow line over the wall top.
  Done-gate: view-front at 2× parses a barrel line at the head; dims
  99.5 and stations 90.8 untouched (cap blades stay byte-identical).
- A3b. MAG WEAPON-READ — SPEND THE PINTLE ALLOWANCE (≤0.4 gate pts,
  still unspent): lift receiver cap + co-rod +0.05..0.07 on the ~3 side
  columns where the ref wing band reads 1.991-2.001 (r7 option A;
  verify turret_side ≥91), or double the pale top-facing footprint if
  the lift prices badly. Done-gate: close-roof 2× weapon read; census
  mg1+ held.

**DRIVER C — deck read polish (tone-only):**
- C1b. FAN SCREEN READ: inside the existing wells, add the slat-screen
  texture (2-3 horizontal screen lines at recess level) + hinge-plate
  contrast so the circles read as the leopard chorded arches, not
  wagon wheels. Zero new columns; gate ×2 held trivially.
- C2b. CABLE VISIBILITY: retint the draped run + tail runs dark
  (two-point measure against the deck camo first — the ref cables read
  dark-on-pale; current runs are camo-on-camo ~2px) and, if tone
  stalls, add one more draped run INSIDE the certified riser window
  (z 0.04..−0.61 only, per the banked deck-cable law). Done-gate:
  view-top at 1× shows dark cable lines.

**DRIVER D — rear identity completion (the round's one mis-position):**
- D2b. MAKE THE CABLE-X VISIBLE (MANDATORY): the delivered X is
  occluded behind the D1 lattice (same y-band, cable fronts −3.856 vs
  slat faces −3.877). EITHER re-position both towCable runs to the
  open wall BELOW the lattice band (y ≈ 0.75..1.15, the zone the ref's
  own X occupies; z ≥ −3.8585 held) OR bring them 25 mm proud to
  z −3.879 (still 6 mm inside the rails' −3.885 plane — verify no
  hullLengthM movement, the r9 eyes:false law stays). Done-gate:
  view-rear at 1× shows the X crossing; flood ≤ label-noise held;
  dims 99.5 held ×2.
- D1b. LATTICE-WING FRONT READ (packet-cited carry): front-facing pale
  grid bars on the corner pocket cards, INSIDE each segment's w-window
  (segment-gap law — no gap-crossing bars). Done-gate: view-front 2×
  shows grid texture at both bustle corners.
- E3. UNDER-WING INTERIOR FILL (carried from r7, not delivered in r9):
  interior faces only under the right wing overhang (a5 order-3c
  class). Done-gate: evaluator hero-rr enclosed-void ≤ ~0.3 m² (toward
  the ref's 0.091 + legitimate gun air); silhouettes byte-held.

**DRIVER F — finish polish:**
- F2b. SEAM ORGANICS: vary deck seam spacing/lengths (the current grid
  reads CAD-regular vs the ref's panel flow) + 1-2 further tint plates
  on the last big flats (fore-roof, mid-deck). No window inversion
  (overshoot law); jacket window stays 67.4 ±2.
- E1b. One more engraved seam course on the bow-shelf verticals (the
  Δ+13° columns) so the rake suggestion survives at 1× — shading only,
  zero gate movement.

**NOT ORDERS (lanes owned elsewhere / priced):** wheel-row window +
dip ledge + clip 98/429 (§B4 queued round; a material-only pale-hub-dot
candidate is flagged for that round, two-point-measure first), plan
toe / bow strata / cheek verticality / hem (ledger-parked geometry —
shading treated this round and next; a 9.0-every-view close may need
either the §B4 landing plus an owner pricing call on the parked
classes, or ledger movement inside gate headroom), muzzle cover 0.56 /
st11-12 / st5-pod pair / st8-9 flicker (gate-priced, stable), fan
r 0.36 bound (deck-carry certified), F3 launcher (declined, priced).

## Residuals certified this round (no new orders)
- §B4 carry digits identical to r7 (clip 98/429; front Δbot −0.703
  @x 1.55) — queued round owns.
- rear 9px flood hairline (y248..255 proc-half x94..95) — sub-visible.
- hero-toptilt 3.528 m² ref-matched projection air + 0.311 m²
  under-belly tilt air (§B4 zone); top 0.002 m² front-left seam sliver.
- Whip-stub blockiness (thin-feature bistability convention).
- plan_turret ref-side flicker class (not observed in my ×2).

## Verdict

FAIL — floor 7.7 (close-front), ceiling 8.2 (toptilt), mean ≈7.9,
+1.0 over r7 across the board: the r9 build round delivered exactly
what it claimed (every done-gate reproduced on my rig, several to the
digit — a clean claims audit), and the r7 projection band for round 1
(~7.8-8.2) landed on the floor views as projected. The remaining gap
to 9.0-every-view is: four visibility refinements on delivered
mechanisms (RWS barrel, MAG, cables, fan screens), one mis-positioned
delivery to fix (the occluded cable-X — the only r9 item whose visible
half failed), the carried E3 fill, seam organics — plus the two lanes
this round cannot touch (§B4 wheel-row/dip round; the geometry-parked
bow/cheek classes). With the order book above landed, the floor should
reach ~8.5-8.8; the last half-point to 9.0 depends on the §B4 round
and/or an owner pricing ruling on the parked classes. Round 2 of the
projected 3-4 — on schedule.
