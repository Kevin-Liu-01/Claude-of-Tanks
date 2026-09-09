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
tread/wake pools at the new waterline. The dry tread branch is retained; an
expired-print admission fix allows a repeatedly traversed spot to receive a
new print/wake. World replacement and Garage fall back to zero water depth.
Map-owned shared texture retention covers the new material's hidden samplers.

## Evidence status

- Focused shallow-water and live-height-proxy checks pass.
- TypeScript 7 and strict metrics for both new runtime modules pass.
- Production build passes (existing large-chunk warning remains).
- Initial dry/shore/immersed native acquisition is pending visual review.
- Not yet published. Buoy seating, night/low-angle views, live motion and
  constrained-device performance remain acceptance checks.
- Sand/snow contact variants and broader shoreline dressing are separate work;
  neither is claimed complete here. Rain/snow weather remains removed.
