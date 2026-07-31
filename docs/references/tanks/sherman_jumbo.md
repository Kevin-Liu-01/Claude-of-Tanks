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