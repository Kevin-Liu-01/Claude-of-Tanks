# Closed circular cap overlap lint

The Chinese fuel-drum defect was a closed cylinder plus thin, closed end
cylinders terminating in the same plane. Two filled discs competed for the
same pixels. The old overlap audit skipped triangles within one material
surface, even when `includeSameObject` was enabled, so merging the parts hid
this defect from the checker.

The repaired checker measures positive-area overlap within merged buffers as
well as across meshes and instances. The circular-cap mode recognizes complete
filled fans geometrically, independent of object names and cylinder metadata.
It checks indexed and nonindexed stock, world transforms, draw ranges, visible
material groups, and instanced transforms. Reports contain tank/quality, mesh
paths, material, native face indices, overlap area and triangle/exposure witnesses.

A depth offset does **not** excuse duplicate circular caps. Use one closed
body with truly hollow annular rims and straps, or physically separate visible
cap planes. Opposite-facing internal contact, disjoint/tangent discs, empty
rings and nondrawn triangles do not fail the rule.

Run a focused scan:

```sh
npm run tank:caps:check -- --ids=vt4a1,ztz99a2,ztz99a2_prototype --quality=both
```

Without `--ids`, the command checks all playable tanks in HIGH and LOW. Use
`--out-dir=<path>` to retain the JSON reports at a chosen location. Any finding,
unsupported batched mesh, or execution failure returns a nonzero exit status.
There is no baseline allowance or tank-name exemption.

`npm test` runs the synthetic negative/positive controls and applies the lint
inside both existing shared fleet passes, reusing each already-constructed
vehicle. It does not add another whole-fleet build to that lifecycle.

Limits: this targets filled circular **fan** caps with at least six sectors;
it does not recognize every arbitrary triangulation of a disc. Plane grouping
is quantized at 10 micrometres and overlap must exceed one square millimetre.
Normal-ray sampling distinguishes exposed from buried surfaces but is not an
exhaustive camera-visibility test. Batched meshes fail closed; the shared passes
use native unbatched geometry. A clean result is specific to this defect class,
not certification of every vehicle surface or its appearance.
