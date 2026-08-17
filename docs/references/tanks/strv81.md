# Strv 81 — reference packet (§5.248 ground-up rebuild, sweden lane)

## Identity
Swedish Centurion Mk 3, 20-pdr era. Centurion grammar legitimately shared
with the frozen centurion3 (bad74e60 lineage) but the geometry is a FRESH
§K measured-loft build in `src/vehicles/profiles/sweden.js` (no donor build
calls; the old donor-clone `centurionBuild(P,3)+package` is retired).

## Instrument
`public/models/community-candidates/strv81_mmdsonic.glb` — "Strv 81" by
MMD_SonicNewYear, CC-BY-4.0, EXTRACTION-SUSPECT (WT-style naming; Strv 81
exists in War Thunder) => measurement-only, LOCAL-ONLY quarantine, never
ships (ATTRIBUTION §5.248 batch B).

Registration (this round trued it up): `turretNode ^turret_0$`, `gunNode
^gun_0$`, autoPivot, **yawOffset PI** (raw scene faces -Z; the pre-fix
extract auto-flip read flip:true; carried in the row per the ztz99a2
convention so every harness agrees — fidelity/critic/evaluator maps +
vertex REG).

## Dims true-up (spec change in src/vehicles/sweden.js)
`hullLengthM 7.82 -> 7.56`. 7.82 was a donor-clone registration error: the
committed centurion3 family value is 7.56 (same chassis) and the print's own
hull mask reads 7.565. Overall 9.85 / width 3.39 / height 3.01 stay the
Swedish published figures. Rig pivots patched to the measured build
(turretPivot [0,1.76,0.35], gunPivot [0,0.32,0.75]; bore axis 2.08).

## Certified-cap candidate — THE WHIP PAIR (oracle defect)
The print fuses two large raked whip antennas INTO turret_0: bases (±0.40,
y 2.72, z -0.45/-0.28 build frame), raked back over z -2.47..-0.27 with
tops 3.15..4.17 (extract turretZProfile + gate work orders). Matching them
puts ~20-25 build columns into the dims p95 roof (heightM would read 3.5-3.6
vs published 3.01 => dims ~0); omitting them caps every row they cross:

- side_whole / side_turret: ~10 matched columns at 0.3-0.55 m err + 3-5
  ONLY-REF cover columns beyond the metal bustle,
- front_whole: the x ±0.4 columns read ref tops 3.7-4.2,
- stations: slices 2/3/4/6 topPct 18-42 (trim absorbs only two).

Build carries base-matched, p95-safe short whips (tips <=3.04). QUEUED FOR
THE ORCHESTRATOR LANE (§E): vlo-class excision of the two whip prisms from
turret_0 (t64bv1-rail/ztz85_iii-whip class). After excision the whip rows
become satisfiable and the ladder resumes; alternatively certify the caps.

## Round receipts (honest baseline -> delivered)
Baseline (donor-clone vs the new print, first honest run): min 0 —
hull 65.4 / whole 27.9 / turret 0 / stations 15.6 / dims 57.5 / floaters 100.

Delivered (ground-up build, gate x2 identical, hash x2 bit-identical
11e5e876): min 34.9 — hull 76.1 / whole 46.9 / turret 45.9 / stations 34.9 /
**dims 100 / floaters 100**. Fidelity whole-views 89.4-96.9 (overall 91.9).
whole/turret/stations are whip-capped (above); hull is NOT capped — its
NEXT ladder is real work (below).

Floater lessons banked this round: spotlight must seat ON the brow plate
(the old bracket floated between wall top and roof cap — 5-pose islands);
rear flaps hang from the fender falls, not the shelf; tire tone needs the
gearFloor/tireHex ambient re-attach or shaded far-side gear drops under the
gMask brightness threshold.

## Owner interim landing absorbed (c425f495)
The owner's parallel session rebuilt the OLD donor-clone turret with: (1) a
low cast-shell loft + (2) unequal skewed crown plates + (3) a right-wall
ventilator/search housing + (4) a global turretG y-squash 0.82. This build
supersedes (1)/(4) with the measured polyMultiLoft walls + rear-biased roof
cap + brow (turret rows 0 -> 45.9 whip-capped; crown/cheek lines match the
print's 2.36-2.85 band directly). (2) and (3) were ABSORBED onto the
measured shell (skewed crown plates on the roof cap; concentric ventilator
drums + 6 radial ribs at the measured right-wall station, x 1.02-1.15,
y 2.18 world, z -0.27 world).

## NEXT (hull ladder, resumes after the whip excision lands)
1. plan_hull 75-80: the ref x ±1.76 bracket sliver at z -2.53 (print-only,
   cover cost); center-plan nose 3.34-3.42 refinement vs ref 3.35.
2. front_hull 76-78: outer-column skirt-hem/fender-lip band (ref 0.64..1.68
   at |x| 1.63-1.68); sprocket/idler hardware width (gearEndWheelHardware
   reaches x 1.63 at xc 1.315/trackW 0.54 — ref band-to-zero columns end
   1.61).
3. side_hull 85+: idler-approach band bottoms (ref 0.22..0.59 slope) —
   contact pins at 2.10/-2.44 got halfway; consider idler y/r again.
4. Engine-deck louvre stack vs the ref 1.94 line (dy-coupled; re-measure
   after every registration-moving change).
