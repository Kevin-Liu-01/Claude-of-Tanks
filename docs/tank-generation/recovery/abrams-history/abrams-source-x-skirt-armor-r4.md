# Abrams X source-panel armor metadata correction

This is a metadata-only correction for the seven conventional Abrams X IDs.
The original vehicles, source oracle, native geometry and donor protection
values are unchanged. It does not qualify the still-rejected whole-model
source fidelity/geometry checks.

## Rejected inherited hit surface

Every new ID inherited four donor `spaced` skirt rectangles at X ±1.86. The
finite segment `[1.90, .80, 0] → [1.84, .80, 0]` incorrectly hit
`skirt_rear_R` at X1.86 even though the segment ends outside the actual native
receiving sheet. Anatomy generation does not replace these non-main plates,
so regeneration alone could not correct the hit.

The new boot-light helper follows the existing first-party source-derived
receiving panels in `abramsSourceXHull.ts`, not a bounding box or imported
source topology. Eight separated panels and the five planar portions of the
aft sheet retain the real 16 mm panel joints, aft joint and rising lower edge.
The inherited front/rear protection boundary stays at Z .9; its crossing of
one physical panel is split without adding an artificial gap. One
`surfaceGroup` per continuous physical sheet prevents coincident seam hits
from charging the same panel twice.

Six variants have 28 quads. SEP v2 has 30 because its actual source18 forward
receiving sheet extends to Z3.535. Only the exposed part beyond Z2.982 is
registered; its overlap with panel7 is not billed again. Other variants keep
their actual shorter forward envelope.

M1A2 X and SEP v3 X retain their separately removable native-skin ERA recipe.
Their permanent spaced planes lie on the real backing interface, 2.345 mm
or 3.3915 mm inside the exterior, according to the authored 35% skin split.
The intact ERA skin and permanent backing are distinct layers at distinct
depths. Removing ERA exposes the same backing plane used by collision. The
urban cassettes and unpartitioned A1-family sheets are not shifted.

## Verification

`src/vehicles/abramsSourceXSkirtArmor.selftest.mjs` passes all seven IDs at high
and low quality, each at three hull/turret poses:

- 1,860 actual permanent-sheet surface checks, maximum native/metadata plane
  residual 0.062424 µm;
- 1,092 actual gap, lower-edge and old-ghost negative checks;
- 432 actual continuous-sheet seam checks, exactly one spaced charge;
- 24 actual ERA strip/reset checks, preserving the backing and its hit;
- donor protection fields and all non-skirt armor fields preserved by the
  isolated helper; both construction and repeated pre-finalization sync
  exercised without accumulating plates.

The first rejected fixture mistakenly called Y .620 air on a forward sheet
whose measured lower edge is Y .615. That exact ray is retained as a positive,
with the below-edge negative at Y .600. The second rejected fixture exposed
the SEP v2-only forward receiving sheet; that exact Z3.4/Y.9 ray is now a
positive for SEP v2 and remains a negative for the other six configurations.
No runtime geometry was changed to satisfy either fixture.

Final focused evidence: `.qa-dev/reports/abrams-skirt-armor-backing-final.log`.
The source specification test and scoped code-quality scan also pass: 14
functions, no complexity violations, no explicit `any` or `unknown`.

Immutable pre-edit full visual buffers/hierarchy/instances/poses for all 14
builds, plus all nine original complete spec hashes, are retained in
`.qa-dev/reports/abrams-armor-metadata-visual-gZjGG6/receipt.json`. After both
skirt and bustle-rack hooks were installed, the exact comparison passed in
`.qa-dev/reports/abrams-armor-metadata-visual-BsrsnZ/receipt.json`: all 14
geometry fingerprints and full scene hashes, and all nine original complete
spec hashes, are byte-identical. The combined log
`.qa-dev/reports/abrams-armor-metadata-visual-final.log` also retains another
passing skirt and initial/sync specification run. Generated anatomy/assets
remain root-owned.

