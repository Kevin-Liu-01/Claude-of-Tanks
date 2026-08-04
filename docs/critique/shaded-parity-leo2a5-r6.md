# leo2a5 shaded-parity r6 — SECOND ADJUDICATION (2026-08-04)

Rig: fresh 14 pairs `node tools/tmp-tank-critic.mjs --id=leo2a5` →
shots/critic-leo2a5/ (zero console errors). Byte-discipline:
`tmp-hashgeo.mjs` leo2a5 = **8066a678** (the r6 landing hash, 60 meshes /
125796 verts) — verified before scoring and re-verified after all renders.
Graduates frozen on my watch: leo2a6 **80b76338**, kf51 **77020c58**
(checked after renders; a6 strips reuse shots/critic-leo2a6 taken fresh at
the same frozen hash). Official gate re-run by me: **min 90.8 PASS ×2
bit-identical** (hull 90.8 / whole 91.2 / turret 91.5 / stations 94.3 /
dims 100 / floaters 100). `track-clip-audit --exact`: **front 0 / rear 0**.
`tank-standard-check`: gate ✓ clip ✓ contig 0 ✓ decor mg0+0d ✗ (standing
§I packet carry — hand-authored MGs predate KIT.fittings; visual read
adjudicated below). `visual-evaluator.mjs --id=leo2a5`: exit 0, **RIG
PARITY OK** (max yawProxy 1.5° @close-front, |dCentroid| 0.065 m, no skew
flip), evidence at shots/visual-eval-leo2a5/. Measurements: the r5 window
set re-derived on MY fresh pairs (tools/tmp-critic-a5r5-measure.py,
verified content, ITU-601 + mask-method maxch ≤13) + r6 additions
(tools/tmp-a5r6crit-extra.py); zoom crops diagnosis-only
(tools/tmp-a5r6crit-crop.py → shots/critic-leo2a5/crops-r6critic/). The
prior critic instance's tmp-c5r6crit-* scratch targets chieftain5 — not
reused.

## HEADLINE: FAIL — floor 8.4 (hero-rearright, close-front), mean ≈8.55, no view at the 9.0 bar; NO mandatory machine-gate order (gate ×2 clean, containment 0/0, contig 0, §B2 toptilt void cleared as ref-matched air)

front 8.6 · frontleft 8.5 · left 8.6 · rearleft 8.5 · rear 8.6 ·
rearright 8.5 · right 8.6 · frontright 8.5 · top 8.6 · hero-fl 8.6 ·
hero-rr 8.4 · toptilt 8.6 · close-front 8.4 · close-roof 8.7

The ladder moved exactly as the r5 verdict projected: floor 7.7 → 8.4,
mean 8.0 → ≈8.55, and the r5 floor view (rear, 7.7) is now among the
best (8.6). All three r5 drivers were genuinely delivered — every
done-gate number the builder claimed reproduces on my own windows within
noise. Builder self-read (~8.4-8.6) is honest this round; I land ON it.
What separates the build from 9.0 is no longer grammar: it is the
finishing tier — clean-CAD kit against a weathered print (pale flat
stern boxes, panel-scale field flatness, comb rim sparkle, louvre band
running hot and uniform). This is round 2 of the projected 3-4.

## r6 claims audit (§D; every number re-derived on my fresh pairs)

- **1a FRONT FLAPS — CONFIRMED (structure), residual honestly banked**:
  front face [70..160]×[395..530] med 66.5 vs ref 63.5, vgrad **2.34**
  (r5: 6.54; ref 0.22), sub45 31 ≈ ref 21, rowmean-sd **6.58** vs the
  ≤4.5 done-gate (ref 3.16); right mirror 6.61/2.34. The face reads ONE
  covered mass at 1× (was a bright ladder); at 3× the pad-row cast
  shadow band + two seam lines remain. The banked mechanism is honest:
  a legal §B4 two-layer track behind a flush flap casts that shadow —
  the ref's smooth band is a flat print. VISIBILITY at game scale:
  minor (a tone stripe, not a ladder).
- **1a REAR — CONFIRMED at the gate line**: rear corner
  [68..160]×[480..555] med 62.2 vs ref 62.8 ✓; my rowmean-sd reads
  4.52 L / 4.55 R vs the builder's 3.98 and the ≤4.5 gate — AT the
  line, not under it. Visual: corners read covered dark; below the
  boards the pad rungs still stripe at 3× (pale rims). Order 1c.
- **1b SPROCKET DISC — CONFIRMED**: disc window [62..105]×[318..360]
  med 54.7 ≤65 ✓, hue 74.8 ≥55 ✓ (ref 76.2), p5 51 ≥45 ✓. The disc is
  now olive-dark, darker than its surround. Residual p95 89.8 = the
  lit rim crescent — visible as a thin bright ring at the rear
  quarters (order 1d, small).
- **1c WRAP-CROWN GRIME — CONFIRMED partial**: strip law re-measured in
  law (med 63.4, ratio 1.048, hue 74.8 family, sat Δ1.2); front face
  p95 74.0 vs ref+4 = 72.7 (1.3 over, banked). The gear window's
  sub45 2763 (ref 59) and hue 40.9 (ref 62.1) stand unchanged — the
  ground-run pad rims still sparkle pale-grey against the ref's olive
  band (order 1c).
- **2a LOUVRE BAND — CONFIRMED, hot**: rear [100..540]×[312..372] med
  91.9 ≥82 ✓ (ref 86.4, +5.5 hot), rowmean-sd 7.26 ≥4.5 ✓ (ref 6.41).
  Full-width lit fine-slat band reads from rear and both quarters —
  the r5 floor driver is dead. Residuals: the band is UNIFORM pale
  (the ref's camo bleeds across its louvres) and the window's hot tail
  includes the two pale stowage boxes whose bottoms sit in-window
  (orders 1a/2a below).
- **2b GUARD RINGS — CONFIRMED**: taillight window hue 59.3 ≥45 ✓ (ref
  52.2), med 65.0 ≈ ref 65.7 ✓; at 4× both clusters read as round
  concentric ribbed cages with lenses, cables crossing. Class match.
- **2c UNDER-BUSTLE — CONFIRMED partial**: hero-rr [420..610]×[330..385]
  p75 69.8 ≥69 ✓ (ref 71.4), sub45 572 vs ≤430 (ref 363) banked — the
  dark under-rack pockets still read at the hero angle; the canvas
  plateau lift is visible and real.
- **3a MG READ (owner law, r5-mandatory) — DELIVERED**: judged at the
  law's own 2× on official views: **close-roof ✓ clear** — the loader
  MG3 parses as a pintle gun (post + receiver mass + 20°-elevated
  barrel with pale co-rod + ammo box beside the hatch ring);
  **top ✓** — the stowed MG3 is the deck's only diagonal element
  (pale two-tone rod at the bustle, unambiguous once parsed, faint at
  plain 2×); **rear** — reads as rod-over-frame at 3×, gun-vs-rail
  ambiguous at 2×. ≥2 views met; the stowed-gun presentation is
  ref-true for an A5 (the print mounts no proud M2). Order 3a hardens
  the read (receiver lump), non-mandatory.
- **3b PERI — CONFIRMED**: camo body + pale cap disc / dark ring /
  pale inner + head-band plates + optic surround; the r5 grey-mauve
  slab and the mip-flat vent/mount boxes are gone (re-bucketed dark).
- **3c LAUNCHERS — CONFIRMED front-on, weak from quarters**: per-tube
  muzzle caps + collar rings + breech caps read as tube rows dead-front
  and at close-roof; from frontleft/frontright the cheeks read mostly
  as dressed slabs + backdrop (order 3b).
- **3d MANTLET ROUNDS — CONFIRMED**: close-front reads round-over-round
  (round face + evacuator drum + collar seam); the r5 nested-square
  stack and the 155.7°/117.1° unmatched stubs are gone from the
  close-front digest.
- **3e GLACIS — CONFIRMED, grain overshoot noted**: view-front
  [200..440]×[330..372] med 63.3 ≤66 ✓ (ref 61.8; r5 was 73.6). The
  bow is dressed (anti-slip fields, X-straps, backing plates, 3-bar
  brush guards). New texture read: proc sd 11.62 / rowmean-sd 7.89 vs
  ref 6.33 / 1.53 — the dressing is BUSIER than the ref's subtle
  print (watch item inside order 1b; do not deepen further).
- **4a DECK — geometry confirmed, window stays banked**: the fan wells
  are real recessed spoked arcs from top/toptilt (r5's drawn circles
  gone); radiator covers landed. Deck window med 54.9 vs ≥57 gate
  (ref 59.9), sub45 1465, vgrad 2.97 — unchanged, camo-bound as
  banked (the ±0.58 strip is scheme camo, per-tank untunable). The
  visible deck deltas that remain are ruled-line grammar and the
  ref's fender chain speckle (order 4a).
- **4b STERN FRAME — CONFIRMED**: rearleft [63..140]×[305..390] sd
  14.69 ≥11 ✓ (ref 13.31), p95 105.4 ≥95 ✓ (ref 102.3); crowns +
  under-shadows read at 3×.
- **4c TURRET FLANK — banked as claimed**: p95 81.5 vs ≥83 (ref 84.4),
  med 74.0 vs 77.8 — the flank quilt is still the flattest large
  surface (order 1b attacks it via panel tint, not window brute force).
- **4d TUBE — acceptable residual**: the sleeve carries scheme camo
  patches at close-front; mottle weaker than ref (stays banked; needs
  the mask-free mechanism, no order this round).

## Standing checks (§B + §H.4)

- **TRACK CONTAINMENT (§B4): PASS** — `--exact` 0/0 re-run by me; no
  tooth-over-plate at 4× anywhere (flap plates sit clear; the comb
  visible BELOW flap bottoms is legal exposure, not clipping).
- **CONTIGUITY / NO EMPTY AREAS (§B2): PASS** — machine contig 0; all
  decks close from top and 55° tilt. Evaluator voids adjudicated: the
  NEW hero-toptilt 6.323 m² @(1.40, 0.98, 1.34) is projection air —
  my 80px-cell air census of the toptilt pair matches ref cell-for-cell
  (proc row y320: 44/1/0/1/69% vs ref 43/0/0/2/69%; merkava
  tilt-projection class, 3d graduated carrying 5.34 m²). hero-rr
  1.116 m² = the same gun-over-deck pocket cleared in r5 (identical
  value); close-roof 0.019 m² pair = wheel-hub recesses (carried).
- **FRONT SLOPES (§B1): PASS** — front 26 matched, worst Δ+5.7° (the
  r5 skirt-top family, gate-priced); glacis rake follows the ref.
  Carriers re-cited, unchanged class: wedge-crest Δ+10.1° ±0.3 on
  1.10 m @(0.72, 2.58, 1.66-ish frontleft, mirrored frontright
  Δ-13.8/Δ+12 family at z 2.25..2.57 y 1.69..2.10), rearleft/rearright
  rack top-line Δ±10.4-10.6 @(z −1.47..−0.95, y 2.31..2.38). All are
  r5 watch-list carriers on certified gate geometry — cite-only.
- **ROUNDNESS (§D)**: hatch rings round in silhouette AND plan; PERI
  cap rings concentric; guard rings round at 4×; fan wells read as
  true arcs with spokes (procOnly arc census: hero-fl proc 2 arcs vs
  ref 1 — the extra is the fan-well curb, benign). The ref's big wrap
  arcs still have no proc counterpart mid-side (r 1.657/74.8° front,
  r 0.474/105.1° rear read on ref only) — but the wrap ends are now
  COVERED by flaps/boards at both ends, so the visible cost is the
  ground-run comb only (folded into order 1c).
- **MG READ (r5 mandatory): DELIVERED** — see claims audit 3a.
- **VARIANT-DISTINCTIVENESS (§H.4) vs graduated leo2a6: PASS,
  strengthened** — fresh 2-up proc strips (left/front/rear/close-roof;
  a6 at 80b76338): (1) L/44 overhang ~1.3 m shorter, no L/55 step —
  decisive side-on both ways; (2) stern grammar now THREE tells — a5
  louvre-band + guard-ring + Strv-frame + sprocket cover disc vs a6's
  clean stern + basket; (3) roof — a5 boxy cluster + crosswind mast +
  diagonal stowed MG3 + flat PERI cap vs a6's proud blister + tall
  whips; (4) gear — a5 raised rear skirts + cover discs vs a6 deep
  scallops; (5) smoke banks now read as per-tube launchers (tells
  retained through the dressing). No re-badge read at any strip.
- FILL/CIRC (owner top-down law): FILL PASS; CIRC PASS — fan arcs now
  shaded geometry; rings round in plan.

## Per-view justifications (bar ≥9.0 "same vehicle, same tier")

- **front 8.6** (7.8): flaps read covered mass (vgrad 2.34), glacis
  dressed in-gate, launcher tube rows + brush guards + round mantlet.
  Held by: pad-shadow stripe on flap faces, glacis grain busier than
  ref (sd 11.6 vs 6.3), roof furniture stack, comb lip below flaps.
- **frontleft 8.5** (8.0): front deliveries + flank; held by ground-run
  comb rim sparkle, launcher bristle weak from the quarter, wedge-crest
  carrier, panel-flat fields, roof slabs.
- **left 8.6** (8.2): disc olive-dark, strip/wheels/hull windows in
  law; held by comb rims (gear hue 40.9 vs 62.1, sub45 2763), roofline
  slab stacking, turret p95 −2.9 (banked 4c).
- **rearleft 8.5** (7.9): louvre facade + guard ring + frame relief
  (sd 14.69) + covered corner; held by disc rim crescent (prominent at
  this quarter), rung rims below boards, pale rack boxes, band hot.
- **rear 8.6** (7.7 — the old floor): full-width lit louvre band, round
  ring cages, corners at ref tone (62.2 vs 62.8), decal + cables + MG
  rod. Held by: band +5.5 hot and UNIFORM (ref camo crosses its
  louvres), two pale CAD stowage boxes in-window, corner rungs at 3×
  (rowmean-sd 4.52 = the gate line), cable X sweep shallower than ref.
- **rearright 8.5** (7.9): mirror of rearleft + rack top-line carrier.
- **right 8.6** (8.2): as left, mirrored.
- **frontright 8.5** (8.0): as frontleft, mirrored.
- **top 8.6** (8.3): fan wells spoked and recessed, MG diagonal is the
  deck's one honest diagonal, rings round, fill clean. Held by: deck
  med −5.0 + ruled-line grammar (banked camo-bound window), missing
  fender chain speckle, sub45 1465 vs 909.
- **hero-frontleft 8.6** (8.1): identity strong, launcher + PERI + straps
  all read. Held by comb lip at the bow, panel-flat fields, roof stack.
- **hero-rearright 8.4 — FLOOR** (7.8): biggest residual density: dark
  under-rack pockets (sub45 572 vs 430), pale flat rack boxes, bustle
  roof plate reads slab-with-highlight-edge, disc crescent, comb. The
  p75 lift and frame relief are real and visible.
- **hero-toptilt 8.6** (8.2): fans shaded, straps read, diagonal MG
  read, fill clean. Held by ruled deck lines, fender-board rim
  serration, plate edge highlights.
- **close-front 8.4 — FLOOR** (7.8): round-over-round mantlet, covered
  wraps, dressed glacis. Held at max magnification by: pad-shadow band
  + seams on the flap face, glacis grain overshoot, roof slab stack
  (EMES surround gaps), comb teeth below the flap line.
- **close-roof 8.7 — CEILING** (8.3): PERI two-tone + camo, launcher
  caps/rings, elevated MG parses as a gun, rings + lug dots excellent,
  radiator covers. Held by large-panel flatness (no print mottle) and
  the flat backdrop plates.

## ORDERS for r7 (grouped by driver; a6-ladder vocabulary; banked classes
respected — no order re-litigates an honestly-banked mechanism; every
geometry item re-runs gate ×2 + containment --exact; graduates frozen)

**GROUP 1 — print-grain tier (new dominant driver: clean-CAD kit vs
weathered print):**
- 1a. STERN PALE BOXES de-CAD (rear + quarters + hero-rr): scheme-camo
  bind + two-tone + strap/edge detail on the two pale stowage boxes and
  rack boxes (a6 r4 #2 mip-average law: small boxes flatten — bucket
  dark + detail overlays). Done-gate: rear window med settles into
  82..88 (kills the +5.5 hot legitimately — box bottoms sit in-window);
  boxes carry ≥2 tones at 2×; 2c p75 ≥69 HELD (canvas hex untouchable
  per the plateau law).
- 1b. PANEL TINT DECK on the big fields (hull flank, turret flank,
  glacis calm-down): per-plate ±2-3 luma tint jitter + seam accents
  (the a6 cast-mottle class). Done-gates: view-left turret-side p95 ≥83
  (closes banked 4c), hull-side med stays within ±2 of ref (currently
  71.1 vs 73.0), glacis rowmean-sd DOWN toward ≤5 from 7.89 (calm the
  overshoot, do not darken further — med gate 63.3 ≤66 held).
- 1c. COMB RIM QUIET (tone only, inside the legal two-layer track):
  olive/mud term on outboard pad rims + rear-corner rung rims below the
  boards; kill the pale AA sparkle along ground runs. Done-gates: gear
  window [100..540]×[352..400] hue ≥50 (now 40.9; ref 62.1) AND sub45
  ≤1500 (now 2763), rear corner rowmean-sd ≤4.0 (now 4.52/4.55), front
  face rowmean-sd toward ≤5.5 (now 6.58; the pad-shadow floor stays
  banked if measured as such — OVERSHOOT LAW: pull back on any window
  inversion, two confirmed incidents in r6).
- 1d. DISC RIM CRESCENT: tone the lit rim ring. Done-gate: disc window
  p95 ≤80 (now 89.8) with med ≤65 / hue ≥55 / p5 ≥45 all HELD.

**GROUP 2 — rear band finishing (driver B closure):**
- 2a. CAMO BLEED over the louvre band + slat tone: patches crossing the
  band per ref, slat mat only (NOT the canvas hex — 2c plateau law).
  Done-gate: rear window med 82..88 with ≥2 camo patches crossing the
  band at 2×; rowmean-sd ≥4.5 held.
- 2b. CABLE X SWEEP: deepen toward the ref's upper-corner-to-ring
  geometry (thin member, pale-refund per §C). Done-gate: rear 2× crop
  X-read; no new gate columns.

**GROUP 3 — furniture polish:**
- 3a. MG READ HARDENING (delivered this round — make it unambiguous):
  pale receiver/grip lump mid-rod on the diagonal stowed MG3 + ammo-box
  pale face on the loader MG. Constraint: law-4 staircase — any
  above-anchor run inside ONE z-column, radial adds inside certified
  envelopes (law-3). Done-gate: top AND rear at 2× read GUN (receiver
  mass visible); dims 100 held.
- 3b. LAUNCHER BRISTLE from quarters: pale end-ring highlights or
  +0.01-0.02 protrusion inside the 1.378→1.41 column limit. Done-gate:
  frontleft/frontright 2× crops show the tube cluster as tubes.
- 3c. ROOFLINE STACK integration at close-front: shroud/fill the visible
  slab gaps around the EMES/PERI cluster (interior faces, certified
  silhouette). Done-gate: close-front crop — no daylight slits in the
  stack; gate ×2 held.

**GROUP 4 — deck dressing:**
- 4a. FENDER CHAIN SPECKLE: spare-link/chain texture along both fender
  edges per the ref's top view (KIT.spareTrackLinks class — §I calls
  for the library; a hand-rolled variant needs its packet line).
  Done-gate: top 2× fender zones read the speckle; AABB unchanged;
  deck window numbers no worse (banked camo-bound med stands).

## Residuals certified/priced this round (no orders)
- Front-face rowmean-sd floor from the pad-row cast shadow (legal §B4
  track vs smooth print band) — banked honest; 1c may shave it, the
  4.5 gate is NOT re-imposed.
- 2c sub45 (under-rack true shade), 4a deck window med/vgrad/sub45
  (camo-bound), 4c med mass (camo-bound) — banked with numbers.
- 4d tube mottle depth — banked (needs a mask-free mechanism).
- 2.695 crown pair, jerry-can bottom, wedge-crest/rack-line Δ flags,
  evaluator top Δbot 1.66 m vertical-cliff class, hero-rr 1.116 m² +
  toptilt 6.323 m² projection-air voids — carried, verified this round.
- mg0+0d §I census carry — packet justification stands; the visual read
  is delivered; KIT.fittings migration stays fleet-program scope.

## Verdict

FAIL — floor 8.4 (hero-rearright, close-front), ceiling 8.7 (close-roof),
mean ≈8.55. No machine-gate order: gate 90.8 PASS ×2, containment 0/0,
contig 0, rig parity OK, graduates frozen (hashes verified twice). Every
r5 driver order was delivered or honestly banked with mechanisms I could
reproduce; the r5 floor (rear) improved +0.9 and the owner-law MG read
is in. The remaining gap is one coherent tier: FINISH — de-CAD the pale
kit, give the big fields the print's panel grain, quiet the comb rims,
bleed camo over the louvre band. With the grammar classes closed, r7 is
a polish round; floor ≥8.8-9.0 is reachable in one strong round, dual
gate in two. Round 2 of the projected 3-4 — on schedule.
