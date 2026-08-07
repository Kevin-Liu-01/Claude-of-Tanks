# Leopard 2 Prototype (`leopard2_proto`)

**Exact variant modeled:** Leopard 2 prototype series (PT 1972-74, Krauss-
Maffei) — 16 hulls / 17 turrets built; TEN turrets carried the Rheinmetall
105 mm smoothbore. Modeled as a 105 mm-smoothbore PT with the pre-2AV spaced
armor turret: slab-sided welded turret with stereoscopic-rangefinder blisters
on both cheeks and the turret-base side bulge, Leopard 2 hull layout.

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
FULL photo-class rebuild in src/vehicles/profiles/leopard.js: the old V1
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
