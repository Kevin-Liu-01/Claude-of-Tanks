# m46_patton shaded-parity r7 — SECOND ADJUDICATION (2026-08-04, post-a93141a)

Rig: fresh 14 pairs `node tools/tmp-tank-critic.mjs --id=m46_patton` →
shots/critic-m46_patton/ (15:50:56 batch, vite :7463, zero console errors)
+ `visual-evaluator --id=m46_patton` (15:51:10, exit 0, **RIG PARITY OK**,
max yawProxy 1.0° @frontleft/frontright, |dCentroid| 0.061 m — the r5
numbers exactly; camoSeed 4242, evidence shots/visual-eval-m46_patton/).

BYTE-STABILITY BRACKET: m46 geometry hash **99a3b0b4** (86 meshes /
90 250 verts, packet-exact) BEFORE renders, mid-round, and at evidence
close (16:06) — patton.js/kit.js byte-identical to the r7 landing a93141a
across the whole window. HEAD moved a93141a → 571ea39 mid-round
(docs-only: the leo2_revolution r9 verdict file; `git diff --stat` proves
no src touch). Family bracket: m47 **f02ef936 FROZEN** (verified ×3 —
the concurrent r8 builder had NOT landed patton.js edits in my window),
graduates m60a1 **81e69e34** / m60a3 **efcde5c4** packet-exact,
do-not-gate respected.

ALBEDO-LANE DRIFT (the brief's live caution, MEASURED): src/vehicles/
materials.js + modern3.js carry UNCOMMITTED albedo-agent edits (mtimes
15:53, AFTER my whole render batch; tankFactory.js 12:08, before it). My
14 pairs are ONE internally-consistent state, but the REF half reads
**+4–5L brighter** than the builder's r7 archives on identical windows
(A1 ref med 63.2 → 68.5, p5 51.4 → 58.7; A3 ref med 62.8 → 67.3/67.0;
A5 ref med 58.6 → 61.3) while the PROC half is pixel-stable (identical
lit-pixel counts every window; A1 med 66.6 → 66.8, A3 60.0/60.1 EXACT;
only the A2 wheel band moved +2L). Archive numbers re-derived myself on
shots/patton-r7/ — they reproduce the builder's claims exactly. Where an
ordered done-gate was REF-RELATIVE, I credit delivery on the verified
committed-state archive and score the view on MY renders, logging the
moved target as albedo-lane (not builder debt). m47 §H.4 pairs
(shots/critic-m47_patton/) were re-stamped 15:58 by the live r8 builder
(post-albedo state) — used READ-ONLY for structural tells, never tone.

Official gate re-run on my watch: **91.1 PASS ×2 bit-identical** (hull
91.9 / whole 91.8 / turret 91.1 / stations 92.5 / dims 100 / floaters
100) — reproduces the r7 packet line to the decimal. Razor: turret 1.1 /
hull 1.9 / whole 1.8 / stations 2.5. `tank-standard-check`: clip **0/0 ✓**,
contig **0 ✓**, decor **mg1+2d ✓** (the r5 mg1+0d bareness finding is
closed). `track-clip-audit --exact` 0/0 ✓. `turret-parent-audit` stranded
0 / abutting 0 / dangling 0 ✓. Measurements: banked scanners
(tools/tmp-r7-merkava.py, tmp-r6-m47.py, tmp-m46r5crit-scan.py) on MY
fresh pairs; zoom crops from the captured batch, diagnosis-only
(scratchpad). All r5-window numbers re-derived this round.

## HEADLINE: FAIL — floor 8.8 (hero-toptilt), mean 8.91, ceiling 9.0
(front/left/right AT the bar); every r5 order (A1–A6, B1–B2, C1/C2/C3/
C4-tone/C5, D) verified DELIVERED on its window, zero regressions, the
r5 floor view moved 8.2 → 8.9 — the asset-tier driver (r3-class black
gear + grey-LEGO M2) is measured DEAD; what remains is the banked
DECK-FIELD faintness (frozen usKit lane — now the floor holder and a
scheduling item), the banked C4 corner verticals, a cloth-slab rack
read, curtain-leg segmentation at the closes, and the roof facet family

front 9.0 · frontleft 8.9 · left 9.0 · rearleft 8.9 · rear 8.9 ·
rearright 8.9 · right 9.0 · frontright 8.9 · top 8.9 · hero-fl 8.9 ·
hero-rr 8.9 · toptilt 8.8 · close-front 8.9 · close-roof 8.9

Every view up 0.3–0.7 on r5, no view down. IDENTITY never in doubt, now
including the A6 identity piece: the TENSION IDLER reads as a distinct
painted wheel with pale end-rings and a real wrap dip at 1× in left,
right AND rearleft (crop-verified both sides; the r5 "drowns in the
black band" read is dead).

## r5-order delivery verification (every claim re-measured on MY pairs)

- **A1 ✓ (the floor-mover, dead)**: view-left [60..580]×[358..427] proc
  sub-30 census **0** (r5: 7481; bar ≤300; ref 0), p5 **54.1** (bar ≥35;
  builder claim 54.1 EXACT), med 66.8 (Δ1.7 vs my ref 68.5 — bar 6L),
  sd 6.92 (≤ ref+4 = 10.76), p95 75.8 ≤ ref+4 (83.1). The bimodal
  black-vs-lit histogram is gone — one paint family.
- **N1 pre-priced ✓**: hero-rr gear r/g **1.002** (bar ≤1.01) vs own hull
  0.967 → split **0.035** vs the REF'S OWN split 0.062 on the same
  windows (gear 1.032 / hull 0.970) — matched in kind, no tan. (Ref gear
  hue warmed with the albedo drift; proc bar met regardless.)
- **A2 ✓**: view-left wheel band [170..380]×[380..416] p75 **73.6** (bar
  ≥66; builder 72.5 + the +2L albedo touch), med 69.5 vs ref 66.6, p95
  75.5 ≤ ref+4 (78.5). Flat-disc census (sd<3, mean>55, cell 14)
  rearright [150..480]×[360..440]: proc **6/93** scattered cells across
  different wheels, none forming a ≥15 px-radius single-tone disc (ref
  0/94 on the brightened state — accent-class delta, not a lavender
  regression). Close-front crop: drums olive with bolt dots + camo
  blotches + hub rings — the lavender-disc acceptance read is DEAD. The
  far-side idler STARBURST is dead at hero-fl AND rearright
  (crop-verified: olive-dark camo faces, no pale spokes).
- **A3 ✓ delivered / albedo-moved target (NOT builder debt)**: front
  track columns proc med **60.0 / 60.1** — IDENTICAL to the archive to
  the pixel count. Bar was "within 5L of ref": archive ref 62.8/62.8 →
  Δ2.8/2.7 MET on the adjudicated committed state (verified myself);
  my-state ref 67.3/67.0 → Δ7.3/6.9 (the target moved +4.5L under it).
  Visual read at 1×: olive pillars with link texture, same family as the
  hull — the r5 near-black pillar read (med 32.4) is dead. Logged as an
  albedo-lane conditional (order R1).
- **A4 ✓**: sponson window p5 **54.1** (bar ≥20); hero-rr far-side
  fender-line proc-only edge max **0.82 m** on my evaluator (bar <2 m;
  the r5 4.68/3.88 serration chains GONE — the only longer proc-only
  survivor is 1.15 m @ y −0.78..−0.21, the packet's adjudicated y<0
  under-belly class). Posts fade into the curtain band at 1× in the
  quarters; residual: 2 curtain legs read as discrete dark verticals at
  close-front (m47 T1 class — order R3).
- **A5 ✓ EXACT-CLASS**: hero-rr gear window [160..500]×[400..540] sub-25
  **0** (r5: 3756; class bar ≤300), p5 43.0 / med 57.2 / sd 8.61 vs ref
  50.5 / 61.3 / 10.31 — in-class, highlight tail kept, no overshoot.
- **A6 ✓ THE IDENTITY PIECE READS**: distinct painted tension wheel +
  pale rim rings (endRings pair on the carrier face) + wrap dip at 1× in
  left/right/rearleft — crop-verified both flanks; §B6 note below.
- **B1 ✓ EXACT**: view-left M2 rod [280..420]×[200..250] block-luma med
  **76.8** (bar ≥70; builder claim 76.8 EXACT), ytop-med **223 = ref
  223**; close-roof cluster [200..420]×[195..260] med **60.6** (claim
  exact) vs my ref 62.3 — Δ1.7, in-class. Sky-backed pale top-lit
  two-tone ✓ MG PHYSICS.
- **B2 ✓**: close-roof crop shows the STEPPED receiver (front block /
  notch / rear block under the cover) + dapple + barrel taper + muzzle
  collar; pedestal head (heightM p95 carrier) untouched — **dims 100 ×2
  on my watch**; front-view slope flag Δ+9.6° @ the mast band = the r5's
  certified dims-carrier class, unchanged. The monotone grey-LEGO read
  is dead. Residual: the group reads boxier than the ref's gun-shaped
  cast masses (certified band, m47 residual class).
- **C1 ✓ subtle**: transverse rib crests + under-bars read on the bow
  undercut at close-front, flush; hull 91.9 held. Quieter than the ref's
  chevron-ring casting grammar (polish-lane, priced).
- **C2 ✓**: the crest-ladder terraced-architecture read at close-roof is
  gone (zWedges) — the roof mid reads camo-continuous at 1×; the FACET
  family on the roof slope remains at close pitch (order R4, the m47
  S-class analog). Stations spend −0.2 as packeted, gate holds.
- **C3 ✓ with honest abort record**: rack reads LOADED (cloth bed + roll
  + straps inside the certified envelope) at top/rearleft/hero-rr; the
  packet's turret_plan abort→slim cycle is the §C discipline working.
  Residual: the load reads as a uniform dark cloth slab vs the ref's
  chunky textured load (order R2).
- **C4 tone-half ✓ / verticals BANKED as predicted**: pale slat rows on
  dark backers read on the tail plate at 1× (rear/rearleft/rearright;
  my plate window row-SD 9.66 vs ref 0.90 — rhythmic rows present; the
  texture-plain read is dead). The corner verticals reproduce EXACTLY:
  evaluator proc-only **88.9° / 91.1° len 0.57 m @ x ±1.68, y
  0.46..1.03** — the r5 numbers to the decimal; shared trackBandGeo
  face, no in-envelope chamfer (occluders would add near-verticals) —
  stays banked, family-lane note.
- **C5 ✓**: dark transverse baffle-window bars read on the muzzle-drum
  flanks at close-front/right; muzzle z untouched, overallLengthM
  sovereign, dims 100 ×2.
- **D ✓ (+2d)**: tow-cable coil on the rear plateau (toptilt/top) +
  spare-track links on the right shelf wall (view-right) — census
  mg1+2d; both AABB-interior (gate byte-identical). The r5 "barest build
  in the family" finding is closed.

## Standing checks (§B + §H.4)

- **§B1 FRONT SLOPES: PASS** — front 29 matched edges, ONE flag >1.5°
  (Δ+9.6° @ the certified pedestal-mast band); glacis rake, cheek
  slopes, dive line inside noise; p95 Δtop 0.143 / Δbot 0.134 m (r5
  class). Round T26 casting reads round.
- **§B2 NO EMPTY AREAS: PASS** — machine scan 0 enclosed cells ✓; decks
  filled at top/toptilt. Void inventory adjudicated WITH blue-signature:
  toptilt 4.193 m² @ (1.24, 1.29, 0.34) = 95.0% blue-signature real sky
  in the barrel/cheek/bow projection triangle (r5-adjudicated class,
  same coords); close-roof 0.066 m² @ (0.20, 3.08, −1.01) = 46.7%
  blue-signature air inside the M2/pedestal/brace cluster — the lawful
  MG-PHYSICS sky window, grown from r5's 0.041 by the B-group mass
  edits (must stay open); close-roof 0.025 m² toe-undercut + hero-rr
  0.036 m² fender-overhang + 0.022 m² under-belly = the r5 coordinate
  families exactly. No through-hull sky anywhere.
- **§B3 DECORATION: PASS** — roof M2 mandatory ✓ pale top-lit; mg1+2d
  censused (KIT.fittings markers).
- **§B4 TRACK CONTAINMENT: PASS** — exact audit 0/0 reproduced; wraps
  clear at 3–4× in all views.
- **§B5 TURRET PARENTING: PASS** — 0/0/0 machine-clean; rack/M2/pedestal
  turret-parented per the r5 note; floaters 100 ×2; no geometry motion
  since the r5 yaw-pair evidence (hash-frozen).
- **§B6 TRACK RUN: PASS** — \\________/ trapezoid both sides: raised
  front idler + raised rear sprocket with tangent ramps; profile p95
  Δbot 0.080/0.080 m; the tension idler now READS (A6 ✓). Packet SIZE
  note (drum tension-idler-sized) carried.
- **§H.4 VARIANT DISTINCTNESS: PASS, strengthened** — vs m47 f02ef936
  (15:58 committed-state pairs, structure only): round T26 casting +
  short bustle vs needle-nose long turret; fat evacuator + single-baffle
  drum vs capsule deflector; mid-roof M2 + tall AA pedestal vs
  bustle-rail M2; fender mufflers + tension idler (m46-only); bow MG
  ball under brush guards vs glacis ball; and m46 now carries its OWN
  Korea-era loadout (canvas rack load, turret-flank spare links,
  rear-deck cable coil, ribbed bow) vs m47's tail-tray tarp + pioneer
  row + whip — the r5 "variety-by-neglect" caveat is CLOSED. vs
  m60a1/m60a3: different generation, no re-badge read; hashes exact.

## Per-view justifications (bar ≥9.0 "same vehicle, same tier", 1×)

- **view-front 9.0 — AT BAR** — every r5 holder addressed: track pillars
  olive with link texture (A3), M2 cluster pale two-tone (B1/B2), bow
  ribs landed (C1), turret paint in-class. Remaining reads are certified
  mast-band mass and texture-hint depth vs the (albedo-brightened) ref —
  same vehicle, same tier.
- **view-frontleft 8.9** — tone holders all dead (band, drums,
  starburst, M2); held by the roof/cheek facet family at quarter pitch
  (R4), curtain band a step heavier than the ref flank, gear a touch
  darker than the shifted ref target.
- **view-left 9.0 — AT BAR** — A1/A2/B1 all green on the ordered
  windows; evacuator + brake + muffler + strap rings + trapezoid +
  READING tension idler; the under-fender band is a graded shadow (p5
  54.1), in-class for the m46's real geometry.
- **view-rearleft 8.9** — black L-mass dead, rack loaded, tail louvres
  read, pale ring + tension dip ✓; held by the cloth-slab load read
  (R2), curtain heaviness, corner-vertical hints at the shell edge.
- **view-rear 8.9** — plate carries slat rhythm (row-SD 9.66 vs ref
  0.90), masts pale, rack loaded, columns olive; held by the banked
  corner verticals @ x ±1.68 (len 0.57 both), plate slat coverage
  narrower than the ref's full-width field, and busier proc rectilinear
  grammar (procOnly 29 vs refOnly 9: louvres/rack/straps trade).
- **view-rearright 8.9** — the r5 bare-drum side: drums camo'd with dots
  (flat-cell 6/93 scattered), starburst dead, louvres read; held by the
  rear-quarter set (verticals, load slab, curtain).
- **view-right 9.0 — AT BAR** — mirror of left; '123' ✓; baffle-slot
  hint on the drum flank; spare-links fitting reads on the shelf wall;
  tension idler + pale rings ✓.
- **view-frontright 8.9** — as frontleft mirrored (its r5 starburst
  advantage is moot now); same facet/curtain holders.
- **view-top 8.9** — plan registration excellent (yawProxy 0.1°); rack
  LOADED, muffler capsules + straps ✓, roof hardware toned, track bands
  olive with link texture. Held by: deck-grille faintness (banked usKit
  lane — ref's pale slat crowns absent: rear-deck med 56.0 vs 61.9),
  the priced plan-edge class (evaluator: ref continuous fender lines
  ±1.75 × 5.81 m vs proc notched rails @ ±1.68 — certified stations/
  whole carriers), load flatness.
- **hero-frontleft 8.9** — the r5 mechanical-diagram read is gone: band
  olive, drums camo'd, no starburst, sponson graded; held by roof facet
  family + curtain band + residual 0.035 gear↔hull split (in-bar).
- **hero-rearright 8.9 — the r5 FLOOR, +0.7** — sub-25 0, hue split
  0.035 (ref's own 0.062), rack loaded, masts pale, tail louvres read,
  0.82 m max fender-line edge; held by corner verticals at hero pitch,
  cloth-slab load, curtain band.
- **hero-toptilt 8.8 — THE FLOOR** — serrated strip dead (olive links),
  roof cluster toned, rack loaded, crest terraces smoothed (C2), cable
  coil reads; held by the MID-DECK FIELD: the ref's dense louvre/slat
  deck grammar vs the proc's plain camo + seams — at this pitch the
  texture-density gap is the loudest single read on the vehicle (banked
  usKit lane, ESCALATED below) + roof facets + load slab.
- **close-front 8.9** — drums painted with bolt dots (the r5 acceptance
  crop), two-layer ground run ✓, bow ribs + shackle clevises read,
  mantlet rotor + wings + camo, baffle slot ✓, M2 pale; held by casting-
  texture depth vs the ref's chevron rings and the two discrete
  curtain-leg verticals (R3, loudest here).
- **close-roof 8.9** — receiver stepped + dappled (B1/B2), terraces
  smoothed, rack loaded, '123', cupola ring ✓; held by the roof
  facet-patchwork family vs the ref's continuous cast roll (R4) and the
  slab-stack M2 group mass (certified band).

## Builder-claims audit (§D; r7 packet vs MY rig)

Every load-bearing number reproduced: gate line ×2 to the decimal, all
four hashes + sibling freezes, clip/contig/parent zeros, A1 quadruple
(54.1 EXACT / 66.8 vs 66.6 / 6.92 / 75.8 EXACT), A2 p75 (73.6 vs 72.5,
+albedo touch), A3 60.0/60.1 EXACT, A5 sub-25 0 + stats, A6 crop-read,
B1 rod 76.8/223 EXACT + cluster 60.6 EXACT, N1 split 0.035 vs claim
0.036, A4 0.82 m vs claim 0.823, C4 verticals 88.9/91.1/0.57 EXACT, void
classes at the r5 coordinates. The packet's honest-residuals section is
accurate and complete (deck grilles, C4 verticals — both confirmed
visible; both r5-banked). The builder's floor self-read (8.8–9.0) is
vindicated. DISCIPLINE NOTES (minor, no flag): (1) the builder's ref
baselines are now historical — the albedo drift moved every ref-relative
window +4–5L after landing; their claims verify EXACTLY on the archived
committed-state renders, which is what the record requires. (2) C4's
"rear-band med 59.3 vs ref 67.6" window could not be located exactly;
the delivered slat-rhythm read is verified by texture metrics instead.
No hidden regression found; commit headline matches the record.

## ORDERS (r8, m46 lane; the gap is 0.1–0.2 on eleven views. Razor:
turret 1.1 / hull 1.9 / whole 1.8 / stations 2.5, dims 100 ×2 after
anything that could move the shared box; gate ×2 after ANY mask-touching
edit)

- **R1. ALBEDO RE-BASELINE (first, cheap, conditional)**: after the
  materials-lane changes COMMIT, re-derive A1/A2/A3 ref windows on the
  committed state. If the front track columns still read >5L under the
  new ref (my state: Δ7.3/6.9), lift the track-face tone ONE sampled
  notch (the A2 dial method on trackL/R or env floor) — done-gate: A3
  med within 5L, A1 bars held, N1 split ≤0.03 preserved.
- **R2. RACK LOAD TEXTURE (tone lane, zero mask)**: break the uniform
  cloth slab INSIDE the certified load envelope (the C3 abort law) —
  mottle/two-tone the canvas, deepen strap contrast, one roll shadow
  line. Done-gate: top/rearleft/hero-rr load reads textured at 1×;
  turret_plan/side rows unchanged in-gate (the C3 abort record is the
  fence).
- **R3. CURTAIN-LEG CONTINUITY at the closes (m47 T1 recipe)**: join or
  tone-step the 2 discrete dark verticals at close-front into the
  curtain band — no >12L lit gap between curtain columns; 1× quarters
  already pass, keep them.
- **R4. ROOF CAST CONTINUITY (m47 S3/B8 machinery, abort-priced)**:
  smoothLoft normal-averaging across the roof-slope facets (zero-mask if
  vertices hold) so the mid-roof shades as one cast roll at close-roof/
  quarters. HARD FENCE: the crest pods are front-roof gate carriers (r5
  law: section tops ≤2.68 outside the band) — gate ×2 + front_whole row
  check mandatory; abort on any wobble.
- **R5. DECK FIELD — LANE ESCALATION (the floor holder, NOT a
  builder-solo order)**: the frozen usKit deck-grille lane now holds
  toptilt (8.8) and part of top. Two lawful paths, orchestrator to
  schedule: (a) unfreeze usKit for a pale-slat-crown pass on the
  existing grille bays (decal-lane, flush, §C end-cap law, zero new
  silhouette columns), or (b) an in-profile decal-lane slat set inside
  the deck terraces (the C4/rearLouvres mechanism worked exactly so on
  the tail plate). Done-gate: toptilt mid-deck carries transverse slat
  rhythm at 1×; hull/stations rows held ×2.

**BANKED / NO ORDER:** C4 corner verticals @ x ±1.68 (evaluator-exact
r5 class; no in-envelope chamfer on the shared trackBandGeo — a family
lane if ever, m47 carries the same class); plan-edge notched-rails vs
continuous fender lip (certified carriers); M2 group slab-stack mass +
pedestal head +1q (certified dims band); chopped rear-track print zone
~1 col @ z ≈ −4.17; turret_plan ONLY-REF sliver x ≈ −1.09 (~0.5 pt);
front idler wrap z 1.64 (law-2 boundary); the five adjudicated void
classes (projection/MG-window/toe/overhang/under-belly); hullLengthM
grid-phase watch (re-measure ×2 after any shared-box change); ref-half
albedo drift (+4–5L, working-tree — re-baseline at R1).

## Verdict

FAIL — floor 8.8 (hero-toptilt), mean 8.91, ceiling 9.0 with THREE views
AT the bar (front, left, right) — and no machine gate broken anywhere:
91.1 PASS ×2 bit-identical on my watch, clip 0/0, contig 0, parenting
0/0/0, trapezoid + reading tension idler, slopes clean, RIG PARITY OK,
§H.4 strengthened, hashes byte-stable through a live albedo-agent window
(99a3b0b4 before, during, after; m47 f02ef936 never drifted). Every r5
order verified delivered on its window — the r5 headline driver
(asset-tier black gear + grey hardware) is measured dead, and the r5
floor view carried the biggest gain on the vehicle (8.2 → 8.9). This is
the m47-r6 shape of round: deliveries complete, zero regressions, the
remaining 0.1–0.2 spread across eleven views in FIVE small, named
families — the escalated deck-field lane (R5, the only view below 8.9),
rack-load texture (R2), curtain continuity (R3), roof cast finish (R4),
and the albedo re-baseline (R1). R1–R4 are one builder round on proven
recipes; R5 is a scheduling call for the frozen lane. The geometry needs
nothing and must not move except where R4's fence allows — m46 is one
polish round from presenting at the bar on every view.
