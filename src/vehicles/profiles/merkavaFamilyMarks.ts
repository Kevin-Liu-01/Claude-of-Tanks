// Merkava family marks (release 262): the measured record of each of the six marks the family builder draws, matched to
// the owner-supplied source models (2026-10-27: "need to match the geometry of these"; Merkava Mk 1B, 2B, 2D, 3C, 3D
// and 4B; local comparison inputs, never redistributed or loaded). The running gear, turret shell, gun, mantlet and
// every detail part come from the source fit (merkavaFamilySource.ts); the hull's lines below are authored per chassis
// from the same fit (its deck, engine deck, nose, belly and stern courses, the sponsons' tops and undersides), since the
// sources' hull plates are open and carry the turret ring's and hatches' openings. Sources and gap tables:
// docs/references/tanks/<id>.md. Hull frame: ground y = 0, +Z the nose, +X the vehicle's left.
import { lineAt, type BellyStation, type MerkavaFender, type MerkavaGearSpec, type MerkavaHullSpec } from './merkavaFamilyHull.ts';
import type { ShellSolid, TurretSlot } from './merkavaFamilyTurret.ts';
import type { BasketLoadItem } from './merkavaFamilyBasket.ts';
import type { MerkavaAddendum, MerkavaBasket, ModulePlate, ModuleRun, SolidPart, TurretModule } from './merkavaFamilyDetails.ts';
import type { SectionPoint } from './sectionSolid.ts';
import type { MeasuredBox, MerkavaGunSpec, MerkavaOverGun, RevolveStation } from './merkavaFamilyGun.ts';
import { MERKAVA_SOURCE, type SourcePart } from './merkavaFamilySource.ts';

export type MerkavaMarkId = 'merkava1b' | 'merkava2b' | 'merkava2d' | 'merkava3c' | 'merkava3_baz' | 'merkava4b';

export interface MerkavaMark {
  readonly id: MerkavaMarkId;
  readonly hull: MerkavaHullSpec;
  readonly gear: MerkavaGearSpec;
  /** The front fender boxes over the sprockets as measured (the +X box); null where the source carries none. */
  readonly fender: MerkavaFender | null;
  /** The turret ring centre in the hull frame: deck height and z. */
  readonly pivot: readonly [y: number, z: number];
  /** The turret shell's measured solids (hull frame). */
  readonly shell: readonly ShellSolid[];
  /** The add-on turret armour modules as measured solids, each in its side's removable package. */
  readonly modules: readonly TurretModule[];
  /** The large source pieces fitted as measured solids (bigpieces.py), drawn by their detail roles. */
  readonly solidParts: readonly SolidPart[];
  /** The belly's add-on armour plate (the 2D and Baz) as measured; null where the source carries none. */
  readonly belly: readonly BellyStation[] | null;
  /** The gun's slot through the turret's nose (the Mk 1 to Mk 3; the Mk 4's gun rides in its pointed housing). */
  readonly slot: TurretSlot | null;
  readonly parts: readonly SourcePart[];
  readonly gun: MerkavaGunSpec;
  /** The hull armour's bolt heads as measured: x, y, z and size (hull frame). */
  readonly studs: readonly (readonly number[])[];
  /** The bustle basket as measured (hull frame); null where the source has none behind the shell. */
  readonly basket: MerkavaBasket | null;
  /** The basket's load: the fleet's field stowage packed on its floor (basketpack.py, hull frame). */
  readonly load: readonly BasketLoadItem[];
  /** Roof machine guns as measured (hull frame): the mount's x, foot y and z, the gun's span along z, and the source gun's
   *  top where it is not the fleet MAG's on its pintle at the foot (else null). */
  readonly roofGuns: readonly (readonly [x: number, foot: number, z: number, z0: number, z1: number, top: number | null])[];
  /** Whip antennas as measured: x, foot y, z, height (on the turret, or on the hull where the foot is under the deck). */
  readonly antennas: readonly (readonly [x: number, foot: number, z: number, h: number])[];
  /** Pieces the source fit left out, measured from the same source (MEASURED_ADDENDA). */
  readonly addenda: readonly MerkavaAddendum[];
}

// ---------------------------------------------------------------------------------------------- the three chassis
// Each from its source's hull plate (the root's largest welded piece; its deck is open under the separate engine and
// transmission hatches, which are measured detail parts): the deck, the glacis falling 0.28 m a metre to the front
// plate, the lower plate steepening from 31 to 48 degrees up to it, the belly and the raked stern; the sponsons' tops
// along the same glacis to the front fender boxes (measured per mark, MerkavaMark.fender); the nose's fittings.
// Mk 1 / Mk 2 (the Mk 1B, 2B and 2D sources share it): deck 1.68-1.76, the glacis from (1.45, 1.74) to the front plate
// at z 3.518 (1.165 over its +X side), the -X side's raised front plate standing 0.14 m proud from z 2.95, its inboard
// edge running from x 0.17 to the centreline at the nose; the lower plate from the belly (0.41) at z 2.65 to 1.105 at
// the front plate; sponsons to +-1.865 over the track, their undersides at 1.33.
const MK12_HULL: MerkavaHullSpec = {
  top: [[-3.70, 0.86], [-3.50, 0.92], [-3.42, 1.20], [-3.32, 1.72], [-3.00, 1.78], [-2.55, 1.81], [-2.45, 1.75],
    [-2.00, 1.71], [-1.85, 1.68], [0.35, 1.68], [0.70, 1.76], [1.20, 1.76], [1.25, 1.745], [1.45, 1.74], [3.518, 1.165]],
  bottom: [[-3.70, 0.69], [-3.20, 0.67], [-3.00, 0.46], [-2.90, 0.41], [2.65, 0.41], [2.70, 0.438], [3.20, 0.735],
    [3.30, 0.821], [3.40, 0.949], [3.50, 1.084], [3.518, 1.105]],
  sponsonTop: [[-3.79, 1.35], [-3.56, 1.36], [-3.52, 1.62], [-3.30, 1.73], [-2.70, 1.77], [-1.75, 1.70], [0.15, 1.69],
    [0.55, 1.68], [0.70, 1.76], [1.20, 1.76], [1.45, 1.74], [2.72, 1.388]],
  sponsonUnderY: 1.33, lowerHalfWidth: 1.15, upperHalfWidth: 1.865,
  noseTaper: [[3.40, 1.15], [3.518, 1.10]],
  rearDoor: null, exhaust: [0.35, 1.85, 0.72, 1.74, 1.43, 1.62],
  raisedPlate: {
    top: [[2.94, 1.334], [2.95, 1.474], [3.20, 1.391], [3.35, 1.323], [3.45, 1.257], [3.518, 1.20]],
    stepX: [[2.95, 0.17], [3.20, 0.14], [3.40, 0.06], [3.518, 0.0]],
  },
  nose: {
    hook: [0.677, 0.92, 3.381, 1.171, 3.618, 3.765], lugXs: [0.22, 0.43, 0.84, 1.043], lugRun: [0.933, 3.374, 1.171, 3.554],
    railXs: [0.61, 0.771], railRun: [3.10, 3.468], shackle: [0.914, 0.684, 0.819, 3.347],
  },
};

// Mk 3 (the 3C and 3D sources): deck 1.68-1.755, the glacis from (1.55, 1.741) to the front plate at z 3.539 (1.165 over
// its +X side), the raised front plate from z 2.95 (its edge from x 0.35 to the centreline); the lower plate from 0.405
// at z 2.65 to 1.14; belly 0.405.
const MK3_HULL: MerkavaHullSpec = {
  top: [[-3.70, 1.20], [-3.62, 1.64], [-3.40, 1.665], [-3.25, 1.745], [-2.95, 1.796], [-2.75, 1.79], [-2.65, 1.735],
    [-2.00, 1.69], [-1.90, 1.66], [0.40, 1.68], [0.70, 1.755], [1.20, 1.755], [1.25, 1.739], [1.55, 1.741], [2.90, 1.366],
    [3.00, 1.30], [3.40, 1.20], [3.539, 1.165]],
  bottom: [[-3.70, 0.67], [-3.30, 0.633], [-3.10, 0.426], [-2.90, 0.405], [2.65, 0.405], [2.70, 0.433], [3.20, 0.730],
    [3.30, 0.815], [3.40, 0.946], [3.50, 1.085], [3.539, 1.14]],
  sponsonTop: [[-3.75, 1.48], [-3.70, 1.63], [-2.95, 1.75], [-1.80, 1.695], [0.30, 1.686], [0.50, 1.686], [0.70, 1.755],
    [1.20, 1.755], [1.45, 1.738], [2.72, 1.383]],
  sponsonUnderY: 1.32, lowerHalfWidth: 1.15, upperHalfWidth: 1.865,
  noseTaper: [[3.40, 1.15], [3.539, 1.10]],
  rearDoor: [1.10, 0.60, 0.80], exhaust: [0.35, 1.85, 0.72, 1.75, 1.45, 1.62],
  raisedPlate: {
    top: [[2.94, 1.369], [2.95, 1.468], [3.00, 1.453], [3.20, 1.376], [3.30, 1.331], [3.40, 1.285], [3.50, 1.227], [3.539, 1.20]],
    stepX: [[2.95, 0.35], [3.20, 0.15], [3.40, 0.05], [3.539, 0.0]],
  },
  nose: {
    hook: [0.677, 0.914, 3.381, 1.162, 3.617, 3.756], lugXs: [0.228, 0.435, 0.827, 1.013], lugRun: [0.98, 3.418, 1.162, 3.576],
    railXs: [0.612, 0.768], railRun: [3.064, 3.435], shackle: [0.875, 0.70, 0.835, 3.363],
  },
};

// Mk 4 (the 4B source): the raised rear deck at 1.84-1.85, the deck at 1.695, the driver's course to 1.79-1.805 from
// z 0.85 to 1.85, the deck at 1.61 to z 2.4 and the glacis from there to the front plate at z 3.986 (1.20); the lower
// plate from the belly (0.452) at z 3.08 to 1.175; sponsons to +-1.915.
const MK4_HULL: MerkavaHullSpec = {
  top: [[-3.80, 1.20], [-3.40, 1.76], [-3.00, 1.84], [-2.25, 1.85], [-2.00, 1.83], [-1.85, 1.78], [-1.50, 1.74],
    [-1.45, 1.695], [0.82, 1.695], [0.86, 1.79], [1.15, 1.805], [1.85, 1.79], [1.88, 1.61], [2.40, 1.61], [2.45, 1.599],
    [3.986, 1.20]],
  bottom: [[-3.80, 1.10], [-3.40, 1.10], [-3.25, 1.086], [-3.20, 0.85], [-3.15, 0.733], [-3.05, 0.733], [-2.85, 0.685],
    [-2.65, 0.494], [-2.60, 0.452], [3.08, 0.452], [3.70, 0.858], [3.80, 0.946], [3.90, 1.064], [3.986, 1.175]],
  sponsonTop: [[-3.80, 1.71], [-2.55, 1.84], [-2.30, 1.81], [-2.25, 1.695], [0.84, 1.695], [0.88, 1.842], [1.05, 1.815],
    [1.95, 1.815], [3.22, 1.466]],
  sponsonUnderY: 1.36, lowerHalfWidth: 1.16, upperHalfWidth: 1.915,
  noseTaper: [[3.80, 1.16], [3.986, 1.10]],
  rearDoor: [1.30, 0.60, 0.70], exhaust: null, raisedPlate: null,
  nose: {
    hook: [0.672, 1.0, 3.85, 1.20, 3.96, 4.112], lugXs: [], lugRun: [1.0, 3.85, 1.15, 3.95],
    railXs: [], railRun: [0, 0], shackle: [0.901, 0.743, 0.878, 3.852],
  },
};

// ---------------------------------------------------------------------------------------------- from the source fit
type SourceRecord = (typeof MERKAVA_SOURCE)[MerkavaMarkId]['record'];

function gearOf(r: SourceRecord): MerkavaGearSpec {
  const g = r.gear;
  return {
    wheelR: g.wheelR, wheelW: Math.min(0.28, g.wheelW), axleY: g.axleY, wheelZs: [...g.wheelZs],
    sprocket: { z: g.sprocket[0], y: g.sprocket[1], r: g.sprocket[2] },
    idler: { z: g.idler[0], y: g.idler[1], r: g.idler[2] },
    rollers: g.rollers.map(([z, y, r]) => [z, y, r] as const),
    trackW: g.trackW, trackTh: Math.max(0.06, g.axleY - g.wheelR - g.trackBottom), trackX: g.trackX,
  };
}

/** The over-gun 12.7 mm as the source measures it (hull frame): the M2 (its `mg_twin` group: back plate, muzzle, bore
 *  height) and its side ammunition box, on the measured cradle's posts and plates over the mask (gunCradle). */
interface OverGunRecord {
  readonly m2: readonly [rearZ: number, muzzleZ: number, axisY: number] | null;
  readonly ammoBox: MeasuredBox | null;
}

// the Mk 1B (in its gun bone), 2D, 3C and 3D sources share one M2 and box; the Mk 2B's cradle stands empty; the Mk 4B's
// M2 rides higher on its pointed housing, its ammunition fed from the right
const MK1_3_BOX: MeasuredBox = [[0.06, 2.55, 0.85], [0.423, 2.806, 1.15]];
const OVER_GUN: Readonly<Record<MerkavaMarkId, OverGunRecord>> = {
  merkava1b: { m2: [0.453, 2.112, 2.705], ammoBox: MK1_3_BOX },
  merkava2b: { m2: null, ammoBox: null },
  merkava2d: { m2: [0.45, 2.11, 2.70], ammoBox: MK1_3_BOX },
  merkava3c: { m2: [0.449, 2.109, 2.70], ammoBox: MK1_3_BOX },
  merkava3_baz: { m2: [0.449, 2.109, 2.70], ammoBox: MK1_3_BOX },
  merkava4b: { m2: [1.152, 2.812, 2.814], ammoBox: null },
};

// The roof guns' tops where the source gun is not the fleet MAG standing on its pintle at the mount's foot (hull frame,
// each source gun group's highest point): the Mk 1 to Mk 3's right gun hangs beside its mount, 0.18 m over the foot
// against the MAG's 0.28; the Mk 4B's rides a 0.4 m post, 0.47 over it. Null keeps the MAG on its foot (the left guns).
const ROOF_GUN_TOP: Readonly<Record<MerkavaMarkId, readonly (number | null)[]>> = {
  merkava1b: [2.884, null],
  merkava2b: [2.924, null],
  merkava2d: [null, 2.925],
  merkava3c: [2.943, null],
  merkava3_baz: [null, 2.999],
  merkava4b: [3.301],
};

// Pieces the source fit left out, measured from the same sources (release 262's gate round: the geometry gate's height,
// hull length and floater reds and the plan-hole census each traced to a source piece the fit dropped):
//  - the rear stowage racks' lowest slats, down their stern face to the racks' measured feet (the Mk 1/2 0.827, the
//    Mk 3 0.745; the fit stopped at 0.97 and 0.91);
//  - the Mk 1B's skirt panels' end tops: each panel's top falls from its middle strip (1.335) to 1.25 at its joint with
//    the next, across x 1.866-1.957 (the fit drew only the middle strips, so the plan read sky between the sponson and
//    the skirt over each joint);
//  - the front skirt hangers outboard of the sponsons on the 2B, 3C and Baz (x 1.863-1.938, z 2.253-2.479);
//  - the 3C's and Baz's left rear rack plate (the fit kept its end brackets);
//  - the Mk 4B's lamp pedestal between its measured base block (to 2.935) and the head's floor (from 2.992);
//  - the 2B's right rear mast as the source draws it: its collar (2.79-2.81) and head (to 3.2015) 0.107 across over
//    the 0.080 stem (source part 754, which the fit read as one 0.105 cylinder).
const mirrored = (a: MerkavaAddendum): MerkavaAddendum =>
  a[0] === 'post' ? ['post', a[1], -a[2], a[3], a[4], a[5], a[6]] : [a[0], a[1], -a[3], -a[2], a[4], a[5], a[6], a[7]] as MerkavaAddendum;
const both = (...rows: MerkavaAddendum[]): MerkavaAddendum[] => rows.flatMap((a) => [a, mirrored(a)]);
const MK12_STERN = both(['box', 'hullArmor', 0.395, 0.958, 0.827, 0.985, -4.003, -3.948]);
const MK3_STERN = both(['box', 'hullArmor', 0.461, 1.041, 0.745, 0.912, -4.192, -4.150]);
const FRONT_HANGERS = both(['box', 'hull', 1.863, 1.938, 1.33, 1.39, 2.253, 2.479]);
const MK3_REAR_RACK: MerkavaAddendum = ['box', 'hullArmor', -1.612, -1.148, 1.330, 1.355, -4.040, -3.964];
const MK1B_SKIRT_ENDS = both(...([
  [1.696, 2.0325], [1.689, 1.3595], [0.407, 0.7325], [0.400, 0.0735],
  [-0.883, -0.5535], [-0.789, -1.2155], [-2.172, -1.8425], [-2.177, -2.343],
] as const).map(([joint, strip]): MerkavaAddendum => ['ramp', 'hullArmor', 1.866, 1.957, joint, 1.25, strip, 1.335]));
const MAST_2B: readonly MerkavaAddendum[] = [
  ['post', 'turretPainted', -1.040, -2.4535, 0.0535, 2.79, 2.81],
  ['post', 'turretPainted', -1.040, -2.4535, 0.0535, 3.196, 3.2015],
];
const MEASURED_ADDENDA: Readonly<Record<MerkavaMarkId, readonly MerkavaAddendum[]>> = {
  merkava1b: [...MK12_STERN, ...MK1B_SKIRT_ENDS],
  merkava2b: [...MK12_STERN, ...FRONT_HANGERS, ...MAST_2B],
  merkava2d: MK12_STERN,
  merkava3c: [...MK3_STERN, ...FRONT_HANGERS, MK3_REAR_RACK],
  merkava3_baz: [...MK3_STERN, ...FRONT_HANGERS, MK3_REAR_RACK],
  merkava4b: [['post', 'turretDetail', -1.034, -1.662, 0.022, 2.930, 2.996]],
};

/** The 2B's source part 754 (the right rear mast, one 0.105 cylinder from 2.5025 to 3.2055) as its 0.080 stem up to the
 *  head (MAST_2B); a regenerated table that moves the part fails here rather than narrowing another. */
function stemOf2bMast(parts: SourcePart[]): SourcePart[] {
  const p = parts[754];
  if (!p || p[0] !== 1 || Math.abs(p[2]! + 1.040) > 0.002 || Math.abs(p[4]! + 2.453) > 0.002) {
    throw new Error('merkava2b: source part 754 is no longer the right rear mast');
  }
  parts[754] = p.map((v, i) => (i === 3 ? (2.5025 + 3.196) / 2 : i === 6 ? 3.196 - 2.5025 : i === 5 || i === 7 ? 0.080 : v));
  return parts;
}

/** Rows of numbers (the record's basket, boot, cradle and studs as plain rows: mapped as their literal tuples, their union
 *  is too large). */
type Rows = readonly (readonly number[])[];

/** The measured barrel profile with each radial step's outer corner chamfered (up to 6 mm along the bore, within the
 *  shorter neighbouring run): the sleeve clamps and evacuator bands read as machined collars, not flat washers. */
function chamfered(profile: readonly (readonly [number, number])[]): [number, number][] {
  const out = profile.map(([z, r]): [number, number] => [z, r]);
  for (let k = 1; k + 1 < out.length; k++) {
    const [za, ra] = out[k - 1]!, [zb, rb] = out[k]!;
    if (Math.abs(zb - za) > 1e-6 || Math.abs(rb - ra) < 0.004) continue;
    // a step at za: move the outer station of the pair along the bore into its own run
    const before = k >= 2 ? za - out[k - 2]![0] : 0, after = out[k + 1]![0] - zb;
    if (rb > ra && after > 0.012) out[k] = [zb + Math.min(0.006, Math.abs(rb - ra) * 0.6, after * 0.4), rb];
    else if (ra > rb && before > 0.012) out[k - 1] = [za - Math.min(0.006, Math.abs(rb - ra) * 0.6, before * 0.4), ra];
  }
  return out;
}

/** The gun: the measured barrel and gun mask in the gun frame, the trunnion `trunnionBack` behind the shell's nose course
 *  (the OBJ sources carry no pivots: the trunnion sits in the mask at the nose slot). The mask's sections run from the
 *  slot's back wall (the Mk 4: 0.55 m behind its nose) to its front, a section kept where it differs from the last kept
 *  by more than 12 mm. */
// the family's full elevation (the specs' gunElevationDeg): the mask's stations behind the trunnion swing down by it
const ELEVATION = 20 * Math.PI / 180;

function gunOf(r: SourceRecord, pivot: readonly [number, number], trunnionBack: number, top: OverGunRecord,
  hull: MerkavaHullSpec): MerkavaGunSpec {
  const [, axisY] = r.barrelAxis;
  const tz = r.noseZ - trunnionBack;
  const trunnion: [number, number, number] = [0, axisY - pivot[0], tz - pivot[1]];
  const barrel: RevolveStation[] = [[r.barrel[0]![0] - tz, 0], ...chamfered(r.barrel).map(([z, rr]): RevolveStation => [z - tz, rr]),
    [r.barrel[r.barrel.length - 1]![0] - tz, 0]];
  const bootRows = r.boot as unknown as Rows | null;
  const boot: RevolveStation[] | null = bootRows ? [[bootRows[0]![0]! - tz, 0],
    ...bootRows.map(([z, rr]): RevolveStation => [z! - tz, rr!]), [bootRows[bootRows.length - 1]![0]! - tz, 0]] : null;
  const start = r.slot ? r.slot.z0 - 0.05 : r.noseZ - 0.55;
  const sections = r.gunMask.filter(([z]) => z >= start);
  const kept: (typeof sections)[number][] = [];
  sections.forEach((m, i) => {
    const last = kept[kept.length - 1];
    if (!last || i === sections.length - 1 || m.slice(1).some((v, k) => Math.abs(v - last[k + 1]!) > 0.012)) kept.push(m);
  });
  // behind the trunnion the mask (inside the slot) keeps its underside 25 mm over the deck its swing passes, at full
  // elevation and at any turret yaw (the highest deck course within its reach of the ring centre)
  const deckWithin = (reach: number): number => {
    let y = -Infinity;
    for (let z = pivot[1] - reach; z <= pivot[1] + reach; z += 0.05) y = Math.max(y, lineAt(hull.top, z));
    return y;
  };
  const mantlet = kept.map(([z, x0, x1, y0, y1]) => {
    const back = tz - z, floor = back > 0 ? deckWithin(z - pivot[1] > 0 ? Math.hypot(z - pivot[1], x1) : pivot[1] - z) + 0.025
      + back * Math.sin(ELEVATION) : -Infinity;
    return [z - tz, x0, x1, Math.min(Math.max(y0, floor), y1 - 0.02) - axisY, y1 - axisY] as const;
  });
  const local = ([min, max]: MeasuredBox): MeasuredBox =>
    [[min[0], min[1] - axisY, min[2] - tz], [max[0], max[1] - axisY, max[2] - tz]];
  const overGun: MerkavaOverGun = {
    m2: top.m2 ? { rearZ: top.m2[0] - tz, muzzleZ: top.m2[1] - tz, axisY: top.m2[2] - axisY } : null,
    ammoBox: top.ammoBox ? local(top.ammoBox) : null,
  };
  // the over-gun mount's posts and plates in the slot (the M2 and its box stand on them, over the mask's top)
  const cradle = ((r.gunCradle ?? []) as unknown as Rows).filter((v) => v[2]! >= start)
    .map((v): MeasuredBox => local([[v[0]!, v[1]!, v[2]!], [v[3]!, v[4]!, v[5]!]]));
  return {
    model: r.barrel.some(([, rr]) => rr > 0.083) && r.barrel[r.barrel.length - 1]![1] > 0.079 ? 'MG25x' : 'M64',
    trunnion, muzzleZ: r.barrel[r.barrel.length - 1]![0] - tz, barrel, boot, mantlet, overGun, cradle,
  };
}

type PackedPlates = readonly { readonly o: readonly number[]; readonly q: readonly number[]; readonly t: number;
  readonly v: readonly number[]; readonly h: readonly (readonly number[])[] }[];
/** Face plates (platefit.py, basketplates.py) from their packing: millimetres, the frame in ten-thousandths. */
function platesOf(p: PackedPlates | undefined): ModulePlate[] | undefined {
  const pts = (flat: readonly number[]): SectionPoint[] => Array.from({ length: flat.length / 2 }, (_, i): SectionPoint => [flat[2 * i]! / 1000, flat[2 * i + 1]! / 1000]);
  return p?.map((pl) => ({
    o: [pl.o[0]! / 1000, pl.o[1]! / 1000, pl.o[2]! / 1000] as const, q: [pl.q[0]! / 1e4, pl.q[1]! / 1e4, pl.q[2]! / 1e4, pl.q[3]! / 1e4] as const,
    depth: pl.t / 1000, outer: pts(pl.v), holes: pl.h.map(pts),
  }));
}

type PackedSolids = readonly { readonly z: readonly number[]; readonly r: readonly (readonly number[])[] }[];
/** A module's plane-bounded runs (plateslab.py), where it carries them: each run's frame quaternion (ten-thousandths in
 *  the source) and its solids. */
function runsOf(m: object): ModuleRun[] | undefined {
  const u = (m as { readonly u?: readonly { readonly q: readonly number[]; readonly s: PackedSolids }[] }).u;
  return u?.map((run) => ({ q: [run.q[0]! / 1e4, run.q[1]! / 1e4, run.q[2]! / 1e4, run.q[3]! / 1e4] as const, solids: solidsOf(run.s) }));
}

/** Measured solids in metres (merkavaFamilySource.ts packs each solid's stations and its sections' x, y pairs in
 *  millimetres, every section after the first as its change from the one before). */
function solidsOf(packed: PackedSolids): ShellSolid[] {
  return packed.map((g) => {
    let acc: number[] = [];
    const rings = g.r.map((flat, s) => {
      acc = s === 0 ? [...flat] : acc.map((v, i) => v + flat[i]!);
      return Array.from({ length: acc.length / 2 }, (_, i): SectionPoint => [acc[2 * i]! / 1000, acc[2 * i + 1]! / 1000]);
    });
    return { z: g.z.map((v) => v / 1000), rings };
  });
}

/** The front fender box as measured (merkavaFamilySource.ts: xi, xo, z0, z1, top0, top1, bottom, side0). */
function fenderOf(r: SourceRecord): MerkavaFender | null {
  if (!r.fender) return null;
  const [xi, xo, z0, z1, top0, top1, bottom, side0] = r.fender;
  return { xi: xi!, xo: xo!, z0: z0!, z1: z1!, top0: top0!, top1: top1!, bottom: bottom!, side0: side0! };
}

/** A source part in metres (merkavaFamilySource.ts packs the centre, size and quaternion in thousandths and a loft's
 *  stations and sections in ten-thousandths; the kind, owner, role and loft axis are as they are). */
const decodePart = (p: SourcePart): SourcePart =>
  p.map((v, i) => (i === 0 || i === 1 || i === 12 || i === 13 ? v : v / (i >= 14 ? 10000 : 1000)));

/** The measured basket in metres (bars' ends in thousandths, radii in ten-thousandths; boxes' quaternions in
 *  ten-thousandths; its floor and panels as face plates). */
function basketOf(r: SourceRecord): MerkavaBasket | null {
  const bk = r.basket as unknown as { readonly b: Rows; readonly p: Rows; readonly f?: PackedPlates } | null;
  return bk ? { bars: bk.b.map((v) => v.map((n, i) => n / (i === 6 ? 10000 : 1000))),
    boxes: bk.p.map((v) => v.map((n, i) => n / (i >= 6 ? 10000 : 1000))), plates: platesOf(bk.f) ?? [] } : null;
}

const LOAD_KINDS = ['chest', 'ammo', 'cans', 'ammol'] as const;
/** The basket's load in metres: each piece's kind (0 chest, 1 ammunition cans, 2 jerrycans, 3 ammunition cans end to
 *  end), its centre in thousandths, its yaw and the floor's normal in ten-thousandths, a chest's size in thousandths or
 *  a row's count. */
function loadOf(r: object): BasketLoadItem[] {
  const rows = ((r as { readonly load?: Rows }).load ?? []) as Rows;
  return rows.map((v): BasketLoadItem => {
    const at = [v[1]! / 1000, v[2]! / 1000, v[3]! / 1000, v[4]! / 1e4, v[5]! / 1e4, v[6]! / 1e4] as const;
    return v[0] === 0 ? ['chest', ...at, v[7]! / 1000, v[8]! / 1000, v[9]! / 1000] : [LOAD_KINDS[v[0]!] as 'ammo' | 'ammol' | 'cans', ...at, v[7]!];
  });
}

function mark(id: MerkavaMarkId, hull: MerkavaHullSpec, trunnionBack: number): MerkavaMark {
  const src = MERKAVA_SOURCE[id], r = src.record;
  const pivot: readonly [number, number] = [r.deck, r.pivotZ];
  return {
    id, hull, gear: gearOf(r), fender: fenderOf(r), belly: r.belly?.map((st) => st.map((v) => v / 1000) as unknown as BellyStation) ?? null,
    pivot, shell: solidsOf(r.turretShell),
    modules: r.modules.map((m) => ({ side: m.side === 1 ? 'R' as const : 'L' as const, axis: m.axis === 0 ? 0 as const : 2 as const, solids: solidsOf(m.s),
      runs: runsOf(m), plates: platesOf((m as { readonly p?: PackedPlates }).p) })),
    solidParts: r.solidParts.map((p) => ({ owner: p.o === 1 ? 1 as const : 0 as const, role: p.r, loft: p.k === 4,
      axis: p.a === 0 ? 0 as const : 2 as const, solids: solidsOf(p.s) })), slot: r.slot,
    parts: id === 'merkava2b' ? stemOf2bMast(src.parts.map(decodePart)) : src.parts.map(decodePart), gun: gunOf(r, pivot, trunnionBack, OVER_GUN[id], hull),
    basket: basketOf(r), load: loadOf(r), studs: ((r.studs ?? []) as unknown as Rows).map((v) => v.map((n) => n / 1000)),
    roofGuns: r.mgs.map(([x, foot, z, z0, z1], i) => [x, foot, z, z0, z1, ROOF_GUN_TOP[id][i] ?? null] as const),
    antennas: r.antennas.map(([x, foot, z, h]) => [x, foot, z, h] as const),
    addenda: MEASURED_ADDENDA[id],
  };
}

export const MERKAVA_MARKS: Readonly<Record<MerkavaMarkId, MerkavaMark>> = Object.freeze({
  merkava1b: mark('merkava1b', MK12_HULL, 0.42),
  merkava2b: mark('merkava2b', MK12_HULL, 0.42),
  merkava2d: mark('merkava2d', MK12_HULL, 0.42),
  merkava3c: mark('merkava3c', MK3_HULL, 0.40),
  merkava3_baz: mark('merkava3_baz', MK3_HULL, 0.40),
  merkava4b: mark('merkava4b', MK4_HULL, 0.45),
});
