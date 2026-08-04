# m47_patton shaded-parity r6 — THIRD ADJUDICATION (2026-08-04, post-9c75117)

Rig: fresh 14 pairs `node tools/tmp-tank-critic.mjs --id=m47_patton` →
shots/critic-m47_patton/ (zero console errors) + `visual-evaluator
--id=m47_patton` (exit 0, **RIG PARITY OK**, max yawProxy 1.331° @front,
|dCentroid| ≤0.047 m, camoSeed 4242, evidence shots/visual-eval-m47_patton/).

BYTE-STABILITY BRACKET (the concurrent-r7-builder hazard, LIVE this round):
m47 geometry hash **f02ef936** (96 meshes / 100 818 verts) BEFORE renders
(14:4x) and AFTER all evidence capture (15:02:25, machine-check chain end) —
patton.js byte-identical to HEAD (9c75117) across the whole window. At
15:08:39 — AFTER my evidence closed — the r7 builder (m46 tone round) landed
working-tree edits on patton.js. Adjudicated SAFE for this verdict: (1) every
m47 render/gate/audit/measurement predates the edit; (2) the diff is
§F.2-conformant — `cfg.wheelMul`/`cfg.gearShade`/`gearTone` opt-in params
whose defaults are m47's own r6 literals ("keeps the m47 r6 literals
byte-identical (frozen f02ef936)" per the diff's own comments; hunks touch
buildPershing/M46_HULL/PATTON_PROFILES.m46 only); (3) re-hash AGAINST the
modified tree still prints **f02ef936**. The brief's stop condition (m47 hash
drift mid-run) never fired. NOTE: the r7 builder re-stamped
shots/critic-m46_patton/ at 15:08; the m46 pairs I adjudicated for §H.4
showed the committed-state r3-class BLACK gear (the brief's stated committed
read — a post-edit olive-gear render would have shown otherwise), so the
§H.4 verdict stands on committed-state evidence.

Official gate re-run on my watch: **90.5 PASS ×2 bit-identical** (hull 90.5 /
whole 91.0 / turret 91.4 / stations 93.6 / dims 100 / floaters 100) —
reproduces the r6 packet line to the decimal. `tank-standard-check`: clip
**0/0 ✓**, contig **0 ✓**, decor **mg1+1d ✓**. `track-clip-audit --exact`:
front 0 / rear 0. `turret-parent-audit`: stranded **0** / abutting 0 /
dangling 0 — the r4 rig_hull/hull-loft false-flag class no longer prints
(audit tool updated per the r4 orchestrator note); clean machine pass, no
adjudication needed. Graduates m60a1 **81e69e34** / m60a3 **efcde5c4**
hash-verified packet-exact (do-not-gate respected). m46 **722c39dc** frozen,
re-rendered read-only for §H.4. Measurements: banked scanners
(tools/tmp-r7-merkava.py + tools/tmp-r6-m47.py) on MY fresh pairs; zoom crops
diagnosis-only (scratchpad, not evidence). All r4/r6 numbers re-derived this
round.

## HEADLINE: FAIL — floor 8.8 (top), mean 8.91, ceiling 9.0 (front/left/right); every r6 order verified delivered ON ITS WINDOW (B1/B2b partials exactly as the packet documents), zero regressions, both packet adjudications (envelope artifact, cover-band line) INDEPENDENTLY CONFIRMED; the r4 N-driver is DEAD — what remains is ONE structural family (the bustle's planar-wall read vs the ref's rounded cast shell) plus the banked-lane albedo field and small texture accents

front 9.0 · frontleft 8.9 · left 9.0 · rearleft 8.9 · rear 8.9 ·
rearright 8.9 · right 9.0 · frontright 8.9 · top 8.8 · hero-fl 8.9 ·
hero-rr 8.9 · toptilt 8.9 · close-front 8.9 · close-roof 8.9

Every view up 0.1-0.4 on r4, no view down. IDENTITY never in doubt (needle
nose, blister pods, long bustle, bow ball, six dished wheels, capsule
deflector, M2 mast). The r4 floor (hero-rr 8.5, held by the gear-as-second-
material family) is now 8.9: gear hue unified, drums camo'd, wedges zero,
far-side band swallowed. Three views sit AT the bar; eleven are 0.1-0.2 out.

## r6 delivery verification (every claim re-measured on MY pairs)

- **N1 hue-unify ✓ EXACT-CLASS**: hero-rr gear window [180..560]×[430..540]
  mean-RGB r/g **1.005** (claim 1.004, bar ≤1.01, r4 1.068; render-noise
  0.001) vs own-hull [300..500]×[220..330] **0.972**, ref gear 0.982 / ref
  hull 0.983. Residual proc gear↔hull split 0.033 (r4 0.10, ref ~0.001) —
  a third of r4, sub-driver. hero-fl [40..400]×[370..520] proc **0.992** vs
  ref 0.984 (claim 0.991/0.988, window-choice delta). A1 class HELD:
  view-left [60..580]×[365..432] sub-30 **0**, p5 54.1 (bar ≥35), med 66.6 /
  p75 70.5 (packet-exact), sd 8.43. A2 HELD: wheel band p75 **70.2**
  (packet-exact, bar ≥66).
- **N2 drum faces ✓**: flat-disc census (sd<3, mean>55, cell 14) sprocket
  window **0/12**, idler **0/15** vs ref 1/12 — no flat single-tone disc
  ≥15 px in any quarter/hero (visual sweep concurs); drum window med 73.8 /
  p75 73.8 (A2 class). NEW WATCH (T2): drum window p95 **93.0 vs ref 78.5**
  — the N5 carrier-face RING reads as a drawn bright circle on the
  sprocket/idler faces at 1× in left/right/quarters; the ref's end wheels
  carry only subdued rim light. Ordered N5 bars all met (below) — this is
  the local tail of a lawful glint, logged as the loudest remaining gear
  accent, not a delivery failure.
- **N3 shadow package ✓ mechanism + BOTH adjudications CONFIRMED**: (a) the
  4.68/3.88 m hero-rr chains reproduce on MY evaluator run **with the
  ref-side twins in the same corridor** — ref 152.1°/5.30 m + 143.7°/5.82 m
  UNMATCHED (and toptilt: proc 133.8°/1.33 m vs ref's own 133.8°/3.04 m) —
  both models carry unmatched contour-ENVELOPE diagonals; the r4 verdict's
  serration attribution was a rig artifact, law-bank discovery (2)
  independently confirmed. (b) Visually on my crops the far-side horn comb
  is swallowed by the run covers — the r4 "pale serrated band floating over
  the deck" is gone. (c) Posts at 1× in frontleft/rearleft: the r4 read
  (dark fence posts against LIT track) is dead — the band behind is now
  dark; residual (T1): the curtain slabs themselves read as 3-4 discrete
  gray verticals with lit gaps at zoom and at the closes.
- **N4 ramp grade ✓ EXACT**: largest sub-25 blob **0 px** in rearleft,
  rearright AND hero-rr gear bands (bar ≤40).
- **N5 glint tail ✓**: hero-rr gear sd **11.05** (bar ≥11, claim 11.09,
  render noise), p95 78.3 ≤ ref+4 (90.4) — no overshoot in the ordered
  window. hero-fl gear p95 in MY window 89.7 vs ref 89.4 (the packet's
  91.3-vs-84.6 watch is window-dependent; tails match in mine).
- **B1 tail rolls — delivered read / metric partial, exactly as documented**:
  the blend rings read at 1× (rear corners graded, no knife edge); the
  flat-wall tangent class persists — my rig: frontright proc-only
  **91.9° len 0.65 m** @ z -1.64..-1.63 y 2.05..2.69 (the packet's frontleft
  twin shortened to 88.4°/0.504). Carried into S2.
- **B2b ✓ at 1× / shell-read residual**: the rear-wall 90° corner verticals
  read ROLLED (chamfer facets at 1×); the "inset picture-frame" is DEAD
  (crop-verified — border faces grade now); tarp panel + sag rolls + three
  straps read proud of the plane. B2 windows: full [175..465]×[313..352]
  med **67.2** (packet-exact; the r4-bar 68 miss is window-EDGE gear pixels
  darkened by ordered N-work — dark cells cluster at x 175-191/431-447),
  sub-45 **23** (r4 22); cavity-only [220..420]×[313..352] med **75.6** vs
  ref 73.8, sub-45 **0** — the delivered B2 mechanism intact. RESIDUAL (the
  round's main finding, order S1): the wall itself remains PLANAR-with-
  bevels vs the ref's continuously-curved cast shell, and the strap battens
  add rectilinear grammar the ref's soft handles don't have.
- **B4 ✓ at 1×**: the pod shelf steps read as a roll at critic pitch; the
  facet transitions surface only at 3× zoom (sub-pixel sagitta at 9.7 mm/px,
  matching the chord-limit claim). The arc-FITTER still counts rear arcs
  ref 2 / proc 0 — corroborates the S1 roundness gap but is fitter-class,
  not a 1× visibility failure. Judged delivered as ordered.
- **B7 ✓**: receiver reads STEPPED (front block / recessed web / rear block
  under the cover) + dappled on my close-roof crops; rod window block-luma
  med **76.8** ytop-med 218 (ref 78.6/215) — packet-exact, bar ≥70; the
  front crown flag moved Δ-6.1° → **Δ-5.4°** (my evaluator, @ (0.354,
  3.252), len 0.30, certified heightM band). ADJUDICATION CONFIRMED: the
  close-roof proc-only **7.2° len 0.91 m** @ z -2.00..-1.13 y 3.20..3.30 is
  the certified cover/pedestal band, NOT the receiver — the receiver top is
  visibly stepped on my renders. Residual: the M2 group still reads as a
  slab-STACK vs the ref's gun-shaped masses (closes; T3-adjacent, mostly
  certified mass).
- **B8 ✓**: the dome shades as ONE cast roll in top/toptilt/close-roof —
  the r4 "flat-paneled dome seams / panel-seam rectangles" holder is DEAD
  in all three views; landed zero-mask (gate bit-identical ×2 on my watch).
- **C3 ✓**: the bow ball carries a real muzzle mass — tapered tube + collar
  + bore tip read at close-front.
- **C5 ✓ at-bar**: front track faces med **60.0 / 59.8** vs ref 65.1 / 62.6
  — Δ5.1 L (left, at the 5L bar edge; my window [95..155]×[430..555] takes
  slightly more edge-shadow than the builder's 64.1-ref read) / Δ2.6 R;
  horizontal plate rhythm reads at 1×. Delivered to bar within window
  sensitivity.
- **C6 ✓ subtle**: X-brace weld beads + scallow-row hints read on the prow
  at close-front — quieter than the ref's casting texture (the ref's
  chevron rings stay louder); the residual is polish-lane, priced into the
  front/close-front scores.
- **C1 hold ✓ machine-zero**: blue-dominant census (b−max(r,g)>8) **0 px**
  in front AND close-front, both halves.
- **B3 (banked lane) re-censused**: top [260..380]×[330..490] sub-50 proc
  **2334** vs ref 1160 (r4: 2024) — +310 from the ORDERED spareTrack/gear
  retone family; same fleet-camo near-black blotch class on lit bare
  plates, still materials-owner lane. Now the top view's primary holder.
- **C4 re-derived EXACT**: hero-rr tip window [100..300]×[330..470]
  mask-method air **28.6% vs ref 27.5%** — byte-stable class, anchor-fenced
  carry.

## Standing checks (§B + §H.4)

- **FRONT SLOPES §B1: PASS** — front view 26 matched edges, ONE flag
  >1.5°: Δ-5.4° @ the certified M2 crown band (B7 class). Glacis rake,
  cheek slopes, dive line inside noise. The m47's T26-family casting is
  ROUND and renders round — needle-nose cone, no slab front (own-class
  judgment per the brief). p95 Δtop 0.138 m / Δbot 0.099 m; quarter p95Top
  0.23-0.28 entries are all `cliff:true` certified corridor-tip carriers
  (M2/whip heightM band), left/right 0.094/0.092 = the r4 class.
- **CONTIGUITY / NO EMPTY AREAS §B2: PASS** — machine top-down scan 0
  enclosed cells ✓; no blue-signature background inside any body region in
  14 views. Evaluator void inventory adjudicated: hero-rr 0.055 m²
  (under-belly, r4 class/coords) + 0.051 m² (fender-overhang toe-undercut,
  r4 class/coords); toptilt **4.673 m²** @ (1.27, 1.44, 0.42) — the r3
  projection-air family re-flagging (barrel/fender-framed REAL air whose 2D
  loop re-closed after the B1/B2b contour edits; rear deck verified solid
  on crops); close-roof **0.403 m²** @ (0.27, 3.36, -1.16) = the MG-PHYSICS
  sky window (must stay open) + 0.039 m² @ (0.32, 1.16, 2.17) barrel-bow
  projection air. No order.
- **DECORATION / MG PHYSICS §B3: PASS** — sky-backed M2 pale top-lit (rod
  med 76.8, crowns ≥2 px), receiver a stepped MASS on a visible truss;
  mg1+1d censused; whip D1 lawful (pale-refund class, aligned with the
  ref's own spike).
- **TRACK CONTAINMENT §B4: PASS** — exact audit 0/0; wraps clear of flaps
  and tail band at 3-4× in all views.
- **TURRET PARENTING §B5: PASS (machine-clean)** — stranded 0 / abutting 0
  / dangling 0; the r4 false-flag class is gone from the tool. Yaw-pair
  sanity holds on the r4 record (no geometry motion since; hash-frozen
  evidence).
- **TRACK RUN §B6: PASS** — ground-run first-content y=400 IDENTICAL both
  halves across x 100..420, run ends match (empty ≥x 440), heights 34-36 px
  vs ref 34-35; both end wheels raised, ramps at both ends: the \\________/
  trapezoid.
- **VARIANT-DISTINCTIVENESS §H.4: PASS, strengthened** — vs m46 fresh
  committed-state pairs: m47 is the dressed later mark (needle-nose
  long-bustle + blister pods vs rounded short-bustle; mast M2 + pyramid
  truss vs low cupola pintle; capsule deflector vs drum brake; whip +
  tarp/roll/duffel + pioneer row + louvre trays vs bare deck; unified olive
  gear vs m46's r3-class black gear — the black gear is m46's OWN pending
  tone debt and was NOT counted against m47, per the brief; note the live
  r7 diff shows m46 adopting m47's gearTone/drum-UV recipes, the family-rig
  law working as designed). No re-badge read vs m60a1/m60a3 (different
  generation entirely; hashes packet-exact).

## THE REMAINING DRIVER (S): the bustle reads fabricated, not cast

With N dead, one structural family holds six views 0.1-0.2 below the bar:
the turret bustle's WALLS. The ref's rear shell is a continuously-curved
casting — every aspect shows graded shading wrapping the corner; the proc
shows PLANAR walls with chamfer bevels and dressing. Measured/observed:
- rear: arcs ref 2 / proc 0 (fitter), procOnly edge count 26 vs refOnly 12
  (busier rectilinear grammar: panel + battens + rails);
- quarters/heros: the flat side wall shades as one tone sheet (ref grades);
  B1-class tangent verticals persist (frontright 91.9°/0.65 m @ z -1.64);
- the S-fix is proven machinery: B4's chord-limited facet rolls + B8's
  smoothLoft normal-averaging — applied to the rear/side walls instead of
  shelf edges and dome.
Everything else remaining is accent-class: T1 curtain segmentation, T2
drum rings, T3 cupola flatness (ref's raised drum + vision blocks vs proc's
low disc — toptilt/close-roof), T4 tarp plainness (big smooth quad + single
T-strap vs the ref's busy rack), plus the BANKED lanes (B3 albedo field —
now the top-view floor holder; B6 twin-drum; C4 sliver; B9 slew).

## Per-view justifications (bar ≥9.0 "same vehicle, same tier", 1×)

- **view-front 9.0 — AT BAR** — every r4 holder addressed or certified:
  wraps in plate rhythm (C5), casting hints (C6), bow muzzle mass (C3),
  zero blue, crown flag Δ-5.4 (certified band), skirt-drop 0.464 m @
  (1.752, 1.644) carried (priced fender class, r4-cited). Remaining reads
  are certified-band mass (M2+boxes width) and texture-hint depth — same
  vehicle, same tier.
- **view-frontleft 8.9** — holders: bustle side wall (S3) at its widest,
  curtain verticals (T1), B1 tangent chain (S2), priced dive/shoulder flags
  (Δ-14.3° len 0.28 @ (-1.25, 1.98) is the carried ±11-14 corner-bias
  family; all other flags certified M2-corridor).
- **view-left 9.0 — AT BAR** — all ordered windows green (A1/A2/rod/D1
  re-verified); horn-comb rhythm + carrier ring (T2) + subtle posts are the
  remaining hair; profile p95 0.094 (r4 class).
- **view-rearleft 8.9** — drum/ramp/hue holders cleared; held by the slab
  bustle quarter read (S1/S3) + posts + ring.
- **view-rear 8.9** — B2 cavity in-class (75.6/73.8, sub-45 0), corners
  rolled, frame dead, pods rolled, tarp reads; held by the planar-wall vs
  rounded-shell read (S1) + batten grammar.
- **view-rearright 8.9** — mirror of rearleft; roof-line Δ+9.0 class
  carried priced; '123' fine.
- **view-right 9.0 — AT BAR** — as left mirrored; capsule deflector clean
  (B6 banked); Δ+11.9 dive mirror priced.
- **view-frontright 8.9** — as frontleft mirrored (Δ+10.9 bustle-floor
  carried; the B1 twin lives here on my rig).
- **view-top 8.8 — THE FLOOR** — dome seams dead (B8), rack pit filled,
  D2/periscopes/pioneer row read; held by the B3 albedo field (census 2334
  vs 1160 — banked materials lane, but the view reads what it reads: the
  near-black blotch mass sits on proc's bare plates), plate-furniture
  density still sparser than ref, notched-rail vs continuous-lip plan edges
  (certified fender-bump trade: evaluator refOnly ±1.75 6.24 m lines vs
  procOnly ±1.68 1.47 m rails).
- **hero-frontleft 8.9** — N dead at the angle that used to shout it; dome
  cast; held by bustle slab + posts pair + B1 tangent + flap-slot slivers
  (C4 family).
- **hero-rearright 8.9 — the r4 floor, +0.4** — hue 1.005, drums camo'd,
  wedge 0, far-side band swallowed, serration chains adjudicated artifact
  (ref twins verified), C4 28.6/27.5 banked; held by slab bustle + posts +
  ring accents + residual 0.033 gear↔hull split.
- **hero-toptilt 8.9** — dome cast roll, plan grammar strong, louvre banks
  read; held by cupola flatness (T3), tarp T-strap plainness (T4), albedo
  blotches (banked), sparse fields.
- **close-front 8.9** — C3/C5/C6 delivered and visible; held by B6
  capsule-vs-twin-drum (banked, loudest here), M2 slew Δ+21.1 + wide T-bar
  (certified band, B9 skipped as priced-optional), casting-texture depth,
  simpler light clusters.
- **close-roof 8.9** — receiver stepped + dappled (B7), dome cast (B8),
  cover-band line certified (verified), MG sky window lawful; held by the
  M2 slab-stack grammar, cupola flatness, rack-edge blotches (banked).

## Builder-claims audit (§D; r6 packet vs MY rig)

Every load-bearing packet number reproduced: N1 quadruple (1.005/0.992 vs
claims 1.004/0.991 — render/window noise), A1 (med 66.6 p75 70.5 exact),
A2 70.2 exact, N4 zeros exact, N5 (11.05 vs 11.09, p95 78.3 vs 78.2), B2
full-med 67.2 exact + cavity 75.6/sub-45-0 exact, rod 76.8/218 exact, C1
zeros, crown flag -5.4 exact, cover-band 0.91 m line exact, gate line ×2 to
the decimal, all four hashes, C4 28.6/27.5 exact. Both flagged-for-critic
adjudications (envelope artifact, cover/pedestal band) VERIFIED indepen-
dently — the ref-side unmatched twins and the stepped receiver are on my
own renders. The packet's honest-residuals section is accurate (B2 window
edge, B1 tangent, B4 fitter, hero-fl p95 watch). DISCIPLINE NOTES (minor,
no flag): (1) N3's "posts done-gate MET" is fair at 1× frontleft/rearleft
— the lit-track contrast is gone — but the curtain slabs read as discrete
verticals at the closes and at zoom; logged as T1 residual, the claim's
view/scale qualifier held. (2) C5's ref-med baseline (64.1/62.8) differs
from mine (65.1/62.6) by window choice; bar met on both readings. No
hidden regression found anywhere; commit headline matches the record.

## ORDERS (r8, m47 lane; grouped by driver. Razor: hull 90.5 (0.5), whole
91.0, turret 91.4 (1.4), stations 93.6. Gate ×2 after ANY mask-touching
edit; B4/B8 machinery is the proven lane for all of Group S)

**GROUP S — cast-shell finish (the floor-mover for 6 views; turret lane,
priced 1.4):**
- S1. ROLL the bustle rear WALL: extend the B2b corner treatment across
  the face — 4-6 chord-limited facets (B4 recipe) or smoothLoft normal
  grading (B8 recipe) between the chamfer rings, tail-face z / tailLip
  anchors untouched. Done-gate: rear-view wall shading reads a continuous
  gradient (no flat plateau ≥0.6 m at 1×); evaluator rear procOnly 26 →
  ≤18; rear arcs proc ≥1 OR crop-proof of graded corner wrap.
- S2. (rides S1) Kill the B1-class tangent verticals: no proc-only ≥0.4 m
  88-93° edge in the z -1.55..-1.70 band on frontleft OR frontright
  (currently 91.9°/0.65 m frontright, 88.4°/0.50 frontleft).
- S3. Side-wall cast grading: smoothLoft normal-averaging on the bustle
  side walls (zero-mask by construction if vertices hold) so the flat
  sheet shades graded at left/frontleft/heros; A/B crop pair as done-gate.
- S4 (with S1, tone): mute the tarp strap battens one step toward cloth
  (the ref's rear face carries soft handles, not pale rails).

**GROUP T — texture accents (tone lane, zero mask):**
- T1. Curtain continuity: join/extend the under-fender curtain panels (or
  drop the inter-panel gaps one tone step) so the band reads CONTINUOUS at
  1× in frontleft/rearleft and at the closes — no 3-4 discrete gray
  verticals with lit gaps. Done-gate: column-luma profile over the band
  shows no >12L lit gap between curtain columns; 1× crops.
- T2. Carrier-ring mute: halve the end-drum ring contrast or camo-
  interrupt the circles — drum window [55..110]×[355..410] p95 93.0 →
  ≤ ref+6 (≈84.5); keep N5's ordered sd ≥11 via the (in-class) wheel-rim
  and horn glints.
- T3 (optional, abort-priced): cupola drum read — raise the visible side
  wall/vision-block step INSIDE the certified roof band (heightM p95
  budget §A holds, dims 100 ×2 mandatory; abort on any stations wobble —
  the B7 hump lesson applies verbatim).
- T4 (optional): tarp texture — split the single T-strap into 2-3 thinner
  straps + edge sag so the toptilt rack read stops being one smooth quad.

**BANKED / NO ORDER:** B3 albedo field (materials-owner lane — census now
2334 and the TOP-VIEW FLOOR HOLDER; escalate priority in that lane); B6
twin-drum deflector (anchor-fenced); C4 sliver (anchor-fenced, re-derived
exact); B9 M2 slew (certified-band optional, priced); notched rails /
fender-bump trade (certified stations carrier); dive-seam Δ±11-14 corner
family (priced carriers); M2 certified band + cover line (dims carriers);
void inventory (projection/MG-window/under-belly/overhang classes,
adjudicated); residual gear↔hull r/g split 0.033 (watch — inside the
ordered bar); hero-fl bright-rim p95 (window-dependent watch).

## Verdict

FAIL — floor 8.8 (top), mean 8.91, ceiling 9.0 with THREE views at the bar
(front, left, right) — and no machine gate broken anywhere: 90.5 ×2
bit-identical on my watch, clip 0/0, contig 0, parenting 0/0/0, trapezoid
exact, slopes clean, §H.4 strengthened, hashes byte-stable through a LIVE
concurrent-builder window (the §F.2 opt-in-default law held under fire —
f02ef936 before, after, and against the modified tree). Every r6 order
verified on its window; both packet adjudications confirmed independently;
the r4 headline driver (gear as a second material family) is measured dead.
What separates m47 from the patton family's first graduation is now ONE
well-understood structural family — the bustle's planar-wall read vs the
ref's rounded casting (S1-S3, all on proven B4/B8 machinery inside a 1.4-pt
turret razor) — plus the banked albedo field that holds the top view and a
handful of tone-lane accents (T1/T2). Clear Group S and the six 8.9
quarters/heros/rear go to the bar; T1/T2 are the same-round polish; the top
view needs its materials-lane fix to move. This is a one-round gap for the
builder and a scheduling call for the albedo lane — the geometry is
graduation-grade and byte-frozen; the last 0.1 is cast truth and paint.
