# Share immutable building data storage, not texture views

Building normal/surface composition already caches immutable canvases across
compatible sets. Their separate Three.js `Source` objects nevertheless upload
separate GPU storage even when the pixels and sampler policy are identical.

The building-only replacement path now uses a weak canvas-to-Source map. Each
texture, material, UV transform and sampler remains independent; Three.js owns
reference counting for each Source/sampler pair. Differing sampler policies
still allocate separately. Before replacing a Source the old texture allocation
is disposed while its original Source is attached. Assigning `texture.image`
on a shared Source would corrupt sibling images and is deliberately avoided.

Only final immutable building normal/surface canvases use this path. Albedo,
terrain, source requests, cancellation, cache residency, roughness, color space,
material/uniform identity and geometry remain unchanged. The weak map itself
cannot extend canvas lifetime. No quality or resource-budget thresholds change.

## Qualification

The before-negative fails actual Three.js Source identity on the unchanged
baseline. Five focused tests passed in the isolated owner: building Source
sharing, sourced textures, source failures, source composition adoption and
prepared terrain textures. Tests cover disposal before replacement, independent
UV/samplers, image replacement/rejoining, retained sibling pixels, cancellation,
source IO count, terrain exclusion and falsy release errors. All 84 runtime/tool
functions passed strict complexity metrics with zero explicit any/unknown.

The first combined typecheck failed because Three.js Source requires its data
generic. The map was corrected to `Source<HTMLCanvasElement>` without runtime
changes. The failure log is retained at
`/private/tmp/cot-interactive-baseline.gsRCvU/build-attribution-source-sharing-build-r1.log`.

The committed native regression owns its FIFO lease and tests nine scenarios:
independent UVs; sampler divergence/rejoin; individual, pair and full disposal
and re-upload; replacement/rejoin; and linear, mipmapped, anisotropic building
sampling. It requires exact rendered pixels, four reference versus two shared
GPU allocations, deliberate UV/Source-mutation negative controls, zero GL errors,
and zero final texture/geometry allocations.

Native Chrome 151 / ANGLE Metal M5 Max passed all nine exact-pixel cases:
zero changed channels, including the actual linear/mipmapped/anisotropy-4
policy. Four independent reference GPU allocations became two shared candidate
allocations. Divergent samplers/images correctly required three instead of
forcing sharing. Both negative controls detected actual pixel corruption.
All final textures/geometries were released, with no GL, page or cleanup errors.
Browser, test server, temporary cache and FIFO lease all closed normally.
Report: `/private/tmp/cot-interactive-baseline.gsRCvU/building-source-sharing-native-r1.json`,
SHA-256 `4af15275dd78f58ba570679521acc28076b17eb4f4d9ac0fb755d3d3631188bf`;
acquisition source hash
`d00a355f40cfcad8a4c2b6062d092321a339aef13f4e628c4f0b7a146fa993ee`.

The combined runner check also caught its intentionally exact native-lease
registry expectation. The new native test is now included in that expectation,
its eight-file event sequence, and all eight concurrency-level missing-lease
negative controls; assertions were extended rather than relaxed. Initial
failure: `build-attribution-source-sharing-build-r2.log` beside the report.

The corrected combined root rerun passed all five selected selftests, typecheck
and the production/public build. Log:
`/private/tmp/cot-interactive-baseline.gsRCvU/build-attribution-source-sharing-build-r3.log`.

This targets redundant data uploads; it does not claim that all observed scene
resource caps were duplicate allocations, nor that frame stalls are resolved.
