# M4A3E2 Sherman Jumbo (`sherman_jumbo`) — reference packet

**Exact variant modeled:** Assault Tank M4A3E2 (75 mm M3), 1944 Fisher
production "Jumbo" — thick welded hull with vertical side plates, heavy
T23-pattern cast turret, VVSS bogies with extended end connectors.

## Corroborated dimensions

| Measure | Value | Sources (2+) |
|---|---|---|
| Length | 247 in = 6.27 m (75 mm gun barely clears the bow) | theshermantank.com M4A3E2 spec sheet PDF; onwar.com/tanks/usa/data/m4a3e2 |
| Width | 115.6 in = 2.94 m (over sand shields) | theshermantank.com spec sheet; onwar.com |
| Height | 116.3 in = 2.95 m | theshermantank.com spec sheet; militaryfactory.com |
| Gun | 75 mm M3 L/40 (tube ~3.0 m) in the T110/M62-style heavy mount | worldoftanks fandom M4A3E2 page; shadock.free.fr Fisher Jumbo survey |
| Turret | massive T23-style casting, 152 mm sides, big flat mantlet | tanks-encyclopedia; shadock.free.fr |
| Running gear | VVSS: 3 bogies × 2 wheels per side + 3 return rollers, FRONT sprocket, rear idler, extended end connectors (duckbills) | onwar.com; shadock.free.fr |

## Identity cues

- Tall slab-sided welded hull (E2 appliqué makes the sides vertical to the
  sponson top), 47° one-piece glacis with driver/co-driver hoods, bow MG ball.
- Rounded cast transmission nose with 3-piece bolted flanges.
- Heavy turret with wide flat mantlet cheeks, commander cupola + oval loader
  hatch, pistol port left side; .50cal on the roof rear.
- Short 75 mm tube ending almost flush with the bow; no muzzle device.
- VVSS bogies (return roller arm trailing), duckbill connectors widen the
  track footprint.

## Reference links

1. https://www.theshermantank.com/wp-content/uploads/M4A3e2-Jumbo-spec-sheet.pdf — official general data sheet
2. https://www.onwar.com/tanks/usa/data/m4a3e2.htm — dims/armor
3. http://the.shadock.free.fr/sherman_minutia/manufacturer/m4a3e2jumbo/m4a3e2.html — Fisher production walkaround photos
4. https://tanks-encyclopedia.com/ww2/usa (M4A3E2 entry) — turret/armor notes

## Local GLB oracle notes

Path: `public/models/tanks/community/sherman-jumbo.glb` (print plates
re-assembled; turret `^turret$`, no gun node — 75 mm fused into the turret;
explicit pivot [0,1.25,0]). Healthy. Width-normalized probe (scale 1.001):

- hull z −3.18..+3.02 (6.20), glacis 1.26@z2.68 → 2.03@z1.68, roof 2.01–2.05
  to z −1.07, rear falls 1.93→1.48 at the tail; sides FULL width ±1.47 from
  ground to y 1.8 (slab + sand shields), ±1.35 at y 1.9, ±1.16 at y 2.0.
  Ground contact z ≈ 1.95..−1.85.
- turret z +1.43..−1.82 shell: base 2.01, roof 2.63–2.91 rising rearward,
  roof fittings spike to 3.13 (z 0.43..−0.57, MG/periscopes); bustle bottom
  2.43@−1.82; plan max ±1.44 @ z 0, mantlet ±0.91 @ z 1.05–1.2, rear taper
  ±0.91 @ −1.5. A fused ring-gear/basket band shows at y 1.22..2.01 under the
  dome (hidden inside the hull silhouette from every view — ignored).
- gun (fused into turret): axis y ≈ 2.31, tube Ø≈0.19, muzzle z +3.18 — only
  0.16 m past the bow (correct for the 75 mm M3).

## Mismatch log (before → after)

| Date | total | minView | H | T | G | R | change |
|---|---|---|---|---|---|---|---|
| 2026-07-30 | 70.0 | — | 88 | 51 | 20 | 86 | baseline (turret far too small/low; muzzle overhang mismatched) |
| 2026-07-30 | 83.9 | 87.9 | 91 | 73 | 67 | 87 | bespoke build: slab E2 hull w/ sand-shield skirts + dark suspension backing, cast transmission nose w/ bolted flanges, huge cast dome (±1.44) + bustle + wide T110-style mantlet, 75 mm ending 0.16 m past the bow, VVSS bogies + duckbill-wide tracks |

ORACLE CAPS (documented, not chased further): (1) the print's hull is
laterally ASYMMETRIC — its upper side band sits ~5-10 cm right of center, so
every front/rear mask carries a fixed red/cyan seam after centroid alignment;
(2) the gun overhang region is a 0.16 m (≈8 px) sliver — its IoU is pixel
noise (G swings 64-67 across identical reruns); the tube diameter/axis match
the probe (Ø0.19 at y 2.22..2.41). Turret 73 is capped by the same top-view
thin-tube subtract mask.


## Geometry gate v9 (2026-07-31, from-scratch agent)

dims 60.2 -> 93.8 (the pintle .50cal stowed low - it owned heightM p95 at
3.10 vs published 2.95); turret dome raised at the rear + bustle skirt
dropped per the gate rows. turretCurves 4.6 unchanged and plan-limited: the
print's fused gun line sits at x ~ -0.3 with the turret visibly rest-yawed
(~7 deg) - ORACLE-REPAIR CANDIDATE (zero Turret rest yaw); a matching
procedural yaw is not legal (the sim owns turret yaw). Certified turret
ceiling until repair: ~30-40.


## Geometry gate v10 round-2 cert update (2026-07-31, oracle batch 7)
The v9 "~7 deg turret rest yaw" cert was DISPROVEN (batch 7): the print's
whole fused turret (dome + basket + 75 mm) was authored 0.218 m LEFT of its
own ring pit and has been rigidly translated onto the ring (gun x ~= 0).
Round-2 honest casting iteration against the repaired print:
- the print's turret node carries its BASKET (r 0.610 ring at y 1.21): the
  gate's isolated turret mask reaches ~0.75 below the ring. The build now
  models the basket drum (r 0.60-0.61, inside the hull at every yaw) — this
  was the single largest turret_side cost (12 columns x ~0.5 m).
- the dome was rebuilt to the print's true plan radius (~1.25, was 1.44)
  and the bustle pulled in to ±0.82/-1.55.
Round-2 row: hull 47 whole 43.2 turret 69.9 stations 50.3 dims 93.8
floaters 100 (ledger: 46.9/22.6/27.6/50.3/93.8/100 — turretCurves +42).

## ww2 r1 (2026-08-03, geometry gate v11 + track-containment law)

43.2 -> 77.1 min over 9 iterations (hull 47->80.7, whole 43.2->74.5*,
turret 69.9->81.1, stations 50.3->83.7, dims 93.8->95.3, floaters 100).
*whole dipped ~2 pts landing the containment law (severe 474/193 exact-clip
-> 60/38, at/below the kv2-graduate band).

What moved it: full hull re-author from the vertex extract — E2 sand skirts
to near-ground with sprocket/idler cutouts (6 segmented plates/side per the
edge-on prism law), two-slope engine deck + 1.82 vent ridge, undercut tail
(plate face -3.13, center+outer lip spans with the ref's ±0.78 notches),
3-piece diff housing with center face 2.90/flanges 2.905, sponson chamfers
1.865->2.012 with a deck-following rear section, glacis mid-step, raised
sprocket y0.74/idler y0.72 (wrap arcs ride the ref's skirt-cutout line);
turret re-authored as plan-exact 28-pt shell + ellipse crown lathe (sz 1.25
c -0.235), undercut bustle to -1.78, basket drum r 0.60 to y 1.22, M62-style
tapering rotor + face plate at z 1.37 + sleeve r 0.165-0.185, tube to +3.18
(published overall exactly = the print's muzzle).

DIMS-vs-ORACLE structural cap (heightM): the print's cast crown+MG band
rides 2.99-3.13 across z -0.7..0.55 (its own p95 = 3.116, +5.6% over
published 2.95). Any >4 side-cols of mass above ~3.0 flips the build's
heightM p95 off the 2.96 crown (measured: the .50cal at 3.16 spanning 15
cols alone cost dims 95.7->49.5). Current compromise: crown 2.96, ONE
narrow ridge z -0.52..-0.28 x -0.82..+0.58 at 3.085 (3 side cols, carries
the ref's front-view crown), cupola/.50cal capped 2.99. This caps
side_whole/front_whole/stations ~77-84 until the oracle warp lands:
NORMALIZATION PLAN AUTHORED in tools/vertex-normalize.mjs (y compress
2.62->2.58, 3.13->2.94; z body x1.0405 about -0.132, muzzle 3.179->3.078)
— literals printed, ORCHESTRATOR-ONLY to execute as a repair batch.

hullLengthM anchors: nose links block face 2.955 (1-col ONLY-PROC) + rear
flaps x ±0.45 face -3.2225 + tail lip -3.215 (measured 6.17, -1.6%).
Track containment: trackW 0.56 xc 1.14, skirts hug 1.448..1.4745, chin/
flanges/diff-cyl pulled between the tracks, rear underside center-only with
outer fills behind the wrap, end-wheel shadow discs skipped.

NEXT: (1) post-warp re-gate should release ~+5-8 on side/front/stations;
(2) plan_turret rear-fat at x ±1.0-1.2 (~1 pt, dome chord vs bustle);
(3) visual round: dome facets read angular vs the cast print at close-up
(lathe 18-seg at q=false); periscope bumps absent.
shots/ww2-r1/after/sherman_jumbo.png (board eyeballed: orientation ✓,
containment ✓, no floaters, roof .50cal present).
