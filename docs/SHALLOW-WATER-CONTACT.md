# Shallow water contact

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
battle effects. The native live-drive transition below verifies that owner.
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
  The subsequent R4 candidate bounds the surface specular energy without
  changing the scene lighting; its accepted scoped preview is recorded below.
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
  interior/omitted-cell regression coverage. R4 and the live drive use this fix.
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
- Constrained-device performance remains an acceptance limitation. The terrain
  shader cache key is now
  v27; the water shader's bounded-highlight candidate is v3.
- The local sand/snow contact checkpoint is integrated, including exact
  water-versus-powder expiry tests. Broader shoreline dressing is not claimed
  complete here. Rain/snow weather remains removed.

## Native R4 and actual-drive review

Evidence root: `/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/`.

- `shallow-water-native-r4.JCVlSt`: sand, immersed, opposite low-angle,
  nighttime and snow captures from the production build. Root visually reviewed
  all five: the broad white sun-glare patch is gone, the waterline crosses the
  lower hull, submerged wheels remain faintly visible, and headlights illuminate
  the surface at night. Sand/snow use short low puffs rather than tall earth
  clouds. Accepted for this shallow-contact presentation, not whole-map art:
  the water is still deliberately simple, with no refraction or fluid motion.
  These static captures manually stage FX and do not prove actual driving.
- `shallow-water-live-r1.GKX9rY`: normal solo battle entry, authored Coastal
  spawn `[232, -352]`, one initial hull-yaw change, then held forward through
  normal input/60-Hz simulation/FX. No teleport, forced speed, suspension,
  manual particle emission or shot mode. The tank reaches `[383.1062, -352]`
  in 11.5021 seconds wall time / 11.5 seconds simulation / 11.4996 seconds FX,
  with both rear contact masks at 1 / 0.954724. The 24 scalar samples advance
  monotonically. Root reviewed dry, shoreline, immersed and Garage images.
- The shoreline trigger samples tank-center coverage first; both rear contacts
  are still dry at that trigger. The later screenshot is bracketed by rear
  coverage 0.0463 / 0.0224 and 1 / 0.9238. It is not an exact first-contact frame.
  The immersed observation records 20 live wet and 76 dry slots in the existing
  global 96-quad pool. Those are lifetime-slot counts, not player-only or pixel
  counts; independent expiry behavior is covered by the focused selftest.
- Normal `leaveBattleToGarage` detaches the retained FX group, disables its late
  particle activity, leaves zero live wet/dry slots and zero attached columns,
  guided missiles or impact decals, and unmounts the world. The screenshot is
  clean. This verifies actual phase ownership rather than a null-field mock.
- Both packets use Apple M5 Max/Metal Chrome at 1440×900, DPR 1, High, trim 0,
  scale 1. No page errors, failed programs, lost context or observed GL errors.
  Build/source pins stay unchanged. Both browsers/previews close and FIFO leases
  release. These are not physical-iPad/Safari or no-regression certificates.

## Bounded draw-cost review and integration

`shallow-water-cost-r1.Hfevdz` records one fresh native OFF/ON/ON/OFF acquisition
with 48 sampled frames per block, fixed camera, High/1440×900/DPR 1, unchanged
source and all 3,387 build-file hashes. Each block keeps the same retained scene,
geometry, material and texture owners: only surface visibility changes. The
complete render changes from 368 to 369 calls and 1,625,184 to 1,629,046 triangles.
This isolates the sheet draw, not construction, full-feature memory or FX cost.

Submission-to-`gl.finish` wall medians are 6.50 / 6.15 / 7.90 / 7.40 ms; pooled
OFF/ON medians are 7.10 / 7.05 ms and p95 values 8.9 / 9.2 ms. GPU query medians
drift strongly (42.57 / 43.76 / 27.55 / 17.75 ms) and exceed the corresponding
completion wall measurements. A foreign Chrome-for-Testing GPU process and
heavy Node work remain active. These samples cannot certify no regression or
quiet-machine GPU attribution. They do verify the exact bounded draw delta;
there is no retry, relaxed threshold, hidden tier reduction or zero-cost claim.
The admitted run takes 33 seconds, has no page/GL errors, and closes its own
browser/server and releases the shared FIFO.

Incremental publication integrates only water/contact and its tests/docs with
the previously accepted coal/root corrections. The current-main integration
packet passes actual nine-map track classification, terrain-resource ownership,
full TS7 and production build (existing chunk warning). The coal command in
session 66771 initially names the wrong directory and fails before loading;
session 12365 reruns only its correct `src/world/maps/` path and passes the
30-map non-coal/RNG/collision checks. The original failure is not relabeled a
pass. Build index: `732c52affc1d52cfa7e32140f5434ccfe083e928c9381413bf24f5db79952742`.
The subsequent rebase adds only an unrelated vehicle-inventory document.

This is the user-requested incremental shallow-contact feature, not closure of
the broader environment performance/memory, shoreline-decoration or all-map
beautification work. The existing simulation/bed, navigation and collision data
remain authoritative; no reflection engine, buoyancy or drowning rules ship.
