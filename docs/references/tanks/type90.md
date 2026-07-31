# Type 90 Kyu-maru (`type90`)

**Exact variant modeled:** Type 90 (JGSDF, 1990s–2000s fit) — Rh-120 L/44
(license), autoloader, standard skirts, no dozer blade.

## Corroborated dimensions

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length | 7.5 m (roster dims 7.45) | weaponsystems.net/system/167-Type+90 (7.5); historyofwar.org Type 90 |
| Overall length (w/ gun forward) | 9.76 m | en.wikipedia.org/wiki/Type_90_tank (9.755); weaponsystems.net |
| Width | 3.43 m | Wikipedia; weaponsystems.net |
| Height (turret roof / overall) | 2.34 m roof / 3.05 m over sights+MG | weaponsystems.net; Wikipedia (2.34) |
| Gun (model, caliber, tube length) | Rh-120 L/44 (license JSW), ~5.28 m tube, sleeve + evacuator + MRS | Wikipedia; globalsecurity.org type-90-arms |
| Road wheels / rollers / sprocket | 6 road wheels/side, return rollers behind skirts, REAR drive sprocket (rear powerpack; weaponsystems' "front sprocket" contradicts JGSDF photos — rear kept), front idler | weaponsystems.net (6 wheels); tank-afv.com Type-90 photos |

## Identity cues (what makes this vehicle unmistakable)

- Turret plan-form and roof layout: Leopard-2A4-like WELDED SLAB turret —
  vertical flat sides, narrow gun throat between swept cheek plates, long
  near-parallel autoloader bustle with clipped rear corners; commander's
  stabilized periscope sight in a tall box FORWARD-RIGHT on the roof
  (offset right of the gun), gunner's primary sight embedded in the roof
  front-right; 12.7 mm M2 on a CENTER pintle between the two hatches.
- Mantlet/gun mount: low wide aperture under a shallow brow; heavy inner
  collar.
- Hull front: shallow two-step glacis, driver front-LEFT with a flush
  polygonal hatch; rear deck dominated by two rectangular cooling banks and
  a transverse louvre row.
- Running gear + skirts: 6 wheels (hybrid hydropneumatic/torsion), rear
  sprocket; 6-panel skirts with the leading panel cut at a slant.
- Signature equipment: 2x3 smoke dischargers on the bustle flanks, TWO long
  whip antennas raked outboard from the bustle corners, rear turret stowage
  rack overhanging the engine deck, side-mounted rear-view mirrors folded on
  the front fenders (often stowed).

## Reference links (links only — no downloaded images committed)

1. https://en.wikipedia.org/wiki/Type_90_tank — infobox 9.755/3.43/2.34
2. https://weaponsystems.net/system/167-Type+90 — hull 7.5, roof 2.34/3.05 overall, 6 wheels
3. https://www.globalsecurity.org/military/world/japan/type-90-arms.htm — gun/armament
4. https://tank-afv.com/modern/Japan/Type-90_Kyu-Maru.php — photo set

## Local GLB oracle notes

Path: `public/models/tanks/community/recovered/type90.glb` (LOCAL-ONLY).
KNOWN NORMALIZATION DEFECT: width-normalized to 3.43 the oracle reads ~20%
TALL — deck ≈ 2.17, roof ≈ 2.90, raked antenna to ≈ 4.4 (its modeled width
under-covers the real 3.43, so the lab's width normalization over-scales
the rest; HANDOFF §4 "wrongly normalized" case). Published dimensions win:
the procedural stays at real proportions and the residual vertical-band
mismatch is a documented cap, not gamed. Shape truths still taken from it:
prominent forward-right roof sight cluster + center MG, big rear bustle
rack overhang, long raked whip antennas, gun overhang ≈ 2.26 m real
(oracle agrees proportionally), track band low under shallow skirts.

## Mismatch log (before → after per fidelity iteration)

| Date | total | minView | hull | turret | gun | tracks | change |
|---|---|---|---|---|---|---|---|
| 2026-07-30 | 78.9 | 76.2 | 87.8 | 61.6 | 73.4 | 84.0 | baseline (generic kit profile in misc.js; muzzle 0.8 m SHORT of the real L/44 station) |
| 2026-07-30 | 79.0 | 80.4 | 87.3 | 73.0 | 49.7 | 81.0 | wave-2 final: turret raised to the real 2.33 roof (+0.22), commander sight tower + center M2 + rear rack overhang + vertical whips, evacR 1.9 gun rebuild, L/44 muzzle at the TRUE bow+2.26 station (gunZ stays 0 — a forward gun origin detached the kit mantlet, r1 floater fixed). GUN CAP ACCEPTED: the oracle is width-under-normalized (~20% tall/long), so its hull swallows most of the true overhang window — the honest muzzle costs G 73→50 while every view score RISES (minView 76.2→80.4); HANDOFF §4 says published dims win |

## GATE-V9 CERTIFIED ORACLE-DEFECT CAP — all curve components + stations (2026-07-31)

Gate-era confirmation of the pre-gate normalization defect: width-normalized
to 3.43 m the print reads p95 roof **3.55 m vs the published 2.34 m
(+51.7 %)**, overall 9.24 vs 9.76, with mast/antenna columns to 4.42 and the
hull mask carrying fused appendages (ref side rows show 4.2 m tops at the
tail). The whole print is ~20 % tall/long relative to its width; no rigid
transform repairs proportions. The build carries PUBLISHED dims (sovereign):
hull 7.45 / overall 9.76 / width 3.43 / p95 height 2.34 (M2 cluster + sight
held at the roofline; whips are the spike budget). hullCurves / wholeCurves /
turretCurves / stations are **certified capped** at their measured residuals
against this oracle (~0-50). dims + floaters must still pass.
