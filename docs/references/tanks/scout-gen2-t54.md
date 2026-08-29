# T-54 (T-54B) — scout-gen2 reference packet (stub, 2026-07-31)

Scout status: MODEL FOUND: m_bergman T54 refit + T55 (CC BY-NC-SA) in candidates-gen2/t54/

## Published dimensions
| dimension | value |
|---|---|
| overall | 9.00 m (gun fwd) |
| hull | 6.45 m |
| width | 3.27 m |
| height | 2.40 m |
| weight | 36.0 t |

Dimension sources (secondary military references — cite the specific page at integration):
- https://tank-afv.com/coldwar/USSR/T-54.php
- https://tanks-encyclopedia.com/coldwar/USSR/soviet_t54.php

## Orthographic / blueprint references
- https://www.the-blueprints.com/blueprints/tanks/tanks-t/
- https://tanks-encyclopedia.com/coldwar/USSR/soviet_t54.php
(the-blueprints.com links are letter-index pages — pick the exact sheet at integration; most of these tanks have a dedicated sheet there)

## Photo references
- https://commons.wikimedia.org/wiki/Category:T-54

## Integration checklist (for the fleet program, NOT this scout round)
- [ ] verify dims against a second source; fill missing (hull-only length, track width)
- [ ] geometry gate: model scaled to overall/hull length, width, height above
- [ ] dual-gate render judgment vs the photo references

## r30 FIRST BUILD (2026-08-04, russia agent): donor stand-in -> real profile
## 0 -> 17.0 min ×2 (hull 17 / whole 17.7 / turret 46.9 / stations 72.7 /
## dims 100 / floaters 100) — CEILING IS THE PRISTINE ORACLE, measured below

buildT54 in src/vehicles/profiles/russia.ts (RUSSIA_PROFILES.t54 overrides
the t62mv1 donor stand-in). Dims SOVEREIGN per the incident law (spec dims:
hull 6.45 / overall 9.00 / width 3.27 / heightM 2.65 = the registered
crown+MG convention — the scout stub's 2.40 is the bare-roof figure).
standard-check: holes 0 ✓, mg1+1d ✓ (DShK FITTINGS.pintleMG + unditching
log; drums/tanks/bins/cable §B3), clip 142/183 (strip/sponson fleet class).

AUTHORED FRAME: hull mid z 0 (rear -3.226, nose 3.226, muzzle PINNED 5.72
= rearmost+9.00; the print runs 9.395 so its last ~4 tube cols ride as
ONLY-REF — accepted, dims sovereign). Extract-to-authored: z ×0.9808,
y ×0.9757 — BUT the extract tables disagree with the render (r29 t90m
class): the gate registers by BODY-span mid (the print's thin 1.18..1.33
nose lip is band-excluded), so every seat below came from the REGISTERED
digest, not raw extract math.

THE PRINT (registered reads, authored frame): turtle hull (deck 1.41-1.47
side / 1.37 front — crowned ridge), blunt-ish bow (thin nose lip to 3.31),
belly flat 0.01 over -2.05..1.64, drums-on-ramp bumps 1.26/1.27 at
-2.81/-2.62; gear: wrap bottoms 0.30@-2.72 / 0.21@2.4, belt grounded
-2.3..2.05 (contactZF/ZR passed EXPLICITLY — see the t90m r30 contact-alias
law); SHORT TALL turret: shell front-center 2.09-2.19 but side max-x
2.6-2.8 (off-center furniture), cupola band z 0.1..0.65 to 2.81, DShK
cluster LEFT-FRONT overhanging the shell (x -1.2..-1.45, z 1.66..1.96,
tops 2.53-2.56 — built as a transverse-yawed compact FITTINGS.pintleMG:
a 0.95-scale/0.85-elev first cut sprawled z 1.49..2.40 and put its barrel
tip into stations i11-i13, topPct 44 — measured, fixed), turret-node APRON
bottoming 0.56 over z -0.45..1.43, fused tube band 1.53..1.80.

ORACLE-DEFECT CEILING (needs orchestrator certification/repair — the
front rows are PINNED):
1. REVERSED-WINDING LOWER BOW: the print's bow faces below y ~0.35 at
   |x|<0.9 do NOT render front-on (mask dump: the ref front view is two
   track blocks with an EMPTY center bottom; its side view has the full
   belly). §B2 forbids replicating a see-through bow, so front_hull/
   front_whole carry ~0.34-deep bottom voids across ~40 center columns
   AND the induced dy pollution (+0.13 lifts every paired top err) —
   measured split ~2.9% + ~2.3% mean = front rows ~17. The batch-25
   re-warp (disabled by the incident) should add a winding repair or a
   certified cap.
2. Print stylization vs published dims (dims-sovereign carries): overall
   +4.4% (tube), crown zone 2.6-2.8 vs my 2.42 compromise (front-center
   says 2.09-2.19 — the print roof contradicts itself between views),
   registration drift: the self-registered station spans differ (ref 6.63
   vs mine 6.82) so station windows walk between runs (stations 72-83
   across identical-geometry runs).

NEXT (post-oracle-repair round): re-derive the turret against a normalized
print; the hull loft/gear/fittings seats are digest-derived and should
mostly hold. side_hull already reads 79.4 pre-repair.

## TURRET-LANE round (2026-08-06/07): turret 46.9 -> 49.6, all certified rows held exactly

Owner sweep order ("update all soviet turrets"). Gate x2: min 17 |
hull 17 / whole 17.7 / turret 49.6 / stations 72.7 / dims 100 /
floaters 100 (baseline turret 46.9; hull/whole/stations/dims EXACT —
the certified-oracle rows did not move).
- §B3.1: pig-snout collar box -> inscribed elliptical frustum (identical
  ±0.23/±0.17 mask extremes) + canvas boot ring; Luna L-2 IR searchlight
  right of the mantlet (gun-slaved drum + rim + lens + yoke — era kit);
  muzzleBore (shadow-named).
- REPORT (what else beyond the turret): the turret row is PINNED by the
  certified oracle defects — today's side_turret registration read
  dAlong 1.408 / plan dy -1.347 (the packet's "registration walks
  between runs" class, RIG-MISMATCH adjacent), and the reversed-winding
  lower bow keeps front rows ~17. The queued ORCHESTRATOR oracle repair
  (winding fix + turret normalization, §7 queue) gates any real t54
  turret ladder; the hull loft/gear seats are digest-derived and should
  hold through it.
