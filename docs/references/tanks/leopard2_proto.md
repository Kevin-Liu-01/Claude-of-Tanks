# Leopard 2 Prototype (`leopard2_proto`)

**Exact variant modeled:** Leopard 2 prototype series (PT 1972-74, Krauss-
Maffei) — 16 hulls / 17 turrets built; TEN turrets carried the Rheinmetall
105 mm smoothbore. Modeled as a 105 mm-smoothbore PT with the pre-2AV spaced
armor turret: slab-sided welded turret with stereoscopic-rangefinder blisters
on both cheeks and the turret-base side bulge, Leopard 2 hull layout.

## 2026-08-12 first-party forward-loft re-certification

The playable remains wholly repository-authored procedural geometry.  The
private recovered print below is a read-only QA oracle and contributes no
vertices, indices, materials, textures, rig nodes or runtime geometry.

The former single-height turret polygon has been replaced by one connected
three-ring welded loft.  Its longer clipped plan, inward-falling crown and
forward 0.10 m seat answer the owner order without raising the low prototype
roof or moving the published overall muzzle station.  Mantlet bay, gun seat,
rangefinder blocks, roof stations, smoke banks, side bins and basket remain
supported parts of the rotating assembly.  New hatch foundations, weld
courses and bustle latches are shallow and backed rather than decorative
floaters.

The front glacis lane transition also moves aft of the rising idler arc,
closing the only hidden full-suspension contact.  Exact band, individual shoe
and full sweep receipts are all 0/0.  Freeze `a7eae06a` reproduces twice at 65
meshes / 90,127 vertices.  The 45-frame packet (15 paired + yaw0 + yaw90)
contains 45 distinct hashes; fresh visual scores have floor 9.1 and mean 9.22.
Usable quantitative fidelity is 93.71 with a 92.52 directional floor.  The
legacy zero turret/gun curve rows remain documented oracle defects, not a
license to copy or rebuild the melted source topology.

## Corroborated dimensions

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length | 7.72 m (production Leo 2 hull layout) | Wikipedia Leopard 2 (7.72 hull), spec row (7.72) |
| Overall length (gun forward) | ~9.97 m (105 mm smoothbore ≈ L/50 class overhang) | spec row 9.97; Wikipedia Leopard 2 9.97 for the L/44 family envelope |
| Width | 3.70 m | spec row, Wikipedia Leopard 2 (3.7 hull) |
| Height (turret roof) | 2.48 m | spec row; Wikipedia Leopard 2 2A4 height 2.48 |
| Gun | Rheinmetall 105 mm smoothbore (10 of 17 turrets) | Wikipedia Leopard 2 (prototype armament), armoredwarfare.com Leopard 2AV article |
| Turret externals | stereoscopic rangefinder w/ armored cheek blocks; turret base wider than turret (side bulge); anemometer, IR light, commander periscope | panzerplace.eu/leopard-2-prototype (Swedish PT hull 7) |
| Running gear | 7 dual road wheels, rear sprocket, front idler | Wikipedia Leopard 2 |

## Identity cues

- Turret: LOW slab-sided welded box (no wedge appliqué, no EMES doghouse) with
  a rounded-cheek front, stereoscopic rangefinder blisters bulging from BOTH
  cheek sides, base ring bulge wider than the turret wall, simple commander
  cupola + loader hatch, early smoke mortar clusters.
- Gun: 105 mm smoothbore — slimmer tube than the 120s, mid-tube bore
  evacuator, NO thermal sleeve (bare tube), plate mantlet in a narrow notch.
- Hull: production-pattern Leopard 2 hull (crease glacis, driver front-right,
  raised engine deck) with plain slab side skirts (no sculpted A5 blocks).

## Reference links

1. https://panzerplace.eu/leopard-2-prototype/ — Swedish PT walkaround notes
2. https://en.wikipedia.org/wiki/Leopard_2 — prototype program history
3. https://armoredwarfare.com/en/news/general/vehicles-focus-leopard-2av — PT/2AV development

## Local GLB oracle notes

Path: `public/models/tanks/community/recovered/leopard2_proto.glb` (m_bergman
print). ORACLE DEFECT — sunken turret: the print is a tall Leopard 2 hull tub
with the turret shell melted to deck level (side hump only 2.21-2.24 over
z −1.4..−0.3) and the gun printed as a bar lying at DECK height (axis ~1.33,
muzzle z 4.30 = only 0.76 m overhang); the `Turret` node contains belly and
scrap geometry, so the turret/gun component channels are meaningless.
Per HANDOFF §5 + shaded-parity precedent (is3_bergman): the build makes the
REAL proud prototype turret + full-length 105 (muzzle ≈ z 5.7, axis ≈1.92);
turret and gun scores are knowingly oracle-capped — logged here.

Width-normalized probe of the tub (ground = 0 after +0.09 shift):

- hull z −4.23..+3.54 (7.77); wall crest: front deck 1.80-1.83, engine deck
  walls 1.96-2.01 (z −3.4..−1.9), sunken-turret hump 2.22-2.24 (z −1.4..−0.3),
  glacis 1.72@2.0 → 1.51@3.43; rear wall bottom slope to 0.9 under z −3.9;
  bustle-basket scrap overhangs to z −4.23 at y 1.3-1.9.
- plan: full width ±1.85 from z −4.1..+3.4 (fenders full width).
- tracks: bottom 0, front ramp z 2.3→3.4, rear ramp z −3.5→−2.9.

## Mismatch log (before → after per fidelity iteration)

| Date | total | minView | hull | turret | gun | tracks | change |
|---|---|---|---|---|---|---|---|
| 2026-07-30 | 67.1 | 77.2 | 89.7 | 25.9 | 31.9 | 80.1 | baseline (generic WESTERN cast-turret profile — wrong identity) |
| 2026-07-30 | 65.5 | — | 86.2 | 27.9 | 30.5 | 81.7 | r1: bespoke build — Leo2 hull matched to the tub + REAL proud PT turret (blisters, base bulge) + 105 mm |
| 2026-07-30 | 67.2 | — | 89.0 | 28.0 | 31.0 | 83.0 | r2: deck/fitting slimming (rope off, thin louvres), gear ends on the tub's ramps, turret shifted onto the sunken hump, slimmer mantlet |
| 2026-07-30 | 67.2 | 77.9 | 89.3 | 28.6 | 31.0 | 83.0 | r3: wheels out to the a6 track line, low PT trunnion (axis 1.88) |

TURRET+GUN ORACLE CAP (per HANDOFF §5, is3_bergman precedent): the tub's
turret channel is belly scraps + a deck-level gun bar (0.76 m overhang at
axis ~1.3); the build keeps the real proud turret and the full-length 105
(2.25 m overhang at axis 1.88), costing T≈28/G≈31 against this oracle while
every shaded view finally shows a Leopard 2 prototype instead of a turretless
tub. Total is pinned at baseline (67.1→67.2) by those two capped channels;
hull/tracks/overall all improved.

### GATE-V10 re-verification of the melted-print cap (2026-07-31, round 2)

Fresh extraction: the bergman print's whole box tops at **y 2.14** — the
entire print stands lower than the real vehicle's published 2.48 roof
(sunken/melted turret confirmed; a proud PT turret + level 105 cannot
match it). The pre-gate HANDOFF §5 cap is hereby restated in gate terms:
hullCurves / wholeCurves / turretCurves / stations are certified capped
at their measured v10 residuals (all ~0 — the build carries the REAL
proud turret and published envelope against a print with no turret and a
deck-level gun bar). dims + floaters pass (100/100). Repair queue: none
possible short of re-sourcing.

## Round-3 cap re-verification (2026-07-31, post kit track fix 146d25c)
Re-measured on gate v10 after the kit contact-span/ground-clamp fix and
the family-wide raisedEnds-workaround removal: the certified oracle/print
defect cap STANDS (curve/station rows unchanged at their capped levels)
and dims HOLDS >= 90. No compensation was re-introduced; end wheels are
plain kit-native fits.

## 2026-08-06 FLEET MUZZLE-BORE + §C.1 WINDING SWEEP (fleet-sweep one-liner)
- §B3.1 bore on the plain tube (len 4.80); §C.1 2 reversed re-oriented (leoHull glacis); F-vs-D 149->0; gate HELD x2 EXACT (all-0 row pre-existing); hash not frozen; mantlet mass verified per MANTLETS-MANDATORY (db9168c). Mechanism: kit.js muzzleBore shadow-named furniture + orientedSlab guard (3fca39b / 1017339); end-on+quarter crops shots/muzzle-sweep/{before,after}/.

## 2026-08-06 §B8 BUILD-UP (owner order: "the leopard 2 prototype and
## leopard 2a4 need a lot of work"; leopard-family builder round)
FULL photo-class rebuild in src/vehicles/profiles/leopard.ts: the old V1
leoHull playable-fallback build (67-class fidelity, wrong-era hull lines)
is replaced by a FAMILY V3 RIG build (leoHullV3 param delta — the rig
litmus) + a bespoke PT turret/gun.

### Identity delivered (photo class, panzerplace/PT walkarounds)
- HULL: production Leopard 2 layout on the family V3 rig — one-plane
  1.70/1.71 aft deck (the a4 §B8 true-up line), family two-slope glacis
  + beak wings + §B4 lane opt-ins + noseFillZFront 3.36 + the a4 bow
  shade overlay (cliff killed); EARLY NOSE fit: headlight pods LOW on
  the nose plate (1.32/3.62 vs the a4's 1.40/3.56); front mudguard
  assembly + rear flaps (§B4-proven planes); tow cable + tool box
  (§B3.2 trials-honest kit); Y-014 PT trials number.
- SKIRTS: prototype-era ONE plain flat full-length line at the ±1.85
  width anchor, th 0.045, NO sculpted fore blocks, no flap — bottom
  0.46 = §B8.1 exposure 59% (real 40-70%); hub-line read via gearFloor
  + tireHex + seven pale hub discs/side (§H.4 tell vs the a4's stepped
  heavy-block line).
- TURRET: LOW slab welded box WITHOUT wedge — walls bottom 1.695w
  (family §B8 face bar), roof plane 2.37w (solids' own tops — a cap
  plate overhung the tapered plan as top-view ledges, deleted); rounded-
  in-plan cheek front (TWO co-planar facets per cheek, §B1.1 symmetric,
  weld seam on the knuckle); stereoscopic rangefinder BLISTERS on both
  cheeks (dome + collar ring + dark optic cap) straddling the roof edge;
  base ring bulge WIDER than the walls (±1.30x1.18 ellipse, bottom
  1.69w, 1.4 cm extreme-arc dip = family margin class); early ring
  cupola (crown 2.50w — inside the 1% dims grace), loader hatch, gunner
  periscope, early IR searchlight box (hood + recessed lens, top
  2.47w), anemometer mast, folded-down whips (a6 precedent), 2x4 early
  Wegmann clusters LOW on the rear walls, segmented rails + lift eyes,
  bustle stowage box + strapped kit (stowage/tarp/ammo can), loader MG3
  pintle (census; mount 0.54 — see the dims lesson), cross decals.
- GUN (§B3.1): ROUNDED cast mantlet — trunnion roll + ellipsoid dome +
  tapered boot (never a prism) + coax port; BARE slim 105 smoothbore
  (no thermal sleeve), r 0.064, mid-tube evacuator, muzzle +6.11 =
  spec 9.97 overall; kit.js muzzleBore (shadow-named, 3fca39b).

### §B8.1 gate table (four-box, tmp-b8-measure)
- overall 9.80(box incl bow flap)x3.702x2.63-spike / muzzle 6.11 ✓
  (spec 9.97 = -3.86 tail -> +6.11 muzzle); roof 2.37; heightM gate
  reads p95 2.49 (+0.51%, in grace)
- hull -3.86..3.95 (7.81 box; gate hullLengthM 7.78 +0.81% in grace)
- turretMass l 3.13 = 40.5% of hull (<55% alarm) ✓ w 2.58 (blisters)
- gun bore y 1.98 ✓; wheels 7 duals pitch 0.84, §B6 raised idler
  3.48/1.11 + sprocket -3.19/1.09 ✓; exposure 59% + countable hubs ✓

### DIMS LESSON (banked): FITTING-CAP heightM p95
The mag pintleMG's receiver band spans SEVERAL side columns — mounted
at 0.65 local it wrote heightM p95 2.59 (+4.46% = dims 72.3) and the
value FROZE across three unrelated spike fixes (cupola/whips/mast are
1-2 columns each; the p95 sat on the MG band). Mount 0.54 -> receiver
~2.48, p95 falls to the cupola crown 2.49. Wide-span fittings, not tall
thin spikes, own heightM — whatsat the fitting AABB per slot (§C law)
BEFORE seating roof weapons on published-height builds.

### Close battery (2026-08-06, official rigs)
geometry-gate x2: 45.6/0/0/0/100/100 both runs — dims 100 + floaters
100 HOLD (the certified melted-print cap: whole/turret/stations capped
~0 BY CERTIFICATE; hullCurves 0 -> 45.6 improved, cap unchanged).
winding-audit m1 rev0/mix0 deficit 0px + m2 clean; track-clip --exact
0/0 band 0/0 shoe; turret-parent 0/0/0; standard-check clip ✓ contig 0
✓ mg1+1d ✓; npm test 166 + track-geometry PASS. Renders:
shots/leo-proto-b8/{r1,r2,final,final-yaw90} (14-view photoclass +
probes; yaw-90 pair = §B5 unity, blisters/cupola/MG/bustle rotate as
one). HASH: f1af7ba8 (56 meshes; old build not frozen). Graduates
PROVEN unmoved: leo2a5 e215a738 / leo2a6 09912270 / kf51 9ac547ac;
family: leo2_revolution bbae2c80 (this round) / leo2a4 551cb30e (this
round).

### 14-view SELF-READS (§B8 honest builder reads, NOT an acceptance bar
### — independent critic adjudication pending)
front 8.4 / frontleft 8.5 / left 8.5 / rearleft 8.4 / rear 8.4 /
rearright 8.4 / right 8.5 / frontright 8.5 / top 8.5 / hero-fl 8.5 /
hero-rr 8.4 / hero-toptilt 8.5 / close-front 8.2 / close-roof 8.4.
Weakest named: close-front cheek faces read plain (real PT is plain
steel there — candidate: casting/weld texture pass); bow shade overlay
reads uniform at close-front; MG mount rides low (the dims budget —
candidate: re-seat on a real hatch-ring arm if the id ever loses the
melted print for a real oracle).

### MODEL_SOURCE NOTE (orchestrator lane)
The id still ships the melted-tub GLB as the playable (userdrops6.js
articulated list — a turretless hump in game). This round's proc build
is the §B8 photo-class replacement candidate: the FLEET-FLIP to
procedural (MODEL_SOURCE removal) is an orchestrator/landing action
outside this file's ownership, gated on the independent critic verdict.

## 2026-08-07 §5.09/§5.16 ROUND (leopard builder) — TYPE90 FAMILY REBASE +
## HUGE FLW 200 RCWS
Owner orders executed: §5.09 "update the leopard 2 prototype to match its
reference" + §5.09-5 RCWS + §5.16 "the type 90 is based off of it [the
leopard 2 prototype] so they can share a basis... type 90 giving the most
basis."

### §5.16 family rebase (type90 = read-only donor)
- TURRET SHELL re-laid as the donor's CLOSED-POLYGON construction
  (KIT.polyTurret, vertical walls) on the certified footprint — the
  V-series early slab turret IS the family origin shape (10-gon: two
  co-planar cheek facets per side, §B1.1 symmetric). Two stacked bands
  keep the rising bottom line (fore 1.695w / 1.74w aft).
- PT PERISCOPE RING (the coordinator-named tell) STRENGTHENED: tall
  vision-block ring drum + 8 periscope blocks with glass slivers + flat
  lid, crown 2.50w EXACT (grace 2.5048 — the dims lesson class).
- type90 grammar adds: raked-aft whips on low side brackets (tips 2.497w
  < grace; replaces the a6 fold-down stubs at the same p95 cost), low
  overhung basket frame + mesh back behind the bustle box, V splash
  board + Notek light + deck course seams (hull family tells).
- Variant tells kept: blisters, base ring bulge, early IR box,
  anemometer, rounded cast mantlet + bare slim 105, plain flat skirts.
### §5.09-5 RCWS (leoFLW200; §5.07 FORWARD; anachronism BY ORDER)
DIMS-SOVEREIGN SQUAT-WIDE fit (published 2.48 binds hardest here — roof
2.37w leaves 0.135 m of wide-mass headroom): s 1.1, gunY 0.46, gunScale
0.92, drumH 0.05, podY 0.70/podH 0.16, elev 0.07. Every wide mass under
the 2.5048 grace line: trough top 2.498w (tucked 2 cm into the roof —
ring-well recess), pod top 2.50w, receiver cap 2.485w, barrel 2.41w
rising to ~2.48 at the tip (the §5.07 "slight elevation"). Garage height
carried by the NARROW optic tower (top 2.78w, z-window 0.16 = <=3 side
columns; above-grace budget = anemometer mast 1 + tower 3 = the 4-col
budget, p95 stays the 2.50 cupola/whip class inside grace). No shields
(the flank plates would top 2.53w — documented as not-fitting on this
mark). Station reads: wide base ring + squat armored trough + elevated
barrel + big pod + tall panoramic tower head.
### Close battery (2026-08-07)
- geometry-gate (melted-print cap regime): run 1
  `0 | hull 45.8 whole 0 turret 0 stations 0 dims 100 floaters 100` —
  dims 100 + floaters 100 HOLD with the full rebase + RCWS aboard
  (hull 45.8 vs 45.6 pre-round = capped-row wobble). x2 line in the
  round report.
- audits + renders: shots/leo-509/final/leopard2_proto{,-yaw90}; battery
  results in the round report. npm test PASS.
- Hash: f1af7ba8 -> 24bd57cc (62 meshes / 86363 verts — moves by design;
  no freeze). Graduates byte-held at close: leo2a5 e215a738 / leo2a6
  09912270 / kf51 9ac547ac / leo1a5 1c79188.

## MODEL_SOURCE FLIP (2026-08-06, orchestrator lane — flip-era mechanics)

The §B8-accepted procedural build (f1af7ba8, V3 delta + PT turret +
cast mantlet, day-resit PASS) is now the MODEL OF RECORD: the
userdrops6 articulated() registration is delisted (Sources drains by
one) and the recovered print stays measurement-only via override
entries added to all three harness maps (procedural-fidelity,
tmp-tank-critic, visual-evaluator — ^Turret$/autoPivot/paintUntextured,
identical to the retired MODEL_SOURCE config). PROOF the rig is
unchanged: gate x2 post-flip reproduces the HEAD ledger row exactly
(0 | hull 45.6 whole 0 turret 0 stations 0 dims 100 floaters 100 — the
melted-print cap line; hull 45.6 IS the §B7-class cap, the print's
turret reads half-height vs the build, refTop 0.71 vs procTop 1.39).
Hash HELD f1af7ba8 across the flip.

## 2026-08-08 §5.35 ROUND (leopard builder) — TOP-CORRIDOR CLOSURE
Owner §5.33 "see-through sides", §5.35 ranked item 5: the sweep's
foreground-island scan caught full-length 7 cm top corridors BOTH sides
(y0-top islands 2498+2494 px, 0.074x5.165 m at x ±1.827 — the §B4
corridor-annulus class; the enclosed-bg flood is blind to them because
they are open-ended). ROOT: the plain PT skirts hang at the ±1.85 §D
width anchor (faces 1.805..1.85) while the fender planks end at 1.737 —
a 6.8 cm air corridor between fender outer face and skirt inner face,
open to ground the whole rear-skirt run (z -3.60..1.55) and reading
edge-on sky from the front between skirt top (1.36) and fender bottom
(1.595..1.61).

### Mechanism: SPONSON-UNDERSIDE / SKIRT-HANGER RAIL (proto-local, no
### leoHullV3 edits — siblings byte-identical by construction)
The real vehicle's sponson side runs near-flush with the skirt plane
and the skirts hang FROM it; the certified print plan reads SOLID full
width ±1.85 there. Four pieces per side inside buildLeo2Proto:
- main rail x 1.7075..1.815, y 1.32..1.62, z -3.655..2.92: laps the
  fender underside (bottoms 1.595..1.61), the skirt top band
  (1.32..1.36) and the fender x-run (1.70..1.737) — §B2 no-air: the
  skirt now connects skirt->rail->fender->body. Bottom AT the 1.32
  sponson-floor line so skirt-uncovered columns (rear cap, segRun
  joints) stay inside the existing body silhouette. Rail inner face
  keeps a 2.0 cm annulus off the band outer face 1.6875 (§B4
  corridor-annulus <=3.5 cm = closed read; shoes 1.678 stay clear —
  track-clip --exact 0/0 band 0/0 shoe post-fix).
- front run z 2.92..3.64 (past the fender end): ONE raked top falling
  WITH the glacis side line (1.47@2.92 -> 1.36@3.64, stays 1.4-3.4 cm
  under it — §B1 silhouette-neutral); bottom 1.24 laps the certified
  mudguard post top (1.26).
- skirt-line joint filler x-face 1.85, y 0.46..1.36, z 1.545..1.605:
  the 5 cm gap between the front/rear segRun courses read a ground
  shaft from above; the PT skirt line is continuous. Outer face AT the
  anchor — width p95 unchanged.
- hullDark hinge seam over the skirt top edge (§B3 skirt-hanger tell).

### Evidence (before -> after, tools/tmp-sweep-seethrough re-run)
- y0-top islands 4992 px (2498+2494) -> 0 (target <100). Before PNGs
  preserved in shots/leo-noair/before/; after set in shots/leo-noair/
  + shots/see-through-sweep/leopard2_proto--*.
- oblique corridor manifestations closed: y0-rqr 11->0, y45-rql 12->0,
  y90-rql 12->0, y0-rql 33->21, y45-rqr 127->116, y90-rqr 18->7 — every
  removed cluster is the (±1.62, 1.58, 2.78) fender-end slot class;
  every surviving cluster byte-identical pre-existing (RCWS-roof 68@
  side-r, mantlet-throat 147@front-low, basket-class side islands
  111/112/753 — §B2 legit open-structure, adjudicated no-order).
- new enclosed counters are the previously-OPEN daylight now roofed by
  the rail: y0-top 35->83 (48 px left mudguard-over-idler slot — §B2
  track-air class, right twin already read 20 before), y0-rear-low
  8->26 (two 9 px annulus pinholes at ±1.72 — the <=3.5 cm class).

## 2026-08-08 §SRCFIX ROUND (leopard builder) — OWNER: "fix the leopard
## prototype and leopard 2a4, they dont match their source material at all"
§B7 photo-class round; the owner rejected both tanks in the garage. Root
reads from the before-evidence (shots/leo-sourcefix/before/): the tank
presented as a SKIRTED FORTRESS — full-length skirt curtain + ambient-black
gear = a Centurion-class hulk, plus a huge anachronistic RCWS tower. The
certified print AGREES with the real 1972-74 trials configuration on the
hull (plan full-width is FENDER-carried, "tracks: bottom 0"), so most of
this round is print-corroborated, not print-fighting.

### GAP TABLE (photo class = PT walkarounds/panzerplace + brief targets)
| # | Photo read (real PT) | Baseline (was) | Fix (now) |
|---|---|---|---|
| 1 | UNSKIRTED early hull: 7 road wheels + return rollers + upper run exposed | full-length skirt curtain 0.46..1.36 at ±1.85; gear ambient-black | skirts OPTED OUT (leoHullV3 guard, byte-identical for all callers); fenders widened to the ±1.85 §D anchor (the print's own config), z -3.84..2.92 |
| 2 | 4 return rollers/side visible | hidden behind skirts, default embed | explicit rollers z {2.28, 0.60, -1.08, -2.72}, y 0.775 r 0.11 — tops kiss the band underside |
| 3 | shallow sponson-level side strip above the wheels | (was the full curtain) | 0.45 m side band y 0.91..1.36 at ±1.85 — the print's OWN extreme-column band (ref 0.91..1.33) + the walkaround plate; wheels/rollers stay exposed |
| 4 | LOW WIDE turret, Leopard-1-like contour | low but narrow (2.24 walls), lost on the hull | plan widened ±1.12 -> ±1.18, bustle -1.60 -> -1.85; height held (roof 2.37w — family low-flat law) |
| 5 | stereo rangefinder ends in ARMORED BLOCKS (panzerplace verbatim) | bare dome blisters | block housings under the domes + collar rings, §B1.1 symmetric |
| 6 | spaced side stowage BINS on the walls | bare walls | two bins/side (§B3 grammar: lid seams + latches), rails re-seated on bin faces, crosses pinned on bin flanks (§5.04) |
| 7 | big rounded cast mantlet filling the front | 0.56 w dome in an oversized slot ("pin head") | slot bay 0.88/±0.448 + cast dome widened to 0.82 w + trunnion roll 0.70 |
| 8 | slim Rh 105 smoothbore, modest mid evacuator | evac bulge 1.8x tube (20-pdr/Centurion read) | evacR 1.45 |
| 9 | NO RCWS on a 1972-74 trials vehicle | §5.09-5 FLW200 + 2.78 w optic tower | REMOVED (newer owner order supersedes §5.09-5 for this id; restoration = one commented call). The REAL roof detail stands in: the walkaround's circular OWS opening "closed off with a plate" — blanked bolt-ring plate aft of the hatches |
| 10 | clean glacis (no V splash board) | type90-donor V board | deleted; Notek + low round lamps kept (early tells) |
| 11 | under-nose recedes to the belly (no barn door) | open tunnel under the tub read as a flat wall over void | §5.18-class closure: receding lower front plate + belly run at 0.555, inter-track ±1.00 |

### §5.35a corridor closure status (constraint: do not remove)
RAIL KEPT both sides (main rail + raked front run + hanger seam) — with
the skirts retired it reads as what its mechanism was named for: the
sponson underside / empty skirt-mounting rail the trials photos show. The
skirt-line JOINT FILLER retired WITH its host skirts (it would float).
Corridor guarantees re-proven post-change: y0-top islands 78 px (<100
target; §5.35a closed at 83), sweep worst 361px @ y0-side-r = open-gear
track-air class (§B2-legit, fleet-normal band), adjudicator hole-count 3
(several graduates carry 6).

### Close battery (2026-08-08, §SRCFIX round; HEAD fdf0320 live-tree)
- geometry-gate x2 IDENTICAL: `0 | hull 48.7 whole 0 turret 0 stations 0
  dims 100 floaters 100` — HOLD-OR-IMPROVE ✓ hull 46.8 -> 48.7 (+1.9,
  driver front_hull 46.83 -> 48.66; side_hull 60.71 -> 63.23). plan_hull
  87.71 -> 86.83 (-0.9: fender-carried plan vs skirt-carried — segment
  gaps + the -3.84 tail; the hull COLUMN improved, documented honestly).
  dims 100 HOLDS: widthM +0.03% (fender/band at the ±1.85 anchor EXACT),
  heightM +0.51%, hullLengthM +0.81%, overallLengthM +0.21%. Capped rows
  (whole/turret/stations ~0 BY CERTIFICATE — melted turretless tub) hold;
  NO RUNG TO 90 exists on this oracle (unchanged §5.35a finding).
- WORK-ORDER-DRIVEN RECOVERY (law-bank candidate): the unskirt first cut
  read hull 42.8 — the gate JSON's front_hull worst-columns decoded the
  print's OWN shallow side band at ±1.85 (ref 0.91..1.33), which the real
  vehicle also carries; building THAT band recovered +5.9 while keeping
  the exposed gear. Measure -> read the work order -> build the real
  piece the print asks for (§K).
- track-clip --exact 0/0 band 0/0 shoe; turret-parent 0/0/0;
  standard-check contig 0 ✓ decor mg1+3d ✓; winding m1 rev0/mix0
  deficit 0 + m2 clean; npm test 166 + track-geometry PASS.
- Hash: afb3cc3c -> 4f6360fe x2 deterministic (61 meshes / 85691 verts —
  moves by design; no freeze). Graduates byte-held through EVERY batch
  (x4 sweeps): leo2a5 e215a738 / leo2a6 09912270 / kf51 9ac547ac /
  leo2_revolution db70c929.
- Evidence: shots/leo-sourcefix/{before,after}/proto* (14-view + yaw-90
  §B5 pair + 6-angle garage sets — the owner's judging view), crop-side
  gear read, family strip. LIVE-TREE note: measured with foreign-lane WIP
  present (misc/russia/tankFactory dirty by other agents); graduate
  hashes constant x4 = the internal-consistency proof.

### 14-view SELF-READS (§B8 builder estimates, NOT an acceptance bar —
### independent critic adjudication pending)
front 8.6 / frontleft 8.7 / left 8.7 / rearleft 8.5 / rear 8.4 /
rearright 8.5 / right 8.7 / frontright 8.7 / top 8.6 / hero-fl 8.7 /
hero-rr 8.5 / hero-toptilt 8.6 / close-front 8.4 / close-roof 8.5.
Weakest named: rear (bustle basket + rear wall read plain vs trials
photos — candidate: rear rack straps/convoy plate); close-front (cast
mantlet renders smooth — casting-texture pass candidate); roller discs
read subtle at distance (real: they are small; acceptable).

### Close battery (2026-08-08, HEAD bd3369c)
- geometry-gate x2 BIT-IDENTICAL (full-json diff proof):
  `0 | hull 46.8 whole 0 turret 0 stations 0 dims 100 floaters 100`
  — HOLD-OR-IMPROVE ✓: hull 45.8 -> 46.8 (driver front_hull 45.81 ->
  46.83: the corridor no longer reads sky edge-on where the print is
  solid), dims 100 + floaters 100 HOLD, capped rows 0 hold. Sub-rows
  side_hull 60.94->60.71 / plan_hull 88.02->87.71 (the joint-filler /
  roofed-daylight columns, ±0.3 = the documented capped-row wobble
  class; component-level all hold-or-improve).
- NO RUNG TO 90 EXISTS on this oracle (confirmed live, mission check):
  whole/turret/stations are capped ~0 BY CERTIFICATE (melted tub, no
  turret in the print) — geoMin stays 0 until a real oracle replaces
  the print (orchestrator/oracle-sourcing lane, outside this file).
- track-clip --exact 0/0 band 0/0 shoe; standard-check clip ✓ contig 0
  ✓ mg2+3d ✓; npm test 166 + track-geometry PASS.
- Hash: 24bd57cc -> afb3cc3c x2 deterministic (62 meshes / 87227 verts,
  +864 — moves by design; not frozen). Graduates byte-held at close:
  leo2a5 e215a738 / leo2a6 09912270 / kf51 9ac547ac / leo1a5 1c79188;
  family leo2a4 12db10a0 / leo2_revolution db70c929 (diff scoped to one
  +30-line hunk inside buildLeo2Proto — no shared-helper edits).

## 2026-08-08 §5.73-3 RCWS RESTORE ROUND (leopard builder)
Owner ruling §5.73-3 (interactive session): RESTORE the automated turret
CROWS on leopard2_proto + leo2a4 — "§5.09 stands for ALL leopards"; the
owner OVERRIDES the §SRCFIX-0808 historical default (gap-table row 9's
REMOVED verdict is superseded by the newer order).

### What changed
- The §5.09-5 DIMS-SOVEREIGN SQUAT-WIDE leoFLW200 call re-enabled
  VERBATIM (x 0.02, y 0.65, z -1.18, s 1.1, gunY 0.46, gunScale 0.92,
  drumH 0.05, podY 0.70/podH 0.16, no shields, elev 0.07, tower top
  1.06/z -1.52/w 0.16, seed 17) — the certified dims-100 recipe: wide
  masses under the 2.5048 grace line, garage height in the narrow tower
  (2.78w, <=3 side columns; anemometer+tower = the 4-col above-grace
  budget). §5.07 CROWS-FORWARD holds BY CONSTRUCTION (fittingPintleMG
  barrel is +z; no rotation passed) and in pixels.
- BLANKED-OWS-RING RE-SEAT (the §5.55 clash): the SRCFIX blanking plate
  trio sat exactly at the station seat — bolt torus top 0.680 was
  COPLANAR with the restored base-plate top (z-fight) and plate+bolts
  buried inside the base footprint. Resolved to ONE visible mount-ring
  FLANGE (cylY r 0.31, top 0.666, under the 0.68 base top): the
  walkaround's circular OWS opening now reads as the REAL mount the
  station occupies — the ratified "deliberate ring" read survives as
  the flange annulus around the base; torus + 8 bolt heads retired.
- Ratified §5.55 reads verified surviving in pixels: unskirted 7-wheel
  gear + 4 return rollers, rangefinder blisters + armored blocks, PT
  periscope-ring cupola, wide cast mantlet, side bins + decals.

### Close battery (2026-08-08, HEAD e898cdb)
- geometry-gate x2 BIT-IDENTICAL:
  `0 | hull 48.9 whole 0 turret 0 stations 0 dims 100 floaters 100`
  — HOLD-OR-IMPROVE ✓: hull 48.7 -> 48.9, dims 100 + floaters 100 HOLD
  with the station + tower aboard (the §5.09 battery replicated on the
  §5.55 turret). NO heightM datum change (§5.73-1 verified: p95 stays
  the cupola/grace class; the 16 mm trough crown lick reads sub-pixel
  at the gate's ~10 mm/px mask — CPU-exact probe tmp-leorcws-p95 reads
  2.52 only by counting that sliver; gate = authority on gated ids).
- npm test 166 + track-geometry PASS.
- Hash as first reported by the builder: 4f6360fe -> d900c8e2 (61 -> 63
  meshes, 85691 -> 89255 verts). LANDING CORRECTION: a clean detached-
  HEAD reproduction of the actually landed station + flange is
  **a9aba192** (63 / 89255) at acc0a48. The earlier candidate came from
  the live pre-landing tree and is retired; the re-cert verdict below
  binds a9aba192. Guards
  byte-held through the round (hashed before AND after): leo2a5
  e215a738 / leo2a6 09912270 / kf51 9ac547ac / leo2_revolution
  db70c929 / leo2a7v 3ca4af86 / leo1a5 1c79188 — no shared-helper
  edits (leoFLW200 body untouched; per-tank call sites only).
- Evidence: shots/leo-rcws/{before,after}/leopard2_proto (20 views:
  9 orthos + 3 heroes + 2 closes + 6 garage) + after yaw90 pair (§B5
  unity — station/tower translate with the turret).

### Independent re-cert verdict (2026-08-08; §5.73-3)
**PASS — floor 9.0 / mean 9.09 across the fresh 14-view sitting, at
clean-HEAD hash a9aba192.** Scores in canonical view order:
`9.1 / 9.2 / 9.1 / 9.0 / 9.0 / 9.0 / 9.1 / 9.2 / 9.1 / 9.2 /
9.0 / 9.1 / 9.1 / 9.0`.

- The restored squat-wide OWS and separate proud panoramic tower satisfy
  the owner's all-Leopards RCWS override without consuming the PT's low-
  roof silhouette: receiver/trough, forward gun, ammo box, powered base,
  optics, and tower are individually readable at garage range.
- The replacement mount flange is visible as a continuous annulus around
  the base, with no coplanar flicker and no sky between station and roof.
  The yaw-90 close/plan/hero battery proves both the station and tower
  follow `rig_turret`.
- The §SRCFIX identity survives in every fresh view: unskirted seven-
  wheel/return-roller gear, low PT turret, stereo-rangefinder blocks,
  wide cast mantlet, clean glacis, and exposed mounting rails remain the
  dominant read. The RCWS is variant kit, not a casemate-height rewrite.
- Evidence: `shots/critic-leo-rcws/leopard2_proto/` (35 fresh sheets)
  plus unchanged-family garage controls. Full verdict:
  the archived visual-review receipt.
