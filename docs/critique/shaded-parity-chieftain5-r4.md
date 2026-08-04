# chieftain5 shaded-parity r4 — independent critic, FIRST adjudication (2026-08-04)

Gate 91.4 min PASS (h91.4/w91.8/t94.1/st93.2/d100/f100, standard-check
clip 0/0, holes 0, mg1 — re-verified this round on current bytes).
**VERDICT: FAIL — min 5.0, mean 6.4 (standard first-round). Floors:
view-left 5.0, hero-frontleft 5.0.** The geometry is registered and
dims-true; the shaded read is not "same vehicle, same tier" yet. The
builder's own flag ("flank furniture reads slabby in hero 3/4s")
under-states the worst finding: the LEFT side hides the entire
Horstmann running gear behind a ground-reaching guard wall.

Official rigs, fresh this round:
- `node tools/tmp-tank-critic.mjs --id=chieftain5` → shots/critic-chieftain5/
- `node tools/visual-evaluator.mjs --id=chieftain5` → shots/visual-eval-chieftain5/
  (report.json + annotated overlays). RIG PARITY OK: 11 ortho views,
  max dYawProxy 0.7° @front, max |dCentroid| 0.093 m — scoring valid,
  no RIG MISMATCH.
- `node tools/tank-standard-check.mjs --ids=chieftain5` — machine gates all pass.
- `node tools/track-clip-audit.mjs --exact --ids=chieftain5` — front 0 / rear 0.

Headline evaluator fact for the arc-subject vehicle (cast turret + L11):
**0 paired arcs in all 14 views.** The ref presents fitted arcs in 10
views (casting shoulder r 0.246 m span 123.7°; bow/idler wrap r 2.12–2.17 m
span 60–62°; glacis blend r 1.20 m span 74.1°, "reads smooth"); the proc
pairs none of them and contributes only 3 micro-arcs (r ≤ 0.13 m). Every
curve the Chieftain is known for currently reads as straight-edged slab.

## Per-view scores (bar ≥9.0 every view)

| # | view | /10 | justification (rig numbers cited per §D) |
|---|------|-----|------------------------------------------|
| 1 | front | 7.5 | Best silhouette: 37 matched edges (4 flagged), profile p95 Δtop 0.104/Δbot 0.093 m. Loses tier on interior reads: turret face is a slab stack; TAN box pops at rect (925,225)..(995,250) luma 63.1/p95 91 vs adjacent camo 48.1 (yellow-shifted rgb 65,66,45); searchlight glass pale-blue at (820,215)..(880,260) luma 58.9 (b≥r); exposed treaded track faces at bottom corners where ref reads covered flaps. Belly V too flat: proc lower edges 0°/179.5° vs ref 5.6°/174.5° (Δ±5.5° ±0.1–0.2°, len 0.82/0.81 m @ y 0.48, x −0.83..0.74). Ref-only shoulder arc r 0.246 span 123.7° @ (1.49, 2.20, 1.57) unmatched — proc corner square. |
| 2 | frontleft | 5.5 | 13/23 matched edges flagged (worst Δ−11° ±0.6° len 0.61 m @ z 3.08..3.38 y 1.20..1.34 — wing shelf vs ref blend; also Δ−9° ±0.8° len 0.90 m @ z 2.50..2.74 y 1.50..1.60). Δtop p95 0.289 m. Left wall hides all running gear (see O1); ref-only bow-blend arc r 1.064 span 74.1° unmatched. Reads container-van, not Chieftain. |
| 3 | left | 5.0 | FLOOR. Ref shows 6 paired road wheels + idler + 3 return rollers below a wheel-top skirt hem; proc shows a camo wall to the ground (guard planes x −1.65..−1.69 + lip −1.74) with zero wheels visible, a black track sliver under the hem, and the rear wrap exposed as near-black teeth on pale discs. Ref-only idler/bow-wrap arc r 2.174 span 60.1° (ends z 3.61→2.51, y 0.73→−0.08) unmatched — proc bow-bottom straight. Chin-band top runs level 177° vs ref 163° falling (Δ+14° ±0.7°, len 0.44 m @ z 1.47..1.94 y 2.23..2.25) — no needle-nose recline. Identity failure. |
| 4 | rearleft | 5.5 | Wall + the sprocket "C": black horn teeth (luma p5 ≈ 7) wrapping a light-gray disc (p95 ≈ 70) at rect (1010,340)..(1105,420) — glitch read vs ref's smooth mid-tone wheels (p5 26 / p95 76). Basket/NBC pack boxes themselves acceptable. Δtop p95 0.253 m; ref-only rear-wrap arc r 1.289 span 104.6° unmatched. |
| 5 | rear | 7.0 | 36 matched edges; Δ 0.186/0.167 m. Rear plate detail (exhaust run, recessed center, tow plate) reads well. Held back by: two full-height black zipper columns at the track corners (teeth-on-pale-disc, both sides) and a flatter, emptier bustle than the ref's bulged stowage. Belly lines Δ±4.4° @ y 0.23 (len 0.84/0.85 m) — same too-flat V class as front. |
| 6 | rearright | 7.5 | Best 3/4: right gear visible and layered correctly. Ref casting shoulder falls 164.8°/165.1°/159.9° (unmatched refOnly, len 1.16/0.66/0.51 m); proc answers with one straight bin-top line 164.1° len 2.25 m — slab-vs-cast at the turret. Δtop p95 0.243 m. Sprocket teeth contrast again at the corner. |
| 7 | right | 8.0 | Wheels, two-layer track, skirt hem all read per ref. Residuals: gun bottom is ONE straight 179.6° line 4.48 m (z 2.54..7.02) vs ref's broken sleeve/extractor line (2.52 m @ z 1.95..4.47 + 2.17 m @ z 4.83..7.00) — no sleeve step reads; saucer ~0.03 high (known r4 residual); flank above fender slabbier than ref. |
| 8 | frontright | 7.0 | 12/21 flagged (worst Δ+11° ±0.7° len 0.44 m @ z 3.20..3.48 y 1.21..1.35 — wing shelf class). Δtop p95 0.289 m. Gear visible (good); chin/collar boxes + boxy sleeve prism read at this angle; bow corner mostly filled by flap boxes but treaded faces still bare. Ref-only glacis-blend arc r 1.078 span 67.9° unmatched. |
| 9 | top | 6.5 | Plan crown curvature genuinely reads (saucer arc visible) but is fenced by rectangles; ~6–8 red-brown stowage lids pop vs ref's single fender tarp. Gun plan: proc sleeve band edge x −0.34 (z 3.49..4.71) then step to −0.23 (z 5.40..6.99) vs ref's ONE straight x −0.24 line z 3.47..6.42; worst column Δbot −1.279 m (ref z 3.45, proc 4.73 @ x −0.32); profile p95 Δbot 1.185 m is this sleeve band. Glacis reads as rectangle patchwork vs ref's clean plate. |
| 10 | hero-frontleft | 5.0 | FLOOR. The hero the builder flagged. Ref: cast turret over visible bogies, needle nose, sleeved L11. Proc: ground-to-turret slab flank (wall + bins co-planar), no wheels, blue searchlight pane + tan box on the crown, flat chin plane. Ref-only arcs r 1.368 span 109.1° (rear wrap) + r 1.254 span 92° (bow blend) unmatched. Reads a tier below. |
| 11 | hero-rearright | 6.5 | Right side saves it: gear + terraced bins visible. Straight 2.25 m bin-top line vs ref's falling casting shoulders (164.8°/159.9° refOnly); sprocket teeth; two ≤0.007 m² void flags verified as track-region air (not §B2 holes). |
| 12 | hero-toptilt | 6.0 | Rectangle city from tilt: bins wall the crown, brown lids scattered, boxy sleeve step visible in plan-ish read. Ref reads one organic casting on a low hull. No arcs paired (ref has none fitted here either, but the slab tiling is the driver). |
| 13 | close-front | 5.5 | The needle-nose test view. Proc: LEFT bow bay exposes raw track wrap + pale panels in a rectangular cavity (ref front corners read filled — its own r1 packet law); collar is a rectangular box; tan box + blue glass prominent; sleeve/evac underside kinks 154.2° vs ref 168.5° (Δ−14.4° ±0.6°, len 0.71 m @ z 4.60..4.80 y 1.55..1.68). Ref-only glacis arc r 1.199 span 74.1° ("reads smooth") unmatched. Δtop p95 0.421 m. |
| 14 | close-roof | 6.5 | Crown furniture placement is honest (cupola drum/cap, periscopes, vent dome, loader ring all at probed stations); MG censuses but barely reads (stowed aft-left, dark-on-dark, occluded). Tan sight-plate box pops on the crown; chin band reads as a quad staircase; sleeve prism facets visible. Δtop +0.703 m @ z 1.06 (ref y 2.89, proc 3.51) — close-crop back-projection of the mast/whip, treat as crop artifact (ortho views hold masts at ≤2.94 ✓), no order hung on it. |

Mean 6.4; five views at/below 5.5. FAIL.

## Standing checks (§B + §D + §H.4)

- **§B1 front slopes: PASS.** Glacis rakes per the print (front silhouette
  37-matched); note the wing-shelf notch reads as a shading step, and the
  cast belly V measures flat (Δ±5.5° front, ±4.4° rear) — ordered as O4d,
  not a flat-front violation.
- **§B2 contiguity/holes: PASS.** Machine top-down scan 0 enclosed cells.
  Evaluator void flags verified by eye: close-roof 1.590 m² = air between
  tube underside and deck (ref shows the same air); hero-rearright
  0.007/0.003 m² = track-region shadow pockets; sprocket-"C" interior is
  the pale wheel face, not background. No see-through violations found in
  any of the 14 views.
- **§B3 decoration: PASS (census mg1), read WEAK.** The MAG GPMG is
  stowed aft-left per packet; correct dark-crown polarity per MG PHYSICS,
  but it disappears at garage distance in 12/14 views (O5, SHOULD).
  Remaining dressing (bins, dischargers, searchlight, basket, NBC pack,
  antennas) is hand-authored mask geometry — packet-justified, censuses 0d
  by design.
- **§B4 containment: PASS.** Audit 0/0 exact; renders show bow wrap under
  the wing shelves with a clean shadow line and rear wrap clear of the
  tail plates.
- **§D rig discipline:** both official rigs fresh; parity OK (0.7° / 0.093 m);
  all shape claims above carry evaluator numbers; tone claims carry
  ITU-601 luma rects (view-front / view-rearleft pixel rects listed at the
  cited views).
- **§H.4 VARIANT-DISTINCTIVENESS vs built UK family (centurion3 76.0,
  centurion5 75.8 boards): PASS.** At a glance the tells are: (1)
  mantletless collar vs the centurions' tan canvas mantlet box; (2) L11
  length with extractor vs the stubby 20-pdr/L7 (proc chieftain tube
  reaches z 7.02, centurion tubes end well short of the bow); (3) NBC
  pack + full-width rear basket vs the centurions' bare boxy bustle; (4)
  terraced flank-bin band + skirt vs the centurions' exposed upper track
  run; (5) cupola + IR searchlight cheek cluster vs the centurions' bare
  dome + twin whips. Caveat: today one of the strongest "tells" is the
  slab flank wall itself, which is a defect — after O1/O4 land, tells
  1/2/3/5 still hold, so distinctiveness survives the fix.

## Orders — grouped by driver (one fix clears a view family)

Gate-hold binds every order: chieftain5 is the family's first geometric
pass — every edit re-gates ≥90 all components ×2 on final bytes, clip
0/0, holes 0, byte-stable siblings. Any geometry edit invalidates this
verdict (§G) and queues re-adjudication.

**O1 — EXPOSE THE LEFT RUNNING GEAR** (geometry: left guard/skirt
family; clears the 5.0/5.5 floor family: left, frontleft, rearleft,
hero-frontleft). The r2-era left track-guard "inner deep run to the
ground" (x −1.65..−1.69, full mid-length) + outer lip band (x −1.74,
y 0.6..1.6) occlude all six paired wheels; the ref's left hem sits at
the wheel-top line exactly like the proc's own RIGHT side. Cut the deep
run back to the skirt hem (~y 0.60) over the wheel span, exposing
wheels/idler/rollers; where the side-mask BOTTOM rows need the low line,
own them per §C with a material split (dark under-material below the
idler-wrap line) instead of geometry — the sanctioned pattern. Watch the
r1 lesson: fills/cuts must return the gate rows (the certified left-shift
print makes left side rows sensitive; stage with `vertex-workorder`
columns before committing to a shape).

**O2 — TRACK/WHEEL TONE + BOW BAY** (material: track family + one flap
fill; clears the corner-glitch reads in left, rear, rearleft, rearright,
close-front). (a) Guide-horn/pad tone floors at luma p5 ≈ 3–7 against
light-gray wheel discs p95 ≈ 70 (rects cited at views 4/5) — ref keeps
the whole zone in a 26..76 band: lift horns/pads toward dark-olive,
drop the bare disc faces toward the ref's rgb ≈ (47,49,40), and mud the
exposed wrap. (b) Close-front left bow bay (between glacis notch z 3.47
and the left wing): the ref front mask reads filled corners — hang the
fender flap/fill (ukHull g.flapDrop is already opt-in) or a dark web so
the bay reads closed; keep the wing tip band THIN (<12% side band, r4
law #5 — do not re-poison dAlong).

**O3 — OFF-PALETTE FITTINGS** (material: glass/canvas/stowage family;
clears pops in front, close-front, close-roof, both front heroes, top).
(a) TAN sight plate on the crown (x −0.26..−0.125, z −0.59..−0.21, top
2.462): luma 63.1 mean / 91 p95, yellow-shifted — repaint dark
olive/camo (ref crown carries no tan; the tan canvas belongs to the
CENTURIONS' mantlet, so this also protects §H.4 tells). (b) Blue-gray
glass set — searchlight pane (luma 58.9, b≥r), sight-housing chip, deck
light lenses (blue chips at plan z ≈ −2.4 / −4.1 deck edges): darken to
near-black glass per the ref's barely-distinct panes. (c) Red-brown
stowage lids in plan: ref shows ONE brown tarp (right fender); proc
scatters ~6–8 brown rectangles across cheeks/fenders/aft deck — repaint
all but one toward olive-drab so the plan reads casting-on-hull, not
patchwork.

**O4 — CAST-FORM READS** (geometry: turret front + gun sleeve + belly;
clears slab reads in front, close-front, close-roof, frontright, right,
top). All interior-shading work at held silhouette columns. (a)
Needle-nose: the chin top runs level 177° vs ref 163° falling (left
view, len 0.44 m @ z 1.47..1.94) — introduce the falling brow/bevel
breaks so the crown-to-collar line reclines; kill the single flat
reclined quad read with 2–3 shading facets inside the current
silhouette. (b) Collar: rectangular box → round/conical cast collar
(front refOnly shoulder arc r 0.246 span 123.7° @ (1.49, 2.20, 1.57) is
the paired target; the L11 emerges from a casting, not a bracket). (c)
Sleeve: the addGunExtra box band reads square and owns plan width the
ref denies — proc plan edge x −0.34 over z 3.49..4.71 vs ref's straight
x −0.24 line z 3.47..6.42 (worst column Δbot −1.279 m @ x −0.32; top
p95 Δbot 1.185 m); chamfer/octagonalize the band toward a cylinder read
inside the 0.222 side band and pull the plan half-width to the ref
line, and give the side view its sleeve→tube step (proc bottom is one
179.6° line 4.48 m vs ref's broken 2.52 + 2.17 m lines). Mind the
−0.292/−0.3 plan-turret marginal columns (r4 residual) when trimming.
(d) Cast belly V: proc bottom edges read 0° where the ref rises 5.6°
outboard (front, y 0.48) and 4.9° at the rear (y 0.23) — steepen the V
within the authored keel/sponson channels.

**O5 — MG READ (SHOULD, fittings):** one clean read for the stowed MAG
within the ≤0.4-pt pintle allowance — slight raise or yaw so receiver
mass + barrel line read in at least the roof/rear-quarter views; keep
dark crown-riding polarity.

## Honest positives (carry forward)

dims 100 both runs; masts/whip co-located and capped ≤2.94 in ortho;
crown furniture stations match the probe (cupola/periscope/vent/loader
ring); rear plate composition near-ref; right-side running gear layering
correct; §H.4 distinct from both centurions; parity rig clean — the
r4 registration work held under fresh renders.

## Evidence

- shots/critic-chieftain5/ (14 views, fresh)
- shots/visual-eval-chieftain5/ (report.json, digest quoted above;
  annotated overlays per view)
- Tone rects measured on view-front.png / view-rearleft.png /
  close-roof.png as cited per view (ITU-601).
- Machine: standard-check PASS line + track-clip 0/0 (this round).
