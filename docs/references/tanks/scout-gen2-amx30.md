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
the playables flip to procedural builders in misc.js (buildAMX30) and
the ahab registrations retire (userdrops7.js MODEL_SOURCE_RETIRED +
USERDROP7_SOURCED_IDS). §E ESCALATION (orchestrator lane): the re-bake
is a one-line manifest fix — hull `RZ(-90)` -> `RZ(90)` for both amx30
and amx30b2 — after which the re-baked GLBs can re-onboard as
measurement oracles (gate ledger rows for amx30/amx30b2 stay their
historical all-zero until then; the broken bake never registered).

BUILD (§B8 identity, both variants; buildAMX30 in misc.js): long LOW
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
