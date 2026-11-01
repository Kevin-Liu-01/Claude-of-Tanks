// tools/fused-roof-gun-boxes.mjs — where a fused source (one mesh for body, turret and fittings) carries its roof gun
// (and, below, its whips), so the geometry gate's dims compare body against body (Main's ruling 2026-10-30; Main
// 2026-10-31: the fused-oracle boxes).
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

// Whips a source fuses into its turret mesh (267, Main 2026-10-31: "the whip defect is handled by the body rule, not by
// trimming the oracle"): the gate takes the triangles in these boxes out of the source for every comparison on its page,
// heights, curves and stations, and the build's whips with them (body-height-parts.mjs roofFittingParts; the page's
// whipsAside). The Strv 81 print (the Centurion family's certified frame, source-world-registration.mjs) carries
// two raked whips in turret_0, two 68-triangle prisms (the census the 08-17 excision cut, docs/references/tanks/strv81.md): one from its
// mount on the left of the roof (z 0.09) to 4.19 m, one from the right rear (z -1.10) to 3.68 m, raked back to z -2.41.
// Each box holds its rod and none of its mount's cap (a wider collar), which stays body like the builds' mount blocks.
// `tallest`: the whips stand over everything else, so no station's source top may reach them once they are set aside.
const CENTURION_WHIPS = Object.freeze({ triangles: 136, tallest: true, boxes: Object.freeze([
  Object.freeze([0.6055, 2.840, -0.708, 0.626, 4.200, 0.105]),
  Object.freeze([-0.4132, 2.822, -2.418, -0.393, 3.690, -1.087]),
]) });
// The T-90MS print's rear whip (t90ms_tagil's certified frame; 267): a 0.70 m stub on its pot at the bustle's left rear,
// three stacked pieces in t-90ms_turret_t-90ms_7_2 (60 triangles, 2.237 to 2.932 m) that no node names, beside the named
// antenna01. The box holds them and none of the pot (its top stands 1 mm over the whip's foot), as the build's rear whip
// (t90msX.ts) carries the antenna role.
const T90MS_REAR_WHIP = Object.freeze({ triangles: 60, tallest: false, boxes: Object.freeze([
  Object.freeze([-0.816, 2.236, -2.404, -0.775, 2.933, -2.369]),
]) });
export const FUSED_ANTENNA_BOXES = Object.freeze({
  centurion3: CENTURION_WHIPS, centurion5_2: CENTURION_WHIPS, strv81: CENTURION_WHIPS, t90ms_tagil: T90MS_REAR_WHIP,
});
