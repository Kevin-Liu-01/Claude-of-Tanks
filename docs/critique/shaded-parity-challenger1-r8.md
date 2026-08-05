# challenger1 shaded-parity r8 — independent critic, SECOND adjudication (2026-08-05)

Bytes and rig integrity, verified by me this round:
- `tmp-hashgeo` challenger1 = **e686ddb6** (59 meshes / 92 256 verts) at
  round START and END — no drift; matches the tone-round landing (9062a07).
  Family watch at both ends: chieftain5 graduate **5117b9a8**, centurion3
  **ac63e6d8**, centurion5 **2395a924** — all EXACT (the two centurions on
  their own tone-round bytes).
- `node tools/geometry-gate.mjs --ids=challenger1` **×2: min 90.2 PASS
  both, identical lines** (hull 91.9 / whole 90.2 / turret 90.3 / stations
  90.6 / dims 95 / floaters 100) — the tone round's 90.1→90.2 uplift is
  real and reproduced. Priced headroom for orders: **whole 0.2, turret
  0.3, stations 0.6, hull 1.9.**
- `tank-standard-check`: PASS (clip 0/0 exact ✓, contig 0 ✓, mg1+0d ✓).
- `turret-parent-audit`: stranded 0 / abutting 0 / dangling 0 (the MAG
  re-pose landed inside `turretG` — correct §B5 bucket).
- `track-clip-audit --exact`: front 0 / rear 0.
- Official rigs, fresh this round (FIFO ticket honored):
  `tmp-tank-critic --id=challenger1` → shots/critic-challenger1/ (14
  pairs, zero console errors);
  `visual-evaluator --id=challenger1` → shots/visual-eval-challenger1/
  (camoSeed 4242). **RIG PARITY OK — no RIG MISMATCH: max yawProxy 2.1°
  @rear, all others ≤1.6°, max |dCentroid| 0.069 m.** Scoring valid.
- Tone/sky numbers: tools/tmp-cr1-r8-tone.py (ITU-601 luma rects,
  re-deriving every r7 window fresh) + tmp-cr1-r8-voidcheck.py
  (mask-method + blue-signature flood/components per §D). Zoom crops
  (shots/critic-challenger1/crops-r8/, tmp-cr1-r8-crops*.py) are
  diagnosis-only; every claim below cites official-render rects or
  evaluator numbers.

## HEADLINE: **FAIL — floor 7.0, mean 7.4.** Floors: view-left 7.0, view-right 7.0, close-roof 7.0. r7 was floor 5.5 / mean 6.3 — floors +1.5, mean +1.1, the hidden-gear identity class is DEAD.

front 8.0 · frontleft 7.5 · left 7.0 · rearleft 7.5 · rear 7.5 ·
rearright 7.5 · right 7.0 · frontright 7.5 · top 7.5 · hero-fl 7.5 ·
hero-rr 7.5 · hero-toptilt 7.5 · close-front 7.5 · close-roof 7.0

The tone round did what it claimed where it claimed it: every r7 luma
window I re-derived lands in or at the ref band (§1), the sealed black
gear band is gone on both sides, all eight blue chips are dead, the
sand/warm-grey fittings family is olive, and the wrap chevron clouds are
structured toned track. What keeps the verdict under 9.0 is one
half-delivered order and a residual family: the opened gear windows read
as FLAT PALE PANELS, not wheel discs (no rim/hub/tire structure, no
inter-wheel shadow — proc band p5 51.2 vs ref 25.8), the re-posed MAG
reads only as a faint plan line (the ref presents its GPMG boldly in
5+ views), the left glacis half still masks out near-black in plan, the
new flap/strap parts frame one genuine 141-px sky pocket at the bow ramp
in close-roof, and a small real-angle family (±0.2..0.8° noise bands)
sits on the sight hood, collar→sleeve line, and right crown courses.

## 1. r7 order verification (all re-measured on MY fresh pairs)

- **O1 EXPOSE THE GEAR — DELIVERED AS TONE, HALF-DELIVERED AS READ.**
  The continuous board wall is slatted: upper course row + five hanger
  straps, six windows at wheel stations, both sides. Left gear band rect
  (850,360)..(1010,390): mean **62.1** p5 51.2 p95 73.2 (r7 slit read
  15.0/p5≈7; ref band (210,360)..(370,390) = 52.6 [25.8..62.5]); the r7
  slit rect itself 55.6. Right band 58.3 vs ref 47.8. Luma profile along
  y368..377 confirms 6-window/5-strap periodicity at wheel rhythm.
  The idler disc articulates at the bow (left-bow crop — spoked/dished
  disc visible inside the toned wrap). BUT at 6× the windows read as
  flat pale rectangles: no tire annulus, no hub dot, no dish shading, no
  inter-wheel tangency shadow — the ref's disc signature (p5 25.8 dark
  gaps between pale discs) is absent (proc p5 51.2), and the band runs
  +9.5 luma hot with p95 73.2 above the ordered 26..70 envelope (§C
  overshoot note). The r7 order's "dished wheel faces + rim/hub
  contrast" clause is the unshipped half → O1 below.
- **O2 WRAP TONE — DELIVERED.** Front corner rects (742,420)..(817,540)
  / (1102,420)..(1177,540): **51.6/51.5** min 26 (r7: 31.3 with min 1);
  rear corners **56.3/56.2 vs ref 57.0/57.4 — parity, dead.** The ragged
  black chevron clouds are gone at both ends (left-bow/left-tail crops:
  structured pads + chain in the olive family, mudded faces).
- **O3 MUD FLAPS ×4 — DELIVERED IN-SILHOUETTE with the documented
  residual.** Panels read through the comb gaps and around the arc at
  all four corners (front-bottom/rear-bottom/left-bow crops); clip 0/0
  exact ×my audit. Dead-front the corners still read as toned track
  ladders over the panel, not the ref's clean flap rectangles — front
  residual −12.7 luma (51.6 vs 64.3) exactly as the packet priced it.
  Rear corners reach full parity. (Acceptance offer in §4.)
- **O4 PALETTE — DELIVERED, ALL WINDOWS.** (a) TOGS body rect
  (760,155)..(810,200): rgb (45,48,37) **g−r +3.1**, luma 45.5 vs ref
  ctx 43.2 g−r +3.3 — sand hue dead, feature kept. (b) Travel-lock/
  glacis box (908,310)..(1010,360): (55,58,47) g−r +3.8 vs ref ctx 52.0
  — warm-grey dead (+3.9 lit-face residual, benign). (c) ALL 8 blue
  chips: five clusters re-measured, b−r **−3.0..−5.3** (r7: +12..+22)
  — the blue family is dead; chips now read pale-olive glass.
  (d) Plank (1060,280)..(1110,292): 58.9 vs box ctx 52.5 vs ref bustle
  ctx 55.5 — the +27.5 pop is now +6.4, inside ref variation.
- **O5 WEAPON/BUSTLE — PARTIAL.** (a) MAG re-posed to left rear roof
  (turret-local (−0.42,0.56,−0.58) yaw 0.62, `turretG`, census mg1);
  verified in plan: dark receiver+barrel line across the pale crown at
  frame (924..996, 154..166) view-top — but the read is FAINT at 1× and
  NO other view presents a legible weapon (barrel deliberately under
  the 0.878-plateau cover; close-roof/quarters/orthos show nothing,
  while the REF presents its GPMG prominently at the crown in
  rear/rearright/rr-bustle crops). Two costlier poses honestly withdrawn
  per the packet (−0.8..−1.7 gate pts) — the staging discipline is
  right; the parity gap stands → O3 below. (b) Smoke banks: tube-cap
  rows resolve (front view: slatted bank faces; crate read broken) but
  the ref's angled tube clusters with circular muzzles still read a
  class finer. (c) Bustle straps: hump-face + cloth straps break the
  box faces (rr-bustle crop); stack still reads crates-with-straps vs
  the ref's rail-and-mesh basketry. (d) Ring fitting: bridged onto a
  base pad at the right lift eye — the r7 floater read is dead.
- **O6 REAR-QUARTER PLAN — DELIVERED AS SCOPED.** Cover strips read
  over z −2.28..−3.10 (top-tail crop); the z<−3.10 lane stays open with
  exposed ladder rungs at both tail corners exactly as the packet
  reported (mask-positive lane, honestly not chased). The ref quarter
  reads covered to the tail → residual priced in top/heroes.
- **SHOULD (plinth highlight) — DELIVERED.** The dead-front split-face
  triangle is calmed by the flush course strip (close-front/cf-turretband
  crops); no staircase read introduced (§B1 note below).

## 2. Per-view scores (bar ≥9.0 every view; §D numbers cited; r7 in parens)

| # | view | /10 | justification |
|---|------|-----|----------------|
| 1 | front (7.0) | 8.0 | Strongest view. 31 matched edges (1 flagged, worst Δ−7.2° ±0.4° len 0.29 m @ (−0.89, 2.58..2.88) sight-block edge — unchanged r7 class), p95 Δtop 0.277 m (mast columns), yawProxy 1.6°. Delivered: corners toned (51.6/51.5 min 26 vs r7 31.3 min 1), TOGS/travel-lock g-dominant, 8 chips dead, smoke banks slatted, root masses dark per ref's own shadow zone, headlights read as equipment. Holds: corner LADDER-over-panel read vs ref's clean flap rectangles (−12.7 luma residual); gun sleeve mass still slimmer than the ref's fat sleeve; smoke tube circles absent (ref presents angled clusters); ref belly V 6.2°/173.8° vs proc flat 0° (unmatched-edge class, minor at this band). |
| 2 | frontleft (6.5) | 7.5 | Gear window open at parity tone; wrap toned; root boxes dark; chips dead. 22 matched (10 flagged — the ≤0.42 m corner-bias family at printed ±4°, no-finding; worst real Δ+5.1° ±0.7° len 0.67 m crown course @ z 1.32..1.63). Holds: window flat-panel read (no discs); course striping (skirt top / board top / edge roll); boxy cheek masses vs ref's cleaner wedge. |
| 3 | left (5.5) | 7.0 | FLOOR. Identity CURED as a class: band at (850,360)..(1010,390) mean 62.1 [p5 51.2] vs ref 52.6 [p5 25.8]; 6-window/5-strap wheel rhythm; idler disc reads at the bow; sprocket ramp toned; §B6 trapezoid articulates both ends. Holds: windows read as FLAT PALE PANELS — no rim/hub/dish, no inter-wheel shadow (p5 51.2 vs 25.8 is the numeric signature), band +9.5 hot with p95 73.2 over the ordered envelope; ref wrap arc r2.23 span 70° unmatched (chord-limit class, no order); real Δ−3.5° ±0.6° len 0.63 crown line @ z 1.78..2.34. Chieftain r5 precedent gave 7.5 for genuine half-exposed DISCS; the flat-panel read grades a half below. |
| 4 | rearleft (6.0) | 7.5 | The skeletal quarter read is DEAD: composed quarter, toned wrap, straps on bustle (rl-quarter crop). 33 matched, p95 Δtop 0.420 m = the tool's own vertical-edge cliff-offset family (annotated). Holds: window panel read; bustle crates-with-straps vs basketry; NO weapon read where the ref presents its GPMG; ref rear-wrap arcs r1.22/r1.74 unmatched (chord-limit class). |
| 5 | rear (6.5) | 7.5 | Best edge count (39 matched, 2 flagged, worst Δ−5.5° ±0.4° len 0.28); corners at PARITY (56.3/56.2 vs 57.0/57.4); ring fitting bridged; plank pop dead; chips dead. Holds: lower rear plate bare vs the ref's exhaust/cable clutter (r7 dock, O6-optional not delivered); bustle crate read; no MG (ref shows one); corner ladder-vs-panel structure. |
| 6 | rearright (6.0) | 7.5 | TOGS rear mass olive at parity; plank 58.9 vs ctx 52.5 (dead); quarter composed. Holds: real right-crown course flags — Δ−7.3° ±0.5° len 0.78 @ (z 1.99..2.41, y 2.21) proc level vs ref falling 8.2°; procOnly muzzle half-arc r0.34 span 169.8° @ (z 4.22..4.53) (bore-disc echo, benign); bustle/no-MG/window family as rearleft. |
| 7 | right (5.5) | 7.0 | FLOOR. Mirror of left: band 58.3 vs ref 47.8, same flat-panel windows, same rhythm; idler wrap climbs per §B6. Real Δ−9.1° ±0.6° len 0.51 fender line @ (z 2.75..3.36, y 1.73) — proc runs level where ref rises (the course-strip break class); Δ−13.1° ±4° noise-band corner flags ignored per §D calibration. |
| 8 | frontright (6.5) | 7.5 | Mirror of frontleft. Real Δ−11° ±0.8° len 0.38 bustle-top line @ (z −0.87..−0.61, y 2.00) proc level vs ref rising 7.3° (right crown-course family, ordered); window/cheek/striping holds as frontleft. |
| 9 | top (6.5) | 7.5 | Plan palette UNIFIED (plank/NBC deck patches dead); O6 strips cover z −2.28..−3.10; MAG reads as a dark line on the crown (the §B3 plan read); §B2 machine 0. Holds: left glacis half masks out near-black — evaluator Δbot +1.133 m @ x −0.94 + the 89.2° vs 74.6° mask-cut edge are the instrument echo of TONE, not geometry (r7-certified geometry class, now ordered as tone O4); z<−3.10 ladder rungs both tail quarters vs ref's covered read; deck course-line patchwork vs ref's cleaner plates. Δbot −2.895 @ x 0.12 = gun-tube cliff class (annotated, no order). |
| 10 | hero-frontleft (6.5) | 7.5 | Genuinely CR1 in the garage view: open gear band, toned wraps, unified palette, one-rake glacis, 11.5 m proportion. Holds: windows pop pale at hero angle (panel read); three-stripe fender line; boxy turret masses; ref fender-line arc/edge unmatched (r7 class). |
| 11 | hero-rearright (6.5) | 7.5 | Ramp + sprocket articulate; tail composed; straps read; TOGS olive. The 0.002 m² void flag re-verified THIS round: 5-px sliver class only (voidcheck — label-speckle aside, nothing enclosed beyond r7's projection sliver). Holds: bustle crates, no MG at the crown (ref presents it here), tail rungs, wrap-shoe tone slightly busier than ref's smooth band. |
| 12 | hero-toptilt (6.5) | 7.5 | Deck filled at 55° (§B2 clean); crown asymmetry + TOGS + NBC compose; palette unified; MAG line faintly present. Holds: course-line patchwork; tail rungs; large empty camo fields between clean boxes vs ref's porthole/bolt detail; worst real Δ+7.2° ±0.6° len 0.56 bin-course edge @ (~x −1.32..−1.16, z 2.38..2.82) (unchanged r7 class). |
| 13 | close-front (6.0) | 7.5 | §B1 money view HOLDS at close range: glacis one plate, bow guard co-planar, plinth highlight calmed by the course strip (no staircase read); root masses dark; chips dead; collar+segmented sleeve+MRS read. Holds: corner ladder-over-panel at close range (the documented O3 residual, most visible here); smoke tube circles absent; real Δ+14° ±0.5° len 0.67 collar→sleeve upper line @ (z 3.77..4.04, y 2.09..2.19); whip lean Δ−18.5° ±0.2° len 0.95 @ (z 1.72..2.26, y 3.19..3.63) — mast class, SHOULD; face rake Δ−3.1° ±0.1° on the 3.43 m upper-left edge persists (sub-order, noted r7). |
| 14 | close-roof (6.5) | 7.0 | FLOOR. Crown palette unified; smoke caps resolve from above; plank fixed; TOGS/NBC stations hold. Docked: **the one REAL §B2 finding this round — a 141-px enclosed sky pocket** at the bow ramp triangle (world ~(0.86,0.34,2.94), voidcheck components; the r7 same-coordinate flag was open background — the new flap/strap parts now ring it); NO weapon read at the crown (the MAG barrel hides under the plateau cover from exactly this view; the ref's GPMG is loud here); large empty camo fields; real Δ−14.7° ±0.4° len 0.42 sight-hood rake @ (z 2.15..2.67, y 2.65..2.84) + Δ−6.1° ±0.2° len 1.21 upper-rear line @ (z −1.12..−0.55). |

Mean 7.4 (104/14); floors 7.0 ×3. FAIL.

## 3. Standing checks (§B + §D + §H.4)

- **§B1 front slopes + NO-STAIRCASES + SLOPE-MOTIVATES-THE-MASS: PASS —
  re-verified post-tone-round.** Glacis still ONE raked plate at 6×; bow
  guard course co-planar; the NEW course strip along the plinth
  split-face line reads as a real course line with flush joints (not a
  quantization step); crown asymmetry still motivates the right roof;
  none of the new parts (straps, flaps, backers, caps, cover strips)
  introduces a stepped slope or a box corner poking past a raked face.
  Turret leading edge Δ−3.1° ±0.1° vs ref — within tier (unchanged).
- **§B2 contiguity/holes: PASS with ONE small new finding (ordered).**
  Machine contig 0. Evaluator flags re-adjudicated on MY renders with
  the §D mask-method + blue-signature flood (tmp-cr1-r8-voidcheck.py):
  hero-rr 0.002 m² = 5-px sliver (r7 class, benign); close-roof
  0.055 m² = **141-px genuinely enclosed sky** at the bow ramp triangle
  — framed by idler, hanger strap, backer edge and shoe run since the
  tone round (r7's same-coordinate flag was open background). Single
  view, corner class, zero-price fix (O2). No sky reads through hull or
  turret interior in any of 14 views. Border clips reported separately
  by the tool — none ordered (§D law).
- **§B3 decoration + NO-MYSTERY-BOXES (new standing check): census PASS
  (mg1+0d), MG READ partial (O3), mystery-box sweep PASS-with-notes.**
  At 1× I find no unidentifiable bare cuboid hovering at mantlet/gun
  root/armor faces: the r7 offenders are cured by rebucket/retone (root
  masses read as the ref's own dark gunmetal shadow zone; TOGS carries
  its barbette identity; headlights read as twin-lens clusters; bins
  carry lid seams + straps; smoke banks carry slatted tube faces; the
  glacis travel-lock box is olive and low). Close-range polish (sight
  windows/latches faint, tube circles absent) is priced inside O5/O6,
  not a standing-check failure.
- **§B4 containment: PASS.** 0/0 exact my run; wraps clear bow wings
  and tail at 4-6× (left-bow/left-tail/void crops).
- **§B5 turret parenting: PASS.** 0/0/0 my run; the MAG re-pose landed
  in `turretG` (source verified, uk.js ~line 1643); straps/flaps/backers
  hull-side. Yaw-pair render not re-run (rest-pose audit + tone-round
  gate ×2 carried; no re-parents this round).
- **§B6 track trapezoid: PASS.** \\________/ both ends; front ramp into
  the raised idler articulates with the DISC now reading inside the
  toned wrap (left-bow crop); rear ramp into the sprocket clean
  (left-tail crop). The r7 wrap-tone order is delivered; no
  parallelogram read anywhere.
- **§D discipline:** official rigs only, fresh, my own runs; RIG PARITY
  OK 14/14; every tone claim carries ITU-601 rects re-derived THIS round
  (no banked numbers reused); every angle claim cites the evaluator
  Δ ± noise band and is dropped as no-finding when inside the printed
  ±4° corner-bias floor; sky claims use mask-method + blue-signature;
  border-clip law honored; the top-view Δbot +1.133 is adjudicated as
  the certified dark-glacis TONE echo, not geometry (r7 precedent,
  re-confirmed visually in top-bow crop — faint dark geometry present).
- **§H.4 VARIANT-DISTINCTIVENESS (boards hash-verified this round:
  chieftain5 5117b9a8 Aug-4 graduate board; centurion3 ac63e6d8 +
  centurion5 2395a924 fresh tone-round boards): PASS, tells verified on
  current pixels.** Garage-glance: (1) Chobham slab-wedge turret with
  commander-high/loader-low crown vs chieftain5's rounded brow casting
  vs the centurions' basket bustles; (2) TOGS barbette beside the gun —
  no sibling carries one; (3) full-length skirt + slatted board layer
  with strap windows vs chieftain5's full exposed discs and centurion5's
  hem-split discs — the r7 caveat is RESOLVED: the flank tell is now a
  legitimate kit read, not the black-wall defect; (4) fat-collared
  segmented L11 + MRS vs centurion L7 classes; (5) stacked square bustle
  + tall kneed whips. UK lineage reads distinct at a glance.

## 4. Certified / no-order ledger (checked present, correctly NOT chased)

- side_whole wrap-zone bottoms z 3.46..3.98 padHug coupling — orchestrator
  lane, unchanged; orders below stay fenced off the band.
- plan rear lip cols ±0.31..0.73 @ −4.16 dims-priced tail anchor — cert
  holds.
- muzzle ridge/valley ±0.03 alternation; st0 wPct trim; hullLengthM
  stylization under dims 95 — packet certs, verified unchanged.
- Wrap-arc pairing (ref r1.2..2.8 arcs unmatched in 8 views): radius-
  authored running-gear class accepted per the chieftain graduation
  precedent (chord-limit law) — shading orders only, never silhouette.
- Mast/whip Δtop columns (left/right +0.65/+0.66 @ z −0.82/−1.06, close
  crops +0.4..+0.7): ≤2 side columns per side, gate heightM budget
  passed; close-view entries are the back-projection crop-artifact class
  (r4/r7 treatment). Whip LEAN angle ordered as SHOULD only.
- top Δbot −2.895 @ x 0.12 (gun tube) + all "at vertical edge — cliff
  offset" digest entries: tool-annotated cliff class, no orders.
- front belly V (ref 6.2°/173.8° vs proc 0°, unmatched-edge class, y
  0.40..0.46 band): logged; sub-visible at 1× behind the wrap comb —
  no order this round, re-check after O1 (chieftain O4d precedent says
  cheap if a round ever needs it).
- yawProxy 1.6°/2.1° = ref's own skew, far under the 10° abort.

## 5. Orders — grouped by driver (gate-priced; whole 90.2 = 0.2 headroom is the wall)

Gate-hold binds every order: any geometry edit re-gates ≥90 all
components ×2 on final bytes, clip 0/0, holes 0, §B5 0/0/0, byte-stable
siblings (chieftain5/centurion3/centurion5 re-hash EXACT), and
invalidates this verdict per §G.

**O1 — DISC STRUCTURE IN THE WINDOWS** (material + /shadow/ lane,
gate-free; clears both 7.0 side floors and lifts all four quarters +
both heroes). The windows are open at parity luma but read as flat
panels. Deliver the r7 order's unshipped half: (a) tire annulus dark
(0x2c-class) ringing each pale disc face, hub dot dark, dish shading so
the face reads dished at 6×; (b) inter-wheel/backer shadow depth — pull
window p5 toward the ref's 25.8 band via the render-only /shadow/
backer lane (banked law 4, zero gate price; thread clip-audit
envelopes); (c) dial the band overshoot back: mean 62.1→~53, p95 73.2→
≤70 (the §C overshoot law — the ORDERED class is the ref's 26..70).
Verify with the r8 rects + the y368..377 oscillation profile
(tmp-cr1-r8-tone.py / -crops2.py reproduce both).

**O2 — RAMP-BAY BACKER** (render-only /shadow/ mesh, zero-price lane;
kills the one §B2 finding). Close-roof shows a 141-px enclosed sky
pocket at the bow ramp triangle, world ~(0.86, 0.34, 2.94) — the bay
past the last backer (z 3.06). Extend/add a dark backer behind the
idler-to-run triangle BOTH sides (mirror before it's found the same
way); re-run tmp-cr1-r8-voidcheck.py → enclosed components must drop to
label-speckle only; clip audit envelopes threaded per banked law 4.

**O3 — MG LEGIBLE READ** (fittings, ≤0.4 pintle allowance, staged §C
per banked law 3). The landed pose censuses and paints one faint plan
line; the ref presents its GPMG prominently at the crown in 5+ views.
Deliver ONE unambiguous receiver-mass + barrel-line read at 1× in at
least close-roof or hero-toptilt: (a) raise/yaw within the plateau
cover's shadow so the barrel run stays spanned in the priced views'
projections (stage pose candidates against plan_turret/side rows, the
withdrawn-poses ledger shows the method); (b) if no pose survives the
0.2 wall, execute the r7 fallback — commander-cupola station variant
(real CR1 carry) priced against front columns — and report the trade.
"Census-passes but reads nowhere" does not meet §B3 at tier.

**O4 — GLACIS-PLAN TONE** (material/map-domain, gate-free). The left
glacis half reads near-black in plan (top-bow crop; evaluator Δbot
+1.133 m @ x −0.94 + the 89.2°-vs-74.6° mask-cut edge are the
instrument's echo of the same tone hole). Lift the top-face read out of
the mask floor (the c3 deckEq/map-domain chain is the family recipe) so
the plan nose reads lit both sides of the tube like the ref's. Kills
two digest lines and the top-view dock in one move.

**O5 — BUSTLE + TAIL READS** (fittings/tone). (a) Second basketry pass:
strengthen the rail-vs-canvas split so the stack reads basket-on-rails,
not crates-with-straps (rr-bustle crop vs ref basketry). (b) Lower rear
plate: the ref's exhaust/cable clutter is a strong rear tell — KIT
pipework/cable dressing inside the hull AABB (§C framing), the O6-
optional item from r7 now ordered. (c) OPTIONAL same-driver: smoke tube
circular muzzle faces (the ref's angled-cluster read) if a cheap
cluster-transform variant exists; slats already broke the crate read.

**O6 — SMALL REAL-ANGLE FAMILY** (priced geometry, vertex-workorder
staging, all ≤0.78 m edges; if a column refuses, document per the
chieftain O4 precedent). (a) Forward sight-hood top rake: Δ−14.7° ±0.4°
len 0.42 @ (z 2.15..2.67, y 2.65..2.84) close-roof. (b) Collar→sleeve
upper line: Δ+14° ±0.5° len 0.67 @ (z 3.77..4.04, y 2.09..2.19)
close-front — mind the gate-priced gun columns (banked law 2: never
extend the tip plane). (c) Right crown-course pair: Δ−11° ±0.8° len
0.38 @ (z −0.87..−0.61) frontright + Δ−7.3° ±0.5° len 0.78 @ (z
1.99..2.41) rearright — proc runs level where the ref falls/rises.
SHOULD: whip lean toward the ref rake (close-front Δ−18.5° ±0.2° len
0.95, mast class); the fender-line level run (right Δ−9.1° ±0.6° len
0.51 @ z 2.75..3.36) rides the same course-strip family — take it only
if the rows allow.

**ACCEPTANCE OFFER — corner flap read**: the dead-front ladder-over-
panel residual (front corners 51.6 vs ref 64.3; the packet's
"geometrically unreachable behind our wrap" argument) may be CERTIFIED
in the packet with the rects and the wrap-geometry argument — on
certification the critic stops pricing it (its dock here is already
modest and non-floor-setting). Uncertified, it keeps costing front/
close-front half-grades.

## 6. Honest positives (carry forward)

The r7→r8 arc executed the verdict faithfully: every one of the six
order families moved, five landed measurably in their windows, gate
+0.1 while doing it, and the two poses/rails that would have cost
silhouette were withdrawn with the costs documented — that is exactly
the staging discipline §C asks for. The hidden-gear class that set
three UK verdicts' floors is dead program-wide on this tank: window
tone at parity, wheel-rhythm periodicity, idler disc articulating,
wraps structured and toned, corners at rear-parity. All machine gates
green ×2 on stable bytes; §B1 survives 6× zoom after new-part
insertion; §H.4 tells now stand on legitimate kit. The remaining
distance to 9.0 is concentrated, named, and mostly in the gate-free
lanes (disc faces, backers, plan tone, basketry) plus one fittings
order (MG) and a small priced angle family — the same shape as
chieftain5's r5→r6 closing round.

## 7. Calibration note

Anchored to the ratified chieftain5 trajectory: r4 5.0/6.4 → (orders
delivered) → r5 7.0/7.5 → r6 9.0+ graduate. challenger1: r7 5.5/6.3 →
(orders delivered, one half) → r8 **7.0/7.4**. The floors land +1.5
(not chieftain's +2.0) because chieftain's O1 delivered genuine
half-exposed DISCS where challenger's windows read flat panels — the
disc-identity clause is the difference, priced consistently (its left
7.5 vs my 7.0). The builder's own self-read (~+2 on the 5.5 floors)
was honest and nearly right; the gap between 7.4 and their expectation
is the flat-panel read + the new ramp-bay pocket, both cheap. FAIL is
the correct headline at a 9.0-every-view bar; the trajectory matches
the family's graduation path exactly one round behind.

## 8. Evidence

- shots/critic-challenger1/ (14 fresh pairs, hash e686ddb6, zero console
  errors) + crops-r8/ (gear zooms, MG hunts ×6 views, smoke, flaps,
  corners, top bow/tail, void, §H.4 pulls)
- shots/visual-eval-challenger1/ (report.json + overlays, camoSeed 4242)
- tools/tmp-cr1-r8-tone.py (every luma/rgb rect above reproduces),
  tmp-cr1-r8-crops.py / -crops2.py (disc oscillation profile) /
  -crops3.py / -crops4.py, tmp-cr1-r8-voidcheck.py (§B2 flood +
  components)
- Machine (all my runs this round): gate ×2 identical PASS lines,
  standard-check PASS, track-clip 0/0 exact, turret-parent 0/0/0,
  hashgeo ×2 (start/end) with three siblings EXACT
- Sibling boards: shots/critic-chieftain5/ (graduate bytes),
  shots/critic-centurion3/, shots/critic-centurion5/ (tone-round bytes,
  hashes re-verified this round)
