# Continuous shoe floor foundation — local candidate

This opt-in foundation does not activate a profile, change a mesh, or claim a
fleet-wide track repair. Per-vehicle primitive/profile changes and complete
anatomy, asset and composed release gates remain separate and pending.

## Contract

- `continuousShoeFloorYM` is an independently certified complete native
  near/far shoe-course minimum, including all vertices, both sides and the
  declared tangent or finite-span placement. It is not a clearance epsilon.
- The shared contact metadata and both gallery/garage seating paths retain
  the lower of their existing measured stock and this certificate.
- The supported authored hull frame is identity with a unit root visual
  scale. Contact setup, presentation seating and simulation sync explicitly
  reject other hull translations/rotations/scales or root visual scales.
  Ordinary root world translation, yaw, pitch and roll remain supported.
- The first opted-in ground sample initializes actual suspension conformance;
  later damping and all non-opted-in behavior retain the original formula.
- A neutral-course certificate does **not** bound arbitrary deformed terrain.
  Nonflat terrain, contact fit and visible hovering require independent tests.
  A safety envelope 31 mm below the loaded line is not an acceptable fitted-track
  result merely because it prevents penetration.

## Proof support

`tools/track-course-intervals.mjs` uses the actual native Float32 carrier and
authored course metric. It partitions every segment/tangent or finite-pin
transition, bounds trigonometric extrema and supplies an analytic Float32
instance-upload error bound. The helper regression contains 38,912 independent
native-matrix heldouts, including between-endpoint extrema and invalid topology.
Its tolerance is arithmetic containment, not permission to overlap geometry.

`continuousShoeFloor.selftest.mjs` covers explicit certificates, lower existing
stock retention, absent-option exact defaults, first/later conformance and
negative frame/scale controls. Both helper regressions pass.

An inactive-core differential was frozen before and after the shared seam in
`cot-t80u-x-outsole-pilot-20260908/.qa-dev/t80u-outsole-baseline-ZQblP3` and
`.../t80u-outsole-baseline-fxLLGf`: HIGH 38/LOW 37 native mesh records, all geometry
attributes/indices, transforms/instance matrices, source receipts, local axles
and contact metadata compare exactly. No original fixture was regenerated.

The separate T80 candidate's native certificate
`.../.qa-dev/t80u-outsole-certificate-24kIqY/receipt.json` bounds the actual
finite-span course at −0.006500219911 m. Its independent 128-phase matrix check
reaches −0.006500007176 m; the outward-rounded −0.006501 m profile certificate is
approximately 1 µm below the loaded tread line. That pilot's actual HIGH/LOW
neutral presentation and 180-frame live-flat simulation checks passed, with
0.993–0.997 µm all-shoe ground gaps. Those profile opt-ins are **not** part of
this foundation commit. Native visual and final release checks remain pending.

The independent nonflat diagnostic is explicitly **not passing**:
`.../.qa-dev/t80u-nonflat-ground-Lc0PuO/receipt.json` records a −35.776 mm
cross-slope transient, −3.429 mm on a 20 mm smooth bump and −2.650 mm in a
shallow hollow. These actual deformed-shoe/terrain counterexamples require
legacy attribution and further mechanical/conformance work. The neutral
certificate must not be advertised as clearing them or the whole fleet.

An early offline refinement attempt stopped at its depth guard because its
requested interval width was smaller than the separately included Float32
error bound. The stopping criterion now subtracts that same bound before
testing interval convergence; the emitted conservative lower bound still
includes the full upload error. No geometry acceptance threshold was loosened.
