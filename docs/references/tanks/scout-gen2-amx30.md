# AMX-30B / AMX-30B2 — scout-gen2 reference packet (stub, 2026-07-31)

Scout status: MODEL FOUND (low detail): Captain_Ahab_62 AMX-30b (CC BY) in candidates-gen2/amx30/; covers B2 with kit tweaks

## Published dimensions
| dimension | value |
|---|---|
| overall | 9.48 m (gun fwd) |
| hull | 6.59 m |
| width | 3.10 m |
| height | 2.29 m (turret roof) |
| weight | 36 t (B) / 37 t (B2) |

Dimension sources (secondary military references — cite the specific page at integration):
- https://tank-afv.com/coldwar/France/AMX-30.php
- https://tanks-encyclopedia.com/coldwar/France/AMX-30B.php

## Orthographic / blueprint references
- https://www.the-blueprints.com/blueprints/tanks/tanks-a/
- https://tanks-encyclopedia.com/coldwar/France/AMX-30B.php
(the-blueprints.com links are letter-index pages — pick the exact sheet at integration; most of these tanks have a dedicated sheet there)

## Photo references
- https://commons.wikimedia.org/wiki/Category:AMX-30

## Integration checklist (for the fleet program, NOT this scout round)
- [ ] verify dims against a second source; fill missing (hull-only length, track width)
- [ ] geometry gate: model scaled to overall/hull length, width, height above
- [ ] dual-gate render judgment vs the photo references

## FRANCE ROUND (2026-08-07, france agent) — owner §5.14: "model the amx 30bs to complement the leclerc (note the amx 30bs' hulls are backwards". BACKWARDS-HULL ROOT CAUSE FOUND + both variants rebuilt PROCEDURAL (§B8 class). Photo-class — no valid oracle; DELIVERED-PENDING-CRITIC.

ROOT CAUSE (the owner's backwards hull): the ahab GLBs carry an
INTERNAL hull/turret 180 — tools/build_gen2_tanks.py bakes the hull
`RZ(-90)` but the turret `RZ(90)` (manifest lines 125/126 and 132/133),
so the baked hull glacis descends toward -z while the gun points +z.
Vertex-extract receipts (docs/references/vertex/amx30.json + amx30b2):
`orientation { glacisSign: -1, gunSign: +1, agree: false }` both files.
A MODEL_SOURCE yawOffset CANNOT fix an internal disagreement (a scene
yaw rotates hull and turret together), so per the §5.14 decision tree
the playables flip to procedural builders in misc.ts (buildAMX30) and
the ahab registrations retire (userdrops7.js MODEL_SOURCE_RETIRED +
USERDROP7_SOURCED_IDS). §E ESCALATION (orchestrator lane): the re-bake
is a one-line manifest fix — hull `RZ(-90)` -> `RZ(90)` for both amx30
and amx30b2 — after which the re-baked GLBs can re-onboard as
measurement oracles (gate ledger rows for amx30/amx30b2 stay their
historical all-zero until then; the broken bake never registered).

BUILD (§B8 identity, both variants; buildAMX30 in misc.ts): long LOW
hull with full-width sponson band; ONE-PIECE rounded raked glacis
(25 deg single plane + casting side blends, §B4-split around the idler
wraps — receipts in builder comments: 137 front voxels -> 0); raked
tail with grille shadow band + rear-fender EXHAUST SILENCER drums (the
AMX-30 tell) + tail pipes; cast turret (polyTurret lower band + tapered
dome band) with the LONG BUSTLE taper; 105 F1 clean tube (no evac, no
sleeve) + muzzle bore; 20 mm M693 coax as a VISIBLE SECOND BARREL beside
the main gun (own housing slot, muzzle ring, bore dot); TOP-7 commander
cupola RIGHT (8-episcope ring, dome crown 2.475w) + remote 7.62 forward
rest (CROWS-FORWARD law) + loader hatch LEFT; PH-8-B IR SEARCHLIGHT
box+lens+guards LEFT of the mantlet on the gun frame (elevates with
it); driver hatch + 3 episcopes LEFT on the glacis; splash-board V;
§B3.2 bow kit (headlights + IR lamps + brush guards + tow shackles),
tow cable, lift eyes, bustle rack + strapped duffels, jerry/ammo cans,
whip antenna + left pot, decals. B2 DELTAS: LLLTV camera box on the
mantlet RIGHT (window + lens hood), paired smoke banks on the turret
rear flanks. GEAR: 5 BIG roadwheels (r 0.335) + 5 return rollers, front
idler / rear sprocket, covered top run. SKIRTS deliberately OFF both
variants (§D WIDTH-GUARD: the shoe envelope prints ±1.573 — a skirt
outside breaks the ±1.55 width anchor, inside gets swept; "side skirts
optional — bare wheels on most fits" per round orders; the B2 reads by
LLLTV + dischargers + fit deltas).

FOUR-BOX (tmp-b8-measure, final bytes, both variants identical hull):
overall 9.475 vs 9.48 pub (gun fwd) / hull 6.595 vs 6.59 / width 3.165
(shoe envelope; hull faces ±1.51 = 3.02 under the 3.10 pub-over-hull) /
roof plate 2.275w vs 2.29 pub (cupola crown 2.475, whip above — real
total-with-cupola ~2.86). turretMass/hull length 53% (< 55% merge
alarm). Muzzle z 6.18 = 2.88 m bow overhang (the AMX-30 long-gun read).

§B BATTERY (final bytes f992548a / f7eecb20): standard-check clip 0/0,
contig 0, census mg1+2d (B) / mg1+4d (B2); turret-parent 0/0/0 both;
winding m1 CLEAN both (0 reversed / 0 mixed / 0 openSuspect); render
deficit 0 px all 9 views both. WINDING MODE-2 "HARD" ADJUDICATED
FALSE-FLAG (§J static-pixel law): candidate rig_hull/mesh#18 (1061 px,
y 1.586..1.644, x ±1.35, z -2.66..-1.91) IS the rear-fender exhaust
silencer drums — hull-parented like the real vehicle; at drum lateral
x ±1.24 the turret sweep envelope (r 2.278 about pivot z 0.30) reaches
only z -1.611 vs the drum front face -1.895: 0.28 m clear, no yaw
collision. npm test green.

SELF-SHOTS: shots/france-round/amx30-before/ (ahab GLBs — the backwards
hull on record, 15 views x2 variants) vs amx30-after/ (procedural fix,
15 views x2 variants); front/side pairs prove glacis-under-gun.
NEXT: independent photo-parity critic (§B8 bar) + §E re-bake lane.

## §E RE-BAKE EXECUTED (2026-08-08, orchestrator lane — §5.14 escalation)
Manifest fix applied (tools/build_gen2_tanks.py: both hull entries
RZ(-90) -> RZ(90)); amx30b_ahab.glb + amx30b2_ahab.glb re-baked
(FORCE=1, blender 4.x; new md5 e28d68d5 / 4d1fc81d; .baks refreshed to
the fixed pristine bytes — batch-22 stays disabled/obsolete: the source
is cured). Vertex receipts regenerated: orientation
{glacisSign:+1, gunSign:+1, agree:true} BOTH variants (was agree:false
— the owner's backwards hull). Evidence renders shots/gen2-bake/
amx30*_{side,front,top}.png — gun over the descending glacis, engine
deck rear. Re-registered as measurement references in the three
harness maps (turretNode ^Turret$, autoPivot, paintUntextured; the
prior no-oracle FALSE-0 ledger rows become measurable). Honest
baseline x2 pending a calm-load window (agents saturated Chrome at
bake time; a starved run 1 was discarded, never recorded).
Bake-wrapper note: build_gen2_tanks.sh line 51 `"${extra[@]}"` trips
bash-3.2 set -u when RENDER is unset — run with RENDER=1 or patch.

## 90-LADDERS ROUND r1 (2026-08-08, misc agent) — honest-baseline decode + first rungs (floater, dims, tail/nose body columns, rack band)

WORLDTRACE DECODE (tools/tmp-misc3-worldtrace.mjs --id=amx30, PARITY
PROVEN vs the official rows at 1024): the §5.36 honest baseline
(amx30 0 | hull 31 / whole 0 / turret 0 / stations 0 / dims 22.7 /
floaters 0) unpacks as:
- REGISTRATION IS FUNCTIONAL (per the §5.36 read): side dAlong 1.321 =
  the print sits off-center in its own frame (refZR [-4.64..1.85] vs
  procZR [-3.20..3.17]); cover is only 0.92% — the ref hull mask does
  NOT carry its gun. Translation is compensated; no snap defect.
- **TALL-HULL PRINT CLASS (the round's central finding)**: with dy
  restored, the print's side hull band is [0.00..1.68] against our
  [0.00..1.38] — ITS DECK LINE SITS AT 1.68 in the width-3.10 frame
  (+22% over our published-proportioned 1.38), and its turret roof
  band runs ~2.9-3.0 (station raw topH 2.92-3.16 over box-min, box-min
  ~0.14 below its ground). Published height is 2.29 (roof) / ~2.86
  over cupola: matching the print's deck/roof breaks `dims` heightM
  by +26% — dims-sovereignty forbids building to it. Every side/front
  hull column therefore pays ~0.14-0.19 top+bottom against the print
  (the mean 3.5-6.4% class), capping side_hull ≈ 50-60 and
  side_whole/front_whole lower UNTIL an §E y-normalize (ariete-class
  band warp, orchestrator lane) lands. ESCALATION FILED with this
  round's report; stations topPct 10-28% carries the same signature
  (ref slice tops 2.9-3.2 vs ours 2.2-2.4).
- floaterFails 1 = the left-flank stowage cluster: the jerry can at
  (-0.88, 0.55, -1.44)t floated 0.07 off the dome wall (plan x 0.77
  at that z); the whip base (0.88) and left antenna pot (-0.90) floated
  the same way off the 0.749 wall line.
- dims 22.7 = heightM 2.46 (the 2.475 cupola crown + 2.45 dome band
  spanned ~6 side columns and owned the p95 against the published 2.29
  ROOF line), hullLengthM 6.37 (front body column died at the glacis
  taper ~3.19, published needs ~3.30), overallLengthM 9.28 (muzzle
  step at world 5.96 vs the published 9.48 span).

RUNGS LANDED (this file, buildAMX30 — both variants inherit):
1. FLOATER: jerry can re-seated to (-0.79, 0.52, -1.36) overlapping
   the dome wall; whip base to (0.74, 0.72, -1.52) ON the wall, h 0.62
   -> 0.30 (its 2.74 tip was station i3's top against the ref's 2.36
   bustle line); left pot to (-0.73, 0.74, -1.55).
2. heightM: TOP-7 cupola flattened (ring top 2.29w, dome band 2.31w,
   crown 2.34w) + MG foot sunk 0.90 -> 0.80 — p95 discipline: pub 2.29
   is the ROOF; only <=3 thin columns may top 2.31.
3. hullLengthM: full-width glacis plate front pulled 3.295 -> 3.15
   (the ref plan front at |x| 0.9..1.7 reads ~3.14 — our corners
   printed +0.15 on six plan cols) + center nose TONGUE (x +-0.94,
   plane-continuation to 3.31; with the lower run + reverse plate the
   3.28-3.31 window carries a 0.73 band = the front BODY column) +
   tail plate band (y 0.84..1.34, face -3.32) = the rear body column.
4. overallLengthM: L7A1 lengthened to the published span — tube 4.31
   -> 4.53, muzzle step at world 6.17, bore moved with it (the print's
   own short tube stays the dims-sovereign PROC-ONLY cover class, one
   col at 6.06).
5. Bustle rack raised + extended (rails 1.83/2.15w to z_w -2.36 class)
   to the print's REF-ONLY band [-1.99..-2.24, y 1.83..2.19].
CLOSE-OUT (final bytes, gate x2 BIT-IDENTICAL per id): **amx30 0 |
hull 34.3 / whole 0 / turret 0 / stations 0 / dims 99.4 / floaters
100** and **amx30b2 0 | hull 28.6 / whole 2.4 / turret 0 / stations
1.2 / dims 98.1 / floaters 100** (from 0 | 31/0/0/0/22.7/0 and 0 |
29.9/0/0/0/44.6/0). The §5.36 seeded ladder is DONE: (a) floaters
0 -> 100 both (the jerry/whip/pot trio was the island); (b) dims
22.7/44.6 -> 99.4/98.1 — heightM 2.46 -> 2.31-class (cupola flatten +
MG foot 0.50 + whip 0.58: pub 2.29 is the ROOF and p95 tolerates <=3
thin cols over 2.31), hullLengthM 6.37 -> 6.57/6.66 (nose tongue +
tail band + THE RENDER-SCALE FIX: trackW/xc 0.57/1.265 -> 0.55/1.243 —
the ±1.5825 shoe envelope had the whole build rendering ×0.979, every
authored length 2.1% short; overall 9.28 -> 9.50 came from the same
fix, NOT from a gun edit), width 3.10 exact. (c) hull/whole/turret/
stations stay CAPPED by the documented tall-hull print class above —
§E y-normalize escalation stands (deck 1.68 / roof ~2.9 in the print
vs published 2.29 roof; matching it breaks dims by +26%). amx30b2
hullLengthM reads 6.66 (+1.03%, 0.03 past grace — a B2-delta body
column at one hull end; -0.24 dims, noted for the next touch).
INCIDENT (banked): the two gun-length edits aimed at this builder's
"muzzle step" LANDED IN buildType74 — the two tanks carry IDENTICAL
L7-gun lines and content-anchored replace hit the FIRST match. Caught
by the guard-hash battery (type74 7ba404c5 -> 19502234 with identical
mesh/vert counts), reverted byte-exact (7ba404c5 re-verified). LAW:
content-anchored edits into multi-builder files need a function-scope
anchor when the target line is a shared idiom.
§B battery (final bytes): track-clip --exact front 8 / rear 0, shoe
0/0 both; turret-parent 0/0/0 both; standard-check clip ✓ contig 0 ✓
census mg1+2d/mg1+4d ✓; npm test green. Geometry hashes: amx30
f992548a -> e2a7ae50, amx30b2 f7eecb20 -> 3aeacbf9. Evidence:
shots/misc-ladders/{before,after}/amx30*.png.
