// The Marconi Marksman turret (release 269, builder M): the measured frame its build (profiles/marksmanTurret.ts) and both
// hulls' combat records (marksmanSpecs.ts) read, so the drawn turret, guns and radar and the specs' pivots, bores and
// plates never drift apart. One turret, two hulls: Finland's ItPsv 90 on the T-55 and the ItPsv Leopard 2 on the Leopard
// 2A4 (docs/references/tanks/marksman_t55.md, itpsv_leopard2.md: every number's photograph or source).
// Dependency-free data (the spec pack imports it at boot). Turret-local metres: the ring's centre on the ring plane
// (y 0), +z forward, +x the vehicle's LEFT.
// First-party: Kevin B. Liu (NOTICE.md).

type P3 = readonly [number, number, number];

/**
 * The welded central body: an octagon in section (a broad chamfer along each roof edge, a lower chamfer that narrows the
 * sides to the floor: photos 02, 03, 10), a full roof, a short chamfer across the rear roof edge, and a hard front (round 4,
 * the blind A/B judge on photos 07, 09, 10): an overhanging upper plate from the roof's front edge down and forward to a
 * sharp horizontal crease 0.81 m over the floor (photo 07: 75 %, photo 09: 65 % of the body's height), and under it a deep
 * V: the lower front face falling back 0.25 m to the floor and narrowing to 0.72 m across it between two corner facets
 * that cut back 38 degrees from it, from the crease's ends to the flanks' foot 0.55 m behind (photo 09's V edges); the flanks themselves vertical down to a 0.16 m chamfer all
 * along (photo 02: the drums on a plain flank), so nothing overhangs the slot beside the pods. 3.07 m long (r2's length: photo 02, 2.6 times its height),
 * 1.84 m across its sides (round 4: height to width 0.63, photos 03, 10: 0.60-0.61), 1.16 m from floor to roof (photo 08:
 * 1.19 m); the floor 0.14 m over the ring on its collar (photo 08: 0.17 m). Every face is planar by construction (the
 * vertices solve the planes), so the build and the armour plates are the same polygons.
 */
export const MARKSMAN_BODY = Object.freeze({
  floorY: 0.14, roofY: 1.30, rearZ: -1.62, prowZ: 1.45, creaseY: 0.95, sideX: 0.92, roofHalfW: 0.76,
});

/** The body's vertices on its left (+x) half; the right is their mirror. */
export const MARKSMAN_BODY_VERTS = Object.freeze({
  // the rear face (z -1.62): floor corner, the side face's foot, the upper chamfer's foot, the rear roof chamfer's corner
  R1: [0.8238, 0.14, -1.62], R2: [0.92, 0.30, -1.62], R3: [0.92, 1.14, -1.62], R4: [0.82, 1.24, -1.62],
  // the roof's rear corner over the rear roof chamfer
  R5: [0.76, 1.30, -1.56],
  // the front: the flank chamfer's front end on the floor, the side face's front foot, the floor's front corner, the
  // crease's end, the upper chamfer's front foot, the roof's front corner
  M1: [0.8238, 0.14, 0.8394082417582418], S: [0.92, 0.30, 0.90], F1: [0.36, 0.14, 1.20], C: [0.92, 0.95, 1.45],
  F5: [0.92, 1.14, 1.26], F6: [0.76, 1.30, 1.10],
} as const satisfies Record<string, P3>);

type BodyVert = keyof typeof MARKSMAN_BODY_VERTS;
/** A face's corners: a vertex name and its side (+1 the left, -1 the right). */
type Corner = readonly [BodyVert, 1 | -1];

/** The body's fourteen faces, each a planar convex polygon (any winding: the build and the plates orient them outward). */
export const MARKSMAN_BODY_FACES: Readonly<Record<string, readonly Corner[]>> = Object.freeze({
  floor: [['F1', 1], ['F1', -1], ['M1', -1], ['R1', -1], ['R1', 1], ['M1', 1]],
  roof: [['R5', 1], ['R5', -1], ['F6', -1], ['F6', 1]],
  rear: [['R1', -1], ['R1', 1], ['R2', 1], ['R3', 1], ['R4', 1], ['R4', -1], ['R3', -1], ['R2', -1]],
  rearRoof: [['R4', 1], ['R5', 1], ['R5', -1], ['R4', -1]],
  frontUpper: [['F6', 1], ['F5', 1], ['C', 1], ['C', -1], ['F5', -1], ['F6', -1]],
  frontLower: [['C', 1], ['C', -1], ['F1', -1], ['F1', 1]],
  ...Object.fromEntries(([1, -1] as const).flatMap((s): (readonly [string, readonly Corner[]])[] => {
    const tag = s > 0 ? 'L' : 'R';
    const face = (...names: BodyVert[]): Corner[] => names.map((name) => [name, s] as const);
    return [
      [`side${tag}`, face('R2', 'S', 'C', 'F5', 'R3')],
      [`upperChamfer${tag}`, face('R3', 'F5', 'F6', 'R5', 'R4')],
      [`lowerChamfer${tag}`, face('R1', 'M1', 'S', 'R2')],
      [`frontCorner${tag}`, face('C', 'F1', 'M1', 'S')],
    ];
  })),
});

/** A corner's turret-local point. */
export function marksmanBodyPoint([name, side]: Corner): [number, number, number] {
  const [x, y, z] = MARKSMAN_BODY_VERTS[name];
  return [side * x, y, z];
}

/**
 * The ring collar under the body (photos 03, 08, 10: a plain drum about as wide as the body's floor), from the hull's
 * adapter ring into the body's floor.
 */
export const MARKSMAN_COLLAR = Object.freeze({ r: 0.70, bottomY: 0.0, topY: 0.16 });

/**
 * Each hull's ring, hull frame: the T-55A's turret pivot on its 1.42 m roof (profiles/t54Family.ts TURRET_PIVOT, which
 * buildT55AHull returns) and the Leopard 2's ring on its deck (leopard2HullDatums.ts LEOPARD2_HULL.ring). The base specs'
 * own turretPivot is not this until their combat anatomy is finalized (the T-55A's spec carries its T-62 donor's), so the
 * Marksmen's specs and builds read these.
 */
export const MARKSMAN_RINGS = Object.freeze({
  t55: Object.freeze([0, 1.42, -0.08] as const),
  leopard2: Object.freeze([0, 1.64, 0.37] as const),
});

/**
 * Each hull's adapter ring (Wikipedia: the turret "installed by the use of an adapter ring"), turret-local: a low ring
 * over the hull's own race, sunk into its deck. The T-55's 1.816 m ring; the Leopard 2's race (profiles/leopard2Hull.ts:
 * the dark disc 1.02 m in radius, its top 1.4 cm over the ring plane) under a wider one.
 */
export const MARKSMAN_ADAPTERS = Object.freeze({
  t55: Object.freeze({ r: 0.97, bottomY: -0.012, topY: 0.03 }),
  leopard2: Object.freeze({ r: 1.06, bottomY: -0.016, topY: 0.035 }),
});

/**
 * The elevation axis: the large bearing drum on each flank (photos 01, 02: its centre about a third of the body's height
 * over its floor, a little ahead of the ring's centre), turret-local; r2's axis (round 4). The guns' armoured pods turn on
 * it with the guns (photo 01 at about 30 degrees, photo 03 near the top of their arc).
 */
export const MARKSMAN_TRUNNION = Object.freeze([0, 0.58, 0.16] as const);

/** The bearing drum about the axis (turret stock: a body of revolution, rotation-invariant), its hub into the pod. */
export const MARKSMAN_DRUM = Object.freeze({ r: 0.40, innerX: 0.65, outerX: 0.97, hubR: 0.10, hubOuterX: 1.025 });

/**
 * The two 35 mm Oerlikon KDA bores, gun-local (x either side, y over the elevation axis; index 0 the right, -x). Photos
 * 03 and 10 put the barrels 2.1-2.5 m apart (round 4: 2.48 m, outboard of the wider body); round 5 (the blind A/B judge,
 * photos 02, 08): each barrel enters its housing 15-20 % under the housing's top, 0.50 m over the drum's centre.
 */
export const MARKSMAN_BORE = Object.freeze({ x: 1.24, y: 0.50 });

/**
 * Each gun's armoured pod, gun-local: a long faceted box round the gun's receiver, a flat inner face beside the drum, a
 * broad chamfer along its top outer edge, smaller ones elsewhere (photos 02, 05, 09), the tail cut back top and bottom
 * (photo 02), and the nose a pointed faceted pyramid to a small face round the bore (photos 02, 07, 09, 10). Round 4 (the
 * blind A/B judge): r2's tail and position, the nose 0.38 m further forward so with the guns level it stands 0.3-0.6 m
 * proud of the body's receding lower front. Round 5 (the blind A/B judge, photos 02 and 08: the drum about 1.25 times the
 * housing's depth, its centre at the housing's bottom edge, half the disc showing): 0.50 x 0.62 m in section, its
 * underside on the axis (62 % of the way down the body), the bore 0.12 m under its top; short enough behind the axis that
 * the tail clears the deck at +85 degrees.
 */
export const MARKSMAN_POD = Object.freeze({
  innerX: 1.00, outerX: 1.50, bottomY: 0.0, topY: 0.62, topChamfer: 0.11, bottomChamfer: 0.08,
  tailZ: -0.42, tailTopY: 0.46, tailBottomY: 0.12, tailCutZ: -0.24, shoulderZ: 0.84, noseZ: 1.36,
  /** The nose's front face round the bore. */
  faceHalfW: 0.12, faceHalfH: 0.12,
});

/**
 * The barrel, gun-local z: the squared pyramid collar on the pod's face (photos 09, 10), the jacket and its clamp, the
 * tapered tube with the thin rod along its outer flank and three clamp bands (photo 05), and the muzzle device: an open
 * frame of four corner bars between two square end plates round two ring coils, 0.30 m across, 2.2 times the tube
 * (photos 05, 06). The bore mouths at the frames' front plates, 4.615 m ahead of the axis: with the guns forward the
 * Leopard 2 version is the published 9.30 m (the hull's stern rack 4.155 m behind its ring, the axis 0.16 m ahead of it),
 * 3.06 m of barrel showing ahead of the pod (photos 02, 08: about 3 m). The barrels r3's thickness (0.15 m tube, 0.19 m
 * jacket).
 */
export const MARKSMAN_BARREL = Object.freeze({
  collarZ: [1.34, 1.56], collarHalf: [0.12, 0.10], jacketZ: [1.52, 2.10], jacketR: 0.095, tubeZ: [2.10, 4.15],
  tubeR: 0.075, muzzleR: 0.068, lineR: 0.016, lineOffset: 0.108, lineClampZ: [2.65, 3.20, 3.75], cageZ: [4.15, 4.615],
  cageHalf: 0.15, plateT: 0.03, barHalf: 0.015, barPos: 0.115, coilR: 0.145, coilL: 0.09, coilZ: [4.30, 4.48],
});
export const MARKSMAN_MUZZLE_Z = MARKSMAN_BARREL.cageZ[1];
/** Each front plate's mouth the fleet carves (tankFactoryCore.ts P.muzzleMouth): the 35 mm bore inside a ring the tube's
 * own 0.15 m across. Unset, the fallback sized the ring off the nominal tube (0.046 m) on the plate's 0.21 m corner
 * radius, a lip 0.22 of its support where the muzzle probe asks 0.35 (release 271's check: marksman_t55 and
 * itpsv_leopard2). The plate keeps its measured 0.30 m. */
export const MARKSMAN_MUZZLE_MOUTH = Object.freeze({ outerRadiusM: MARKSMAN_BARREL.tubeR, innerRadiusM: 0.0175 });

/**
 * The Marconi 400-series search and tracking radar on the rear roof (photos 02, 03, 04, 07, 10): a base drum under a wide
 * pleated black rubber skirt (round 5: 0.46 m across, 0.9 of the dish, photos 02, 04, 10), a drum housing on the skirt
 * (round 4, photo 04), the column, the head with its electronics
 * box on the right, the dish facing forward on an
 * elevation axle, and from the axle's left end a straight boom, one dish across, angled up and outward to the
 * electro-optical tracker's box. Photo 02 puts its column 0.78 m ahead of the turret's rear face; photos 03 and 10 on the
 * centre line (10's offset is perspective). Fix round 1 (the blind critic): the dish 0.50 m across (photo 02: 0.8 of a
 * pod's height and 42 % of the body's; photo 10: 26 % of its width), the top 0.99 m over the roof (1.38 m before; the
 * round-4 judge: the dish's top and the arm about 0.8 of the turret's height over the roof in photos 02, 04 and 10).
 */
export const MARKSMAN_RADAR = Object.freeze({
  x: 0, z: -0.86, baseR: 0.18, baseTopY: 1.37, skirtR: 0.23, skirtTopY: 1.47, housingR: 0.16, housingTopY: 1.56,
  columnR: 0.10, columnTopY: 1.65,
  headY: 1.775, headH: 0.26, axleY: 1.80, dishR: 0.25, dishDepth: 0.07, dishTiltDeg: 15, dishZ: 0.16,
  boomFootX: 0.20, boomDir: [0.55, 0.80, 0.22], boomL: 0.50, topY: 2.29,
});

/** The commander's (right, -x) and gunner's (left, +x) sight heads mid-roof (photos 02, 03), their hatches ahead, at r2's
 * stations on the r2-length body (round 4); round 5 (photos 02, 07): 0.31 m tall over the roof, two thirds of the radar
 * boot's width. */
export const MARKSMAN_SIGHTS = Object.freeze({ x: 0.30, z: -0.02, hatchX: 0.38, hatchZ: 0.56, hatchR: 0.22, headH: 0.26 });

/** The brow block jutting at the top front of the body over the upper plate (round 5, photo 07): along the roof's front
 * edge, its top 2 cm over the roof, its vertical front face 0.20 m ahead of the roof's edge, its underside raked back
 * into the plate. */
export const MARKSMAN_BROW = Object.freeze({ halfW: 0.72, topY: 1.32, backZ: 0.96, frontZ: 1.30, frontBottomY: 1.20,
  rootY: 1.10, rootZ: 1.20 });

/** Each side's four 76 mm Wegmann dischargers (en.wikipedia: eight) at the rear roof corner, and the side grille. */
export const MARKSMAN_SMOKE = Object.freeze({ z: -1.38, y: 1.02, tubeR: 0.048, tubeL: 0.22 });
export const MARKSMAN_GRILLE = Object.freeze({ z0: -1.40, z1: -0.84, y0: 0.42, y1: 0.96 });
