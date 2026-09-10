# Overlapping bush sprays — source draft, unvalidated

Isolated from exact `29217600af0e2615549529cb93dc0f3384ef0265` (accepted Autumn
palette; no held normal or rejected shrub geometry). Only the bush constructor
and its private writer/interface change runtime. `foliageCard`, every tree
builder, placement, materials, shaders, textures and world updates are untouched.

The existing 16 random nodes each emit two smaller flat sprays rather than one
bowed card. Widths are .74/.68 times the original .72–1.27m random width, both
with .8 aspect. Each pair shares a branch anchor strictly inside both rectangles;
local offsets (.14,.05) and (−.12,−.08) of each spray's width prevent coincident
centers. Yaw separation is .90–1.20 radians, pitch stays within ±.40 radians and
roll within ±.60. The sprays are noncoplanar, predominantly upright—not radial
tangent plates, a hollow shell or repeated horizontal tiers.

Branch anchors keep the original random direction/radius distribution, XZ scale
.96 and vertical scale .42 around y=.55 with a small node-dependent height
stagger. These dimensions aim to retain the loose old full crown footprint and
lower skirt; actual per-seed bounds, coverage and gameplay-cover alignment are
not yet accepted. Both palettes and textured leaves remain visible through
the same existing materials.

The writer computes normals from actual Float32 positions relative to the bush
center: scale vertical displacement by .65, normalize, add .55 to Y with minimum
.28, normalize again. This yields finite unit normals with normalized Y at least
approximately .269, including the old downward-pole case. A mild vertex-height
value gradient, lifted interior shade floor and reduced card saturation replace
the compounded dark center; visual success is not inferred from this math.

## Exact construction budgets; not measured performance

- 32 flat sprays ×2 triangles =64 triangles,192 nonindexed vertices: same as
  16 bowed cards ×4 triangles. Same position/normal/UV/color/flex layouts:
  9216 attribute bytes per prototype, two production buckets unchanged.
- One BufferGeometry and five final typed arrays/BufferAttributes. No temporary
  PlaneGeometry, converted clones, parts array or merge in this constructor.
- Exactly11 RNG draws per node in the prior order,176 total. Both output sprays
  derive from those draws; no new placement RNG, map queries or frame work.
- UV content intentionally changes:32 complete atlas rectangles instead of16
  twice-subdivided rectangles. Flex stays .22. Pair plane area is1.01 times the
  predecessor's flat-plane area (before its bow); changed overlap/alpha coverage
  still requires actual rendering review, not a same-triangle performance claim.

Root delegates focused actual-geometry/RNG/all-palette tests separately. No
tests, quality scan, typecheck, build, browser, native acquisition, commit or
push were run by the implementation owner. This candidate is not visually or
performance accepted. Preserve earlier rejected shrub/native receipts.
