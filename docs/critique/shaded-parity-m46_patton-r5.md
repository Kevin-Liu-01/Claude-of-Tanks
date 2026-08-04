# m46_patton shaded-parity r5 — FIRST ADJUDICATION (2026-08-04, post-f108803 re-anchor)

Rig: fresh 14 pairs `node tools/tmp-tank-critic.mjs --id=m46_patton` →
shots/critic-m46_patton/ (zero console errors, vite :7456). BYTE-STABILITY
BRACKET (the concurrent-r6-builder hazard the brief named): m46 geometry
hash **722c39dc** (38 meshes / 82 552 verts) via tmp-hashgeo BEFORE renders
AND AFTER all evidence capture. HEAD moved f108803 → 6a3dab2 mid-round
(t72b3m graduate-change + home/logo commits); `git diff f108803 6a3dab2 --
patton.js kit.js materials.js` is EMPTY — the scored build is exactly the
committed f108803 state, no drift, no stop. Family bracket: m47_patton
**fbf23bfe** (the r4-adjudicated d149cc9 state), graduates m60a1
**81e69e34** / m60a3 **efcde5c4** — packet-exact, do-not-gate respected.
Official gate re-run on my watch: **91.2 PASS ×2 bit-identical** (hull 91.9
/ whole 92.4 / turret 91.2 / stations 93.0 / dims 100 / floaters 100) —
reproduces the r5 packet line to the decimal. Headroom razor: turret 1.2,
hull 1.9, whole 2.4, stations 3.0. `tank-standard-check`: clip **0/0 ✓**
(§B4 reproduced), contig **0 ✓** (§B2 machine scan), decor **mg1+0d ✓**
(§B3 minimum met — and 0 dressing items is itself a finding, see Group D).
`track-clip-audit --exact` 0/0 ✓. `turret-parent-audit` stranded 0 /
abutting 0 / dangling 0 ✓ (§B5 clean — no m47-style false flags on this
rig). `visual-evaluator --id=m46_patton`: exit 0, **RIG PARITY OK** (max
dYawProxy 1.0° @frontright, max |dCentroid| 0.061 m — no RIG MISMATCH; the
pt91m yaw-180 class absent), camoSeed 4242, evidence at
shots/visual-eval-m46_patton/. Measurements: banked ITU-601/mask-method
scanners (tools/tmp-r7-merkava.py) + a new RGB/hue + blue-signature
scanner (tools/tmp-m46r5crit-scan.py) on MY fresh pairs; zoom crops
diagnosis-only (tools/tmp-m47r4crit-crop.py). All numbers derived this
round on this build.

## HEADLINE: FAIL — floor 8.2 (hero-rearright), mean 8.42, ceiling 8.6 (front/top/toptilt); geometry is the family's best (91.2 ×2) and identity is never in doubt — the gap is ONE dominant asset-tier driver (the un-toned r3-class BLACK GEAR the m47 r4 verdict predicted: gear-band sub-30 census 7481 vs ref 0) plus the grey M2/AA hardware cluster and a short list of cast-grammar items

front 8.6 · frontleft 8.3 · left 8.5 · rearleft 8.4 · rear 8.4 ·
rearright 8.3 · right 8.5 · frontright 8.4 · top 8.6 · hero-fl 8.3 ·
hero-rr 8.2 · toptilt 8.6 · close-front 8.4 · close-roof 8.4

IDENTITY: PASS in every view — proud round T26 casting (not sunken),
90 mm M3A1 with fat evacuator sleeve + single-baffle muzzle drum, big
fender mufflers with strap rings, 6 road wheels + 5 return rollers,
raised front idler AND raised rear sprocket with the tension idler
below/ahead of it (geometrically present; see A6 — it currently drowns
in the black band), bow MG ball under the brush-guard/light row, M2 +
tall AA pedestal mid-roof at the correct x station (measured: proc mast
columns px 236..308 = ref's own, front view). This is an M46, not an
m47 re-badge (§H.4 below).

## Measured driver inventory (§D discipline — every claim carries its number)

**THE FLOOR-MOVER — r3-class black gear (the m47 r4 verdict called it):**
- view-left gear band [60..580]×[358..427]: proc sub-30 census **7481**
  (ref **0**; m47's r3 read was 5470, its r4 fix bar ≤300, delivered 0);
  proc p5 **6.8** vs ref **51.4** (m47 A1 bar ≥35); proc med 56.0 /
  sd 25.73 vs ref 63.2 / 8.71 — a bimodal black-vs-lit histogram where
  the ref is one paint family.
- front view track columns [85..175]×[400..555] + [468..558]×[400..555]:
  proc med **32.4 / 32.4**, p25 16.3 vs ref **62.7 / 62.7** — two
  near-black pillars flank the bow in front AND rear views.
- hero-rearright gear window [160..500]×[400..540]: proc sub-25 **3756**,
  p5 9.5, med 52.0 vs ref p5 44.0, med 58.6.
- Wheel drums: view-left band [170..380]×[380..416] proc p75 **61.3** vs
  ref **67.6** (m47 A2 bar ≥66) — and the LEFT side is the good side: at
  close-front/rearright/frontleft the drum faces read as flat unpainted
  grey-lavender discs (no camo, no hub/bolt read at 1×; crop-verified).
  The far-side FRONT IDLER face pokes past the bow as a pale multi-spoke
  STARBURST against the black band (hero-fl, frontleft) — the single
  oddest object in the quarters. The sprocket face repeats the starburst
  read at rear quarters.
- HUE: NO m47-r4-class split — proc gear r/g **0.962** vs proc hull
  1.024 (ref gear 0.999 / hull 0.972). m46 is at the PRE-tone stage
  (luma class), not the m47 post-tone brown/tan stage — so the A-group
  order below is m47's proven recipe with the r4 N-lessons pre-priced,
  not a repeat of m47's mistake.

**Grey hardware cluster (M2 + AA pedestal + cans):**
- view-left M2 rod [280..420]×[200..250]: proc block-luma med **57.0**
  vs ref **73.3** (m47 B5 bar ≥70, m47 delivered 76.8) — the sky-backed
  segment violates the MG-PHYSICS pale-top-lit read.
- close-roof cluster rod [200..420]×[195..260]: proc med **48.4** vs ref
  **58.9**; crop shows a monotone grey box-receiver + plain taper barrel
  + grey can + grey post — no jacket, no articulation (the m47 B7
  "monotone slab" lesson applies verbatim).

**Cast/texture grammar (in-class paint, wrong grammar):**
- Turret paint is IN-CLASS: view-left turret crop [230..430]×[225..305]
  proc med 77.3 / sd 12.20 vs ref 74.6 / 11.51; front face
  [180..470]×[150..290] proc med 65.0 / sd 15.01 vs ref 63.3 / 14.14.
  The pale-flat impression is SHAPE grammar: panel creases + the r5
  crest-ladder pods reading as terraced architecture at close-roof
  (crop-verified; invisible at 1× in ortho sides — the r5 design
  behaves as authored except at the roof close), and proc band<55 =
  18.8% vs ref 10.7% front (bigger, harder-edged dark blobs).
- Bow: ref's ribbed transmission-cover/step grammar + shackle castings
  vs proc's plain camo plate (close-front crop). The proc ground-run
  DOES show the two-layer track (pale inner chain under black shoes) —
  the best gear read on the vehicle.
- Rear: band tone in-class camo (NOT m47-r3's black band), but the
  plate is texture-plain vs the ref's slat/grille rows, and the shell
  corners are hard verticals — evaluator: proc-only **88.9°/91.1° len
  0.57 m @ x ±1.68, y 0.46..1.03** (rear view), the m47 B2b class.
- Bustle rack reads as a bare pale-floored scaffold (thin rails, no
  load) vs the ref's dark loaded rack — top/rearleft/hero-rr.
- Rear deck grille rows read fainter than the ref's slat rows
  (top/toptilt/rear).

## Standing checks (§B + §H.4)

- **§B1 FRONT SLOPES: PASS** — glacis rake, cheek slopes, dive line all
  match; front p95 Δtop 0.143 m / Δbot 0.134 m; no noise-exceeding
  slope-class flag (the front Δ+9.7° @ x -0.96 len 0.60 is the pedestal
  mast band — certified dims-carrier class, rides Group B).
- **§B2 NO EMPTY AREAS: PASS** — machine scan 0 enclosed cells ✓; decks
  render filled at top + toptilt. Evaluator void inventory adjudicated
  (all legitimate outside-silhouette air, blue-signature law applied):
  toptilt **4.192 m² @ (1.24, 1.29, 0.34)** = the sky triangle framed by
  barrel overhang, turret cheek and bow edge (crop-verified; the
  evaluator's own "barrel/deck gaps read as voids" class — same family
  as m47-r3's adjudicated projection-bay); close-roof 0.041 m² @
  (0.20, 3.08, -1.01) = air inside the M2/pedestal/brace cluster;
  close-roof 0.025 m² @ (0.24, 1.03, 2.10) = toe-undercut family under
  the bow fender lip; hero-rr 0.036 m² @ (1.07, 1.74, 1.14) =
  fender-overhang air above the wrap (m47 r4 watch class, same
  coordinates family); hero-rr 0.022 m² @ (-0.60, -0.65, -1.60) =
  under-belly class (y<0). No through-hull sky anywhere.
- **§B3 DECORATION MINIMUM: PASS at the letter** — roof M2 mandatory ✓
  present and reads in all 14 views (dark, but unambiguous); census
  mg1+0d. The ZERO dressing count is the §H.4/D-group finding: this is
  the barest build in the patton family.
- **§B4 TRACK CONTAINMENT: PASS** — clip 0/0 ✓ reproduced on my watch
  (the r2 22/0 is history); wraps clear of bow/stern solids at 3-4× in
  all views.
- **§B5 TURRET-FURNITURE PARENTING: PASS** — audit 0/0/0, no
  adjudication needed (the m47 rig_hull false-flag class does not fire
  here). Rack, M2 station, pedestal all rotate with the turret per the
  r5 packet's parenting note; floaters 100 ×2.
- **§B6 TRACK RUN SILHOUETTE: PASS** — side views read the trapezoid
  \\________/: raised front idler (z 1.64, the law-2 boundary
  compromise, costs ~1q on two arc columns — banked residual), raised
  rear sprocket with tangent ramps; evaluator left/right profile p95
  Δbot 0.080 m. The TENSION IDLER (m46 identity piece) is authored and
  visible in the rear-gear crop but reads black-on-black at 1× — it
  must READ after the A-group retone (A6 done-gate). SIZE note from the
  packet stands (visual sprocket drum tension-idler-sized): shape law
  holds, no order beyond A2/A6 tone.
- **§H.4 VARIANT DISTINCTNESS (vs m47_patton fbf23bfe fresh r4-round
  renders + m60a1 closing boards): PASS on structure** — m46's tells:
  proud ROUND T26 casting + short bustle vs m47's needle-nose long
  turret + blister pods; fat evacuator sleeve + single-baffle drum vs
  m47's capsule deflector; tall AA pedestal + mid-roof M2 vs m47's
  bustle-rail M2; fender mufflers + tension idler (m46-only in the
  family); bow MG ball under brush guards vs m47's glacis ball. vs
  m60a1/m60a3: different hull/turret generation entirely (long bare
  M68 tube + angular turret + no fender mufflers) — no re-badge read
  any pairing. CAVEAT (priced in Group D): today part of the
  distinctness is variety-by-neglect — m46 is bare+black where m47 is
  dressed+painted. After the tone round, m46 needs its OWN era-correct
  loadout (not a m47 re-dress) to keep §H.4 honest.

## Per-view justifications (bar ≥9.0 "same vehicle, same tier")

- **view-front 8.6 — ceiling class** — identity instant (casting
  silhouette, mantlet ball, correct mast station, wide fenders, brush
  guards + lights + bow ball). Held by: two near-black track pillars
  (med 32.4 vs 62.7), grey M2/pedestal cluster, plain bow face vs the
  ref's ribbed cover + shackle castings, harder panel-crease turret
  read (band<55 18.8% vs 10.7%).
- **view-frontleft 8.3** — the gear diagram at its widest: black band +
  drums without camo + far-side black serration under the bow + the
  pale starburst idler face; grey M2; turret cheek panels.
- **view-left 8.5** — wheels DO carry camo this side (med 61.3 vs ref
  62.7 in-class; p75 61.3 vs 67.6 flat) but sit inside a black wrap +
  black sponson band (sub-30 7481 vs 0); M2 rod 57.0 vs 73.3;
  evacuator + brake + muffler + trapezoid all read ✓.
- **view-rearleft 8.4** — rear wrap is a black L-mass around the
  sprocket; scaffold rack; faint grille rows; muffler + strap rings ✓.
- **view-rear 8.4** — band tone in-class camo (better than m47-r3's
  black band ever was), flanked by two solid black track columns;
  scaffold rack + grey masts against the sky; plate texture-plain vs
  slat rows; hard corner verticals @ x ±1.68 (len 0.57 m).
- **view-rearright 8.3** — the bare-drum side: flat grey-lavender
  wheel faces + black wrap + starburst sprocket + scaffold rack.
- **view-right 8.5** — mirror of left; '123' decal ✓; tension idler
  present but unreadable in the black band.
- **view-frontright 8.4** — mirror of frontleft minus the worst
  starburst angle.
- **view-top 8.6** — plan registration excellent (yawProxy 0.1°); deck
  camo + muffler capsules + correct turret planform + hatch cluster ✓.
  Held by: black track edge bands poking past the fender lines both
  sides (ref hides its tracks under the fenders), fainter grille rows,
  grey roof hardware, empty rack.
- **hero-frontleft 8.3** — the mechanical-diagram read concentrated:
  black band, grey drums, bow starburst, black sponson; turret cheek
  panels; grey M2. Still unmistakably an M46.
- **hero-rearright 8.2 — THE FLOOR** — everything at once: black wrap +
  bare drums + starburst + scaffold rack + square rear corners + grey
  masts + faint grilles (gear window sub-25 3756; p5 9.5 vs 44.0).
- **hero-toptilt 8.6** — decks filled, plan grammar good, gun band
  reads with camo + drum; held by the near-side black serrated strip,
  grey roof cluster, pale rack floor, and the crest terraces faintly
  visible on the roof slope.
- **close-front 8.4** — the two-layer ground run (pale inner chain
  under black shoes) is the best gear read on the tank; bow ball +
  guards + lights ✓. Held by: flat lavender drums at their loudest,
  black wrap walls, plain bow plate vs ribbed grammar, monotone
  mantlet, grey M2.
- **close-roof 8.4** — cupola ring, hatch discs, '123', rack rails ✓.
  Held by: the grey LEGO M2/pedestal cluster (rod med 48.4 vs 58.9),
  crest-ladder pods reading as terraced architecture where the ref
  rolls cast, bare rack, plain roof vs cast texture.

## ORDERS (r6; grouped by driver; tone/texture first. Razor: turret 91.2
(1.2 headroom), hull 91.9 (1.9), whole 92.4, stations 93.0, dims 100 —
gate ×2 after ANY mask-touching edit; §C: verify shadow-proxy
mask-exclusion per-harness before relying on it; hullLengthM phase watch
(packet residual): re-measure dims ×2 after anything that moves the
shared box)

**GROUP A — GEAR TONE (zero-mask, the floor-mover; adopt m47's PROVEN
d149cc9 cfg.gearTone/wheel recipes with the m47-r4 N-lessons PRE-PRICED):**
- A1. Retone track buckets out of the black class: done-gate view-left
  [60..580]×[358..427] sub-30 ≤300 (today 7481; ref 0), p5 ≥35 (today
  6.8; ref 51.4), med within 6L of ref 63.2, sd ≤ ref+4 (today 25.7 vs
  8.7). N1 PRE-PRICED: stay in the hull-olive family — gear-vs-own-hull
  mean-RGB r/g split ≤0.03 (today 0.962 vs 1.024; m47's failed landing
  was 1.07 vs 0.97 — do not go tan). N5 pre-priced: keep a highlight
  tail (rim glints), no overshoot (p95 ≤ ref+4; ref p95 77.5).
- A2. Wheel/idler/sprocket DRUM FACES: camo blotches + hub/bolt read on
  ALL faces including the two STARBURST spoke faces (m47 A2 + N2 in one
  order — the ref paints the whole gear): done-gates — view-left wheel
  band [170..380]×[380..416] p75 ≥66 (today 61.3); no flat single-tone
  disc ≥15 px radius in any quarter/hero (close-front lavender drums are
  the acceptance crop); starburst faces read camo'd at hero-fl/rearright.
- A3. Track FACES front/rear: camo the wrap faces so the front/rear
  pillars die — front view column windows ([85..175] and [468..558] ×
  [400..555]) med within 5L of ref 62.7 (today 32.4 both).
- A4. Under-fender shadow/AO band (m47 N3, §C proxy law: verify
  mask-exclusion in this harness first): swallow the pure-black sponson
  wall + far-side serration into a graded shadow — done-gate: sponson
  window p5 ≥20, far-side fender-line proc-only edges <2 m in hero-rr
  (evaluator), no discrete black fence-post verticals at 1×.
- A5. Grade the ramp-gap wedges between last wheel and both wraps (m47
  N4): no sub-25-luma wedge >40 px in rearleft/rearright/hero-rr
  (hero-rr gear window sub-25 today 3756 → target class ≤300).
- A6. TENSION IDLER MUST READ (identity piece, §B6-adjacent): after
  A1/A2, the small wheel below/ahead of the sprocket reads as a
  DISTINCT painted wheel + wrap dip at 1× in left/right/rearleft —
  name-check it in the builder's packet section with a crop.
  Gate risk GROUP A: zero mask (tone/texture/AO only) — but §C material
  splits + gate ×2 anyway; abort any item that wobbles hull/stations.

**GROUP B — M2/AA HARDWARE (the m47 B5+B7 combo, certified-band lane):**
- B1. Sky-backed pale top-lit two-tone on M2 + pedestal + cans (MG
  PHYSICS): view-left rod [280..420]×[200..250] block-luma med ≥70
  (today 57.0; ref 73.3; m47 delivered 76.8); close-roof cluster med
  toward ref 58.9 (today 48.4).
- B2. Receiver mass grammar: break the monotone grey box — jacket hint,
  receiver hump + rear cap, can two-tone (m47 B7 lesson) INSIDE the
  certified pedestal band; the pedestal is the published-heightM p95
  carrier — dims 100 must hold ×2; silhouette spend ≤ the 0.4 pintle
  allowance (§C).

**GROUP C — CAST/GRAMMAR (priced; turret 1.2 / hull 1.9 headroom):**
- C1. Bow transmission-cover rib/step grammar (the ref's loudest bow
  texture; close-front/front): decal-lane relief, flush, ≥15 mm off
  trace-column boundaries (§C end-cap law), zero new silhouette
  columns — hull razor says decal-first, geometry only with gate ×2.
- C2. Crest-ladder terraces at close-roof: tone-first continuity (camo
  across the pod steps ± ≤0.05 chamfer) so the roof mid reads cast —
  HARD LAW FENCE from the r5 packet: crest section tops ≤2.68 outside
  the band; the pods are gate carriers (front-roof rows) — any geometry
  change needs gate ×2 + the front_whole row check.
- C3. Load the rack + slat-tone its floor (tarp/roll/duffel at rim-safe
  heights, m47 D3 class) — with m46's OWN selection (§H.4: era-correct
  canvas/duffel, not a m47 re-dress); KIT.fittings only (§I).
- C4. Rear shell: kill the corner verticals @ x ±1.68 (evaluator
  88.9°/91.1° len 0.57) with chamfers INSIDE the current mask envelope
  + a slat/grille texture hint on the plate (tone lane).
- C5. Single-baffle SLOT hint on the muzzle drum (today a plain pot;
  the squashed 0.40 block is the certified print frame — texture/inset
  only, zero new columns, muzzle z untouched: overallLengthM sovereign).

**GROUP D — DRESSING/VARIETY (§B3 spirit + §H.4):** one pass of
KIT.fittings dressing for the barest build in the family — pioneer row /
spare links / tow cable per M46 photo truth; mg census stays ≥1; every
fitting AABB-interior (§C); expect +1-2d in the census.

**BANKED / NO ORDER:** chopped rear-track print zone ~1 col @ z ~-4.17
(packet-certified residual); turret_plan ONLY-REF sliver x ~-1.09 (~0.5
pt permanent cover residual); pedestal head +1q over the ref's 3.15 band
(dims sovereignty keeps it); front idler wrap z 1.64 vs ref arc centre
~1.72-1.76 (law-2 track-link boundary constraint, ~1q on two arc
columns); sprocket drum tension-idler-sized (packet SIZE note, §B6
holds); the five adjudicated air pockets (barrel-sky, AA-cluster,
toe-undercut, fender-overhang, under-belly — watch classes); hullLengthM
grid-phase sensitivity (re-measure ×2 after any shared-box change).

## Verdict

FAIL — floor 8.2 (hero-rearright), mean 8.42, ceiling 8.6 (front/top/
toptilt); no view at the 9.0 bar, and NO machine gate broken anywhere
(91.2 PASS ×2 bit-identical, clip 0/0, contig 0, §B5 0/0/0, §B6
trapezoid ✓, slopes clean, RIG PARITY OK, §H.4 clear). This is exactly
the round the program's record predicted: the r5 re-anchor delivered the
family's best geometry and a registration-true, identity-complete M46 —
and the m47 r4 verdict's family note ("m46 still renders the r3-class
BLACK gear") is now measured fact: gear-band sub-30 7481 vs ref 0, front
track pillars med 32 vs 63, M2 rod 57 vs 73. One tone round moves every
quarter/hero 0.3-0.5 (the m47 precedent: its A-group alone was +0.2-0.3
across the board, and m46 starts with LESS residual debt — no hue-split
mistake to unwind, turret paint already in-class). Take Group A with the
N-lessons pre-priced, add the B-group hardware pass and the small C/D
items, and m46 should present at or near the bar on its second
adjudication. The geometry needs nothing: don't touch the masks except
where an order says so, and gate ×2 everything that could.
