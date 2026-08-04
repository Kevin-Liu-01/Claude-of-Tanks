# m47_patton shaded-parity r3 — FIRST FORMAL ADJUDICATION (2026-08-04)

Rig: fresh 14 pairs `node tools/tmp-tank-critic.mjs --id=m47_patton` →
shots/critic-m47_patton/ (zero console errors). Official gate re-run on my
watch: **90.3 PASS ×2 bit-identical** (hull 90.3 / whole 92.4 / turret 92.9 /
stations 95.4 / dims 100 / floaters 100) — reproduces the 97691ad ledger
line to the decimal; hull 90.3 is the razor this round (turret carries 2.9
pts of headroom, hull 0.3 — lane pricing below follows that split).
`tank-standard-check`: clip **0/0 ✓**, contig **0 ✓**, mg1+0d ✓.
`visual-evaluator.mjs --id=m47_patton`: exit 0, **RIG PARITY OK** (11 ortho
views, max dYawProxy 1.7° @front, max |dCentroid| 0.044 m), camoSeed 4242,
evidence at shots/visual-eval-m47_patton/ (report.json + overlays).
Graduate discipline: m60a1 **81e69e34** / m60a3 **efcde5c4** hash-verified
(packet-exact, do-not-gate respected). Sibling m46_patton rendered
read-only for the §H.4 check (shots/critic-m46_patton/, zero errors).
Measurements: banked ITU-601/mask-method scanners (tools/tmp-r7-merkava.py)
on MY fresh pairs; zoom crops diagnosis-only (tools/tmp-m47r3-crop.py).
All numbers below re-derived this round with windows quoted.

## HEADLINE: FAIL — floor 8.3 (hero-rearright), mean 8.49, no view at the 9.0 bar; ZERO machine-gate failures (clip 0/0, contig 0, mg1) — the gap is pure asset-tier: gear shade, bustle cast grammar, MG tone law, chroma outliers

front 8.7 · frontleft 8.5 · left 8.5 · rearleft 8.4 · rear 8.4 ·
rearright 8.4 · right 8.5 · frontright 8.5 · top 8.6 · hero-fl 8.4 ·
hero-rr 8.3 · toptilt 8.6 · close-front 8.5 · close-roof 8.5

This is the patton family's first critic round on its first gate-passer,
so it opens the family's visual-ladder vocabulary. The IDENTITY verdict is
unambiguous — every view reads M47 Patton: the long M36 with its wide
blast deflector, the needle-nose casting rising to the 2.95 crest, the
long stepped bustle overhang, both M12 rangefinder blisters, the bow MG
ball (last US tank with one), six dished wheels + fender mufflers. The
TIER verdict fails on four cross-cutting drivers, all measured below.
Registration, dims, slopes and footprint are already graduate-grade; the
front ortho is one flag from silhouette-perfect. What stands between 8.5
and 9.0 is (A) the near-black mechanical-diagram running gear, (B) the
slab-read bustle + missing casting arcs, (C) an MG that breaks the
sky-backed tone law, and (D) primer-grey/chroma outlier fittings.

## Standing checks (§B + §H.4)

- **FRONT SLOPES: PASS** — front view: 31 primaries matched, ONE flag
  >1.5°, worst Δ-1.7° ±0.5° (a 0.30 m vertical at x 0.34, the pedestal
  edge — not the glacis). Glacis rake, cheek slopes and dive line all
  follow the ref within noise. p95 Δtop 0.119 m / Δbot 0.109 m.
- **CONTIGUITY / NO EMPTY AREAS: PASS-with-watch-items** — machine §B2
  scan 0 enclosed cells ✓; top + toptilt decks render filled, no sky
  through hull or turret interior anywhere. Evaluator enclosed-void
  inventory, all adjudicated legitimate air (§D caveat class): 4.751 m²
  @ (1.26, 1.40, 0.44) hero-toptilt = tilt-projection bay (merkava3d
  graduated carrying 5.34 m² in this view); 0.742 m² @ (-1.42, 2.37,
  -1.03) hero-rr = far-side air under the real bustle overhang; 0.177 m²
  @ (0.29, 3.28, -1.25) close-roof = the pedestal/M2 H-frame sky window
  (MG PHYSICS wants that gap); 0.054 m² @ y -0.53 = under-belly. The
  documented **0.041 m² @ (0.31, 1.10, 2.14)** re-measured present =
  toe-undercut air between the dive-fender tips and the lower bow —
  §B2 machine 0, carried as the packet's watch item. One NEW hero-angle
  read (not a §B2 failure, ordered under C4): the rear fender tip
  (z -4.02..-4.10) shows a thin sky sliver between plate underside and
  track top in hero-rearright — reads as a separated plate at 3×.
- **DECORATION / MG PHYSICS: FAIL (tone law)** — the roof M2 is present,
  masses correct (receiver box + ammo stack + cradle + tube), pitches
  with the certified published-height pedestal — but it reads as a flat
  DARK block against sky: view-left rod table over the gun
  [215..370]×[200..240]: block-luma med **56.0** (p25 56.0 / p75 58.0 —
  no top-light gradient at all) vs ref **79.5** (75.0/81.5). MG PHYSICS:
  sky-backed guns read pale top-lit. The stowed FITTINGS 'mag' at
  (0.30, 2.96, -0.62) censuses mg1 ✓ and reads as a stowed bracket
  (packet-justified §I; the measured M2 station is the hand-authored
  gate carrier — justification carried, same class as merkava/m60).
  Order B5. Bow MG ball + stub verified authored and reading at
  (+0.55, 1.31, 1.63) ✓ (identity kept).
- **TRACK CONTAINMENT: PASS** — `track-clip-audit --exact` 0/0 ✓ (via
  standard-check); visually clean at 3-6× at both wraps: front wrap
  clears the dive fenders, rear wrap clears the tail band; no tooth
  through plate anywhere in 14 views.
- **VARIANT-DISTINCTIVENESS vs m46_patton (82.0 built): PASS** — fresh
  proc-vs-proc reads (left/front/top): (1) TURRET PLANFORM — m47 long
  needle-nose pear + parallel bustle running to z -2.7 covering the rear
  deck vs m46's compact rounded egg + stub bustle leaving the deck open;
  (2) MUZZLE — m47 wide twin-drum blast deflector (plan-T, fat side
  profile) vs m46's slim tube + small baffle brake; (3) M2 STATION —
  m47 amidships-rear published-height pedestal skyline vs m46's
  forward cupola mast; (4) CHEEK BLISTERS — m47 carries both M12 pods
  (read in plan + front) — m46 has none; (5) BOW — m47 full-width dive
  band + shelf vs m46's stepped plain glacis. No re-badge read.
  §H.4 residual: LOADOUT variety is thin — both siblings carry the same
  minimal dressing (same lights, same muffler kit, near-bare decks;
  m46 even shares the blue-lens class) — order D3 opens the era-kit
  split (m47 rack stowage) before the family's variety round.
- FILL/CIRC: decks filled ✓. Circularity: wheels/blister circles read
  round in plan; the CAST-ARC census is the failure mode instead —
  see driver B (the ref's arc grammar lives at the wraps, blisters,
  deflector face and tail; the proc matches none of them).

## §D-cited machine findings (visual-evaluator, coordinates PROC-frame)

- **ARC DEFICIT (the cast-vs-CAD story, measured):** ref arcs with NO
  proc match — front idler wrap r0.98 m span ~89° both quarters
  (@ z 1.12..1.86 y 0.00..0.99); sprocket-zone wraps r0.43-0.50 span
  60-66° (@ z -2.5..-3.0 y 0.3..1.4); cheek-blister dome in rear view
  r0.12 span 109.8° (@ x 0.72..0.88 y 2.46..2.64); blast-deflector END
  r0.15 span 168.7° (@ z 3.92..4.15 y 1.89..2.15 — the ref drum face is
  a near-half-circle cap, the proc's is square); tail undercut r0.15
  span 156.5° (@ z -4.14..-3.99); glacis-toe roll r0.46 span 67.4°
  (close-front @ z 2.96..3.25 y 1.28..1.69). Proc-only arcs: its own
  dome-nose roll (r0.15-0.20 span 124-183° @ z 0.39..0.63) — smooth
  lathe, no polygonal flag (the only "reads polygonal: 9 facets" flag
  this round is on the REF at close-front r0.13). Net: proc dome is
  properly smooth; proc gear/fittings are properly round NOWHERE the
  ref is.
- **SLAB BUSTLE, machine-cited:** proc-only 90° cliffs at the bustle
  side FRONT edge both sides (89.6° len 0.50 m @ z -1.64 y 2.18..2.68
  frontleft; 90.4° len 0.52 m @ z -1.60 y 1.99..2.51 rearright), the
  bustle side wall vertical @ x -1.11 y 1.78..2.25 in dead-rear, and
  boxy tail-corner verticals @ x ±1.68 y 0.42..1.14 (rear). The ref's
  dome-to-bustle transition is a swept shoulder; its rear shell rounds.
- **DIVE LINE Δ:** left: 21.8° vs ref 33.7° (Δ-12° ±0.8°, len 0.30 m
  @ z 0.80..1.39 y 1.71..1.95) mirrored right (Δ+12°) — the fender
  hanger/nose seam segment sits shallower than the ref's; plus the
  proc-only 37.7° edge @ z 1.79..2.17 y 1.22..1.52 (dive window face).
  NOTE: the dive tip/eye tip are the r3 front span-end ANCHORS
  (anchor-profile law) — no silhouette order issued on them; recorded
  as the priced shape residual.
- **M2/pedestal band flags** (certified-height class, read-only): left
  Δtop +0.933 m @ z 0.80 / rearright +0.716 @ z 0.52 / frontleft +0.619
  @ z 0.49 (cliff offsets at the corridor tip — the proc M2 rides the
  published 3.35 over-MG height, the warped oracle's gun sits at its
  own ~2.9 band; dims 100 carries this; no order to move it).
- **Roof-line Δs (quarters):** rearright upper 13.7° vs 4.2° (Δ+9.6°
  ±0.4° len 0.80 m @ z -0.28..0.15 y 2.75..2.90); rearleft Δ-14.1° ±4°
  (short segment, inside noise caveat); close-roof upper Δ+8.4° ±0.1°
  len 1.43 m @ z -2.01..-0.67 y 3.28..3.48 (M2/pedestal band line).
- **Plan fender lines:** ref continuous ±1.75 rails run 6.24 m
  UNMATCHED; proc plan edges live at ±1.68 with bump tips — the r2
  fender-law trade (1.677 HW + discrete hangers) reads as notched
  edges from above. Priced residual (stations/width carriers), no
  order.

## Builder-claims audit (§D; r3 packet vs MY rig)

1. "90.3 PASS ×2" — reproduced bit-identical twice today ✓.
2. "standard-check clean (clip 0/0, contig 0, mg1)" — reproduced ✓.
3. "evaluator 14/14 RIG PARITY OK (yawProxy ≤1.7°)" — reproduced:
   max 1.7° @front, no flip, |dCentroid| ≤0.044 m ✓.
4. "0.041 m² void under the dive tip, covered from above" — reproduced
   at (0.31, 1.10, 2.14); adjudicated toe-undercut air, watch stands ✓.
5. Graduate hashes m60a1 81e69e34 / m60a3 efcde5c4 — verified ✓.
6. Residual honesty confirmed: side_hull worst cols the packet names
   (tail band -4.147, idler-approach ramp, dive-window maxima) are
   exactly where my per-view deductions land — no hidden regressions
   found.

## The four measured drivers (all views)

- **A. GEAR-SHADE CLASS (tone lane, zero mask):** the running gear is a
  black-and-grey mechanical diagram on an olive tank. View-left gear
  band [60..580]×[365..432]: proc p5 **6.8** / p25 23.6 / med 57.7 /
  sd 23.4 vs ref p5 **51.6** / med 64.0 / sd 7.9; sub-30 census
  **5470 px vs 0** (worse than the merkava1b r12 class, 1995 vs 0).
  Grammar splits: (a) guide-horn combs hang as separated black Ts along
  the top run and around both wraps (ref: one continuous soft-shadow
  band under the fender); (b) wrap faces read as solid black walls at
  close-front; (c) wheel DRUMS are unpainted single-tone (wheel band
  [170..380]×[386..416]: p75 61.3 vs ref 69.5 — the ref camo-paints its
  wheels; proc p5 52.0 vs 51.6 is otherwise parity); (d) pale
  primer-grey muffler legs/roller brackets stand against the black band
  (hullDetail boxes at z ≈ -2.34/-2.58 + bracket posts) and project
  ABOVE the deck line from the opposite quarter — bare pale sticks
  against sky in every quarter/hero view.
- **B. BUSTLE/CAST GRAMMAR (mixed lane, turret has 2.9 pts headroom):**
  the machine-cited slab: 90° front cliffs both sides, flat rear wall
  with an inset picture-frame panel, boxy tail corners; the rack reads
  as a closed dark PIT from above (top [260..380]×[330..490] sub-50
  census **2557 vs 1160**, worst cell p5 43.4 vs 53.5) and its rear
  band reads a full class darker than the ref's lit slatted tray
  (view-rear [175..465]×[313..352]: med **60.7 vs 73.2**, sub-45
  77 vs 3). Blister pods read as shelf boxes from the rear (missing
  ref arc r0.12 span 109.8°). The ref's cast arc grammar at the
  deflector end + glacis toe is likewise unmatched (§D list above).
- **C. MG TONE LAW + FLOAT (material + flush):** rod med 56.0 vs 79.5
  (sky-backed pale law broken); the assembly reads as a floating dark
  H-frame from front/rear (thin pedestal post + thin cradle posts, no
  visible mount truss mass inside the roof gap). Certified height —
  the fix is tone + mount mass, not station moves.
- **D. PRIMER/CHROMA OUTLIERS (material):** SATURATED BLUE headlight
  lenses at (±0.75, 1.44, 1.63) — the only saturated blue on the
  vehicle, loud in front/frontleft/close-front (m46 shares the class —
  family-wide fix); primer-grey dive/bowShelf band reads as an
  unpainted appliqué stripe across the bow (full width, hard top/bot
  edges); primer-grey M2 stack; pale muffler legs (also under A).
  Deck sparsity rides with this driver: engine-deck transverse relief
  row-SD **1.33 vs ref 2.98** ([215..425]×[470..524] top view), front
  deck 55.0/1.77 vs 60.5/0.92 (slightly dark + seam-flat); rear plate
  med 67.6 vs 73.3.

## Per-view justifications (bar: ≥9.0 "same vehicle, same tier")

- **view-front 8.7** — best view. Slopes/footprint/registration
  graduate-grade (1 flag, Δ-1.7°); needle nose, blister shoulders and
  fender line land; bow ball reads. Held by: near-black track blocks
  vs the ref's olive family (A), blue lenses (D), the primer dive band
  stripe (D), dark M2 T-frame (C).
- **view-frontleft 8.5** — identity instant; same-vehicle YES. A at
  full force (comb + wrap + posts), bustle 90° front cliff (B,
  machine-cited @ z -1.64), M2 dark float (C), blue lens (D).
- **view-left 8.5** — long-tube + deflector + needle-nose + bustle
  overhang silhouette all read; wheel-face tone parity measured. Held
  by A (sub-30 5470 vs 0 — the single loudest number this round), C
  (rod 56 vs 79.5), pale legs (A/D), missing whip antenna the ref
  carries at dome-rear z ≈ -0.8 (D1), dive-seam Δ-12° (priced).
- **view-rearleft 8.4** — A + B together: comb + slab side + closed
  dark rack band + boxy tail verticals; fender-tip plate read begins.
- **view-rear 8.4** — B at its purest: flat wall + inset panel vs the
  ref's rounded shell over a lit slatted tray (med -12.5L, sub-45
  77 vs 3); missing blister arc (r0.12); proc-only 90° tail cliffs at
  x ±1.68; M2 H-frame floats dead-center skyline. Rear plate itself
  carries decent structure (row-SD 7.97).
- **view-rearright 8.4** — mirror of rearleft + the Δ+9.6° roof-line
  flag; the pale far-side posts serrate the deck line.
- **view-right 8.5** — as left; plus the square deflector end vs the
  ref's r0.15 span-168.7° rounded cap, '23' decal fine.
- **view-frontright 8.5** — as frontleft, mirrored (Δ+10.4/-6.4°
  bustle-floor flags).
- **view-top 8.6** — plan footprint/registration excellent (yaw 0°,
  tail corner flags ≤1.9°); blisters + cupola + deflector-T read; §B2
  filled. Held by the rack dark pit (2557 vs 1160 sub-50), halved
  engine-deck relief (1.33 vs 2.98), notched ±1.68 fender edges vs the
  ref's continuous ±1.75 rails, near-bare deck furniture vs the ref's
  tarp/strap/louver texture.
- **hero-frontleft 8.4** — A loudest (comb + drums + posts + black
  wrap), turret nose slab-face read, M2 float, blue lens; dished-wheel
  anatomy does read at this angle — the tone kills it.
- **hero-rearright 8.3 — THE FLOOR** — every driver in one frame: black
  comb + unpainted drums + pale posts (A/D), slab bustle + '123' wall
  (B), fender-tip sky sliver (C4), rack pit over the shoulder, M2
  stack primer-grey. The ref half is a unified cast-and-canvas
  vehicle; the proc half is parts.
- **hero-toptilt 8.6** — decks filled, containment clean, plan grammar
  good; held by rack pit + engine-deck flatness + slab bustle top +
  comb serration of the deck edge.
- **close-front 8.5** — needle-nose casting face + mantlet + ball read;
  containment visually clean at 2×. Held by the black wrap wall (A),
  blue lenses at their loudest, primer dive band + hard seam (D), thin
  .30 stub, square deflector.
- **close-roof 8.5** — M2 masses + cradle + certified pedestal +
  stowed-mag bracket + blister tops + rivet rows all read; deck panel
  lines clean. Held by the primer-grey M2 stack with zero top-light
  (C), pale flat hatch ellipse, rack pit at frame edge, dome panel
  creases where the ref rolls cast.

## ORDERS (grouped by driver; tone/material first; every geometry item
carries razor pricing — hull sits at 90.3 with 0.3 headroom, turret at
92.9 with 2.9; gate ×2 after ANY mask-touching edit)

**GROUP A — gear-shade lane (driver A; all material/tone, zero mask):**
- A1. Lift the shoe/horn floor to the ref's shade class: view-left band
  [60..580]×[365..432] sub-30 **5470 → ≤300** (ref 0), p5 ≥35; keep lit
  shoe-top pitch. Retone the chain/horn dark buckets or their AO — no
  geometry.
- A2. Camo-paint the wheel drums (ref paints them): wheel band p75
  61.3 → ≥66 with visible blotches on ≥3 drums/side; keep hub rings.
- A3. Kill the pale posts: muffler legs (z ≈ -2.34/-2.58) + roller
  brackets + flap straps → dark-fitting class (or legY0 1.22 → ~1.50 to
  tuck them behind the fender line — interior in side ortho, backed by
  track; verify gate ×2 if resized). Done-gate: no pale verticals
  against track or sky in quarters/heros.
- A4. Wrap-face relief: break the solid-black wrap walls at close-front
  with end-connector/tan-pitch texture inside the existing silhouette.

**GROUP B — bustle/cast grammar (driver B; turret lane, 2.9 pts
headroom, price each item, gate ×2):**
- B1. Sweep the bustle FRONT shoulders: chamfer/roll ≤0.05 m on the 90°
  cliffs @ z -1.60..-1.64 y 2.0..2.68 both sides (machine-cited) so the
  dome flows into the bustle as cast. 1-2 turret side columns at ≤5 cm
  — inside headroom; verify.
- B2. Open the rear rack read: recess real slat/rail through-shadow
  into the existing rear band (no new silhouette columns — cuts only)
  + retone: rear band [175..465]×[313..352] med **60.7 → ≥68** with
  ≥6 dark slat lines; round the rear shell corners (kill the x -1.11
  vertical) within the current mask envelope.
- B3. Fill the rack PIT from above (mask-free: contents below rim):
  tarp crown + duffels INSIDE the rack walls; top [260..380]×[330..490]
  sub-50 **2557 → ≤1400** (ref 1160). Doubles as D3 era stowage.
- B4. Round the blister pods' rear profile (the missing r0.12 span
  109.8° arc @ x 0.72..0.88 y 2.46..2.64): small profile roll, ≤2
  turret rear columns, priced.
- B5. M2 per MG PHYSICS (certified pedestal height UNTOUCHED): two-tone
  the gun — pale top-lit crown/receiver (≥2px edges, 35-45px runs),
  dark unders; rod med **56.0 → ≥70** (ref 79.5). Add mount-truss mass
  inside the pedestal-to-roof gap so the H-frame reads mounted, not
  floating (interior to the certified band; keep the 0.177 m² sky
  window open — the law wants it). Barrel taper + muzzle collar detail.
- B6. OPTIONAL-IF-PRICED: round the deflector END (ref r0.15 span
  168.7° @ z 3.92..4.15) with an edge roll ≤0.03 keeping plan 0.65 and
  muzzle 4.353 extents. WARNING: these are the r3 re-paired muzzle
  anchor columns (anchor-profile law) — land only on a held 90.3 ×2;
  drop on any wobble.

**GROUP C — bow + attachment reads (material + flush; hull razor 0.3 —
NO hull silhouette spend):**
- C1. Headlight lenses: kill the saturated blue → smoked-glass
  dark/olive (family-wide: m46 shares it). Done-gate: no saturated
  blue disc at (±0.75, 1.44, 1.63) in front/close-front.
- C2. Camo the dive/bowShelf band + soften its appliqué seam TONE
  (material only — its silhouette is the r3 front span-end anchor
  set; the anchor-profile law forbids moving tip/edges).
- C3. Bow .30 stub → real muzzle mass (collar + slightly fatter stub,
  ≤0.03 proud, front-view interior only).
- C4. Fender-tip sky sliver (z -4.02..-4.10, hero-rr): fill with a
  DARK BACKER/mud-flap INSIDE the existing silhouette (material-split
  lane — rear-visible content below the idler-wrap line writes
  side-mask bottoms, and the tailStack anchors live at -4.10..-4.215:
  zero new silhouette columns allowed; if it can't be done
  mask-invisible, defer and bank).

**GROUP D — parity dressing (§B3/§H.4; KIT lane, AABB-interior):**
- D1. antennaWhip (KIT.fittings) at dome-rear right, z ≈ -0.8 — the
  ref's own whip (pale, tip y ≈ 3.5). heightM p95 budget: ≤4 side
  columns aligned with the ref's own spike band; pale-refund pricing;
  pintle-class allowance ≤0.4 pts respected.
- D2. Deck relief: engine-deck louver rows as flush dark slat decals
  pinned on real planes (decals ARE mask geometry — keep ≥15 mm off
  trace columns; segment ≤0.48 m per station end-cap law): top-view
  row-SD 1.33 → ≥2.2. Front-deck periscope/wiper dots to the ref's
  1.77-flat band.
- D3. Era stowage variety (§H.4, with B3): rack tarp roll + duffels +
  a left-fender-aft jerry pair — the M47 loadout tell vs m46's bare
  build; deterministic seeds, userData.fitting censused.

## Residuals certified/priced this round (no orders)
- Pedestal M2 at 3.375-3.38 = the heightM certification carrier (dims
  100); the Δtop +0.6-0.9 m cliff flags are its read — carried.
- Oracle tube-stretch pairing constants (muzzle 4.353, evac 3.10..3.96)
  — re-paired r3, hands off except priced B6.
- Dive/eye-tip front anchors + tailStack rear anchors (anchor-profile
  law) — silhouette frozen; C2/C4 are material-lane only.
- 0.041 m² toe-undercut air — watch item stands (§B2 machine 0).
- Toptilt 4.751 m² / hero-rr 0.742 m² — projection-bay/overhang air
  (§D caveat class, merkava3d precedent).
- Plan ±1.68 fender rails vs ref ±1.75 continuous — r2 fender-law gate
  trade, stations carrier.
- Dive-seam Δ±12° + i9/i11 station trim slots — gate-priced carriers.
- mg1 hand-authored M2 + stowed mag §I justification — carried
  (m60/merkava precedent).

## Verdict

FAIL — floor 8.3 (hero-rearright), rear quarters and closes at 8.4-8.5,
ceiling 8.7 (front). No machine gate is broken: this is the cleanest
standing-check sheet a first critic round has filed (clip 0/0, contig 0,
slopes 1-flag, §H.4 pass) — and the identity is never in doubt. The
roadmap is dominated by zero-mask lanes: ALL of group A, C1-C3, B3, B5
tone, D3 move no silhouette; B1/B2/B4/D1/D2 spend inside the turret's
2.9-pt headroom under gate ×2; only B6/C4 touch anchor zones and both
carry explicit abort conditions. Clear A + B and the M47 is a genuine
9.0-track candidate: its geometry is already the family's best, and the
distance to "same tier" is paint, shade and cast truth — not shape.
