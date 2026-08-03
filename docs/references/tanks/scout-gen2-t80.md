# T-80 (1976) / T-80B / T-80BV — scout-gen2 reference packet (stub, 2026-07-31)

Scout status: MODELS FOUND: bergman T80 early / T80B applique / T80BV full-ERA (CC BY-NC-SA) in candidates-gen2/t80|t80b|t80bv/

## Published dimensions
| dimension | value |
|---|---|
| overall | 9.66 m (gun fwd) |
| hull | 6.78 m |
| width | 3.52 m (skirts) |
| height | 2.20 m |
| weight | 42.0 t (T-80) / 42.5 t (T-80B) |

Dimension sources (secondary military references — cite the specific page at integration):
- https://tank-afv.com/coldwar/USSR/T-80.php
- https://www.militaryfactory.com/armor/detail.php?armor_id=71

## Orthographic / blueprint references
- https://www.the-blueprints.com/blueprints/tanks/tanks-t/
(the-blueprints.com links are letter-index pages — pick the exact sheet at integration; most of these tanks have a dedicated sheet there)

## Photo references
- https://commons.wikimedia.org/wiki/Category:T-80

## Integration checklist (for the fleet program, NOT this scout round)
- [ ] verify dims against a second source; fill missing (hull-only length, track width)
- [ ] geometry gate: model scaled to overall/hull length, width, height above
- [ ] dual-gate render judgment vs the photo references

## t80-line first build (russia r25, 2026-08-03) — FAMILY RIG EXEMPLAR
One parameterized buildT80Line (v0/1/2) per BUILD-STANDARD SS-H: t80 69.5,
t80b 68.6, t80bv 33.7 (dims 100 + floaters 100 all three). Shared: raked
turbine-hump band w/ recessed channel, arrow bow, wide flat cast dome
(donor's domed lathe was the big miss), raked bustle, turret-node apron as
hidden carrier, fat-sleeved 2A46M-1 w/ clamp plates. B: brow applique +
902 smokes. BV: K-1 cheeks (shared k1 kit, opt-in), glacis raft, skirts.
Decoration law from birth: Utyos MG (p95-safe 2.2195), cupola, drums,
unditching log, tow cable, headlights, periscopes.
LANDMINES (read before touching): refs render width-normalized — t80bv
safeScale x0.9536 leaves its print ~4.4% small in y AND z; group-squash
regresses (rigs shear independently) — 33.7 is STRUCTURAL pending a
certification ruling. The ref's 0.29-band tube counts as side-row BODY
span (12% cut sits at 0.265-0.275 by camera pitch — slim cylinder + clamp
plate is the safe carrier). heightM p95 catches the MG cluster on SOME
camera pitches (anchor 2.2195 inside grace, not the ref's 2.29 spike).
t80/t80b to >=75: rear-plate zone (frame -1.44), tube-zone 5.4-5.5, front
+-0.97-1.01 floors (pt91m belly-rail pattern applies).
