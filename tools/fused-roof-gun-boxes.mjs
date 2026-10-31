// tools/fused-roof-gun-boxes.mjs — where a fused source (one mesh for body, turret and fittings) carries its roof gun, so
// the geometry gate's dims compare body against body (Main's ruling 2026-10-30; Main 2026-10-31: the fused-oracle boxes).
// Each box is [x0, y0, z0, x1, y1, z1] in the certified source frame (tools/source-world-registration.mjs). The gate
// leaves out of the source's body every triangle whose three corners lie in the boxes (body-height-parts.mjs
// roofFittingParts), so the source names its roof gun and the build's roof gun leaves too (pairedRoofFittings).
// The boxes enclose the source's roof gun and mount as the builds traced them before the owner's true-scale guns
// replaced them (856d6b11cd^: t72buX.ts, t72b1987X.ts and t80uX.ts sourceMachineGun and its mount), and nothing the
// builds keep as body. Curves keep every part. First-party tooling: Kevin B. Liu.

export const FUSED_ROOF_GUN_BOXES = Object.freeze({
  // the commander's NSVT on its box mount: the gun and cradle along x -0.61, the ammunition box on the left and the two
  // uprights and stay on the hatch blocks; the cupola under it (to 2.29) and the sight beside it (2.52) stay body
  t72bu: Object.freeze({ boxes: Object.freeze([
    Object.freeze([-0.71, 2.55, 0.25, -0.52, 2.78, 2.20]),
    Object.freeze([-1.23, 2.40, 0.15, -0.68, 2.78, 0.64]),
    Object.freeze([-0.56, 2.23, 0.17, -0.32, 2.78, 0.91]),
  ]) }),
  // the NSVT over the cupola ring (2.234), receiver to muzzle, cradle and ammunition box; the open hatch lid standing
  // behind the cupola (z -0.82 .. -0.77, to 2.723) stays body, as the build's lid does
  t72b_1987: Object.freeze({ boxes: Object.freeze([
    Object.freeze([-0.88, 2.245, -0.76, -0.38, 2.56, 0.87]),
  ]) }),
  // the NSVT on its pintle over the left of the cupola, grips to muzzle, with its ammunition box; the cupola (to 2.21 in
  // this footprint) and the sight block on its front (x -0.71 .. -0.53, to 2.40) stay body
  t80u: Object.freeze({ boxes: Object.freeze([
    Object.freeze([-1.26, 2.205, 0.0, -0.89, 2.52, 1.64]),
  ]) }),
});
