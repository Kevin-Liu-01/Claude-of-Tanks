# Carryover from critique round 3 (written by the r3 verifier, 2026-07-28)

Everything apply-ready in the nine `*-r3.md` handoffs (+ the four patch
files) was applied and committed in "Critique round 3 fixes". The items
below were deliberately NOT applied — either unverified feature work routed
to a specific owner, or superseded by a conflicting change this round.

## 1. props.js — sniper-scope near-prop fade (controls_gunnery r3 §8, MAJOR)
`world.setSniperFade` (map.js ~183) forwards only to vegetation. Props
(telegraph poles, hesco/wall slabs) within a few meters of the scoped camera
render unfaded and can occupy ~15% of the frame (critic shot
`cgshots/b2_sniper_aim.png`). Ask the props owner: extend the vegetation
corridor's hash-noise dither/discard (vegetation.js ~1268/2490) to props
instanced meshes, gated on `distanceToCamera < ~6 m && scoped`; acceptable
minimum is fading any prop whose bounding volume intersects the camera→6 m
segment. Not applied by the verifier: per-instance shader work across all
prop materials, never temp-verified by anyone this round.

## 2. maps/horizon.js — sniper-zoom forest impostors (lighting_post r3 §8, MAJOR)
x8 horizon forest reads as rows of solid-teal alpha silhouettes with
dead-snag spikes (shots/sniper_view.png top third). Requested of the CB
owner: 3 tone steps per tree in the comb texture (sun az 115°), ±8% luma
per-instance jitter, drop snag sprites beyond the second ridge row,
optionally swap the first comb row to vegetation.js `farTreeLOD` within
700 m of the scope bearing.

## 3. vehicles/materials.js — painted-set albedo raise (lighting_post r3 §6, part)
APPLIED: hull roughness 0.95→0.78, hull envMapIntensity 0.55→0.75.
NOT applied: the ~1.5x camo-palette luminance raise (luma floor ~0.16
linear), barrel thermal-sleeve/periscope-bezel spec materials, and the
wheels env raise (would reverse the tank_models r1 "blue-black glossy
wheels" fix). The palette raise must be done by the materials owner WITH
garage screenshots — camo_spotting r3 reworked the same palettes this round
and double-tuning blind risks regressing their verified shots.

## 4. fx/effects.js — muzzle ground-glow radius (lighting_post r3 §2c, part)
APPLIED: caliber-keyed core scale (`coreK = 0.8 + caliberMm/120*0.5`).
NOT applied: "reduce the ground-glow decal radius ~25%" — spawnMuzzleFlash
has no distinct ground-glow decal to shrink (the ground pool comes from the
muzzle light, whose range is lighting_post's own r2 tuning). Needs the fx
owner to identify the intended element.

## 5. engine/lighting.js|post.js — winter props render albedo-independent pale
(terrain_environment r3 finding, reproduced with probes.) A near-black
boulder (props rock InstancedMesh, ~87 m from the winter preset camera)
renders ~0.8-luminance cream; flooding geometry color pure red renders
salmon with G/B ≈ 0.5 — i.e. ~0.5 albedo-INDEPENDENT white is added on the
winter path. Worked around via winter.js `rockSink: 0.45` + sandbag tint,
but any dark prop on snow will hit it. Root-cause in the engine.

## 6. Foliage frame-time cliff attribution (gameplay_feel r3 §4)
The r2 critique's worst chase frames (bush clumps filling the frame) carried
11-21 FPS headless readings vs 47 on open meadow. performance_budget:
attribute on real hardware (suspects: bush/tree overdraw with alphaTest +
CSM, occlusion-fade dither path).

## 7. Perf re-certification on merged HEAD (performance_budget r3, REQUIRED)
The r3 cert numbers in docs/perf-after.json / docs/cert-r3-dsf*.json were
measured on a pinned pre-merge worktree at f43b778 UNDER CONTENTION. After
this merge, re-run `node tools/perfprobe.mjs --dsf 1` and `--dsf 2` in a
quiet window and replace docs/perf-after.json. frameMsP99 (25 ms gate)
remains UNPROVEN, not failed. The 6.0M triangle ratchet is met on the probe
battle — flip `RATCHET.trianglesMedianMax` into BUDGET only after it holds
across desert/winter/urban probes.

## 8. Grass-taper conflict resolution (verifier decision, r3)
terrain_environment's mid-grass retune (keep-more: 0.24@70-230) and
performance_budget's measured cut (0.54@58-205) collided in vegetation.js
`update()`. The PB cut won — the 7.0M triangle budget was blown at 8.08M and
the cut is measured (-1.5M tris). If the midfield reads too thin next round,
re-tune WITH a triangle probe, not by reverting.

## 9. Vegetation impostor variants (content_breadth r3 §6, guidance)
If "flat card sheets / repeated palm scaffold" persists: crossed canopy
planes for the 60-260 m band, per-instance frond/tuft count off the
placement rng, ±18% canopy-radius jitter (vegetation.js
buildBroadleafCards/buildPalmGeometry).

## 10. genIcons regeneration for delisted-GLB fallbacks (tank_models r3 note)
`node tools/genIcons.mjs --tanks ariete,leo2a4,bmp2` once icons tooling is
free, so carousel/techtree portraits match the procedural fallback models.
