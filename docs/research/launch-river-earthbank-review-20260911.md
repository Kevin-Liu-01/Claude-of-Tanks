# River water and Monsoon bank review

The shared river surface (Monsoon, Delta, Autumn) and Mangrove marsh now use
0x46665f, opacity0.55 and roughness0.30. Depth, flow, bed, coverage, geometry
and all other water profiles remain unchanged. This separates the visible
water from the warm soil while retaining ripples and dark wet banks.

Monsoon's exposed-bank material uses the existing Ground071 granular earth
set with a muted tint, instead of Rock058's directional veins. The underlying
geometry, material coverage and shared terrain shader remain unchanged.
This is a Monsoon-only material choice; other maps retain their source sets.

Evidence retained under `.qa-dev/launch`:

- `{monsoon,delta,autumn,mangrove}-palette-r1`: twelve same-scene native
  before/candidate pairs. Every repeated control is exact RGBA; geometry,
  texture and program counts match within every pair; zero GL/page errors.
  Independent review approves all twelve sampled daytime pairs.
- `{monsoon,polders}-palette-mobile-{day,night}-r1`: eight more pairs at the
  actual mobile quality preset under desktop viewport emulation. Night runs
  enter a real battle and verify the active clear-night map atmosphere.
  All repeated controls and resource counts match; no GL/page errors.
  Independent review approves all sixteen original images in these eight pairs.
  These are not physical-device or frame-rate certifications.
- `wall-material-pairs-r5`: nine matched-dev pairs with exact terrain,
  visible geometry, camera, render state, resource counts and uploaded-owner
  lists. Five Monsoon views show a clearer granular earth bank without a
  broad control regression; both Redrock controls remain exact RGBA.
- `river-earthbank-focused-r1.log`: six focused test files pass, including
  native sea texture/normal/physics preservation and source composition.
  Type checking and private production build pass.
- `river-earthbank-built-r1`: fresh production-bundle acquisition on all four
  affected maps passes all seven map-quality checks, target texture readiness,
  exclusive battlefield ownership and terrain warm-up, with no page errors.
  Native renderer: ANGLE Metal / Apple M5 Max. Build index SHA-256:
  `1d54da4c7c77440856b45a345adae513288720aa5f76f195f5227d2ac7d20b1e`.
  Final Monsoon shore32, Delta15, Autumn24 and Mangrove12 originals were also
  reviewed after the combined build. Thirty-frame timing samples were taken
  under host contention and do not certify sustained performance.

The shared terrain projection trial and the Autumn/Saltwind horizon threshold
trial were rejected and removed. The latter's actual compiled uniform branch
was verified; it still did not fix the green curtains. Its patch and failed
art review remain in `wall-material-pairs-r5`. Earlier R1/R4 resource mismatches
remain failures in their original reports; later parity does not erase them.
The remaining horizon defect is being investigated separately. Water-body
shape, every shoreline's accessibility and clean sustained performance are
not certified by these material comparisons.
