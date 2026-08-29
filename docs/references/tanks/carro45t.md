# Carro 45t (`carro45t`) — §5.248 ground-up rebuild (italy wave)

**Exact variant modeled:** OTO Melara 45-tonne medium project ("Carro da
Combattimento 45 t") — the WoT-style paper vehicle. NO real vehicle exists;
**the hlebov print IS the primary source** (round brief law) and the spec row
is the dims anchor (LOW-CONF law).

## Sources
- `public/models/community-candidates/carro45t_hlebov.glb` — "Carro 45t" by
  Dmitry Hlebov (CC-BY-4.0, Blender/OBJ hand-model; LOCAL-ONLY quarantine,
  never ships). Registered: turret `Object_58` (fused antennas), gun
  `Object_4` + follower `Object_6` (mantlet), meters scale.
- Spec row (modern3.ts): 6.98 hull / 10.60 overall / 3.43 width / 2.95 height
  — hull/overall/width match the print within 0.3%; heightM 2.95 is the
  registered gameplay anchor. The print's own p95 body envelope reads 2.42
  (roof 2.35 + cupola 2.42; NOTHING between 2.55 and the bare whip tips at
  4.11) — `silhouetteHeightM: 2.42` added so the gate compares like with
  like (userdrops5 leo2a6 / modern2 ztz99a2 precedent). heightM stays 2.95.

## Orientation adjudication (extractor misfire)
tools/vertex-extract.mjs flagged "hull BACKWARDS vs gun (t62_bergman class)".
ADJUDICATED CORRECT-AS-REGISTERED: the gun end carries the low nose, the
continuous glacis-to-casemate slope and the raised front idler; the sprocket
(spoked, `Object_32/56`) sits at the stern. The heuristic's "plateau" is the
narrow casemate crest near the bow, so the rear's 4.73 m deck walk outvoted
the real 1.29 m glacis climb. Raw-vertex + render receipts:
shots/italy-wave/printraw/carro45t_hlebov-*.png.

## MEASURE (§K flow)
Gate-frame decode receipts: scratchpad italy-wave/carro45t-workorder.json +
carro45t-gatecurves.json (the gate's own traced curves exported via
tools/tmp-italy-curves.mjs; the raw-extract hull/turret split mis-assigned
Object_2/6-class followers, so the gate curves are the split authority).
Adopted lines (world): deck 1.496 (-2.25..+1.25), rear deck 1.556 with
1.543/1.509 steps, raked tail plate to -3.385 with the recess block to -3.46;
glacis (2.20,1.468)->(3.10,1.24)->nose 1.03@3.48; driver crest x ±0.39 tops
2.17-2.23 (TURRET material in the print — its hull object tops at 1.56);
turret ring skirt 1.501, left roof plateau 2.353 (x -1.14..+0.48) with the
rear slope to 2.16@-2.24, right shelf rim 2.24 (x 1.22..1.57), cupola 2.42,
asymmetric wall cant (left outer 1.60@±1.54 -> crown 2.33@±1.15, right crown
2.19 under the shelf); saddle mantlet 1.585..2.015 (z 1.30..2.11); 105 mm
tube r 0.10 with the mid-tube evacuator swell r 0.139 @ 5.47..6.17, slim
muzzle at +7.11 (overall 10.60); six roadwheels r 0.36 @ z 2.02..-1.88,
raised idler (2.69, 0.77, r 0.31), rear sprocket, three return rollers;
full-length fenders ±1.545..1.71 with the apron band y 0.91..1.47; two
vertical whips x ±0.385 (print z -1.52/-1.55), tips 4.11.

## Gate result — PASS ×2, bit-identical
`hull 91.0 / whole 90.8 / turret 90.6 / stations 90.3 / dims 100 /
floaters 100 — geoMin 90.3 PASS` (final ×2 runs identical; earlier pass
state 90.2 ×2 also banked: shots/italy-wave/carro45t-pass1.json).
Release compliance: track-clip band 0/0, shoe 0/0, strict sweep 0/0;
contiguity 0; muzzle bore machine-tagged + ray-tested; decor census
mg1+3d (towCable/stowageRack/spareTrackLinks/pintleMG fittings).

## Ladder laws banked (this round)
- FRAME PIN (donor r8 pattern): the hull-row registration flips ±half-column
  with marginal 12%-band edges; the bow body edge is PINNED at +3.30 by the
  0.48-band final-drive noses and everything beyond stays sub-threshold; the
  tail pins at -3.385. Gear-end tweaks move the frame more than they move
  their own pixels — sprocket/idler stations are print-true and frozen.
- EDGE-ON PRISM LAW (re-proved): fender plane/hem/apron authored as 0.46 m
  bays with real end faces; a single 6.6 m prism vanishes from every
  mid-span station slab.
- OFFSET-MOUNT WHIPS: the fitting's inline pot could not satisfy the st3/st4
  windows and the trace column at once; pots sit at z -1.585/-1.615 with the
  vertical rods in the print's own column (-1.53/-1.56).
- The print's track ends at the last roadwheel (bare sprocket/idler —
  mechanically wrong); MY live course keeps real wraps with the sprocket
  seated so the taut ramp lands on the print's sculpted line (lift -2.05).

## Print divergences (documented, not chased)
- Sponson floors ride at 1.33..1.42 (print hull floor 0.32 spans the lane):
  the animated-sweep law owns the lane volume; strict sweep 0/0.
- Turret sweep clearance: fender bays inside the swing circle ride at 1.48
  (k2 sweep law); the print's static fenders sit 1.50-1.53.
- Driver crest furniture (hatch seam + episcopes) rides the turret nose like
  the print's own fused geometry.
- Commander's Breda MG stowed low at the cupola (print shows none; the
  owner's c425f495 interim carried one — absorbed at k2 low-mount discipline,
  top under the 2.42 p95 datum).

## Owner c425f495 absorption (turret densification, interim on the OLD build)
Absorbed onto the measured rebuild: split roof crown -> superseded by the
MEASURED asymmetric plateau/shelf; crew-station lids (flat, under-datum);
periscope arcs; rear backed service wall + 9-rib louvre cadence + corner
stanchions; roof service-lid cadence; low optical block (as the measured
2.20 housing); commander MG (low-mounted). Superseded with receipts: the
turretG.scale.x*0.88/y*0.98 squash (the measured loft IS the print's
trapezoid), the proud side-access panels (the print walls sit at ±1.51-1.55
already; seams carried flush on the cant).
