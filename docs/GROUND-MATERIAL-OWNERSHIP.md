# Ground material separation

This checkpoint addresses one shared visual defect, not completion of the
thirty-map environment pass: worked soil inherited turf grain after the
terrain shader had already blended it away.

## Change and boundaries

The near base-layer normal/albedo octave and the distant turf octave now use
the remaining base coverage. Dirt, rock, projected slopes, liquid and roads
exclude that detail continuously. Pure base material retains its previous
detail gains and sampling coordinates. The base layer is grass on pastoral
maps, but can be snow, sand or ash on other biomes; those layers likewise must
not be reapplied over a different exposed material.

This is limited to these two detail octaves. Other later coastal-sand and snow
drift mixtures have separate coverage and are not certified by this change.

Ironworks also uses the existing activity-footprint mask mode. Its three
accepted irregular service-court/access polygons now replace the blanket
572-by-576-metre dry settlement wear rectangle. Existing `townWear` is 1.6,
making the authored cores soil-dominant while retaining regrowth and feathered
edges. This is not a global increase in dirt coverage: coastal sand limits and
all other map settings remain unchanged.

No new textures, texture dimensions, samplers, uniforms, geometry, callbacks or
placement rules are introduced. The material retains its ten shader-owned
textures and existing 78 texture-fetch expressions. This is an ownership
census, not proof of zero GPU-time cost. The program key advances to v28.

Terrain heights, collision, road/rut/water mask RGB, protected road/water alpha,
spawns and raw vegetation admission are unchanged. Existing grass instances
are not removed from yards by this surface-only correction.

## Verification

`terrainMaterialOwnership.selftest.mjs` executes the actual scalar declarations
and all four normal/albedo consumers with controlled texture inputs. It checks
full replacement, exact pure-base behavior, 2,048 fractional combinations,
continuity and old-formula/consumer-bypass negative controls. These are source
and scalar checks, not compiled GLSL or rendered-pixel proof.

The maintained village-wear test checks real 512/256 masks across three seeds,
localized soil area, protected channels, sampled physical queries and current
authoring. Its older coastal/28-map receipts remain immutable; historical
Foundry projections strip only the independently guarded later visual inputs.
The service-court test retains its original additive-mask test under an
explicit pre-localization input while its actual geometry/collision producer
checks remain current.

The combined nineteen-stage packet passes: fourteen focused world tests,
TypeScript/core-unused checks, baseline/candidate Doctor, diff hygiene and the
public build. Both scoped Doctor scans report zero warnings/errors. The first
packet stopped before build on an expected-map-order mistake in the new
fixture; the canonical list was corrected without changing coverage limits.

Actual Ironworks dry wear is 3,224 square metres at desktop mask resolution
and 3,248 at mobile, versus the old 326,168/304,976-square-metre apron. The
high-alpha soil cores retain 1,580/1,600 square metres. Different terrain seeds
produce the same mask here because mask noise intentionally uses its existing
fixed seed; physical-query parity is checked separately for all three seeds.

## Native comparison and limits

All eight original 1440-by-900 before/after images were reviewed, including an
independent second review. The accepted improvement is narrow: Ironworks has
a clearer brown working strip linking its loading buildings, without the
large rectangular wear apron. Autumn's exposed soil change is subtle; the
coastal beach and waterline remain visually almost identical. There is no new
visible seam, clipping or blank patch in those controls. Fine turf noise,
sparse industrial dressing and simplified vegetation remain unfinished art
issues. The prior court images remain a separate layout/contact checkpoint.

Native High/trim-0 Apple M5 Max captures used identical cameras and DPR1.
Actual ground geometry/owners, ten texture dimensions/sampling, 27,000,832
base texture bytes per map, and renderer residency match in all four pairs.
Decoded mask RGB is exact; only Foundry alpha changes. Generated driver mips
and total retained heap are outside that resource receipt.

Across 120 normal post-render samples per view, ground draws/triangles are
exactly unchanged. Submission-wall median/p95 (milliseconds) are court
2.80/3.50 to 2.80/3.50, establishing 3.10/3.50 to 3.00/3.40, Autumn 2.50/3.30
to 2.35/3.10, and coast 2.10/2.90 to 2.30/3.40. Autumn cadence p95 increases
16.9 to 18.2 ms. These sequential cross-context samples are not completed GPU
time, do not isolate causality, and do not certify zero performance regression.

The first native attempt timed out inside a long browser call on baseline
Autumn. A second attempt used short, persisted observations: grass construction
was progressing normally, but five visible/four ahead chunks remained at the
unchanged 20-second acquisition limit. Textures and carpet were ready, camera
ownership stayed exact and no browser errors were recorded. Both failures are
retained. A separate settled-art protocol waits for natural cooperative
completion with the same source, quality and readiness predicate; it does not
turn the failed 20-second check into a pass or certify startup performance.
Autumn needed 34.160/34.075 seconds in that settled-art comparison. Runtime
budgets, quality and grass pumping were not changed to force readiness.

The source-owned minimap was then baked at 440 by 440 pixels after a DPR2
reload. Its scene and six service-court donors were checked. The accepted
Foundry WebP is 37,932 bytes, SHA256
`d599e03b30d3d74318391f1c0651846f0dff82c0609862ef3427a2140856848e`.
Only Foundry's asset and cache revision change; the other 29 remain untouched.

Local check evidence:
`/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/ground-material-checks-r2.XWrZZA/`

Local native evidence (including raw timing/resource samples and limitations):
`/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/ground-material-settled-art-r3.B4gifJ/`
