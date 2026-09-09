# Shallow water contact candidate

This is a presentation change, not a fluid/buoyancy engine. The authoritative
terrain, navigation ground types, vehicle support and hit positions stay on
the existing drivable bed. A translucent sheet places the visible waterline
0.43–0.72 metres above that bed in fully wet areas, fading out through the
existing shoreline/road/pad coverage. Frozen and dry maps do not get a sheet.

Coast, lake, silty river and marsh profiles vary tint, transparency, roughness,
depth and flow. Existing terrain mask and water normal textures are reused;
there are no reflection/refraction passes, render targets, new texture sets,
or per-frame geometry work. Construction yields per grid row.

One shared 8-metre grid surface adds at most one geometry/material and one
single-pass transparent draw per liquid world. The 1024-metre maximum grid
has at most 16,641 vertices / 32,768 triangles (actual wet footprints are
compacted). This is a bounded added cost, not a zero-cost or no-regression
certification. Native frame and memory acceptance is still required.

Track spray and expanding ripple rings use the existing particle and 96-quad
tread/wake pools at the new waterline. Contact samples the exact rendered
triangles, not the continuous depth curve between their vertices. The sampler
reuses the construction height grid and adds a compact cell-admission bitset:
68,612 retained CPU bytes at the maximum 1024-metre grid. It does not query
shore masks, allocate, or search geometry during contact. The dry tread branch is retained; an
expired-print admission fix allows a repeatedly traversed spot to receive a
new print/wake. The proxy follows world replacement and falls back to zero
when there is no field. That null-field test is not a Garage-transition test:
Garage can retain a dormant world, while the existing FX phase owner suspends
battle effects. A native transition check is still required.
Map-owned shared texture retention covers the new material's hidden samplers.

## Evidence status

- Focused shallow-water and live-height-proxy checks pass.
- TypeScript 7 and strict metrics for both new runtime modules pass.
- Production build passes (existing large-chunk warning remains).
- The first complete native dry/shore/immersed acquisition (R2) uses Apple
  M5 Max/Metal, 1440×900, high quality, trim 0 and scale 1. It reaches the
  expected 0 / 0.359 / 0.72-metre water depths with no page/console errors.
  Tracks visibly submerge, but the bay is too pale and washed out from the
  sun-facing view. That appearance was rejected, not published.
- The R3 candidate caps the surface environment reflection, strengthens its
  shared wave normals, and makes only the submerged terrain bed matte/dimmer
  so two reflective sheets do not compound the glare. Buoys now seat at the
  visible waterline; grounded boats and driftwood keep their bed placement.
  Focused checks, TypeScript 7, strict new-module metrics and build pass.
- R3 completed dry/shore/immersed, opposite low-angle and night views with
  no errors. Low-angle immersion and night lights are visible, but the direct
  sun highlight remains overexposed, so daytime appearance is still rejected.
  The next candidate bounds the surface specular energy without changing the
  scene lighting. It awaits integrated checks and a native preview.
- R3's same-build water-mesh on/off samples isolate the extra draw only:
  371→372 calls and +3,862 triangles at this Coastal pose. The two off/on/on/off
  median render times were 3.8/3.9/4.9/3.7 ms; the second on block has an
  8.7-ms p95. These variable samples are not a no-regression certificate or
  a full-feature, steady-state or tablet performance gate.
- R2's growing resource counts across different poses are not a memory A/B:
  moving the camera warms other materials, geometry and textures too.
- Integration caught a shoreline-interior height mismatch: the 8-metre mesh
  and the analytic contact depth only agreed at vertices. The candidate now
  uses one triangle-height sampler for wakes, spray and buoys, with independent
  interior/omitted-cell regression coverage. Native review is still pending.
- The integrated alignment/powder candidate passes all seven focused tests,
  TS7, strict metrics for both water modules (12 functions, no violations),
  and the seven-file water/terrain Doctor scan. Production build also passes;
  its existing large-chunk warning remains. These are session 65572 results,
  not a native visual/performance acceptance or a clean full-FX Doctor claim.
- Two integrated contact tests initially failed before assertions because
  `typescript` now resolves the TS7 version-only package. Using the already
  maintained `typescript-compiler-api` import makes both pass; no dependency
  or runtime changes were needed. Original failures remain in session 33311
  and `track-contact-compiler-r1.YMPY27/REVIEW.md` under the evidence root.
- Not yet published. Buoy visual seating, live motion and constrained-device
  performance remain acceptance checks. The terrain shader cache key is now
  v27; the water shader's bounded-highlight candidate is v3.
- The local sand/snow contact checkpoint is integrated, including exact
  water-versus-powder expiry tests. Its native appearance and broader shoreline
  dressing are not claimed complete here. Rain/snow weather remains removed.
