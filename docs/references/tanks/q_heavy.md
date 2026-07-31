# Heavy Tank, Quaternius (`q_heavy`) — reference packet

**Exact variant modeled:** Quaternius "Tank" (poly.pizza FA5daiyZQq, CC0 1.0) —
a STYLIZED community design, not a historical vehicle. Per the fidelity
program rule for stylized community tanks, **the oracle IS the reference**:
the build matches the GLB's chunky low-poly character (squat wide hull, big
rounded turret, fat stepped gun, chunky exposed wheels), not a real tank.

## Corroborated dimensions (the oracle, width-normalized to spec 3.60 m)

Probe: tools/tmp-ww2-probe drive of the fidelity-lab frame (scale 0.926).

| Measure | Value |
|---|---|
| Hull | z −2.63..+2.63 (5.26 m), full-width ±1.80 slab the whole length |
| Roofline | bow tip y 0.89 rising to cab roof 1.16–1.17 (±1.09 wide); rear engine hump to y 1.39–1.44 (z −1.9..−2.45); tail drops to 0.89 |
| Fender/track shoulder | ±1.75 at y 0.2–0.7, ±1.80 at y 0.8–1.0 (tracks nearly hull-width, ground-contact bumps every ~0.5 m from z 1.93 to −2.07) |
| Turret | plan snout ±0.59 @ z 1.35 widening to ±1.34 @ z 0..−0.15, taper to ±1.17 @ −1.65; base y ~1.20 (floats over cab roof 1.16), crown 1.64–1.65; forward shield lip 1.19..1.50 at z 1.2–1.4 |
| Gun | axis y 1.40, tube Ø0.24 to z≈3.0, stepped to Ø0.18, muzzle z 3.68 (1.05 m past bow) |

Spec row (`specs.js q_heavy.dims`): 7.2 × 3.6 × 3.0 — the GLB is proportionally
much squatter/shorter; the loader's width clamp (3.6×1.08) governs, so the
scored oracle stands 5.26 m long and 1.65 m tall. The procedural build
replicates the ORACLE frame (the r7 parametric used hullLength 7.2/roofY 1.64
and lost ~30 pts of hull/turret mask for it).

## Identity cues

- Chunky toy proportions: hull one wide slab, tracks nearly as wide as hull.
- Raised center cab band (±1.09) + rear engine hump with grille character.
- Big rounded turret with narrow forward gun-shield snout, wide mid dome.
- Fat two-step gun tube, no brake, big visible wheels, no skirts.

## Reference links

1. https://poly.pizza/m/FA5daiyZQq — Quaternius "Tank", CC0 1.0 (authoritative source model)
2. https://quaternius.com/ — author page (Ultimate pack family; consistent chunky style)

## Local GLB oracle notes

Path: `public/models/tanks/community/tank_quaternius_fa5.glb`
(turret `^Tank_Turret$`, gun `^Tank_Gun$`, yawOffset π/2). Healthy oracle;
skinned rig (bone-driven), articulation nodes verified by the rig probe.

## Mismatch log (before → after)

| Date | total | minView | H | T | G | R | change |
|---|---|---|---|---|---|---|---|
| 2026-07-30 | 57.1 | — | 68 | 53 | 15 | 68 | baseline (generic 7.2 m parametric hull) |
| 2026-07-30 | 89.1 | 89.2 | 92 | 79 | 91 | 86 | bespoke oracle-frame build: 5.26 m slab hull + cab band + rear hump, snouted dome turret w/ under-collar, two-step Ø0.24 gun, 9 chunky steel wheels at the oracle's 0.5 m pitch |

Remaining gap: turret component (79) — the oracle's dome/collar transition is one
fused blob whose subtract-mask carves differently than a clean hull/turret rig;
plan and side profiles match within ~5 cm. Widening the snout plan toward the
probe read cost 2 pts (r2 reverted).


## Geometry gate v9 (2026-07-31, from-scratch agent)

DIMS-FIRST REBUILD: the published spec row (7.2 x 3.6 x 3.0, overall 8.8)
is ~1.37x/1.75x the Quaternius toy's frame at matched width (oracle measures
5.44 long, 1.71 tall). Dims are sovereign and uncappable, so the build now
carries the published envelope (dims 0 -> 93.1, floaters 100) and every
curve row is a certified proportion cap (the width-normalized toy cannot be
tracked from a published-size build): hull/whole/turret/stations 0. If the
spec row is ever re-derived from the oracle (5.44/6.44/3.6/1.71), the
previous curve-matched geometry scores hull ~47 / turret ~56.