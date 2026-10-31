// The 2A4-era Leopard 2s on the release-262 Leopard 2-pattern hull (profiles/leopard2A4Family.ts draws them; their specs
// carry this envelope): the turret datums and the combat envelope on the drawn hull and turret. The owner, 2026-10-28:
// "update and cleanup our old designs for leopard 2a4 otco, 2a4v, 2a4m, 2a4, 2a4m can, and leopard 2 improved off of thhast
// good hull and redesingn the turrets off of our leopard 2a6 and have them be the before variants basically".
//
// The turret is our source-measured Leopard 2A6 (profiles/leopardA6X.ts) before its wedge: the 2A6 X's measured shell
// sections (the asymmetric walls, 1.274 m right and 1.177 m left of the gun; the roof falling to the front; the floor
// rising over the bustle), its hatch rings and smoke-tube rows, with the wedge add-on armour and the 2A5's side modules
// taken off and the 2A4's front armour block put back from the 2A6 X's own seam (z 1.0977) to vertical faces 0.55 m ahead.
// Its z stations keep the 2A6 X's frame: re-rooted on the release hull's ring (z 0.37), the 2A6 X's hatches, smoke rows,
// front-block seam and bustle land where Björn Huber's published Leopard 2A4 side drawing (Wikimedia Commons
// "Leopard2A4.jpg", CC BY-SA 3.0) puts them over the same seven road wheels, scaled by the wheel pitch (the drawing's
// pitch is 165.2 px = 0.825 m here): the loader's hatch over the ring, the front block's seam 0.51 m behind its faces,
// the faces 0.48 of a pitch behind the first road wheel, the bustle's rear 0.68 of a pitch behind the sixth. (The 2A6 X's
// own yaw origin, z 1.05, is its modeller's, 1.05 m ahead of that ring.)
//
// Boot-light: plain data and the shared plate helpers, no geometry. Turret metres from the ring's centre on the deck;
// the world's right of a +Z hull is -X (the commander, gunner and the EMES 15 sit right, the loader left). The spec
// helpers' "R" plates stand on +X, as in leopard2a3B4Armor.ts.
import {
  plate, rearPlate as rr, rightSidePlate as sR, leftSidePlate as sL, roofPlate as rf,
  rightCheekPlate as chR, leftCheekPlate as chL, moduleBox as mbox, crewBox as cbox,
  type ArmorEnvelope, type ArmorPlate, type PlateOptions,
} from './specHelpers.ts';
import { LEOPARD2_HULL, leopard2HullArmor } from './leopard2HullDatums.ts';
import {
  LEOPARD2_CHEEK_SWEEP_DEG, cheekCornerZ, cheekFaceZ, sightBackZ, type Leopard2CheekFront,
} from './leopard2CheekFrontDatums.ts';

/** The turret's datums (turret metres). */
export const LEO2A4_TURRET = Object.freeze({
  pivot: LEOPARD2_HULL.ring,
  /** The trunnion: the 2A6 X's measured pitch axis (its bore 1.97 m over the ground). */
  gunLocal: Object.freeze([0, 0.33, 1.42] as const),
  /** Trunnion to muzzle: the Rh-120 L/44 and L/55 at the release hull's scale (its wheel pitch is 0.936 of the drawing's
   *  real 0.881 m), so the gun-forward lengths from the rear plate read the published 9.67 m and 10.97 m. */
  barrelL44M: 4.10,
  barrelL55M: 5.34,
  barrelRadiusM: 0.084,
  /** The front block (photographed 2A4s: Austrian, Croatian, Singaporean): from its rear seam (the 2A6 X's station) the
   *  cheeks' top runs level to `bevelZ`, then a 40-degree bevel slopes forward and down to the vertical faces, which stand
   *  from the floor to `faceTopY`; the outer corners are cut back to the walls from `cornerZ`. */
  blockZ: 1.0977,
  cornerZ: 1.38,
  bevelZ: 1.45,
  faceZ: 1.65,
  faceTopY: 0.61,
  /** The gun slot between the cheeks, filled by the wide flat mantlet (about 40 % of the front, as photographed). */
  slotHalfWidthM: 0.475,
  /** The 2A6 X's core walls (the turret is wider right of the gun) and the faces' outer edges. */
  wallRightM: 1.2742,
  wallLeftM: 1.1769,
  faceRightM: 1.10,
  faceLeftM: 1.01,
  floorY: 0.058,
  blockTopY: 0.74,
  roofY: 0.791,
  /** The floor rises over the bustle (the 2A6 X: 1.698 m at z 0.26, 1.786 at -0.47, 1.854 from -1.02). */
  bustleFloorY: 0.214,
  /** The right wall steps in over the bustle (the 2A6 X: 1.213 at z -1.02, 1.126 at -1.81). */
  bustleRightM: 1.126,
  bustleEndZ: -2.30,
  rearZ: -2.64,
  rearRightM: 0.78,
  rearLeftM: 0.80,
  rearRoofY: 0.72,
  rearFloorY: 0.25,
  /** The mantlet's face in the gun's frame, 3 cm behind the cheeks' faces. */
  mantletFaceZ: 0.20,
  /** The EMES 15 sight's notch: cut through the right cheek's upper face and bevel (x centre, half-width, its sill, the
   *  block's top), open forward and upward back to the sight head's face at `pocketZ`; 0.44 m wall to wall (the 262 lane's
   *  measure from three photographs: 441, 428 and 446 mm). */
  emes: Object.freeze({ x: -0.72, halfW: 0.22, y0: 0.42, y1: 0.74, pocketZ: 1.40 }),
  /** The 2A6-look front (profiles/leopard2A4Wedge.ts: the 2A6 X's wedges compressed ahead of the trunnion): its tip and
   *  shoulder stations, the wedges' inner and shoulder half-widths, the side modules' outer half-widths. */
  wedge: Object.freeze({ tipZ: 2.75, shoulderZ: 2.187, innerLeft: 0.261, innerRight: 0.199, shoulderLeft: 1.177,
    shoulderRight: 1.274, broadLeft: 1.394, broadRight: 1.491, rootZ: 1.095 }),
  /** The commander's ring (right) and the loader's (left): the 2A6 X's measured rings [x, z, radius, height]. */
  commander: Object.freeze([-0.6221, -0.0401, 0.31935, 0.164] as const),
  loader: Object.freeze([0.53145, -0.01375, 0.37077, 0.102] as const),
});

/**
 * The square block's cheek front (leopard2CheekFrontDatums.ts, the 262 early Leopards' construction shared): the faces at
 * faceZ across the slot, swept back LEOPARD2_CHEEK_SWEEP_DEG toward their outer ends (the owner, 2026-10-29: "i think it
 * nneeds to be a lot mroe than 6 degrees"), vertical to faceTopY, bevelled back to the block's top, a 10 cm chamfer to each
 * wall; the shell's front at 0.98, behind the outer ends' bevelled tops (the right's at 1.03); the EMES 15's notch 0.22 deep,
 * not shallower than the bevel, its housing on the roof behind it. The 2A6-look wedge front keeps the shell to blockZ.
 */
export const LEO2A4_CHEEK_FRONT: Leopard2CheekFront = Object.freeze({
  frontZ: LEO2A4_TURRET.faceZ, slotHalfWidthM: LEO2A4_TURRET.slotHalfWidthM, sweepDeg: LEOPARD2_CHEEK_SWEEP_DEG,
  floorY: LEO2A4_TURRET.floorY, faceTopY: LEO2A4_TURRET.faceTopY, cheekTopY: LEO2A4_TURRET.blockTopY,
  cheekBevelM: LEO2A4_TURRET.faceZ - LEO2A4_TURRET.bevelZ, rootZ: 0.98, cornerChamferM: 0.10,
  right: Object.freeze({ faceHalfWidthM: LEO2A4_TURRET.faceRightM, wallHalfWidthM: LEO2A4_TURRET.wallRightM }),
  left: Object.freeze({ faceHalfWidthM: LEO2A4_TURRET.faceLeftM, wallHalfWidthM: LEO2A4_TURRET.wallLeftM }),
  sight: Object.freeze({
    innerX: -LEO2A4_TURRET.emes.x - LEO2A4_TURRET.emes.halfW, outerX: -LEO2A4_TURRET.emes.x + LEO2A4_TURRET.emes.halfW,
    sillY: LEO2A4_TURRET.emes.y0, lintelY: 0.715, topY: 0.83, depthM: 0.22, housingDepthM: 0.62,
  }),
});

/** Linear interpolation along a [z, y] station line, held past its ends (leopard2Hull.ts's lineAt, boot-light). */
export function lineAtStations(line: readonly (readonly [number, number])[], z: number): number {
  if (z <= line[0][0]) return line[0][1];
  for (let i = 1; i < line.length; i++) {
    const [z0, y0] = line[i - 1], [z1, y1] = line[i];
    if (z <= z1) return y0 + (y1 - y0) * (z - z0) / (z1 - z0);
  }
  return line[line.length - 1][1];
}

/** Which 120 mm tube the vehicle carries. */
export type Leopard2A4Gun = 'L44' | 'L55';

/** The six vehicles on the construction, and the tube each draws (the spec envelope and the builder read this one table). */
export const LEOPARD2A4_FAMILY_GUN = Object.freeze({
  // the Leopard 2A4 draws the 2A4's L/44 (the build it replaces was a 2A6 with the L/55); the OTCO and the Improved too
  // (the owner via Main, 2026-10-29: the Dutch 2A4NL of the OTCo and KMW's KWS II trial tanks ran the L/44; their old
  // builds' L/55 rode the 2A6M and 2A7V specs they were copied from)
  leo2a4: 'L44', leo2a4_v: 'L44', leo2a4m: 'L44', leo2a4m_can: 'L44', leo2a4_otco: 'L44', leo2_improved: 'L44',
  // the owner, 2026-10-28: "oh yeah this meanns we nnneed to update the strv 121 as well" (the Swedish Leopard 2A4)
  strv121: 'L44',
} as const satisfies Record<string, Leopard2A4Gun>);
export type Leopard2A4FamilyId = keyof typeof LEOPARD2A4_FAMILY_GUN;

/**
 * The owner, 2026-10-28: "we can still have 2a4s that use this squarish turret that doesnt look like 2a6, but it should be
 * evenly split between the 2a4 squares vs 2a4 modern upgraded variants that look like 2a6s". The plain 2A4, the 2A4 V and
 * the 2A4M CAN (whose real appliqué is bolted over the square front) keep the 2A4's block; the 2A4M (the 2A4 V with the
 * field-modernisation kit), the OTCO (the ERA and ISAF fit) and the Leopard 2 Improved (the improved Leopard 2 the wedge
 * came from) carry the 2A6-look wedge front.
 */
export const LEOPARD2A4_FAMILY_FRONT = Object.freeze({
  leo2a4: 'block', leo2a4_v: 'block', leo2a4m_can: 'block', leo2a4m: 'wedge', leo2a4_otco: 'wedge', leo2_improved: 'wedge',
  // the Stridsvagn 121 is the Swedish Army's Leopard 2A4 (1994): the square block
  strv121: 'block',
} as const satisfies Record<Leopard2A4FamilyId, 'block' | 'wedge'>);
export const LEOPARD2A4_FAMILY_IDS = Object.freeze(Object.keys(LEOPARD2A4_FAMILY_GUN) as Leopard2A4FamilyId[]);

export const leopard2A4BarrelM = (gun: Leopard2A4Gun): number =>
  gun === 'L55' ? LEO2A4_TURRET.barrelL55M : LEO2A4_TURRET.barrelL44M;

/** The protection a plate carries, copied from the vehicle's own record. */
type PlateValues = Pick<ArmorPlate, 'physicalMm' | 'keMm' | 'ceMm' | 'kind' | 'era' | 'moduleLink' | 'gunFollow'>;

function valuesOf(p: ArmorPlate): PlateValues {
  return { physicalMm: p.physicalMm, keMm: p.keMm, ceMm: p.ceMm, kind: p.kind, era: p.era, moduleLink: p.moduleLink,
    gunFollow: p.gunFollow };
}

/** A plate drawn on the new construction carrying a named plate's protection. */
function carry(geometry: ArmorPlate, name: string, v: PlateValues): ArmorPlate {
  return { ...geometry, name, ...v };
}

/** How a vehicle's own plates move onto the construction. */
export interface Leopard2A4EnvelopeOptions {
  readonly gun: Leopard2A4Gun;
  /** The square 2A4 block or the 2A6-look wedge front (LEOPARD2A4_FAMILY_FRONT). */
  readonly front: 'block' | 'wedge';
  /** How much deeper the fore skirt blocks hang than the aft run (the hull's own option). */
  readonly foreSkirtDropM: number;
  /** Plates the vehicle's kit seats on drawn surfaces of its own (ERA fields, appliqué layers), keyed by name. */
  readonly kitPlates?: Readonly<Record<string, KitPlate>>;
  /** Plates a kit adds that the vehicle's record never carried, with their own protection (leo2a4_v's Kontakt-1). */
  readonly addedPlates?: Readonly<Record<string, KitPlate>>;
}

/**
 * The vehicle's combat envelope on the drawn hull and turret: every plate keeps its name and its protection (physical,
 * KE and CE thickness, kind, ERA, module link) from the vehicle's own record, and takes its place on the construction.
 * Plates the 2A4 turret no longer draws as a separate solid (the 2A6's wedge, the 2A5's chevron layers) stay as the
 * spaced layer inside the front block, behind its faces, so the frontal protection stands. A plate the construction has
 * no surface for, and the kit does not seat, throws.
 */
export function leopard2A4FamilyArmor(id: string, legacy: ArmorEnvelope, o: Leopard2A4EnvelopeOptions): ArmorEnvelope {
  const T = LEO2A4_TURRET;
  const plates = new Map<string, ArmorPlate>();
  for (const p of [...legacy.hullPlates, ...legacy.turretPlates]) if (!plates.has(p.name)) plates.set(p.name, p);
  const used = new Set<string>();
  // a kit that seats one of the construction's own plates on its add-on (an appliqué's face) overrides that plate's seat
  const seated = (name: string, g: ArmorPlate): ArmorPlate => o.kitPlates?.[name]?.plate ?? g;
  const take = (name: string): PlateValues | null => {
    const p = plates.get(name);
    if (!p) return null;
    used.add(name);
    return valuesOf(p);
  };
  const need = (name: string): PlateValues => {
    const v = take(name);
    if (!v) throw new Error(`leopard2A4FamilyArmor: ${id} has no ${name} plate`);
    return v;
  };
  const zero = { glacis: { ke: 1, ce: 1, phys: 1 }, lowerFront: { ke: 1, ce: 1 }, side: 1, rear: 1, roof: 1,
    skirtFore: { ke: 1, ce: 1 }, skirtAft: 1 };
  const hull = leopard2HullArmor(zero, o.foreSkirtDropM);
  const drawn = new Map(hull.hullPlates.map((p) => [p.name, p]));
  const hullPlates: ArmorPlate[] = [];
  // the drawn hull's plates under the vehicle's own names: the fore blocks carry the heavy skirt's protection, the aft
  // panels the rear run's; a vehicle with one skirt plate a side spans the whole run with it
  const hullNames: Array<[drawnName: string, own: string[]]> = [
    ['upper_glacis', ['upper_glacis']], ['lower_front', ['lower_front']],
    ['hull_side_upper_R', ['hull_side_upper_R']], ['hull_side_upper_L', ['hull_side_upper_L']],
    ['hull_side_lower_R', ['hull_side_lower_R']], ['hull_side_lower_L', ['hull_side_lower_L']],
    ['skirt_fore_R', ['skirt_heavy_R', 'skirt_fore_R']], ['skirt_fore_L', ['skirt_heavy_L', 'skirt_fore_L']],
    ['skirt_R', ['skirt_rear_R', 'skirt_R']], ['skirt_L', ['skirt_rear_L', 'skirt_L']],
    ['track_R', ['track_R']], ['track_L', ['track_L']], ['hull_rear', ['hull_rear']], ['hull_roof', ['hull_roof']],
  ];
  const singleSkirt = !plates.has('skirt_heavy_R') && !plates.has('skirt_fore_R') && plates.has('skirt_R');
  for (const [drawnName, own] of hullNames) {
    const geometry = drawn.get(drawnName)!;
    if (singleSkirt && /^skirt_fore_/.test(drawnName)) continue;
    const name = own.find((n) => plates.has(n));
    if (!name) throw new Error(`leopard2A4FamilyArmor: ${id} has none of ${own.join(', ')}`);
    let g = geometry;
    if (singleSkirt && /^skirt_[RL]$/.test(drawnName)) {
      // one plate a side from the rear panel's end to the fore block's nose, on the fore blocks' face
      const fore = drawn.get(drawnName === 'skirt_R' ? 'skirt_fore_R' : 'skirt_fore_L')!;
      const sx = Math.sign(geometry.verts[0][0]), x = Math.abs(fore.verts[0][0]);
      const y0 = Math.min(...fore.verts.map((v) => v[1])), y1 = Math.max(...fore.verts.map((v) => v[1]));
      const z0 = Math.min(...geometry.verts.map((v) => v[2])), z1 = Math.max(...fore.verts.map((v) => v[2]));
      g = (sx > 0 ? sR : sL)('skirt', 1, x, y0, x, y1, z0, z1);
    }
    hullPlates.push(carry(seated(name, g), name, need(name)));
  }
  // the turret: the cheek faces either side of the gun slot, the 2A6/2A5 frontal layers inside the block behind them,
  // the EMES 15 window's recess (right), the mantlet, the walls, the rear plate and the roof
  // the mantlet plate on the slot's face (the 262 lane: on the mantlet's own face it squeezed every plate onto the envelope)
  const gy = T.gunLocal[1], mz = T.faceZ, top = T.blockTopY - 0.01, block = o.front !== 'wedge', F = LEO2A4_CHEEK_FRONT;
  // the square block's faces sweep back toward their outer ends and meet the walls at the chamfers (the shared cheek
  // front); the 2A6 look's plates keep their stations
  const faceOut = (fw: number): number => (block ? cheekFaceZ(F, fw) : T.faceZ);
  const cornerR = block ? cheekCornerZ(F, F.left) : T.cornerZ, cornerL = block ? cheekCornerZ(F, F.right) : T.cornerZ;
  const turretPlates: ArmorPlate[] = [
    // the cheek plates lean from the faces' foot to the bevel's top edge (the face and its bevel, one plane each side)
    carry(seated('turret_cheek_R', chR('turret_cheek_R', 1, T.slotHalfWidthM, T.faceZ, T.faceLeftM, faceOut(T.faceLeftM),
      T.floorY, top, T.faceZ - T.bevelZ)),
      'turret_cheek_R', need('turret_cheek_R')),
    carry(seated('turret_cheek_L', chL('turret_cheek_L', 1, T.slotHalfWidthM, T.faceZ, T.faceRightM, faceOut(T.faceRightM),
      T.floorY, top, T.faceZ - T.bevelZ)),
      'turret_cheek_L', need('turret_cheek_L')),
    carry(plate('mantlet', 1, [-0.465, gy - 0.23, mz], [0.465, gy - 0.23, mz], [-0.465, gy + 0.30, mz], { gunFollow: true }),
      'mantlet', need('mantlet')),
    carry(seated('turret_side_R', sR('turret_side_R', 1, T.wallLeftM, T.floorY, T.wallLeftM, T.roofY - 0.03, T.bustleEndZ,
      cornerR)), 'turret_side_R', need('turret_side_R')),
    carry(seated('turret_side_L', sL('turret_side_L', 1, T.wallRightM, T.floorY, T.wallRightM, T.roofY - 0.03, T.bustleEndZ,
      cornerL)), 'turret_side_L', need('turret_side_L')),
    carry(rr('turret_rear', 1, T.rearLeftM, T.rearFloorY, T.rearZ, T.rearRoofY, T.rearZ), 'turret_rear', need('turret_rear')),
    carry(rf('turret_roof', 1, T.wallLeftM * 0.92, T.roofY, T.rearZ, T.blockZ), 'turret_roof', need('turret_roof')),
  ];
  const wedge = !block, W = T.wedge, S = F.sight;
  const recess = take('turret_sight_recess');
  if (recess) {
    // the EMES 15's window: on the block's notch's back (the sight head's face, parallel to the swept cheek), or (the 2A6
    // look) the raised housing's canted window on the roof
    const back = (x: number): number => cheekFaceZ(F, x) - S.depthM;
    turretPlates.push(carry(wedge
      ? plate('turret_sight_recess', 1, [-0.50, 0.70, 1.72], [-0.94, 0.70, 1.72], [-0.50, 0.85, 1.70])
      : plate('turret_sight_recess', 1, [-S.innerX, S.sillY, back(S.innerX)], [-S.outerX, S.sillY, back(S.outerX)],
        [-S.innerX, S.lintelY, back(S.innerX)]), 'turret_sight_recess', recess));
  }
  // the frontal layers the old wedge-turret builds drew as separate solids: on the 2A6 look, the wedges' own faces; on the
  // square block, the spaced layer inside it, halfway between the shell's front and the swept faces
  const innerZ = (x: number): number => (F.rootZ + cheekFaceZ(F, x)) / 2;
  // [f0, f1]: the share of the layer's width from its inner edge (a chevron's courses tile it side by side)
  const layer = (name: string, sx: number, yLo: number, yHi: number, f0 = 0, f1 = 1): ArmorPlate => {
    const at = (a: number, b: number, f: number): number => a + (b - a) * f;
    if (wedge) {
      const xa = sx > 0 ? W.innerLeft : W.innerRight, xb = sx > 0 ? W.shoulderLeft : W.shoulderRight;
      const xi = at(xa, xb, f0), xo = at(xa, xb, f1), zi = at(W.tipZ, W.shoulderZ, f0), zo = at(W.tipZ, W.shoulderZ, f1);
      return sx > 0
        ? chR(name, 1, xi, zi, xo, zo, yLo, yHi, 0.10)
        : chL(name, 1, xi, zi, xo, zo, yLo, yHi, 0.10);
    }
    const xa = sx * T.slotHalfWidthM, xb = sx * (sx > 0 ? T.wallLeftM : T.wallRightM) * 0.96;
    const xi = at(xa, xb, f0), xo = at(xa, xb, f1);
    return sx > 0
      ? plate(name, 1, [xi, yLo, innerZ(xi)], [xo, yLo, innerZ(xo)], [xi, yHi, innerZ(xi)])
      : plate(name, 1, [xo, yLo, innerZ(xo)], [xi, yLo, innerZ(xi)], [xo, yHi, innerZ(xo)]);
  };
  const lo = wedge ? 0.12 : T.floorY, hi = wedge ? 0.60 : top;
  for (const [name, sx] of [['turret_wedge_R', 1], ['turret_wedge_L', -1]] as const) {
    const v = take(name);
    if (v) turretPlates.push(carry(layer(name, sx, lo, hi), name, v));
  }
  for (const name of plates.keys()) {
    const m = /^turret_chevron_([LR])_(upper|lower)(?:_(\d+))?$/.exec(name);
    if (!m) continue;
    // the old builds' two courses a side tiled the chevron, the face (to 87 % of its width) then the swept wing: a
    // frontal shot crossed one of them, never both
    const sx = m[1] === 'R' ? 1 : -1, mid = (lo + hi) / 2;
    const [f0, f1] = m[3] === '1' ? [0, 0.87] : m[3] === '2' ? [0.87, 1] : [0, 1];
    turretPlates.push(carry(m[2] === 'upper' ? layer(name, sx, mid, hi, f0, f1) : layer(name, sx, lo, mid, f0, f1), name,
      need(name)));
  }
  // the kit's own plates (ERA fields, appliqué layers) seated on its drawn surfaces
  for (const [name, kit] of Object.entries(o.kitPlates ?? {})) {
    if (used.has(name)) continue;                                          // it overrode a construction plate's seat
    const v = take(name);
    if (!v) throw new Error(`leopard2A4FamilyArmor: ${id}'s kit seats ${name}, which its record does not carry`);
    (kit.rig === 'hull' ? hullPlates : turretPlates).push(carry(kit.plate, name, v));
  }
  // plates the record never carried, with their own protection (a combat addition, named in the vehicle's envelope)
  for (const [name, kit] of Object.entries(o.addedPlates ?? {})) {
    if (plates.has(name)) throw new Error(`leopard2A4FamilyArmor: ${id}'s added plate ${name} is already in its record`);
    (kit.rig === 'hull' ? hullPlates : turretPlates).push(kit.plate);
  }
  const leftover = [...plates.keys()].filter((name) => !used.has(name) && !/_hatch_\d+_/.test(name));
  if (leftover.length) throw new Error(`leopard2A4FamilyArmor: ${id}'s ${leftover.join(', ')} found no surface`);

  const barrel = leopard2A4BarrelM(o.gun), muzzleZ = T.pivot[2] + T.gunLocal[2] + barrel;
  const modules = [
    ...hull.power,
    // the hull magazine left of the driver (the bustle's ready rounds stay behind the blow-out panels)
    mbox('ammoRack', [0.20, 0.60, 1.55], [1.02, 1.45, 2.85]),
    mbox('turretRing', [-1.02, 1.52, T.pivot[2] - 1.02], [1.02, 1.70, T.pivot[2] + 1.02]),
    hull.radio,
    // the sight head: on the square block at the notch's back (the swept face 0.22 behind it), on the 2A6 look to the face
    mbox('optics', [T.emes.x - 0.26, 0.38, 0.95], [T.emes.x + 0.26, 0.92, block ? sightBackZ(F) + 0.02 : T.faceZ], true),
    mbox('gun', [-0.20, gy - 0.22, -0.90], [0.20, gy + 0.26, T.faceZ], true),
    ...hull.tracks,
  ];
  for (const m of legacy.modules) if (m.module === 'roofGun') modules.push(structuredClone(m));
  const crew = [
    hull.driver,
    cbox('gunner', [-0.95, 0.05, 0.25], [-0.30, 0.72, 1.05], true),
    cbox('commander', [-1.05, 0.10, -0.62], [-0.35, 0.86, 0.18], true),
    cbox('loader', [0.25, 0.05, -0.55], [1.00, 0.82, 0.45], true),
  ];
  return {
    boundingRadiusM: Math.hypot(muzzleZ, 2.0) + 0.25,
    turretPivot: [T.pivot[0], T.pivot[1], T.pivot[2]],
    gunPivot: [T.gunLocal[0], T.gunLocal[1], T.gunLocal[2]],
    gunBarrel: { lengthM: barrel, radiusM: T.barrelRadiusM * 1.22 },
    hullPlates, turretPlates, modules, crew,
  };
}

/** A plate a kit seats on its own drawn surface, in its rig's metres (its protection comes from the record by name). */
export interface KitPlate {
  readonly rig: 'hull' | 'turret';
  readonly plate: ArmorPlate;
}

export function kitPlate(rig: KitPlate['rig'], name: string, v0: readonly [number, number, number],
  v1: readonly [number, number, number], v3: readonly [number, number, number], o: PlateOptions = {}): KitPlate {
  return { rig, plate: plate(name, 1, v0, v1, v3, o) };
}
