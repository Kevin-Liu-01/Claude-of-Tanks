// The Marconi Marksman turret (release 269, builder M): the measured frame its build (profiles/marksmanTurret.ts) and both
// hulls' combat records (marksmanSpecs.ts) read, so the drawn turret, guns and radar and the specs' pivots, bores and
// plates never drift apart. One turret, two hulls: Finland's ItPsv 90 on the T-55 and the ItPsv Leopard 2 on the Leopard
// 2A4 (docs/references/tanks/marksman_t55.md, itpsv_leopard2.md: every number's photograph or source).
// Dependency-free data (the spec pack imports it at boot). Turret-local metres: the ring's centre on the ring plane
// (y 0), +z forward, +x the vehicle's LEFT.
// First-party: Kevin B. Liu (NOTICE.md).

type P3 = readonly [number, number, number];

/**
 * The welded central body: an octagon in section (a broad chamfer along each roof edge, a deep lower chamfer that
 * narrows the sides to the floor, deepest at the front: photos 02, 03, 10), a full roof, a short chamfer across the rear
 * roof edge, and the front a blunt vertical prow (two faces meeting 12.7 degrees back at the centre line, photos 07, 09)
 * between a sloped upper band (photos 03, 10) and a lower front chamfer back to the floor. 3.02 m long (photo 02: 3.1 m
 * with the prow's perspective), 1.60 m across its sides (photo 10: 1.64 m), 1.16 m from floor to roof (photo 08: 1.19 m,
 * photo 10: 1.03-1.24 m); the floor 0.14 m over the ring on its collar (photo 08: 0.17 m). Every face is planar by
 * construction (the vertices solve the planes), so the build and the armour plates are the same polygons.
 */
export const MARKSMAN_BODY = Object.freeze({
  floorY: 0.14, roofY: 1.30, rearZ: -1.62, prowZ: 1.40, sideX: 0.80, roofHalfW: 0.66,
});

/** The body's vertices on its left (+x) half; the right is their mirror. `K` are the prow's ridge on the centre line. */
export const MARKSMAN_BODY_VERTS = Object.freeze({
  // the rear face (z -1.62): floor corner, the side face's foot, the upper chamfer's foot, the rear roof chamfer's corner
  R1: [0.716429, 0.14, -1.62], R2: [0.80, 0.30, -1.62], R3: [0.80, 1.16, -1.62], R4: [0.72, 1.24, -1.62],
  // the roof's rear corner over the rear roof chamfer
  R5: [0.66, 1.30, -1.56],
  // the front: floor corner, the lower chamfers' corner on the prow, the side face's front foot and head, the upper
  // chamfer's front foot, the roof's front corner
  F1: [0.62, 0.14, 1.02], F2: [0.733352, 0.37333, 1.25333], F3: [0.80, 0.50, 1.24], F4: [0.80, 1.096, 1.24],
  F5: [0.80, 1.16, 1.164706], F6: [0.66, 1.30, 1.00],
  K1: [0, 0.52, 1.40], K2: [0, 0.96, 1.40],
} as const satisfies Record<string, P3>);

type BodyVert = keyof typeof MARKSMAN_BODY_VERTS;
/** A face's corners: a vertex name and its side (+1 the left, -1 the right; the ridge's on the centre line either way). */
type Corner = readonly [BodyVert, 1 | -1];

/** The body's fifteen faces, each a planar convex polygon (any winding: the build and the plates orient them outward). */
export const MARKSMAN_BODY_FACES: Readonly<Record<string, readonly Corner[]>> = Object.freeze({
  floor: [['F1', 1], ['F1', -1], ['R1', -1], ['R1', 1]],
  roof: [['R5', 1], ['R5', -1], ['F6', -1], ['F6', 1]],
  rear: [['R1', -1], ['R1', 1], ['R2', 1], ['R3', 1], ['R4', 1], ['R4', -1], ['R3', -1], ['R2', -1]],
  rearRoof: [['R4', 1], ['R5', 1], ['R5', -1], ['R4', -1]],
  frontUpper: [['F6', 1], ['F5', 1], ['F4', 1], ['K2', 1], ['F4', -1], ['F5', -1], ['F6', -1]],
  frontLower: [['F1', 1], ['F1', -1], ['F2', -1], ['K1', 1], ['F2', 1]],
  ...Object.fromEntries(([1, -1] as const).flatMap((s): (readonly [string, readonly Corner[]])[] => {
    const tag = s > 0 ? 'L' : 'R';
    const face = (...names: BodyVert[]): Corner[] => names.map((name) => [name, s] as const);
    return [
      [`side${tag}`, face('R2', 'F3', 'F4', 'F5', 'R3')],
      [`upperChamfer${tag}`, face('R3', 'F5', 'F6', 'R5', 'R4')],
      [`lowerChamfer${tag}`, face('R1', 'F1', 'F2', 'F3', 'R2')],
      [`prow${tag}`, face('F3', 'F2', 'K1', 'K2', 'F4')],
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
 * The elevation axis: the large bearing drum on each flank (photos 01, 02: its centre about 0.35 m ahead of the ring's
 * centre, a third of the body's height over its floor), turret-local. The guns' armoured pods turn on it with the guns
 * (photo 01 at about 30 degrees, photo 03 near the top of their arc).
 */
export const MARKSMAN_TRUNNION = Object.freeze([0, 0.58, 0.16] as const);

/** The bearing drum about the axis (turret stock: a body of revolution, rotation-invariant), its hub into the pod. */
export const MARKSMAN_DRUM = Object.freeze({ r: 0.40, innerX: 0.66, outerX: 0.875, hubR: 0.10, hubOuterX: 0.925 });

/**
 * The two 35 mm Oerlikon KDA bores, gun-local (x either side, y over the elevation axis; index 0 the right, -x). Photos
 * 01 and 02 put the bore line 0.37-0.40 m over the drum's centre; photos 03 and 10 the barrels 2.1-2.5 m apart.
 */
export const MARKSMAN_BORE = Object.freeze({ x: 1.16, y: 0.38 });

/**
 * Each gun's armoured pod, gun-local: a long faceted box round the gun's receiver, a flat inner face beside the drum, a
 * broad chamfer along its top outer edge, smaller ones elsewhere (photos 02, 05, 09), the tail cut back top and bottom
 * (photo 02), the nose a faceted pyramid to a front face round the bore (photos 09, 10). 1.40 m long and 0.52 x 0.63 m
 * in section (photo 10: 0.55 m tall): short enough behind the axis that the tail clears the deck at +85 degrees (its
 * lowest corner 0.17 m over the ring plane).
 */
export const MARKSMAN_POD = Object.freeze({
  innerX: 0.905, outerX: 1.42, bottomY: 0.03, topY: 0.66, topChamfer: 0.11, bottomChamfer: 0.05,
  tailZ: -0.42, tailTopY: 0.50, tailBottomY: 0.14, tailCutZ: -0.26, shoulderZ: 0.72, noseZ: 0.98,
  /** The nose's front face round the bore. */
  faceHalfW: 0.12, faceHalfH: 0.11,
});

/**
 * The barrel, gun-local z: the mantlet sleeve on the pod's nose, the jacket and its clamp, the L/90 tube, the v0 sleeve
 * and the slotted muzzle brake (photos 05, 06: two baffle rings in a frame of two side plates, four lugs on the front
 * flange). The bore mouths at the brakes' front faces, 4.60 m ahead of the axis: with the guns forward the Leopard 2 version
 * is the published 9.30 m (the hull's stern rack 4.155 m behind its ring and the axis 0.16 m ahead of it).
 */
export const MARKSMAN_BARREL = Object.freeze({
  sleeveZ: [0.955, 1.08], jacketZ: [1.00, 1.62], tubeZ: [1.62, 4.05], v0Z: [4.05, 4.17], brakeZ: [4.17, 4.60],
  sleeveR: 0.088, jacketR: 0.068, tubeR: 0.050, muzzleR: 0.046, brakeR: 0.072,
});
export const MARKSMAN_MUZZLE_Z = MARKSMAN_BARREL.brakeZ[1];

/**
 * The Marconi 400-series search and tracking radar on the rear roof (photos 02, 04, 07, 10): a wide base drum and its
 * rubber boot, the column with a flange, the head with its electronics box on the right, the dish facing forward on an
 * elevation axle, and on the axle's left end a boom to the electro-optical tracker's box. Photo 02 puts its column 0.78 m
 * ahead of the turret's rear face; photos 03 and 10 on the centre line (10's offset is perspective). Its top 2.68 m
 * over the ring: the published 2,705 mm turret height with the radar in its firing position.
 */
export const MARKSMAN_RADAR = Object.freeze({
  x: 0, z: -0.86, baseR: 0.30, baseTopY: 1.41, bootTopY: 1.52, columnR: 0.16, columnTopY: 1.72,
  headY: 1.875, axleY: 1.98, dishR: 0.37, dishDepth: 0.09, dishTiltDeg: 20, dishZ: 0.20,
  boomX: 0.46, topY: 2.68,
});

/** The commander's (right, -x) and gunner's (left, +x) sight heads mid-roof (photos 02, 03), their hatches ahead. */
export const MARKSMAN_SIGHTS = Object.freeze({ x: 0.27, z: -0.02, hatchX: 0.34, hatchZ: 0.56, hatchR: 0.22 });

/** Each side's four 76 mm Wegmann dischargers (en.wikipedia: eight) at the rear roof corner, and the side grille. */
export const MARKSMAN_SMOKE = Object.freeze({ z: -1.38, y: 1.02, tubeR: 0.048, tubeL: 0.22 });
export const MARKSMAN_GRILLE = Object.freeze({ z0: -1.40, z1: -0.84, y0: 0.42, y1: 0.96 });
