# Bounded wet-layer pixel pacing

Candidate base: `465a68f7c43cd9ed1cc23ce62853ab9d1c6e0b43`.
This is a terrain-loading experiment, not a quality change or an attribution of
the early/historical callback gaps.

## Evidence and scope

The saved `production-first-player-profile/battle.cpuprofile` contains 27
inclusive samples, weighted at 29.682 ms, beneath the minified ground-layer
painter (`Di → Pi → Fi → Ji → qi`, `terrain-BQYTIK68.js`). This identifies a
synchronous wet-material construction cost. Sample weights are not exact
function timings. That interval is later than the historical 88.5 ms callback
gap under both recorded profile-start alignment bounds; it cannot prove that
gap's cause. The separate recent day gap during “Building terrain meshes” also
does not identify this particular pixel loop.

`makeGroundLayerSteps` retains the original painter's pixel order, private
seeded noise, Float32 height field, packed roughness, tone, normal construction,
resolution and texture settings. It yields after each eight painted rows.
`makeGroundLayer` remains a synchronous drain of that same generator. Only the
ordinary mud wet layer delegates these checkpoints to the existing terrain
material generator; the ice/sea paths and synchronous rock fallback retain
their established scheduling behavior.

Desktop mud painting has 32 checkpoints, each with 4,096 noise calls. Mobile
painting has 16 checkpoints, each with 2,048 calls. These are work-count bounds,
not millisecond guarantees. The final tone/normal conversion and Canvas image
construction remain synchronous after the last row checkpoint. There is no
new worker, cache, timer, deadline, quality policy or progress value. Existing
async terrain pacing and cancellation own the additional checkpoints.

## Qualification contract

`terrainWetLayer.selftest.mjs` uses the pinned `@napi-rs/canvas` rasterizer and a
frozen pre-change painter. It compares every returned native albedo/normal byte,
pre-normal Float32 height, texture setting and noise-coordinate order for
desktop/mobile mud and rock, two seeds, and three tone/roughness cases. It also
composes the production ground/material/terrain generators and async consumer
with the actual opaque-loading scheduler and controlled host delivery. Pending
task, rAF and post-rAF task waits must prevent further painting; cancellation
at rows 8, 128 and 256 must close the generator without wet texture or material
publication. Unrelated horizon/source/geometry work is a peripheral fixture.

The native Canvas checks are CPU payload evidence, not GPU, visual-scene,
browser responsiveness or speedup certification. No browser comparison is
included in this candidate's qualification.

## CPU qualification receipt

The consolidated shared-FIFO retry passed all 24 native pixel cases with the
exact package pin `@napi-rs/canvas@0.1.100`. The controlled scheduler delivered
22 task waits and 10 paint/post-task waits for a complete desktop mud bake.
Cancellation at rows 8/128/256 stopped at exactly 4,096/65,536/131,072 noise
calls, closed the delegated iterator once, and published no wet texture.

The wet-layer, splat-field, terrain-resource, world-build-coordinator and frame
scheduler checks passed; registry discovery found all 978 ordered checks.
Strict typecheck/unused-owner checks and the public build passed. The five
affected painter/material functions passed strict `<22` cyclomatic, `<22`
cognitive and `<80` Halstead gates. The new row generator scored 5/9/27.14.
The full terrain inventory still reports the unchanged legacy `heightAt` and
`applyHeightConstraints` violations; this is not a whole-file clean claim.

Log: `.local-evidence/terrain-wet-layer-validation-r2/checks.log`. The original
run's failed negative-control assertion is preserved in
`.local-evidence/terrain-wet-layer-validation/checks.log`: the broken no-row
delegation was rejected earlier than the test's expected message, with eight
textures already present during a wait instead of six. Only the harness was
corrected before the complete retry.

Frozen public `dist/index.html` SHA-256:
`ad8bd5105a20ed669c4c9ac57db1e3dc3b2a560179dd380b854b2782d814c5be`.
No browser, commit, push or deployment was performed.
