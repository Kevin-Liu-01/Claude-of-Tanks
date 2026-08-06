# leo2_revolution r18 §B7 RE-CERT — independent critic (2026-08-05)

Full 14-view re-certification of the r18 OWNER REF-WRONG turret re-author
at candidate **ce7f3824** (landed 7ce9780). Per BUILD-STANDARD §B7(3) the
TURRET is scored against the REAL Rheinmetall MBT Revolution (Leopard 2A4
+ AMAP, photo class: faceted wedge front one-plane-per-side meeting a
center prow, hooded gunner's sight recessed right-cheek-top, canted AMAP
panel courses with legible seams, ROSY banks low on the panels, bustle
rack, clean roof with SEOSS pedestal + crosswind mast + compact .50 RWS
rear-right, seated hatches); REF PARITY governs hull-only reads. The
capped gate row (min 0.2, §B7 cap table in the packet) is ADJUDICATED and
outside this verdict. I am adversarial to the builder's claims; every
number below is my own run.

## Provenance (all commands mine, this session)

- Tree: HEAD **7ce9780** (r18 landed), working tree clean at the measured
  paths (only tool-written ledger.json + unrelated tmp scratch dirty).
- Byte discipline, `node tools/tmp-hashgeo.mjs
  --ids=leo2_revolution,leo2a5,leo2a6,kf51` ×2 BRACKETING all renders:
  leo2_revolution **ce7f3824 (78 meshes / 107353 verts)** both bookends —
  exactly the packet candidate. Frozen sibs byte-identical both bookends:
  leo2a5 **2f9d0af0**, leo2a6 **f25dad51**, kf51 **1452024b**.
- Official gate ×2: **min 0.2 | hull 91.8 / whole 76.4 / turret 0.2 /
  stations 78 / dims 99.5 / floaters 100** — tool JSON cmp-clean between
  runs (BIT-IDENTICAL ×2), reproducing the packet close line EXACTLY.
  HULL rows at r17 values to the decimal: side_hull **91.79** / plan_hull
  **97.56** / front_hull **95.35** / plan_whole **97.39**; side_whole
  80.96 / front_whole 76.37 / side_turret 74.75 / plan_turret 0.23 = the
  §B7 cap table rows; registration UNMOVED (side dAlong 0 / dy −0.004).
  Stations decode matches the cap: st6 3.37 / st7 4.46 / st9 5.08 / st10
  7.72 / st11 9.59 topPct; st8 wPct 2.91; st11/12 wPct 2.6/2.6. Dims rows
  identical (h 0.5 / hullL 0.68 / overallL 1.06 / w 0.11). The
  uncontested-region proof HOLDS: hull rows byte-equal to r17.
- Renders: fresh 14 shaded pairs `node tools/tmp-tank-critic.mjs
  --id=leo2_revolution` → shots/critic-leo2_revolution/ (zero console
  errors, favicon 404 only). `node tools/visual-evaluator.mjs` exit 0,
  **RIG PARITY OK — max yawProxy 2.9° @close-front** (packet claim exact;
  every ortho ≤1.2° except the two close views 2.7/2.9°); flagged edge
  deltas decode as the §B7 wedge-vs-print classes (e.g. close-roof upper
  34.1° vs print 15° = wedge top vs diving pancake nose — capped, not a
  defect).
- Official audits (each self-ticketed, run sequentially): track-clip
  --exact **front 0 / rear 0 | shoe 0 / 0, blind spots 0**; turret-parent
  **stranded 2 / abutting 0 / dangling 0**; standard-check **clip 0/0 ✓ |
  contig 0 ✓ | decor mg1+4d ✓** (gateMin 0.2 is the adjudicated §B7 row —
  the machine-gate FAIL line is that row only).
- §J yaw-90 pair RE-RENDERED AT THE VERDICT HASH:
  `node tools/tmp-defuse-recert-yawpair.mjs --id=leo2_revolution` →
  shots/defuse-recert-yaw/ (4 cameras × yaw 0/90 + subtree vertex
  census).
- Measurements: tools/tmp-leo-r18recert-crop.py (2×/4×/6× crops,
  diagnosis-only) + tools/tmp-leo-r18recert-measure.py (ITU-601 luma
  rects with coordinates) + an enclosed-sky flood (bg maxch ≤13 AND
  B−R ≥ +8, border-connected removed, label band y13-21 excluded per the
  §J PAIR-PNG law).

## HEADLINE: RE-CERT PASS (re-freeze ce7f3824) — floor 9.0, mean 9.04; the turret finally reads as the real MBT Revolution

The owner's "looks terrible" print turret is gone and nothing of it
lingers: the wedge reads as ONE raked face plane per side meeting the
center prow (no staircase, no pillowing at 4×), the plan sweep V runs
shoulder-to-embrasure exactly like the vehicle's photo class, the sight
hood recesses into the right cheek top, the panel courses cant out with
legible dark seam strips and ROSY mouths low on the mid panels, the roof
carries an identifiable SEOSS/mast/RWS/module program, and the §J yaw
pair at ce7f3824 proves the ENTIRE new mass — wedge, panels, SEOSS, RWS,
rack, ring fills — rotates as one (census: hull subtree tops ≤1.712
across the whole turret footprint; the only tall hull mass is the
hull-TRUE mast 2.465 @ z −3.7/−3.8).

front 9.1 · frontleft 9.0 · left 9.0 · rearleft 9.0 · rear 9.0 ·
rearright 9.0 · right 9.0 · frontright 9.0 · top 9.2 · hero-fl 9.1 ·
hero-rr 9.0 · hero-toptilt 9.1 · **close-front 9.0 (floor class)** ·
close-roof 9.1

## Standing-check table (brief §1–7)

| # | Check | Required | Measured (mine) | Verdict |
|---|-------|----------|-----------------|---------|
| 1 | tmp-hashgeo ×2 bracketing | ce7f3824; sibs 2f9d0af0/f25dad51/1452024b | ce7f3824 (78/107353) ×2; sibs exact ×2 | PASS |
| 2 | gate ×2, capped line exact | 0.2 \| 91.8/76.4/0.2/78/99.5/100; hull rows at r17 | exactly that, JSON bit-identical ×2; side/plan/front_hull 91.79/97.56/95.35 + plan_whole 97.39 | PASS |
| 3 | track-clip --exact | 0/0 band + shoe | front 0 / rear 0 \| shoe 0 / 0, blind 0 | PASS |
| 4 | turret-parent | stranded ≤2, certified mast-union classes only | stranded **2** / abutting 0 / dangling 0; boxes [−1.42..1.42, top **2.46**, z −3.88..3.23] 53% and [±2.00, top **2.46**, z −3.88..3.65] 26% — same two merged hull buckets, tops = the hull-TRUE mast line; ratios moved with the new turret envelope exactly as the packet certifies; census confirms zero turret mass hull-parented | PASS |
| 5 | standard-check | contig 0 + mg census | clip 0/0 ✓, contig 0 ✓, decor mg1+4d ✓ | PASS |
| 6 | §J yaw-pair at ce7f3824 | entire turret yaws as one mass | 4-cam pairs: wedge, panels, module, RWS, rack, fills all rotate; deck left behind = flat chassis + mast; hullTopsByZ ≤1.712 in footprint | PASS |
| 7 | evaluator rig parity | no RIG MISMATCH | RIG PARITY OK, max 2.9° @close-front | PASS |

## Claims audit (§D — packet r18 done-gates re-derived on my rig)

- Gate line ×2 bit-identical + hull rows byte-equal r17: **CONFIRMED**.
- Candidate hash ce7f3824 (78/107353) ×2 + frozen sibs: **CONFIRMED**.
- Close battery lines (track-clip 0/0/0/0, §B5 2/0/0 at 53%/26%, contig 0,
  mg1+4d, parity 2.9° @close-front): **ALL CONFIRMED to the digit**.
- Yaw-90 unity: **CONFIRMED at the verdict hash** (my own §J re-render —
  builder evidence hash-stamped valid).
- "Old dead-front BLACK BOX is gone": **CONFIRMED** — the fore ring zone
  at close-front now reads split fills behind the prow plan-cover; the
  full-width bow slab read is dead.
- SELF-READ floor (close-front 8.5): **REFUTED UPWARD** — see the
  per-view justification; the zone is the same §C class the ratified
  defuse-recert certified at 9.0 in a strictly worse state.
- Deleted print artifacts (wing, cheek/notch complex, pod deck, floating
  cupolas, EMES riser, wing-cover suite): **CONFIRMED ABSENT** in all 14
  views + plan.

## §B standing checks on the changed content

- **§B1 slopes / NO STAIRCASES / slope-motivates-the-mass**: the wedge is
  ONE face plane per side (4× shading continuous across the module
  courses; seams are engraved lines ON the plane with lifting bosses, not
  step offsets); the prow ridge is crisp; the outer-edge chamfer
  1.58→1.50 reads as its own motivated facet meeting the panel tops; the
  roof plateau meets the wedge on the wedge's own line. Course BOTTOMS
  step because they ride the certified ref floor channel staircase
  (2.045/1.90/1.79w) by construction — horizontal armor-course bottoms,
  not slope quantization. NO staircase read anywhere on the new mass.
- **§B2**: machine contig 0 ✓. My enclosed-sky flood (blue-signature +
  border-flood + label-band excluded): front 486 / frontleft 58 / left 66
  / rearleft 557 / rear 5 / rearright 230 / right 81 / frontright 175 /
  top 443 / hero-fl 1 / hero-rr 0 / toptilt 0 / close-front 16 /
  close-roof 19 — all thin honest sight-lines through furniture gaps
  (whips, rails, mast, rack), every view FAR cleaner than the honest
  print's own halves (left 2409 / front 2967 / rear 4131 / top 4735). No
  turret holes; the fore LOW fill (±0.60) blocks the side x-ray as
  authored.
- **§B3 / NO MYSTERY BOXES (hunted at 2×–4×)**: every roof unit carries
  its tell — SEOSS: ring + pedestal + hood visor + recessed dark lens;
  RWS: pintleMG M2 (census mg1) with base/collar/slew disc/sensor pack +
  pale ready-ammo bin, foot sunk so the pale cap rides under the 2.64
  line; equipment module: louvre ribs + lid seams + latches; hatches:
  seated rings + lid seams + periscope blocks with glass slits; crosswind
  mast: single column + fore-aft head; ROSY: four tube mouths + rim
  collars visible at 6× riding the cant face (sub-dominant at 1× exactly
  like the photo class); rack: rails + frame drops + strapped duffel +
  jerry cans + tarp roll, all parsing as stowage at 1×.
- **§B4**: 0/0 band + shoe ✓; close-front containment reads clean under
  the plank/idler (r13/r15 classes carried; hull rows byte-equal).
- **§B5**: table above + census — PASS; the two stranded flags are the
  certified mast-union AABB false-flag classes (the audit's merged-bucket
  limitation, documented negative).
- **§B6**: \\________/ reads both sides (both end wheels raised, ramps
  rise); running gear untouched (hull rows byte-equal, dims 99.5 exact).
- **§H.4 variant distinctiveness** (fresh renders vs frozen sibs): the
  revolution is now MORE distinct — wedge front + canted panel courses +
  ROSY-on-panel + SEOSS/RWS roof is unique in the leopard family (a5
  scalloped skirts / seven-wheel row, a6 blister + L/55 step + louvre
  grille, kf51 its own silhouette). No re-badge read; sib bytes frozen
  (hash proof ×2).

## Per-view justifications (bar ≥9.0 at graduation severity; every view = turret PHOTO-CLASS + hull REF-PARITY)

- **front 9.1** — wedge planes + prow ridge + recessed sight aperture
  read at 1×; SEOSS (lens face), mast (x −0.29), module louvres, RWS cap
  under the published line, periscope glass slits all identifiable at 4×;
  embrasure pockets flanking the mantlet parse as recess shadow (840 px
  luma<12, bbox 108×51, left deeper than right); hull bow/skirt parity
  clean. Residuals: pocket flat-ink (P-R1), SEOSS pale top face (P-R2).
- **frontleft 9.0** — full grammar; panel seams + top bevel legible; band
  under the turret parses as the under-overhang slot at 1×; at 2× the
  fore fill shows a ~1 px lit top sliver (the SHADOW-FILL EXPOSURE tell,
  sub-visible at 1× — folded into P-R1). Enclosed-sky 58.
- **left 9.0** — three panel segments + dark seam strips ✓; ROSY mouths
  resolve at 6×; roof program + rack + hull-true mast; ring band strip
  med 25.8 / p10 5.5 (flat-dark sub-population = the certified §C
  mechanism, named follow-up P-R1); §B6 silhouette ✓.
- **rearleft 9.0** — rack + module read; 557 thin sight-lines are the
  honest class (defuse-era 631 at the same view); band as left.
- **rear 9.0** — the closest call, priced with measurement: the aft ring
  band reads 6490 px luma<12 (bbox 347×47 @ x790-1137, y267-314) — but
  the r17-state "before" render carries **6382 px in the same rect**
  (+1.7%): a CARRIED class from the ratified lineage, not an r18 growth,
  and the left-view band actually shrank (2830→2501). It parses as the
  under-bustle gap the real vehicle also shadows; uniform ink is the
  synthetic part → P-R1 is a MUST order. Everything else reads: rack
  rails + drops + duffel + cans + tarp, module louvres, whips, SEOSS
  ring; hull lattice band with the X ON it (certified identity tell) +
  flaps parity.
- **rearright 9.0** — mirror of rearleft; 230 sight-lines.
- **right 9.0** — mirror of left (band population equal to the digit,
  6597 vs 6569 raw strip counts).
- **frontright 9.0** — mirror of frontleft; 175 sight-lines.
- **top 9.2** — the 54° plan sweep V from shoulders (±1.58) to the
  embrasure reads exactly like the vehicle; deck FULL (contig 0; 443
  thin lines vs the print's 4735); panels at the real ±1.70 line; module
  / hatches / SEOSS / rack planform all legible; hull plan parity
  (97.56/97.39 rows byte-equal).
- **hero-frontleft 9.1** — the identity view: wedge + chamfer + panel
  courses + roof set compose as the photo class; skirt cliffs + wheels
  parity below; enclosed-sky 1.
- **hero-rearright 9.0** — rack at 4×: tarp roll with end caps, cans,
  frame drops, platform; M2 RWS receiver + barrel + bin read; module
  louvres crisp; the under-rack void shows box corners at 4× (band
  class, P-R1); enclosed-sky 0.
- **hero-toptilt 9.1** — prow line runs true down the wedge; sight hood
  recess visible; hatch rings + periscope glass; camo coherent across
  facets; rack + cans read; enclosed-sky 0.
- **close-front 9.0 — FLOOR CLASS (builder self-read 8.5 REFUTED UP)** —
  the wedge at maximum magnification is the round's proof: continuous
  plane shading, engraved seams + bosses, crisp prow, contained running
  gear below, fore-deck cluster with its r17 tells (lid disc + seam +
  hinge blocks). The dark zone: 2274 px luma<12 (bbox ~197×38 at the
  waist, 0.55% of the half-frame) + mid-grey box tops (left slab zone
  med 40.1 / p10 5.5; mantlet recess med 53.0) — the same §C
  mechanism-tier the RATIFIED defuse-recert floor certified at 9.0
  (~2100 px fill-corner class), and r18 is strictly better here: the
  dead-front black box is GONE, the fills hide behind the prow
  plan-cover, the lit-top tell is ~1 px at the official framing. Vs
  photo class the zone parses as the under-wedge/mantlet shadow pocket
  the real vehicle carries; its flat ink is P-R1's exact target.
- **close-roof 9.1** — hood walls + roof over the dark aperture +
  recessed glass read as the gunner's sight at 2×; plane planarity holds
  at 4×; periscope glass, module louvres, whip bases, rack top all
  identifiable; enclosed-sky 19.

## Residuals certified this round (none blocking)

1. **P-R1 (MUST, next dressing round — sharpens the packet's named
   follow-up)**: recess-steel/fill TONE PASS — the ring-band fills and
   under-wedge recess courses read flat ink (luma ~5.5) at 1×–4×:
   worst faces = the aft fill (rear view x790-1137), side band strips
   (p10 5.5), close-front slabs (med 40.1 zone). These are AUTHORED
   render-only meshes, not shadow reads (mixed-percentile zones — the
   DEEP-SHADE ALBEDO CLAMP does NOT bind the ink sub-population), so a
   dark-steel albedo + a TOP-FACE darkening term (the 2× lit-sliver
   tell at frontleft/close-front) is reachable. Target: band med toward
   the REF's own under-turret 25-57 range with structure, killing the
   box-corner reads at 2×–4×.
2. **P-R2 (polish)**: SEOSS head top face reads pale at front/hero
   views — tone to the sight-family (photo class: self-colored cover).
3. Whip antenna tips top the turret AABB at 2.700 (SEOSS anchor 2.66,
   RWS cap 2.633, mast 2.62) — thin-feature, dims-invisible (heightM
   actual 2.65 ✓); note for icon-framing/probe consumers only.
4. Front embrasure pocket asymmetry (left 840 px ink vs lighter right) —
   panel-end geometry, parses as lighting at 1×; rides P-R1.
5. Top-view outer-column fender read (evaluator Δbot −1.17 @ x ±1.98,
   proc fender line 3.25 vs print 2.08) — pre-existing hull parity
   class, byte-equal rows since r17, gate-priced invisible (plan rows
   97+); no order.
6. procShadow_gun proxy z→7.6 (+1.6 m past muzzle) — carried
   fleet-class residual, mask-excluded, render-invisible in all 14
   views; family LOD true-up queued (packet).
7. The §B7 cap rows stand until the queued ORACLE-EXCISION round
   (orchestrator §E lane) — RECOMMENDED, echoing the packet: the wing
   swarm drop frees ~11 plan columns and the cap shrinks to genuine
   real-vs-print divergence.

## Law discoveries (for the bank)

- **§B7 CARRIED-CLASS SEVERITY ANCHOR**: in an owner ref-wrong re-author,
  photo-class scoring applies to the re-authored region; RESIDUAL CLASSES
  CARRIED from the ratified lineage keep their ratified severity — the
  critic prices them by DELTA (same-rect before/after measurement), not
  by fresh-eyes shock. The r18 rear band read +1.7% vs the r17 state
  (6382→6490 px) and the left band SHRANK (2830→2501): carried, not
  grown; re-litigating it below the ratified 9.0 would be calibration
  drift, not honesty.
- **SHADOW-FILL LIT-TOP TERM (sharpens the packet's law 6)**: fills
  hidden in plan can still catch the key light along their TOP faces
  from elevated scored cameras (~1 px @1×, legible at 2×) — the §C
  exposure audit must include top-face slivers, and fill tone passes
  must include a top-face darkening term, not only vertical faces.
- **BUILDER SELF-READ CALIBRATION IS NOT THE BAR**: the r18 builder
  self-read 13/14 views below 9.0 while every named read decodes to
  certified-tier classes; the ratified precedent verdicts (defuse-recert
  here, chieftain5 fleet-wide) are the severity anchor — critics
  adjudicate against them with measurements, in both directions.
- Enclosed-sky flood baselines re-derived for the r18 config (label-band
  excluded, blue-signature term): front 486 / frontleft 58 / left 66 /
  rearleft 557 / rear 5 / rearright 230 / right 81 / frontright 175 /
  top 443 / hero-fl 1 / hero-rr 0 / toptilt 0 / close-front 16 /
  close-roof 19. Banked numbers re-derive before re-use (§D).

## Verdict

**RE-CERT PASS (re-freeze ce7f3824)** — floor 9.0 (close-front /
band-class views), highs 9.2 (top) / 9.1 (front, hero-fl, toptilt,
close-roof), mean **9.04**. All seven standing checks land exactly on
the packet's close battery; the hull rows prove the uncontested region
untouched; the §J yaw pair at the verdict hash proves §B5 unity of the
entire new mass. The owner's ruling is delivered: this turret reads as
the real Rheinmetall MBT Revolution at 1×, 2× and 4×, and the wrong
print no longer steers a single visible surface. P-R1 (fill/recess tone
pass with the top-face term) and P-R2 ride the next dressing round,
non-blocking; the queued §E wing-excision round then shrinks the §B7
cap to the honest real-vs-print residue.
