# Leopard 1A5 (`leo1a5`) — BASE-21 photo-class packet

Spec home: src/vehicles/modern2.js (dims 7.09 / 9.54 / 3.37 / 2.62).
Old build: buildLeo1A5 (modern2), pre-oracle era ("wholly ancient"
owner class). NEW build (2026-08-07 scaffold round): profile builder in
src/vehicles/profiles/leopard.js (LEOPARD_PROFILES.leo1a5 — overrides
MODERN2_BUILDERS via PROFILED_BUILDERS, the same binding leo2a4 uses).
Family guidance (owner 2026-08-06): leo1a5 takes inspiration from the
leopard1 family.

## ORACLE STATE (2026-08-07, base-21 scaffold round)
**NO usable oracle.** The leo1a4 photogrammetry scan was adjudicated
RE-RIG-CLASS (fused 1.1M-vert blob, accessor-outlier crush — see the
scan section below): it is NOT registered in any harness map and MUST
NOT be. There is no docs/geometry-gate/leo1a5.json and no ledger row.
**FALSE-0 LAW: never run the geometry gate against this id.** The bar
is the VISUAL photo class + published dims + the §B battery + §B8.1
proportion gates + 14-view self-shots (tools/tmp-ww2-photoclass),
pending an independent §B8 critic. Real photos + the leopard family
graduates (leo2a5/leo2a4 grammar) are the influence sources.

## Identity brief — what makes a 1A5 read as a 1A5
1. **EMES-18 embrasure** (the acid tell): the big flat-faced armored
   sight housing standing on the RIGHT fore-roof with its twin square
   apertures — the A5's fire-control rebuild tell, per the owner brief
   ("welded turret with the big flat-faced EMES-18 sight embrasure, vs
   A4's cast" — the program's 1A5 wears the angular welded-family
   turret grammar the brief orders).
2. **Angular low welded turret**: flat inward-leaning walls, long flat
   cheek planes converging on the mantlet zone, squared bustle —
   nothing drum- or dome-like; plan is a tapering hexagon.
3. **Wide cast saddle mantlet** at the turret face (the Leopard 1
   signature §B3.1 mantlet mass): a rounded horizontal casting
   spanning most of the turret front, gun central, coax port right,
   telescope port left.
4. **105 mm L7A3** with full thermal sleeve (the A5 upgrade), mid-tube
   fume extractor, MRS collar, open muzzle bore (§B3.1). Muzzle
   overhangs the bow by ~2.4 m — a long slim tube, visibly slimmer
   than any 120.
5. **Slim low hull with sloped upper sides** (the Leopard 1
   tumblehome): one long shallow glacis sweep, splash-board V on the
   plate, driver front-RIGHT, flat low engine deck, raked louvre banks
   on the rear plate corners.
6. **Running gear EXPOSED**: 7 dual road wheels + 4 return rollers +
   raised idler AND sprocket all readable — the classic fit carries NO
   armour skirts, only the thin rubber side aprons under the fender
   line. Left view counts 7 wheels at a glance (§B8.1 gate 1 is free
   by construction — never curtain it).
7. **Stowage baskets across the turret rear** — the mesh basket frames
   wrapping the bustle, loaded.

## Corroborated dimensions (photo-class targets; spec row = modern2.js)

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length | 7.09 m | Wikipedia Leopard 1, tanks-encyclopedia Leopard 1 |
| Overall length (gun fwd) | 9.54 m | Wikipedia Leopard 1, military-today Leopard 1A5 |
| Width | 3.37 m (3.25 over tracks) | Wikipedia Leopard 1, army-guide Leopard 1A5 |
| Height | 2.62 m (absolute, periscope line; turret roof ~2.39) | Wikipedia Leopard 1 (2.613), steelbeasts SBWiki |
| Combat weight | 42.2 t | Wikipedia Leopard 1A5, army-guide |
| Gun | 105 mm L7A3 (L/52 ≈ 5.46 m tube), thermal sleeve, fume extractor, MRS | Wikipedia Royal Ordnance L7, KMW heritage |
| Running gear | 7 dual road wheels (~0.63 m), 4 return rollers, rear drive sprocket, front idler | photos, Wikipedia Leopard 1 |

Spec dims row (modern2.js TANK_SPECS.leo1a5):
`{ hullLengthM: 7.09, overallLengthM: 9.54, widthM: 3.37, heightM: 2.62 }`
— sovereign four-box anchors. Width anchor = the FENDER/APRON plane at
±1.685 EXACT (§D width-guard; tracks at ±1.625 = the published 3.25).

## §B8.1 PROPORTION GATES — target numbers (checked before detail)
1. **WHEEL EXPOSURE:** no skirts — apron hem 0.72 vs wheel band
   0.045..0.675 (r 0.315 @ y 0.36): wheels 100% exposed, 4 return
   rollers visible in the 0.78 top-run daylight, climbing runs to both
   raised end wheels open. Left view counts 7 + idler + sprocket.
2. **GLACIS PLANE:** ONE shallow plane from the beak crest (y 0.72 @
   z +3.545) to the roof crest (1.38 @ z +1.55) — run ~2.0 m @ ~18°;
   below it the steep lower nose 0.42@3.10 → 0.72@3.545 (~34°). No
   bow cliff: the lit vertical face is the beak edge band only
   (≤ ~0.1 m). Splash-board V rides ON the plane.
3. **TURRET SHAPE LINE:** low angular welded wedge — visible face
   ≈ 0.94 over the 1.38 deck (roof plane 2.32 world) with the walls
   leaning in (base ±1.04 → roof ±0.86), EMES-18 lid ~2.575,
   periscope/whip line ≤ 2.62 (heightM datum). Falsifiable: cast-dome
   or drum reads FAIL; the EMES-18 flat face must read in the right
   front-quarter.
4. **STRUCTURE-MERGE:** turretMass z-span target ≤ 3.0 m ≈ 42% of
   7.09 (cheek tips +0.80 world → basket tail −2.20 world).
5. **GEAR PATTERN:** 7 duals at 0.82 m pitch, 4 rollers at y 0.72,
   idler {z 3.05, y 0.54} + sprocket {z −3.12, y 0.55} BOTH raised
   over wheelY 0.36 → §B6 trapezoid at both ends, open top run.
6. Four-box: overall ≈ 9.54 × 3.37 × 2.62; hull l 7.09 (z ±3.545);
   turretMass l ≤ 3.0 (≤42%); gun bore y ≈ 1.93; muzzle world +6.00.

## Build plan (leopard.js — builder `buildLeo1A5Profile`)
- HULL (bespoke lofts in the builder — leoHullV3 is the Leopard 2 rig
  and stays untouched; zero shared-helper edits, so every leopard.js
  graduate hash holds by construction): lower hull between the tracks,
  sponson band at 0.88 with the sloped upper side plates to the ±1.28
  deck edge (the tumblehome), deck polyline 1.38 → 1.30 tail, one-plane
  glacis + steep lower nose + beak wings, vertical-ish rear plate with
  raked louvre banks + taillights + shackles + flaps, fender planks at
  ±1.685 EXACT with rubber aprons segmented below, driver station
  front-right ON the roof behind the crest, engine deck grilles + fuel
  caps + fan field, §B2 closure inboard of the band inner faces only
  (wheel-train daylight stays REAL air per the §B2 clarification).
- GEAR: KIT.buildRunningGear direct (leoGear hard-codes the Leopard 2
  coveredTop/rollers — not this vehicle): 7 duals r 0.315, 4 rollers,
  raised ends, open top run, arms.
- TURRET: welded wedge (orientedSlab facets, §C.1 winding guard on
  every mirrored slab), ring plinth (§B2 slit closure), EMES-18
  flat-faced housing + twin dark apertures + recessed glass + lid,
  commander/loader hatch rings, loader MG3 = FITTINGS.pintleMG (§B3
  census), 2×4 Wegmann smoke banks per side, grab rails, lift eyes,
  twin whips ≤2.62, mesh stowage baskets across the bustle LOADED
  (stowage/tarp/jerry/spare links), cross + number decals on real
  planes.
- GUN (§B3.1): cast saddle mantlet on gunG (cylX casting + boss +
  cheek fill — never a prism), L7A3 via buildGun {len 5.53, r 0.058,
  sleeve, evac 0.58, MRS} + muzzleBore. gunG at (0, 0.51, 0.52) under
  turretG (0, 1.42, −0.05) → bore y 1.93, muzzle +6.00 = 9.54 EXACT
  over the −3.545 tail.
- Tones: per-build gear tone opt-ins (padHex/chainHex/gearFloor — the
  merkava r12 / chieftain5 r5 lineage) so the exposed gear reads alive,
  never ambient-black.

## r1 SCAFFOLD BUILD (2026-08-07) — first real build of the id, DELIVERED-PENDING-CRITIC

Builder: `buildLeo1A5Profile` (src/vehicles/profiles/leopard.js),
registered `LEOPARD_PROFILES.leo1a5` — overrides the ancient modern2
buildLeo1A5 via PROFILED_BUILDERS. Geometry hash **1c79188** (44 meshes
/ 60781 verts), stable ×2. Graduate holds: **leo2a5 e215a738 / leo2a6
09912270 / leo2_revolution bbae2c80 / kf51 9ac547ac — ALL byte-identical
before AND after the round, ×2 runs** (the builder is a self-contained
function: bespoke hull/gear lofts, ZERO edits to leoHullV3/leoGear/
wedgeTurretV3/leoMantletGun or any shared path).

### Four-box (OFFICIAL tmp-b8-batch probe, shots/base21-scaffold/b8/measures.json)
- overall **9.531 × 3.370 × 2.631** (y-top **2.620 EXACT** = the whip
  tips at the published datum; h carries the ~1.1 cm shoe dip) vs spec
  9.54/3.37/2.62 → −0.1% / EXACT / ✓
- hull l **7.096** (z −3.551..+3.545; +0.08% — the 6 mm rear overshoot
  is the taillight lens class) vs 7.09
- turretMass l **2.940 = 41.4% of hull** ✓ (§B8.1-4 clear)
- muzzle world **+6.00 EXACT** (overall-by-muzzle 9.545), bore y
  **1.93**; saddle mantlet spans w 1.394
- WIDTH ANCHOR: fender planks ±1.685 EXACT (tracks ±1.625 = the
  published 3.25 over tracks; aprons inboard at 1.681).

### §B8.1 self-probe vs targets
1. wheel exposure — NO skirts: 7 duals + 4 return rollers + both raised
   end wheels fully readable, apron hem 0.72 over the 0.045..0.675
   wheel band ✓ (countable at a glance in view-left)
2. glacis — ONE plane 0.72@3.545 → 1.38@1.55 (~18.3° over 2.0 m),
   steep lower nose under it, splash-V riding the plane (+rx per the
   sign law) ✓ no bow cliff
3. turret line — welded wedge, roof 2.32, walls lean in, EMES-18 flat
   face + twin apertures right fore-roof, lid 2.575 ✓
4. structure-merge 41.4% ✓  5. §B6 trapezoid: idler {3.05, 0.54} +
   sprocket {−3.10, 0.55} both raised over wheelY 0.36, open top run ✓

### Battery (official rigs, final bytes)
- track-clip --exact: **0/0 band + 0/0 shoe** (clean on the first run —
  the fender planks sit 3 cm over the 0.94 idler-orbit crest, the
  mudguard drops/flaps clear the ±3.47/−3.50 orbit far edges)
- winding-audit: m1 **rev 0 / mix 0 / deficit 0 px**; m2 **CLEAN 0**
- turret-parent: **stranded 0 / abutting 0 / dangling 0**
- standard-check: NO gate row (FALSE-0 law), clip ✓, **contig 0** ✓,
  decor **mg1+1d** ✓ (loader MG3 pintleMG fitting + glacis
  spareTrackLinks)
- §B5 yaw-90 pair: shots/base21-scaffold/leo1a5-final{,-yaw90}/ — the
  turret (wedge + EMES + baskets + Wegmann banks + whips + saddle +
  gun) yaws as one; hull deck kit static
- npm test: 166 + track-geometry PASS

### 14-view SELF-READS (builder reads, NOT an acceptance bar — §B8;
### views = the critic rig, shots/base21-scaffold/leo1a5-final/)
front 8.3 / frontleft 8.5 / left 8.5 / rearleft 8.3 / rear 8.2 /
rearright 8.3 / right 8.5 / frontright 8.5 / top 8.5 / hero-fl 8.5 /
hero-rr 8.3 / hero-toptilt 8.4 / close-front 8.6 / close-roof 8.4.
Weakest named reads: view-rear basket interior still shades dark (the
half-height mesh fix killed the black-billboard read; a strap/cargo
tone step is the next lever); the head-on glacis reads tonally flat
(geometry is the correct plane — an anti-slip field / grime term is
the a4-class candidate); EMES lid edge slightly proud at close-roof.

### Round fixes banked (r0 → r1)
- Saddle mantlet: first-cut cheek spheres (r 0.25, z-scale 1.30) read
  as searchlight blobs — shrunk/tucked (r 0.20, [1.0, 0.90, 1.12],
  z 0.20) to the compact Leopard 1 saddle.
- Basket back: a full 1.54 × 0.44 dark mesh panel rendered as the
  owner's BLACK-RECTANGLE class in view-rear — half-height mesh +
  mid-rail + cargo raised to read over the mesh line.
- Jack block hullWood → hullTrack (the orange-wood accent law,
  chieftain5 r6 O3b precedent).
- Bow/stern kit tucked inside the ±3.545 hull anchors (brush guards,
  front flap, shackle bows — the +1% hull-length overshoot class).

### Residuals / next-round candidates
- Turret grammar is the BRIEF's welded-family read; if a future owner
  ruling asks for the strict German 1A5 (cast turret + B&V appliqué),
  that is a §B7-class re-region, not a fix of this build.
- The leo1a4 scan §E outlier-strip lane stays open — if it lands,
  re-extract and re-evaluate as a family oracle candidate (turret
  differences priced as parity deviations).
- Independent §B8 photo-parity critic verdict PENDING (builder
  self-reads are not the bar).

## §5.247 LECLERC-LEVEL REDESIGN (2026-08-17) — r2, DELIVERED-PENDING-CRITIC

Owner order (§5.247 ten-tank wave): "full leclerc-level redesign based on
its model and historical references... leave nothing untouched and
unimproved. make sure we load all sources correctly." §K flow executed:
measure → loft to measured lines → close with real geometry → prove in
pixels. Builder `buildLeo1A5Profile` rewritten in place (leopard.js lane;
zero shared-helper edits). Final geometry hash **2aee1f9d** (53 meshes /
84765 verts — the leo2a4 graduate class), **×2 bit-identical**
(order-shuffled runs). Evidence: shots/leo1a5-wave/{baseline,r2a..r2d,
final,final-yaw90}/.

### SOURCES verified first (the §5.247 first step)
- Registration RESOLVES: `LEOPARD_PROFILES.leo1a5` → PROFILED_BUILDERS →
  BUILDERS override (tankFactory). Spec row modern2.js dims 7.09/9.54/
  3.37/2.62 loads.
- Gate print: NONE exists (no docs/geometry-gate/leo1a5.json, no ledger
  row) — the CORRECT state per this packet's FALSE-0 law; not a broken
  row; no gate was run against this id. The visual photoclass rig ×1 was
  the round baseline instead.
- leo1a4_scan partial reference LOADS: docs/references/vertex/
  leo1a4_scan.json (fused, crush-scale — proportional reads only). Used
  this round: body h/w 0.783 (vs published 0.777 ✓), the bow-wing plan
  taper over the last ~0.24 m, and the REAR-CORNER CUT (halfW 0.604 tail
  vs 0.85 mid → the big angled corner louvre banks, now built). The scan
  GLB itself is absent from the live public/models tree (stale dist copy
  only) — consistent with its RE-RIG/unregistered adjudication; it must
  NOT be map-registered until the §E outlier-strip lands.

### Gap table (photo-round contract) — CLOSED
| # | Photo read | Baseline (r1 @ eed3f94e) | Fix (r2 @ 2aee1f9d) |
|---|---|---|---|
| G1 | Saddle mantlet = compact horizontal casting tucked under the brow | cylX end discs + proud ellipsoid cheeks read as a SEARCHLIGHT DRUM (worst §B3 miss) | capsule casting: cylX core + sphere-capped ends inside the cheek line, flat top cover, chin fill, boss, dark part-line; ports kept |
| G2 | Welded turret: strongly leaning faceted walls, tapering hexagon plan | one frustum + flat slab side (~11° lean), plan read arrow-notched | measured 3-panel-per-side hexahedron loft (base A(0.96,−1.30) B(1.06,−0.15) C(0.98,0.34) D(0.60,0.80) → roof A'(0.78,−1.26) B'(0.82,−0.15) C'(0.64,0.30) D'(0.42,0.72); lean 14–17°), leaning rear wall, chin wedge + trunnion frames + brow, two-plate roof, 4 weld seams |
| G3 | Gear alive: scalloped rubber aprons, rollers peeking, dished end wheels | apron band+shadow one black void; rollers invisible; idler/sprocket faces featureless | scalloped bays (hem 0.78/tabs 0.71), rollers r 0.095 peek under the hem, rotation-invariant dished rings + hubs on BOTH end wheels (r ≤ 0.155 under the shoe-horn sweep) |
| G4 | Bow = plates + visible track fronts, small mudguards | full-width camo mudguard wall = bow cliff | narrow outboard rubber drops + hinge strips; track/idler fronts show head-on; blackout lamps + guard bars added |
| G5 | German fender grammar | bare pale planks | 2 stowage bins/side (outer 1.66 < the 1.685 anchor) + latches, Bosch horn, width-indicator rods, axe + crowbar + shovel, extinguisher |
| G6 | Leopard 1 deck + rear grammar | one dark field + 6 slats; stick-on rear vents | framed twin intake fields + spine + slats, TWO cooling-fan rings + hubs + spokes, framed transverse exhaust grille, outboard fuel caps, access seams; rear: corner-cut louvre banks at the deck line (the measured scan corner cut) + rib ladders + frame posts, spare-links fitting, convoy plate, access disc, jack body |
| G7 | Loaded wrap baskets | rigid 4-bay fence read as architecture | finer rails + diagonal X-stays + arms, half-height mesh law kept, cargo densified (2 stowage + 2 ammo + jerry + tarp), FITTINGS.stowageRack ×2 on the side walls (fill 0.85) |
| G8 | EMES-18 embrasure w/ shutters + hood | plain box + proud lid | pedestal + tall housing + twin RECESSED windows behind shutter frames + divider + wiper + hood side cheeks + flush lid (2.585 world < 2.62 datum) |
| G9 | Cupola 8 blocks, domed lids, sprung whips | 6 blocks, flat rings, stick whips | 8-block ring + glass slits (P.q), domed lids + hinges + handle on both hatches, whips = base + spring + 2-segment taper, tips 2.62 EXACT |
| G10 | Wegmann cups on visible brackets | dark panel + dots | bracket plates ON the leaning walls (rz-matched), 2×4 cups/side forward of the racks (never occluded) |
| G11 | L7A3 sleeve/evac/MRS/open bore | ✓ (kept) | buildGun {5.48, r 0.058, sleeve, evac 0.58, collar} + muzzleBore — unchanged |
| G12 | Roof furniture | sparse | roof-edge rails + stanchions, 4 lift eyes, TRP head, decals re-pinned ON the leaning planes (rz 0.31/0.21 = the measured leans, 5 mm proud) |

### Four-box (OFFICIAL tmp-b8 probe, shots/leo1a5-wave/final/measures.json)
- overall **9.537 × 3.370 × 2.643** (y-top **2.620 EXACT** = whip tips at
  the datum; h carries the −0.023 shoe dip) vs 9.54/3.37/2.62 → −0.03% /
  EXACT / ✓. WIDTH ANCHOR: planks ±1.685 EXACT (two in-round breaks —
  apron rail 1.688, louvre-bank swing −3.645 — caught by the probe and
  re-seated INSIDE the anchors same-round).
- hull l **7.102** (z −3.557..+3.545; the 12 mm tail overshoot is the
  same taillight/louvre lens class as r1's certified −3.551..−3.557)
- turretMass l **2.947 = 41.6%** ≤42% ✓ (w 2.352 = the side racks);
  muzzle world **+6.00 EXACT**, bore y **1.93**; saddle w 1.338
- mesh/vert budget: 53 / 84765 (hashgeo) — leo2a4 graduate class ✓

### Battery (official rigs, FINAL bytes)
- track-clip --exact: **band 0/0 + shoe 0/0** (in-round finds fixed:
  corner banks re-seated at the deck line over the sprocket wrap, jack
  body pulled out of the track lane, end-wheel rings capped r ≤ 0.155
  under the guide-horn sweep — each re-measured to 0)
- winding-audit: m1 **rev 0 / mix 0 / deficit 0 px**; m2 **0 candidates**
- turret-parent: **stranded 0 / abutting 0 / dangling 0**
- standard-check: **NO gate row (FALSE-0 ✓)**, clip ✓, contig **0** ✓,
  decor **mg1+4d** ✓ (pintleMG + spareTrackLinks ×2 + stowageRack ×2 —
  up from r1's mg1+1d)
- npm test: exit 0 (all selftests incl. track-geometry PASS)
- §B5 yaw-90 pair: shots/leo1a5-wave/final{,-yaw90}/ — turret (loft +
  EMES + cupola + MG + racks + baskets + cups + whips + saddle + gun)
  yaws as ONE; hull kit static
- GUARD PROOF (×2 runs, spanning TWO parallel-landing HEAD moves
  9c583790 → d046f113 → 609ad37a; lane files name-diff-verified
  untouched): leo2a4 3e07c84f / leo2a5 6ecdfb06 / leo2a6 e99dd7f8 /
  leo2a7v a755d23c / leopard2_proto 2a88d640 / leo2_revolution f55a29c8 /
  kf51 ffb1144c / kf51b 492c42e8 — **ALL byte-identical before, during
  and after the round.**

### 14-view SELF-READS (builder estimates, NOT the bar — §B8 critic pending)
front 8.7 / frontleft 8.7 / left 8.7 / rearleft 8.6 / rear 8.5 /
rearright 8.6 / right 8.7 / frontright 8.7 / top 8.8 / hero-fl 8.7 /
hero-rr 8.6 / hero-toptilt 8.7 / close-front 8.7 / close-roof 8.6.

### Residuals / next-round candidates
- Sprocket carrier face still shades dark in pure side view (rings
  present; the toothed ring carries the read) — a pale hub accent is the
  next lever if the critic asks.
- Corner louvre banks foreshorten from dead-rear (strong at 3/4) — a
  darker slat-gap term could lift the head-on read.
- hull-bucket y-max moved 1.496 → 1.571 (the rear-plate spare-links
  fitting top) — inside every anchor; no gate row exists for this id.
- Turret grammar remains the OWNER-BRIEF welded family (a strict-German
  cast+B&V ruling would be a §B7 re-region — unchanged from r1).
- leo1a4 scan §E outlier-strip lane still open (family-oracle candidate
  if repaired); the gap table above is the re-verify checklist.

## LEOPARD 1A4 PHOTOGRAMMETRY SCAN (2026-08-06 base-21 wave — report-only)
"Leopard 1A4 [photogrammetry scan]" by pervonharke, CC-BY-4.0 verified —
`community/leopard_1a4_photogrammetry_scan.glb` (56 MB, 1,085,034 verts
/ 583,305 tris, 17 mesh chunks named `Stereo textured mesh`, unlit
photogrammetry texture). The 1A4 shares the 1A5's hull/turret lineage
(welded turret family) — banked as leo1a5 build INFLUENCE. Extract
committed: docs/references/vertex/leo1a4_scan.json (vertex REG id
`leo1a4_scan`, fixedMount whole-box — no turret node exists in a scan;
NOT in any harness map).

### The scan is NOT oracle-grade as-is (accessor-outlier crush, §E class)
- The accessor min/max corner box spans ~2.5x the visible tank along
  the length axis (raw bbox 586 x 321 x 1000 units) — photogrammetry
  OUTLIER POINTS far from the vehicle inflate it. Loader-parity
  normalization (which trusts accessor boxes, GLTFLoader semantics)
  therefore CRUSHES the visible tank to ~39% scale: every mask dim
  reads -57..-62% (overall 3.74 vs the 9.54 target it was scaled to).
  The same crush would hit the runtime loader and every harness — DO
  NOT register this print in any map until a §E repair strips the
  outliers and rebuilds accessor min/max (orchestrator lane).
- The VISIBLE geometry itself is proportionally trustworthy: body
  height / width = 0.783 vs published 0.777 (2.62/3.37) — sub-1%
  agreement. Station widths across the body (crush-scale): 1.30-1.42
  wide over stations 0-10 with the gun spike at stations 11-13 —
  a clean single-vehicle scan (no ground plane in the mask; the
  outliers are sparse points, not terrain).
- Length reads short of published even proportionally (overall/width
  2.61 vs 2.83 published): muzzle-end truncation in the scan is likely
  — verify before using it as a length authority.

### What the leo1a5 lane can use TODAY (influence, not gate)
Curve/station data in the extract for the welded-turret grammar, wheel
spacing, and the 1A4/1A5 turret-face read; photos remain the primary
photo-class source. If the §E outlier-strip lands, re-extract and
re-evaluate as a real leo1a5-family oracle candidate (the 1A4/1A5
turret differences — B&V add-on armor, EMES-18 vs the 1A4's EMES-12A1 —
must be priced as parity deviations, never chased).
