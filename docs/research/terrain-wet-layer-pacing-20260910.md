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
No browser, commit, push or deployment was performed for that isolated receipt.

## Integrated native checkpoint

The wet-layer change and build-local plaster relief sharing are integrated at
`3f66a459e` (before publication). Fourteen focused terrain/props/lifetime/
scheduler/registry checks, full typecheck/unused checks and public build pass.
The frozen public index SHA-256 is
`3254a75de246986cf2e5a5a857af65ff2b2a01125acb14d8e5ea3105afc14ca4`.

Actual Battle, night Battle Again and Garage controls pass functional,
warm-readiness, source-readiness, boot-audio and audio-clock gates. Root inspected
all three stills; the authored terrain, buildings, night lighting and Garage
remain present. Page/cleanup/failure lists are empty. Total action times are
6353.0 / 5533.7 / 324.1 ms, with largest callback gaps **101.8 / 53.8 / 42.7 ms**.
The largest cold gap crosses “Surveying terrain” to “Building terrain meshes”; it
does not establish the wet painter as its cause. These are single-run functional
results, not proof that overall loading is smooth or that pacing is faster.

The unchanged fixed-roster phase-resource acquisition confirms battle scene
textures **132→130**, scene pixels **28,914,944→28,783,872**, and renderer
textures **304→302**, versus the preceding FX candidate. All three phases retain
the same object/geometry/material/program counts. Battle mean main-thread work
is 6.276 ms/render; Garage remains idle rather than continuously animating.
There are no page, console or HTTP failures. The **same eight resource gates
still fail**: Garage triangle counts, and battle object, geometry, material,
texture and texture-pixel ceilings. No threshold or visual quality was reduced.

Raw evidence in the owning battle-era worktree's `.local-evidence/`:
`terrain-plaster-combined-validation.log`, `terrain-plaster-actions/report.json`
and its three PNGs, and `terrain-plaster-resources.json`. Acquisition hashes
remain `782d10ba63581e161cad61ed9c3930f7199cef71c356886cc2ed467a9af3d9f2`
(actions) and `bd40b57d430b7134f6ee0a3ba58e57c451f762b93585515a2bcbed7e31e52edb`
(resources). Both use native Apple M5 Max ANGLE Metal, High, DPR 1, scale 1,
trim 0; action viewport is 1280×720, resource viewport 1280×577. This checkpoint
does not resolve the historical 214–319 ms gameplay stalls.

## Foreground scheduling follow-up

The foreground world-build owner now requests a task yield after 6 ms and a
paint/post-paint yield after 16 ms, previously 12/32. Background scheduling,
shared scheduler defaults, cancellation, progress notifications, timeouts and
visual quality are unchanged. Cooperative checkpoints cannot preempt an atomic
operation and this is not a 16 ms frame guarantee.

The production trace contains 54.1–61.0 ms terrain/structure frames composed of
multiple 6.7–15.7 ms script slices before a paint. A task yield alone does not
promise a rendered frame; the shorter paint deadline addresses that case.
The largest observed frame also contains a 63.1 ms atomic continuation, which
this policy cannot fix. Extra yields can lengthen total loading; actual native
timing remains a separate acceptance check.

The coordinator test exercises its actual default policy with controlled browser
delivery: 6/12 ms task waits, the 16 ms paint deadline, a required post-rAF task,
deadline reset, cancellation-safe fixture cleanup and unchanged deduplicated
progress. Coordinator, scheduler and all 24 native wet-layer cases pass in
`cot-terrain-wet-layer-20260910/.local-evidence/foreground-policy-6-16-r2/checks.log`.
