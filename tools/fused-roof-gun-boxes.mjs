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

// Stowage a source fuses into its meshes (267, Main 2026-10-31: drums, drum cradles and stowage racks or baskets leave the
// body comparison on both sides): the gate takes it out of the source for every comparison on its page, as the build's
// tagged stowage leaves (profiles/stowagePart.ts; body-height-parts.mjs stowageParts). An entry's `nodes` names whole
// stowage nodes the generic names (ORACLE_STOWAGE_NODES) miss; each of its `parts` cuts, within the nodes `within` names
// (three's sanitized names, a node or an ancestor), the triangles whose three corners lie in its boxes, in the page's
// registered frame (the T-90 family's canonical prints register at unit scale, so it is each GLB's own frame). Boxes
// enclose welded pieces lying wholly in the stowage (one box per piece, 0.5 mm proud) and cut no hull, fender or turret
// piece of the node: the pieces they cut in part are the drum hoses and the cradle arms' roots at the rear plate.
// `triangles`: what the boxes take (a record's stowageAside names each cut node with its count). Picked with
// ~/cot-lanes/gate-stowage-evidence/scripts/pickboxes.py and checked with boxcheck2.py (the T-90 lane's tags, 1b963a465f).
// The T-90A Vladimir print (desirefx.me_009): the two fuel drums across its stern (0.66 m across, 0.92 m long), their
// cradle arms and bolts, the drum caps and the hose runs over them, everything behind the drums' front face (z -3.477)
// above the cradle floor (y 1.14), and above the fenders (y 1.24) out to the hose ends; the hull ends at z -3.43.
const VLADIMIR_STERN_DRUMS = Object.freeze({ triangles: 6227, parts: Object.freeze([Object.freeze({ within: /^desirefxme_009$/,
  boxes: Object.freeze([
    Object.freeze([-0.975, 1.14, -4.25, 0.975, 1.98, -3.477]),
    Object.freeze([-1.36, 1.24, -4.25, 1.36, 1.98, -3.477]),
  ]) })]) });
// The T-90 / T-90A Burlak / T-90MS War Thunder prints share one hull's stern drum cradle: four webs, four brackets and four
// feet with their gussets and hinge pins (26 pieces, 816 triangles, z -3.80 to -3.10) in each print's hull mesh.
const T90_CRADLE = Object.freeze([
    Object.freeze([-0.8427,  1.1821,  -3.2369,  -0.8257,  1.1968,  -3.1674]),
    Object.freeze([-0.8237,  1.2046,  -3.7877,  -0.7719,  1.3491,  -3.2984]),
    Object.freeze([-0.8442,  1.1811,  -3.1958,  -0.8105,  1.2036,  -3.1753]),
    Object.freeze([-0.8115,  1.1372,  -3.2876,  -0.786,  1.2456,  -3.101]),
    Object.freeze([-0.851,  1.2016,  -3.2133,  -0.809,  1.2222,  -3.1265]),
    Object.freeze([-0.8041,  1.1391,  -3.7954,  -0.7934,  1.3462,  -3.2338]),
    Object.freeze([-0.789,  1.2016,  -3.2133,  -0.747,  1.2222,  -3.1265]),
    Object.freeze([-0.8296,  1.1411,  -3.2465,  -0.768,  1.1597,  -3.2027]),
    Object.freeze([-0.3984,  1.2016,  -3.7954,  -0.3466,  1.3462,  -3.3061]),
    Object.freeze([-0.3862,  1.1343,  -3.2955,  -0.361,  1.2427,  -3.1088]),
    Object.freeze([-0.426,  1.1987,  -3.2213,  -0.3839,  1.2193,  -3.1342]),
    Object.freeze([-0.3788,  1.1362,  -3.8032,  -0.3681,  1.3433,  -3.2417]),
    Object.freeze([-0.3635,  1.1987,  -3.2213,  -0.3217,  1.2193,  -3.1342]),
    Object.freeze([0.3387,  1.2016,  -3.7954,  0.3905,  1.3462,  -3.3061]),
    Object.freeze([0.3509,  1.1343,  -3.2955,  0.3761,  1.2427,  -3.1088]),
    Object.freeze([0.3113,  1.1987,  -3.2213,  0.3531,  1.2193,  -3.1342]),
    Object.freeze([0.3582,  1.1362,  -3.8032,  0.369,  1.3433,  -3.2417]),
    Object.freeze([0.3736,  1.1987,  -3.2213,  0.4154,  1.2193,  -3.1342]),
    Object.freeze([0.7778,  1.2016,  -3.7954,  0.8297,  1.3462,  -3.3061]),
    Object.freeze([0.79,  1.1343,  -3.2955,  0.8155,  1.2427,  -3.1088]),
    Object.freeze([0.7505,  1.1987,  -3.2213,  0.7926,  1.2193,  -3.1342]),
    Object.freeze([0.7974,  1.1362,  -3.8032,  0.8082,  1.3433,  -3.2417]),
    Object.freeze([0.8126,  1.1811,  -3.1997,  0.8458,  1.2036,  -3.1792]),
    Object.freeze([0.8126,  1.1987,  -3.2213,  0.8546,  1.2193,  -3.1342]),
    Object.freeze([0.772,  1.1382,  -3.2544,  0.8336,  1.1568,  -3.2104]),
    Object.freeze([0.8272,  1.1821,  -3.2407,  0.8442,  1.1968,  -3.1713]),
  ]);
const T90A_BURLAK_CRADLE = Object.freeze([
    Object.freeze([-0.8427,  1.1821,  -3.2369,  -0.8257,  1.1968,  -3.1674]),
    Object.freeze([-0.8237,  1.2046,  -3.7877,  -0.7719,  1.3491,  -3.2984]),
    Object.freeze([-0.8442,  1.1811,  -3.1958,  -0.8105,  1.2036,  -3.1753]),
    Object.freeze([-0.8115,  1.1372,  -3.2876,  -0.786,  1.2456,  -3.101]),
    Object.freeze([-0.851,  1.2016,  -3.2133,  -0.809,  1.2222,  -3.1265]),
    Object.freeze([-0.8041,  1.1391,  -3.7954,  -0.7934,  1.3462,  -3.2338]),
    Object.freeze([-0.789,  1.2016,  -3.2133,  -0.747,  1.2222,  -3.1265]),
    Object.freeze([-0.8296,  1.1411,  -3.2465,  -0.768,  1.1597,  -3.2027]),
    Object.freeze([-0.3984,  1.2016,  -3.7954,  -0.3466,  1.3462,  -3.3061]),
    Object.freeze([-0.3862,  1.1343,  -3.2955,  -0.361,  1.2427,  -3.1088]),
    Object.freeze([-0.426,  1.1987,  -3.2213,  -0.3839,  1.2193,  -3.1342]),
    Object.freeze([-0.3788,  1.1362,  -3.8032,  -0.3681,  1.3433,  -3.2417]),
    Object.freeze([-0.3635,  1.1987,  -3.2213,  -0.3217,  1.2193,  -3.1342]),
    Object.freeze([0.3387,  1.2016,  -3.7954,  0.3905,  1.3462,  -3.3061]),
    Object.freeze([0.3509,  1.1343,  -3.2955,  0.3761,  1.2427,  -3.1088]),
    Object.freeze([0.3113,  1.1987,  -3.2213,  0.3531,  1.2193,  -3.1342]),
    Object.freeze([0.3582,  1.1362,  -3.8032,  0.369,  1.3433,  -3.2417]),
    Object.freeze([0.3736,  1.1987,  -3.2213,  0.4154,  1.2193,  -3.1342]),
    Object.freeze([0.7778,  1.2016,  -3.7954,  0.8297,  1.3462,  -3.3061]),
    Object.freeze([0.79,  1.1343,  -3.2955,  0.8155,  1.2427,  -3.1088]),
    Object.freeze([0.7505,  1.1987,  -3.2213,  0.7926,  1.2193,  -3.1342]),
    Object.freeze([0.7974,  1.1362,  -3.8032,  0.8082,  1.3433,  -3.2417]),
    Object.freeze([0.8126,  1.1811,  -3.1997,  0.8458,  1.2036,  -3.1792]),
    Object.freeze([0.8126,  1.1987,  -3.2213,  0.8546,  1.2193,  -3.1342]),
    Object.freeze([0.772,  1.1382,  -3.2544,  0.8336,  1.1568,  -3.2104]),
    Object.freeze([0.8272,  1.1821,  -3.2407,  0.8442,  1.1968,  -3.1713]),
  ]);
const T90MS_CRADLE = Object.freeze([
    Object.freeze([-0.8427,  1.1821,  -3.2378,  -0.8257,  1.1968,  -3.1685]),
    Object.freeze([-0.8237,  1.2046,  -3.7866,  -0.7719,  1.3491,  -3.2993]),
    Object.freeze([-0.8442,  1.1811,  -3.1969,  -0.8105,  1.2036,  -3.1762]),
    Object.freeze([-0.8115,  1.1372,  -3.2887,  -0.786,  1.2456,  -3.1021]),
    Object.freeze([-0.851,  1.2016,  -3.2144,  -0.809,  1.2222,  -3.1274]),
    Object.freeze([-0.8041,  1.1391,  -3.7945,  -0.7934,  1.3462,  -3.2348]),
    Object.freeze([-0.789,  1.2016,  -3.2144,  -0.747,  1.2222,  -3.1274]),
    Object.freeze([-0.8296,  1.1411,  -3.2476,  -0.768,  1.1597,  -3.2036]),
    Object.freeze([-0.3984,  1.2016,  -3.7945,  -0.3466,  1.3462,  -3.3072]),
    Object.freeze([-0.3862,  1.1343,  -3.2964,  -0.361,  1.2427,  -3.1098]),
    Object.freeze([-0.426,  1.1987,  -3.2221,  -0.3839,  1.2193,  -3.1353]),
    Object.freeze([-0.3788,  1.1362,  -3.8023,  -0.3681,  1.3433,  -3.2426]),
    Object.freeze([-0.3635,  1.1987,  -3.2221,  -0.3217,  1.2193,  -3.1353]),
    Object.freeze([0.3387,  1.2016,  -3.7945,  0.3905,  1.3462,  -3.3072]),
    Object.freeze([0.3509,  1.1343,  -3.2964,  0.3761,  1.2427,  -3.1098]),
    Object.freeze([0.3113,  1.1987,  -3.2221,  0.3531,  1.2193,  -3.1353]),
    Object.freeze([0.3582,  1.1362,  -3.8023,  0.369,  1.3433,  -3.2426]),
    Object.freeze([0.3736,  1.1987,  -3.2221,  0.4154,  1.2193,  -3.1353]),
    Object.freeze([0.7778,  1.2016,  -3.7945,  0.8297,  1.3462,  -3.3072]),
    Object.freeze([0.79,  1.1343,  -3.2964,  0.8155,  1.2427,  -3.1098]),
    Object.freeze([0.7505,  1.1987,  -3.2221,  0.7926,  1.2193,  -3.1353]),
    Object.freeze([0.7974,  1.1362,  -3.8023,  0.8082,  1.3433,  -3.2426]),
    Object.freeze([0.8126,  1.1811,  -3.2007,  0.8458,  1.2036,  -3.1801]),
    Object.freeze([0.8126,  1.1987,  -3.2221,  0.8546,  1.2193,  -3.1353]),
    Object.freeze([0.772,  1.1382,  -3.2555,  0.8336,  1.1568,  -3.2115]),
    Object.freeze([0.8272,  1.1821,  -3.2418,  0.8442,  1.1968,  -3.1723]),
  ]);
export const FUSED_STOWAGE_BOXES = Object.freeze({
  t90a_vladimir: VLADIMIR_STERN_DRUMS,
  t90: Object.freeze({ triangles: 816, parts: Object.freeze([Object.freeze({ within: /^vehicle#t-90--t-90_7_0$/, boxes: T90_CRADLE })]) }),
  t90a_burlak: Object.freeze({ triangles: 816, parts: Object.freeze([Object.freeze({ within: /^Object_24$/, boxes: T90A_BURLAK_CRADLE })]) }),
  // the T-90MS print also names its bustle basket, vehicle#t-90ms_cage01_turret_t-90ms_10_0 (1,838 triangles, whole)
  t90ms_tagil: Object.freeze({ triangles: 816, nodes: /cage01_turret/,
    parts: Object.freeze([Object.freeze({ within: /^vehicle#t-90ms--t-90ms_1_0$/, boxes: T90MS_CRADLE })]) }),
  // the T-90A print's gear533: both drums, their cradles and straps behind the hull (51 pieces; its two hoses in part)
  t90a: Object.freeze({ triangles: 851, parts: Object.freeze([Object.freeze({ within: /^gear533$/, boxes: Object.freeze([
    Object.freeze([-1.091,  1.148,  -4.1661,  -0.131,  1.781,  -3.4915]),
    Object.freeze([-0.9341,  1.1647,  -3.996,  -0.898,  1.3273,  -3.5374]),
    Object.freeze([-0.9341,  1.1672,  -3.996,  -0.898,  1.3298,  -3.5374]),
    Object.freeze([-0.9279,  1.1293,  -4.1763,  -0.8622,  1.7907,  -3.4815]),
    Object.freeze([-0.9186,  1.089,  -3.996,  -0.9174,  1.3298,  -3.3793]),
    Object.freeze([-0.9148,  1.089,  -3.996,  -0.9136,  1.3298,  -3.3793]),
    Object.freeze([-0.9137,  1.6071,  -4.1562,  -0.884,  1.7646,  -3.9883]),
    Object.freeze([-0.927,  1.6228,  -4.1387,  -0.8693,  1.6518,  -4.1078]),
    Object.freeze([-0.927,  1.6234,  -4.138,  -0.8693,  1.6524,  -4.1072]),
    Object.freeze([-0.9271,  1.7208,  -4.0342,  -0.8693,  1.7499,  -4.0034]),
    Object.freeze([-0.9271,  1.7215,  -4.0336,  -0.8693,  1.7505,  -4.0027]),
    Object.freeze([-0.7667,  1.1216,  -4.1949,  -0.7457,  1.8113,  -3.4601]),
    Object.freeze([-0.6489,  1.6684,  -3.7202,  -0.5491,  1.7942,  -3.572]),
    Object.freeze([-0.6377,  1.714,  -3.6821,  -0.5602,  1.8248,  -3.5733]),
    Object.freeze([-0.4472,  1.1216,  -4.1947,  -0.4262,  1.8113,  -3.46]),
    Object.freeze([-0.3289,  1.1293,  -4.176,  -0.2632,  1.7907,  -3.4813]),
    Object.freeze([-0.3247,  1.1647,  -3.9958,  -0.2885,  1.3273,  -3.5372]),
    Object.freeze([-0.3247,  1.1672,  -3.9958,  -0.2885,  1.3298,  -3.5372]),
    Object.freeze([-0.309,  1.089,  -3.9958,  -0.3078,  1.3298,  -3.3791]),
    Object.freeze([-0.3054,  1.089,  -3.9958,  -0.3042,  1.3298,  -3.379]),
    Object.freeze([-0.3118,  1.6071,  -4.156,  -0.282,  1.7646,  -3.9881]),
    Object.freeze([-0.3251,  1.6228,  -4.1385,  -0.2673,  1.6518,  -4.1076]),
    Object.freeze([-0.3251,  1.6234,  -4.1378,  -0.2673,  1.6524,  -4.107]),
    Object.freeze([-0.3252,  1.7208,  -4.034,  -0.2673,  1.7499,  -4.0032]),
    Object.freeze([-0.3252,  1.7215,  -4.0333,  -0.2673,  1.7505,  -4.0025]),
    Object.freeze([0.1375,  1.148,  -4.1656,  1.0975,  1.781,  -3.4909]),
    Object.freeze([0.2927,  1.1647,  -3.9956,  0.3289,  1.3273,  -3.5369]),
    Object.freeze([0.2927,  1.1672,  -3.9956,  0.3289,  1.3298,  -3.5369]),
    Object.freeze([0.3084,  1.089,  -3.9956,  0.3096,  1.3298,  -3.3788]),
    Object.freeze([0.2828,  1.6071,  -4.1556,  0.3126,  1.7646,  -3.9879]),
    Object.freeze([0.312,  1.089,  -3.9956,  0.3132,  1.3298,  -3.3788]),
    Object.freeze([0.2696,  1.6228,  -4.1382,  0.3273,  1.6518,  -4.1074]),
    Object.freeze([0.2696,  1.6234,  -4.1376,  0.3273,  1.6524,  -4.1067]),
    Object.freeze([0.2695,  1.7208,  -4.0338,  0.3273,  1.7499,  -4.0029]),
    Object.freeze([0.2695,  1.7215,  -4.0331,  0.3273,  1.7505,  -4.0023]),
    Object.freeze([0.2697,  1.1293,  -4.1758,  0.3354,  1.7907,  -3.4811]),
    Object.freeze([0.4334,  1.1216,  -4.1944,  0.4544,  1.8113,  -3.4597]),
    Object.freeze([0.5568,  1.714,  -3.6817,  0.6344,  1.8248,  -3.5729]),
    Object.freeze([0.5478,  1.6684,  -3.7198,  0.6476,  1.7942,  -3.5715]),
    Object.freeze([-0.6016,  1.4909,  -3.6527,  0.6113,  1.7719,  -3.4163]),
    Object.freeze([0.7529,  1.1216,  -4.1943,  0.7739,  1.8113,  -3.4596]),
    Object.freeze([0.9021,  1.1647,  -3.9954,  0.9384,  1.3273,  -3.5367]),
    Object.freeze([0.9021,  1.1672,  -3.9954,  0.9384,  1.3298,  -3.5367]),
    Object.freeze([0.9179,  1.089,  -3.9954,  0.9191,  1.3298,  -3.3786]),
    Object.freeze([0.89,  1.6071,  -4.1554,  0.9197,  1.7646,  -3.9877]),
    Object.freeze([0.9214,  1.089,  -3.9954,  0.9226,  1.3298,  -3.3786]),
    Object.freeze([0.8686,  1.1293,  -4.1755,  0.9344,  1.7907,  -3.4809]),
    Object.freeze([0.8767,  1.6228,  -4.1379,  0.9344,  1.6518,  -4.1071]),
    Object.freeze([0.8767,  1.6234,  -4.1373,  0.9344,  1.6524,  -4.1064]),
    Object.freeze([0.8767,  1.7208,  -4.0336,  0.9344,  1.7499,  -4.0026]),
    Object.freeze([0.8767,  1.7215,  -4.0328,  0.9344,  1.7505,  -4.002]),
  ]) })]) }),
  // the T-90SM print: the empty stern cradle's eight webs in chasis (296 triangles) and the bustle basket in misc_a (28
  // pieces and two of its posts in part, 422); its exhaust casing's tail box at z -3.98 stays body
  t90sm: Object.freeze({ triangles: 718, parts: Object.freeze([
    Object.freeze({ within: /^chasis$/, boxes: Object.freeze([
    Object.freeze([-0.8104,  1.1626,  -4.0978,  -0.7996,  1.3669,  -3.4948]),
    Object.freeze([-0.8319,  1.2264,  -4.0893,  -0.78,  1.3699,  -3.5642]),
    Object.freeze([-0.3699,  1.1626,  -4.0978,  -0.3591,  1.3669,  -3.4948]),
    Object.freeze([-0.3915,  1.2264,  -4.0893,  -0.3396,  1.3699,  -3.5642]),
    Object.freeze([0.3692,  1.1626,  -4.0978,  0.38,  1.3669,  -3.4948]),
    Object.freeze([0.3476,  1.2264,  -4.0893,  0.3996,  1.3699,  -3.5642]),
    Object.freeze([0.7956,  1.1656,  -4.0893,  0.8064,  1.3699,  -3.4863]),
    Object.freeze([0.7741,  1.2294,  -4.0809,  0.826,  1.3729,  -3.5558]),
  ]) }),
    Object.freeze({ within: /^misc_a$/, boxes: Object.freeze([
    Object.freeze([-0.897,  1.9892,  -2.9207,  0.9083,  1.9964,  -2.8818]),
    Object.freeze([-0.897,  2.1625,  -2.9228,  0.9083,  2.1695,  -2.8818]),
    Object.freeze([-0.8666,  2.049,  -2.9228,  0.8607,  2.056,  -2.8818]),
    Object.freeze([-0.8926,  1.951,  -2.8322,  -0.8539,  2.2338,  -2.8186]),
    Object.freeze([-0.8304,  1.9386,  -2.8975,  -0.823,  2.2213,  -2.8565]),
    Object.freeze([-0.684,  1.9272,  -2.6222,  -0.66,  2.1861,  -2.5981]),
    Object.freeze([-0.2707,  1.9209,  -2.9122,  -0.2463,  1.9423,  -2.6838]),
    Object.freeze([-0.2492,  1.9386,  -2.8975,  -0.2415,  2.2213,  -2.8565]),
    Object.freeze([-0.2427,  2.2024,  -2.6848,  -0.2139,  2.2308,  -2.6585]),
    Object.freeze([-0.2407,  2.2059,  -2.9143,  -0.2162,  2.2273,  -2.6817]),
    Object.freeze([0.2345,  2.2059,  -2.9122,  0.2592,  2.2273,  -2.6817]),
    Object.freeze([0.2324,  2.2024,  -2.6848,  0.2611,  2.2308,  -2.6585]),
    Object.freeze([0.2648,  1.9209,  -2.9101,  0.289,  1.9423,  -2.6838]),
    Object.freeze([0.2589,  1.9386,  -2.8975,  0.2665,  2.2213,  -2.8565]),
    Object.freeze([0.7149,  1.9284,  -2.6138,  0.7374,  2.1856,  -2.5917]),
    Object.freeze([0.8259,  1.9386,  -2.8975,  0.8338,  2.2213,  -2.8565]),
    Object.freeze([-0.8666,  1.9348,  -2.9228,  0.8607,  1.9418,  -2.8818]),
    Object.freeze([-0.8666,  2.1056,  -2.9228,  0.8607,  2.1131,  -2.8818]),
    Object.freeze([-0.8666,  2.2198,  -2.9228,  0.8607,  2.2268,  -2.8818]),
    Object.freeze([0.8656,  1.951,  -2.8322,  0.9043,  2.2338,  -2.8186]),
    Object.freeze([0.8676,  2.1749,  -2.9207,  1.0043,  2.1819,  -2.2942]),
    Object.freeze([0.8676,  2.0044,  -2.9207,  1.0048,  2.0114,  -2.3026]),
    Object.freeze([0.8759,  1.9473,  -2.8596,  1.0038,  1.9543,  -2.3005]),
    Object.freeze([0.8759,  2.1186,  -2.8596,  1.0038,  2.1256,  -2.3005]),
    Object.freeze([0.8759,  2.2323,  -2.8596,  1.0038,  2.2393,  -2.3005]),
    Object.freeze([0.9401,  1.951,  -2.3415,  0.9793,  2.2338,  -2.3279]),
    Object.freeze([0.8759,  2.0617,  -2.8596,  1.0038,  2.0685,  -2.3005]),
    Object.freeze([0.9626,  2.1824,  -2.3352,  1.0067,  2.1894,  -2.2921]),
  ]) }),
  ]) }),
  // the T-90M print names its drums ('EXtra fuel storage') and side baskets ('Rear turret basket.001/.002') generically;
  // its bustle basket is 'Hull cage.001' ('Hull cage', full width at the fenders, is its slat cage and stays body)
  t90m: Object.freeze({ triangles: 0, nodes: /^Hull_cage001/, parts: Object.freeze([]) }),
});
