# leo2_revolution shaded-parity r7 — FIRST ADJUDICATION (2026-08-04)

Rig: fresh 14 pairs `node tools/tmp-tank-critic.mjs --id=leo2_revolution` →
shots/critic-leo2_revolution/ (11:51:04, zero console errors — the stale
06:29 pre-r7 set was overwritten; nothing scored from it). Byte-discipline:
`tmp-hashgeo.mjs` leo2_revolution = **c5d9e131** (39 meshes / 96020 verts,
the r7 landing hash) verified BEFORE rendering and re-verified after all
evidence runs (bookend below). Graduates frozen on my watch: leo2a6
**80b76338**, kf51 **77020c58** (hashes verified this session; §H.4 strips
reuse their existing frozen-hash critic pairs per the a5-r6 precedent).
Official gate re-run by me: **min 90.7 PASS ×2 BIT-IDENTICAL** (hull 91.7 /
whole 90.7 / turret 91.7 / stations 90.8 / dims 99.4 / floaters 100 —
JSON-diff clean between runs; exactly the r7 landing line).
`visual-evaluator.mjs --id=leo2_revolution`: exit 0, **RIG PARITY OK**
(max yawProxy 0.8° @close-front, |dCentroid| 0.19 m, no skew flip, no
axis break), evidence at shots/visual-eval-leo2_revolution/ (my run,
18:54Z). Measurements: tools/tmp-rev-critic-measure.py (mask-method
+ blue-signature refinement, see below) + tools/tmp-rev-critic-crop.py
(zoom crops DIAGNOSIS-ONLY per §D) + tools/tmp-rev-critic-strips.py
(§H.4 2-up strips). Machine checks (standard-check aggregate incl. §B2
top-down scan + §B3 census + §B4 clip audit; §B5 turret-parent audit):
all run this session — see the machine-check section.

MEASUREMENT-LAW NOTE (banked for the fleet): the banked MASK-METHOD sky
test (|px−0x151b20| maxch ≤13) FALSE-POSITIVES on this build's warmest
track-shadow tone (24,22,19 — maxch 13 exactly). Sky claims here add the
blue signature (B−R ≥ +8; bg B−R = +11, warm shadow −5). All §B2 numbers
below use the refined mask; the loose mask inflated proc "holes" ~5-15×.

PIPELINE INCIDENT (disclosed): the shared FIFO capture lock was wedged
THREE times this session by a non-protocol plain-FILE lock written to
/tmp/cot-shots.lock by the concurrent camo/fonts agent's bespoke shell
protocol ("claude-camo-fonts" 11:25, "-r2" 11:55, "-r3" 12:15 — a retry
loop). The mkdir-based FIFO tools cannot reap a stale FILE (rmdirSync
ENOTDIR — the head ticket spins on `continue` and never times out), so
the whole fleet queue (7-11 live harnesses each time) deadlocked behind
it while the writer waited on its own wedged child — a deterministic
self-deadlock. I reaped the file each time only after it exceeded the
tools' own 5-minute staleness law (24 min, 15 min, 6 min stale); the
FIFO head (never my own job — twice the camo agent's own child, once the
a5 builder's render) acquired first each time — no queue-jumping. The
camo agent's lock protocol needs an orchestrator correction (write a
DIRECTORY or take a FIFO ticket like every other harness), else it will
re-wedge the fleet on its next retry.

## HEADLINE: FAIL — floor 6.6 (close-front, rear), ceiling 7.2, mean ≈6.9; no view near the 9.0 bar. Geometry arc is DONE and holds (gate 90.7 ×2 bit-identical, parity clean, §B6 pass, §H.4 pass, decks cleaner than the ref's own) — the gap is one coherent tier: the build has never had a finishing round. Two §B2 daylight channels + the weapon-read cluster are the mandatory items.

front 6.7 · frontleft 6.9 · left 7.2 · rearleft 7.0 · rear 6.6 ·
rearright 6.9 · right 7.2 · frontright 6.9 · top 6.7 · hero-fl 6.8 ·
hero-rr 6.7 · toptilt 7.2 · close-front 6.6 · close-roof 6.8

Calibration: this is the program's expected first-verdict band for a
geometry-first build (merkava3d/1b opened 5.5-6.5 with silhouette-law
failures; leo2a5 opened 7.7-8.0 already wearing family dressing). The
revolution's SILHOUETTE parity is genuinely strong — every ortho outline
tracks the warped print closely (the 90.7 is honest), §B6 ramps read,
fill is better than the ref's own — but the vehicle is bare CAD: no gun
face, no RWS station read, near-black gear band, no engine-deck fans, a
foreign flat-grey tail panel, undressed rear wall, +8 hot walls. Nothing
here re-litigates the warp or the certified residual classes; the ladder
to 9.0 is finishing + a small set of zero/low-mask-cost sculpting orders.

## §B standing checks

- **§B2 CONTIGUITY / border-flood (no sky through the AMAP courses/RWS)**:
  DECKS PASS decisively — refined-mask enclosed-sky, PROC vs REF's own:
  top 124 px vs 4752 px, hero-toptilt 94 px vs 1417 px, left 130 vs 797,
  right 152 vs 529 (≈90-100 px of every PROC figure is the pair-label
  glyphs; the ref's own air is its slat lattice + skirt channels). The
  evaluator's toptilt 3.529 m² @(-1.47, 1.81, 0.87) sits on the ref's own
  2.673 m² at the same centroid — tilt-projection air (merkava class),
  not a hole; hero-rr 0.767 m² @(-2.35, 1.98, -1.03) is the gun/wing air
  window plus a real under-wing slot (order E3). **TWO PROC-ONLY DAYLIGHT
  CHANNELS FAIL the 'no gaps between masses' read** (ref carries neither):
  (1) LEFT AMAP course channel open from dead rear — 538 px ≈ 0.033 m²,
  a ~1.6 m tall × ~6 cm sky slit at world x ≈ −1.95, y ≈ 0.6..2.2 (rear
  view y263..465 x533..539; the right-side mirror is a 16 px hairline;
  reads as a 137 px sky pocket from rearright y289..300 x494..505);
  (2) front tub↔track-band slit at world x ≈ −1.35 — 416 px ≈ 0.024 m²
  (front y273..429 x100..107) + an 88 px slit above it (y177..182
  x124..142). Order D3 (mandatory, cheap end-caps). Machine top-down
  hole scan: see machine-check section.
- **§B3 DECORATION MINIMUM**: census is real (FITTINGS.pintleMG MAG
  stowed on the right wing, turretG-parented, mask-free at (0.85, 0.21,
  2.75) turret-local) — but at game scale it is INVISIBLE as a weapon
  (sunk flush INSIDE the wing band by design; verified at 2-3× on
  close-roof/top). The Revolution's roof weapon is the RWS — and the
  PROC RWS reads as plain cargo pods: no ring base, no pedestal/head
  split, no elevation arm, no barrel (the authored RWS barrel cylZ sits
  UNDER the fore-roof line — never paints). The REF paints a full
  station: head box with glass face on a ringed turntable with standoff
  posts + elevation arm. Smoke clusters: PRESENT both rear corners and
  read at toptilt (good); the ref also mounts a cluster at the CHEEK
  FRONT that the proc lacks (order F3, optional — r5 plan-column risk
  documented). VERDICT: census PASS, visual weapon-read FAIL → orders
  A2 (mandatory) + A3.
- **§B4 TRACK CONTAINMENT**: the documented sprocket-dip carry is
  visible but subtle — the tucked-wrap shoes (z −3.16..−3.46, AABBs to
  x −0.82) print a dark ledge/step under the rear corners, and the
  front-view −1.01 column reads the 0.091 bottom (evaluator: front
  Δbot −0.703 @x 1.548 / rear Δbot +0.708 @x 1.59 — the flap/board
  bottoms disagreeing with the ref band line in both directions, the
  same documented class). Clip audit reproduction: machine-check
  section. The queued §B4 round owns both symptoms — NOT re-priced
  here (per the packet residual note).
- **§B5 TURRET-FURNITURE PARENTING**: `turret-parent-audit` printed
  stranded 2 / abutting 0 / dangling 0 — BOTH ADJUDICATED FALSE-POSITIVE
  (AABB-coarse, the kf51 raised-deck precedent): (1) the two DRIVER
  PERISCOPES on the bow shelf (combined AABB −0.68..−0.29, 2.00..2.03,
  1.72..1.85; source: `periscope(P,'hullDetail',−0.62,2.0,1.80)` +
  `(−0.36,2.0,1.78,0.25)`) — hull crew equipment that must NOT yaw; they
  flag only because the right WING inflates the casting box to z 3.56
  over the whole bow shelf; (2) the MERGED HULL MESH itself (AABB
  ±1.42 × 1.16..2.46 × −3.88..3.36, overlap 50%) — the raised AMAP
  courses/posts push the merged-hull AABB into the casting envelope.
  True turret furniture (baskets, hanging panels, pods, whip stubs,
  stowed MAG, smoke clusters) is turretG-parented in source. PASS.
- **§B6 TRACK RUN SILHOUETTE**: PASS — \\________/ reads on both sides:
  ground run SHORT base, both end wheels raised (sprocket z −3.46
  y 1.12, idler z 3.44 y 1.06), kit-native climb ramps visible at both
  ends in my left/right pairs (3× crops verified; ramps ~30-35°).
- **§B1 FRONT SLOPES**: the ref rakes are gate-certified at 90.7, and
  the big rake lines exist in silhouette — but three measured flats hold
  the FACE read back (all ledger-parked classes, order E cites, no
  geometry order this round): bow shelf run flat 176.8° vs ref 163.6°
  (Δ+13.2° ±0.5) @z 2.67..3.04 y 1.88..1.91; jacket nose corner 166.3°
  vs 154.3° (Δ+12° ±0.4) @x 1.79..2.22 y 1.69..1.84 (hero-fl); plan toe
  edges dead-straight 0.2°/180° vs ref 10.5°/169.4° (Δ∓10.3-10.6° ±0.4)
  over 0.61-0.62 m @x ±(0.09..1.29) z 3.86; fore-roof line 6.3-8.1° vs
  ref 13.7-15° (Δ−7 to −7.4° ±0.2-0.5) @z 1.23..1.81 (frontright +
  close-roof). The toe is pinned by the r7 BODY-SPAN dAlong law (band
  0.18 at 0.965; the 1.005 try flipped dAlong and smeared every side
  row) — cited as certified, chase only via shading.

## §H.4 VARIANT VARIETY (mandatory this round — first family adjudication with 2 graduates)

Fresh 2-up PROC strips (left/front/rear/close-roof), revolution over each
graduate at verified frozen hashes
(shots/critic-leo2_revolution/crops/h4-rev-vs-{a6,kf51}.png):

- vs **leo2a6 (80b76338)**: PASS. Tells both ways at a glance — (1) L/44
  short overhang, no L/55 mid-tube step; (2) full-height faceted AMAP
  jacket cliffs + rear corner posts vs a6's scalloped skirts with the
  seven-wheel row visible; (3) roof: low RWS pod deck + twin whip stubs
  vs a6's proud blister + tall whips; (4) rear: AMAP tail band + ribbed
  panel vs a6's louvre grille + light clusters. No re-badge read.
- vs **kf51 (77020c58)**: PASS. Different silhouette family entirely —
  kf51's hex-arch skirts, chevroned glacis, SEOSS tower, Natter deck vs
  the revolution's closed faceted jacket. No re-badge read.
- ADVERSE NOTE for the finish round: part of today's distinctiveness is
  the revolution's UNFINISHED state (grey panel, black band). The
  geometric tells above must carry the identity after Group B/D/F land —
  they do (jacket, posts, pods, overhang are all geometry).

## Claims audit (§D — r7 packet claims re-derived on my rig)

- Gate line: **CONFIRMED** — 90.7 ×2 bit-identical on my runs, every
  component matching the packet table to the decimal.
- Hash: **CONFIRMED** — c5d9e131 / 39 meshes / 96020 verts before AND
  after the evidence runs (drift bookend clean; the concurrent leopard
  builder never touched revolution bytes on my watch).
- Evaluator parity ≤0.8° / no RIG MISMATCH: **CONFIRMED** (my run).
- "Filled decks, whip stubs read, AMAP mass closed" (r7 shots note):
  CONFIRMED for decks/whips/mass — but see §B2 for the two course
  channels the top-down scan cannot see (side/rear-facing).
- Muzzle 6.005 / tip-column cover 0.56: not re-litigated (gate-priced,
  stable ×3 per packet; my gate agrees at dims 99.4).
- st8/st9 flicker + pod-line carries: observed states within the packet's
  documented bands; stations 90.8 in both my runs.

## Tone/texture measurements (ITU-601 luma, refined sky mask, my pairs)

- TRACK BAND (view-left, proc band strip [120:500]×[372:392]): med 52.2
  but **p5 6.8, sd 23.3** — near-black pad/shoe faces alternating with
  mid tones. REF gear zone [120:500]×[358:392]: med 53.0, **p5 51.1,
  sd 7.4** — uniform olive-brown with pale wheel rims. This is the exact
  merkava-r1 'near-black voided track' signature (that verdict's p5 was
  6.8 too). Order B1.
- JACKET WALL (proc [120:500]×[305:355]): med **73.2** vs REF hull side
  64.9 — +8.3 HOT; rowmean-sd 5.38 vs 3.96. Order F1.
- REAR TAIL PANEL (proc [190:447]×[338:372]): med 56.0 with **p5 = 56.0**
  (dead-flat grey) vs REF slat band [230:430]×[255:305] med **78.6**,
  p95 95.6, sd 13.65 — pale, textured, camo-crossed lattice. Order D1.
- REAR HULL WALL: proc med 60.8 ≈ ref 59.3 (tone match GOOD) but
  rowmean-sd 3.99 vs ref 6.08 — the ref wall carries cable/fitting
  relief the proc lacks. Order D2.

## Per-view justifications (bar ≥9.0 "same vehicle, same tier")

- **front 6.7**: stance, width, jacket seams, corner posts, whip stubs
  all present; camo seed parity good. Held by: NO GUN READ dead-front
  (ref paints mantlet drum + bolted flange + dark bore circle; proc tube
  end-cap is camo-on-camo and vanishes — 3× crop confirmed), near-black
  track ladder towers at both corners (ref: pale wheels/flaps), boxy
  vertical turret cheeks (ref: inward-leaning facets), ref-only slat
  lattice wings at the bustle corners, front tub-band daylight slit
  (§B2), stratified bow (Δ+13.2° flat where ref falls).
- **frontleft 6.9**: proportions/overhang right; ramps read. Held by:
  bow strata + blunt jacket nose corner (Δ+12°), cliff flank (hull and
  turret in one plane; ref sets the module proud with a shadow gap),
  band exposure, RWS pods read as cargo.
- **left 7.2** (best ortho with right): outline tracks the print
  closely — deck line, module length, short overhang, tail undercut,
  §B6 trapezoid; course seams honest. Held by: p5-6.8 black band with
  ~1 visible wheel disc vs ref's seven pale-rimmed wheels, dead-straight
  skirt hem (ref scallops per wheel), no evacuator drum on the tube
  (gate-priced: kit sleeve printed over the ref's bare 1.917 band —
  cite-only), pods-not-station roofline, +8.3 wall heat.
- **rearleft 7.0**: rear-quarter volumes right (posts, undercut, rails).
  Held by: rails-without-lattice tail (ref's fine slat texture), band,
  wall flatness, dip-class dark ledge at the rear corner (§B4 carry).
- **rear 6.6 — FLOOR**: tone match on the wall is actually good (60.8
  vs 59.3) and the undercut/posts/flap positions track. Held by: the
  FLAT-GREY RIBBED PANEL (56.0 flat vs ref's pale 78.6 textured slat —
  the single most foreign element on the vehicle), undressed wall (no
  tow-cable X, no light clusters; rowmean-sd 3.99 vs 6.08), the 1.6 m
  §B2 daylight channel at x −1.95, plain flap slabs, black sprocket
  wraps.
- **rearright 6.9**: as rearleft; the tail panel reads edge-on as a
  thin floating wing + the 137 px sky pocket at the quarter (§B2).
- **right 7.2**: mirror of left (fore-roof Δ−7.4° cited here).
- **frontright 6.9**: mirror of frontleft.
- **top 6.7**: plan outline + registration excellent; fill CLEANER THAN
  REF (124 px vs 4752 px); hatch rings + pods + clusters place
  correctly. Held by: ENGINE-DECK FANS MISSING (ref: two big semicircular
  arches with hinge plates + bolt rows — the leopard deck signature),
  no deck tow-cable arcs, plan toe taper flat (Δ−10.3/+10.6° both
  edges), serrated course-tab edges both sides where the ref runs
  smooth rail lines, exposed wrap-teeth zipper strips at both band
  ends.
- **hero-frontleft 6.8**: reads 'armored box barge' at the hero angle —
  the one-plane flank + vertical bow strata + flat pod deck; identity
  saved by proportions, overhang, seams, posts. Fan absence visible.
- **hero-rearright 6.7**: the container read is strongest here (largest
  flat planes + grey panel + black band); under-wing air slot visible
  (0.767 m² window vs ref 0.091 — air + slot, order E3).
- **hero-toptilt 7.2**: decks close, smoke clusters read as launchers,
  pods/steps/rings all place; camo strong. Held by fans/cables absence
  + serrated edges + tail panel grey.
- **close-front 6.6 — FLOOR**: at maximum magnification the bow is a
  stack of horizontal ledges with a vertical wall (ref: one dominant
  raked wedge + clevis + round bolted flange + mantlet face); the gun
  end is camo-capped with no bore/step; black brick flaps at both
  skirt fronts; clamp bar reads as a stray pale plank; §B2 slit
  visible. The beak toe + clevis face + shelf lines DO track the print.
- **close-roof 6.8**: hatch rings round, periscope + vision block
  present, pods clean, clamp/wing geometry crisp. Held by: the wing
  cover as a large mip-flat grey rectangle (a5 'backdrop plate' class),
  stowed MAG invisible as a gun at 2×, no launcher presence in the
  fore quarter (ref mounts one on the cheek), clean-CAD field flatness
  everywhere (no print grain).

## ORDERS for the next round (grouped by driver; every geometry item
re-runs gate ×2 + containment + the §B2 flood; dims 99.4 headroom is
THIN — overallLengthM 1.07 means NO tube/length changes of any kind;
whole 90.7 is the binder — zero-mask mechanisms preferred throughout)

**DRIVER 1 — WEAPON READS (identity; A2 mandatory):**
- A1. GUN FACE: dark bore end-disc INSET at the muzzle tip (inside the
  0.078 tube radius, flush cap — zero silhouette) + dark inset collar
  band 0.10-0.15 m behind the tip + mantlet-face relief inside the
  notch envelope. FORBIDDEN: any tube length change (r7 law 2: the
  plan grid re-rolls; 6.005 is priced at dims 99.4). Done-gate:
  view-front/close-front at 2× show a dark muzzle circle; gate ×2
  bit-held.
- A2. RWS STATION READ (MANDATORY — §B3 read + packet identity cue):
  re-sculpt the LEFT pod IN PLACE (x −0.38..−1.2855, z-front w −0.735,
  top 2.66 — ALL faces stay inside the current pod AABB, top face
  EXACTLY 2.66 = the heightM anchor): ring-base race + pedestal split +
  head box + optic glass + dark barrel relief on the front face; keep
  the two st4 cap blades inside. Done-gate: front + close-roof at 2×
  parse a weapon station; dims 99.4 UNCHANGED; stations 90.8 held
  (cap blades untouched).
- A3. STOWED MAG legibility: EITHER lift to wing-top (+0.05-0.07 on ~3
  side columns at w 2.6..2.9 where the ref wing band reads 1.991-2.001
  — priced INSIDE the §C 0.4-pt pintle allowance, verify turret_side
  stays ≥91) OR keep flush and add pale two-tone read (receiver cap +
  co-rod) inside the band. Census stays mg1+.

**DRIVER 2 — GEAR BAND (the merkava-class read; tone-only, zero mask):**
- B1. Track tone: pads/shoes/wrap-teeth olive-brown — kill the pure
  blacks (front boards x ±1.05..1.62 z 3.4..3.77, rear wrap ledge
  z −3.16..−3.46 included). Done-gate: left/right band strip p5 ≥40
  (now 6.8), med 48..58 (ref 53.0); §B4 clip numbers unchanged
  (material-only).
- B-residual (NOT this round): the seven-wheel row stays hidden behind
  the pad train (ref shows it in the 0.1..0.7 window). Any band/pad
  geometry change re-rolls the documented belly/skirt columns — that
  lane belongs to the queued §B4 sprocket-dip round; flag the wheel
  window as a candidate there.

**DRIVER 3 — DECK IDENTITY (zero/AA-level mask):**
- C1. TWIN FAN ARCHES on the engine deck per the ref (two large
  semicircular recessed screens + hinge plates + bolt rows; a5-r6
  fan-well recipe, recess + ≤0.02 curbs). Done-gate: top/toptilt read
  two circles; gate ×2 held (recesses are tone, curbs inside AA).
- C2. Deck tow-cable arcs (KIT.towCable) + hinge/handle fittings inside
  the deck outline. Done-gate: top 2× cable read; no new columns.

**DRIVER 4 — REAR IDENTITY + §B2 (D3 mandatory):**
- D1. TAIL SLAT READ: re-materialize the hanging panel + rear band from
  flat grey to the pale open-frame lattice (ref med 78.6 / p95 95.6 /
  sd 13.65 vs proc 56.0 flat): pale frame tone + dark through-hole
  texture + camo bleed; geometry stays (ledger-parked). Extend the
  treatment to the slat-course ENDS so the front view recovers the
  lattice-wing read at the bustle corners. Done-gate: rear panel window
  med 70..85 with sd ≥10; front-view wings read at 2×.
- D2. REAR WALL DRESSING: tow-cable X (thin members ≤0.02 proud, flush
  on the wall — the tail is dims-tight), light clusters, small kit per
  ref. Done-gate: rear wall rowmean-sd toward 6 (now 3.99 vs ref 6.08);
  hullLengthM pct ≤0.68 held.
- D3. §B2 CHANNEL END-CAPS (MANDATORY): close (i) the LEFT jacket
  course channel from dead rear (x ≈ −1.95, y 0.6..2.2) with an end-cap
  INSIDE the course envelope at the course's own lines (station
  cap-blade law — z-thin caps PAINT stations, st4 precedent), mirror
  check on the right (16 px hairline); (ii) the front tub↔band slits
  (x ≈ −1.35: 416 px + 88 px) with end plates inside the band/course.
  Done-gate: refined-mask flood ≤ label-noise (~100 px) on front/rear
  PROC halves; stations ≥90.8 held ×2; floaters 100.

**DRIVER 5 — FACET GRAMMAR (cited residuals; shading-tier only):**
- E1. The measured flats (bow shelf Δ+13.2°, jacket nose Δ+12°, plan toe
  Δ∓10.3-10.6°, fore-roof Δ−7 to −7.4°) are LEDGER-PARKED classes (the
  toe is pinned by the r7 dAlong law — band 0.18 at 0.965 vs the 0.324
  threshold; do NOT move it). Treat with SEAM ENGRAVING + panel-tint
  breaks that suggest the rake (a6 cast-mottle class); cite, don't
  chase, the geometry. Done-gate: no gate movement (that's the point).
- E2. Hull/turret plane split: darken the course RECESSES + add shadow
  seams at the module underline so the turret reads proud of the hull
  (interior tone, zero mask).
- E3. Interior fill faces under the right wing overhang (the hero-rr
  air slot at ≈(−2.35, 1.98, −1.03) window) — interior faces only,
  certified silhouette untouched (a5 order-3c class).

**DRIVER 6 — FINISH TIER:**
- F1. Jacket albedo: side-course material −8 luma (proc 73.2 → ref
  64.9 ±2); one material constant.
- F2. De-CAD the big fields: per-plate tint jitter ±2-3 L + seam
  accents on jacket courses, wing cover (the grey rectangle), roof
  plates (a6 recipe). Done-gate: wall rowmean-sd toward ref 3.96..6;
  no window inversion (overshoot law).
- F3. OPTIONAL launcher presence fore-quarter per ref cheek-front
  cluster — ONLY inside the certified cheek envelope; the r5 incident
  (tubes printed −2.54 into the −1.375 plan column) prices this: tubes
  must stay inside the cheek plan line or stay rear-parked with the
  parity deviation cited.

## Residuals certified/priced this round (no orders)
- §B4 sprocket-dip carry + clip front/rear (documented class, queued
  round owns it — evaluator front Δbot −0.703 @x 1.548 / rear Δbot
  +0.708 @x 1.59 re-confirmed as the same mechanism).
- Muzzle tip cover 0.56 (12 mm inside the 0.75-pitch margin, stable);
  st11/12 wPct 2.6 (width-guard sovereign); st5/pod-line carries
  (dims-sovereign pair); st8/st9 window flicker (both tabs at ±1.639).
- Tube evacuator absence (gate-priced: the ref band is bare 1.917 —
  a sleeve re-print costs; needs a mask-free mechanism if ever).
- Whip-stub blockiness (thin-feature bistability law — solid stubs at
  the printing-state read are the certified convention).
- hero-toptilt 3.529 m² / hero-rr projection-air remainder — ref-matched
  air classes, carried.

## Machine-check section
- turret-parent-audit (§B5): stranded 2 / abutting 0 / dangling 0 —
  both stranded flags adjudicated false-positive above (driver
  periscopes + merged hull volume; kf51 AABB-coarse precedent).
- HASH BOOKEND: c5d9e131 (39 meshes / 96020 verts) re-verified AFTER all
  evidence runs, WITH the concurrent leopard-r8 builder's working-tree
  edits present — all 13 diff hunks confined to buildLeo2A5 (old lines
  2759..3399; buildLeo2Revolution shifted 3473 → 3719 byte-identical).
  Graduates re-verified at the same sitting: leo2a6 80b76338, kf51
  77020c58. No drift; no STOP condition.
- tank-standard-check: gateMin 90.7 (my gate JSON, 47 m old at check
  time) | **clip front 98 / rear 429** ✗ vs the ≤60 band — REPRODUCES
  the packet's documented §B4 carry to the digit (98/429; the certified
  sprocket-dip tucked-wrap class, queued round owns it — not re-priced
  here) | **contig 0 ✓** (§B2 top-down machine scan clean, matching my
  refined-mask flood) | **decor mg1+0d ✓** (real KIT.fittings census —
  the stowed MAG; visual weapon-read adjudicated at §B3 above). The
  aggregate line reads 0/1 solely on the documented clip carry.

## Verdict

FAIL — floor 6.6 (close-front, rear), ceiling 7.2 (left, right,
toptilt), mean ≈6.9 across 14 views. The geometric arc the family spent
seven rounds on is REAL and holds under my rig: gate 90.7 PASS ×2
bit-identical, rig parity ≤0.8°, §B6 correct, decks cleaner than the
ref's own, §H.4 distinct against both graduates. What stands between
this build and the graduation track is one coherent finishing tier plus
two mandatory sculpt/cap items (A2 RWS station read, D3 §B2 channel
end-caps) — nearly all of it zero-mask-cost by construction. With
Drivers 1-4 landed and the finish pass (F) started, the floor should
move to ~7.8-8.2 in one round (the a5-r5→r6 ladder moved +0.7 with a
comparable order book); the 9.0 bar realistically needs 2-3 rounds.
Round 1 of a projected 3-4.
