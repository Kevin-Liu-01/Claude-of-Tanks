# Interior fills to zero — 2026-09-15

Owner ruling (2026-09-14): interior fill residuals go to zero. The generator
(`tools/gen-interior-fills.mjs`) already reported residual 0 L for the fleet while the
watertight check (`tools/tank-watertight-check.mjs`) still reported 181 of 205 tanks
leaking (994.8 L in total; ISU-152 80.9 L, KF51 65.9 L, Ukrainian M1A1 50.0 L). The two
tools share one voxeliser (`tools/tank-voxel-body.mjs`), the same grid origin, the same
exclusion regex and the same flood / deep-interior logic, so the disagreement had to be in
how the shipped fill meshes rasterise compared with the voxels the generator claimed.

## Root cause

The generator marks its claimed voxels solid in its own grid. The check builds the tank
with the fill boxes as real meshes and samples their triangles. Fill boxes are authored
exactly on the voxel lattice, and `floor()` binning of a sample that lies exactly on a
lattice plane is asymmetric: a sample on a box's minimum plane falls inside the box, a
sample on its maximum plane (`y1 + 1`) falls one voxel beyond it. Side faces carry edge
samples on the top and back planes, so every box grew by one voxel above and behind it in
the check alone. Those extra voxels carry the `hullInteriorFill` group (component hull),
which lifted `deepInterior`'s per-column hull spans and turned slivers the generator had
correctly left unclaimed (they were not deep) into "deep" leak voxels.

Three smaller mismatches sat on top: the generator marked claimed voxels as shell group 1
(whatever mesh came first) instead of a fill group of the right component, so its residual
pass used different column spans than the check; the record origin was stored at four
decimals (a few microns off the lattice); and a first "mark both voxels on a boundary"
attempt widened boxes symmetrically and made the fleet worse.

## Fix

- `voxelise` binds every surface sample half a millimetre against the triangle's winding
  normal (`NUDGE = 0.02 voxel`) and a hair toward the triangle's centroid (`EDGE = 1e-4`),
  so a closed body authored on the lattice rasterises into exactly its own layer of voxels.
  Authored plates move by well under a voxel and both tools see the same body.
- The generator registers `hullInteriorFill` / `turretInteriorFill` / `gunInteriorFill`
  groups and marks claimed voxels with the component's group; records store origins at six
  decimals.
- All 205 fill records regenerated (`--all --rounds=8 --min-fine=1`); the fleet check runs
  `--gate` at the 0.05 L bar.

`.qa-dev/fill-diff.mjs <id>` (untracked) rebuilds the two views on one lattice and reports
the leak voxels the check sees that the generator does not, with the column spans and the
open axes that explain each; `.qa-dev/fill-face.mjs <id>` checks that the shipped fill
meshes mark exactly the claimed voxels (outside 0, boundary missing 0). Both must read zero
before a regeneration is trusted.

## Verification

    node tools/tank-watertight-check.mjs --ids=<fleet> --gate --json=<path>
    node tools/gen-interior-fills.mjs --all --rounds=8 --min-fine=1 --stats
    node tools/tank-sealed-check.selftest.mjs

The release check (`npm run tank:release:check -- --ids=… --gate`) carries the sealed and
watertight steps for the oracle ids.
