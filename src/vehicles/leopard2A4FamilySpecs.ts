// The 2A4-era Leopard 2s on the release's construction (profiles/leopard2A4Family.ts; docs/references/tanks/
// leo2a4-family.md): the Leopard 2A4, 2A4 V, 2A4M, 2A4M CAN, 2A4 OTCO and the Leopard 2 Improved, rebuilt in place on the
// release-262 Leopard 2-pattern hull with the 2A4 turret derived from our Leopard 2A6 (the owner, 2026-10-28). Their
// combat data stands: every stat, the gun and its rounds, the paint, and every armour plate's protection (physical, KE and
// CE thickness, kind, ERA, module link) under its own name, with the trims keyed to the ids already applied. Only where the
// plates stand moves: onto the drawn hull and turret (leopard2A4FamilyArmor.ts), with each kit's own plates (ERA fields,
// appliqué layers) seated on its drawn surfaces.
//
// The Stridsvagn 121 (the owner, 2026-10-28) waits for its field suit's re-seat on this construction (the ghillie lane):
// its rebuild is on item/strv121-2a4-265 and ships with that row; this release keeps today's Strv 121 (Main).
//
// The re-envelope runs once, after every registration-time copy of these records (fleetRegistration.ts): the source-X
// studies leo2a6 and strv122 (second wave), leo2a5, leo2a5m, leo2a6m and leo2a7v, and leo2a6_ua (cloned from leo2a4_otco
// at registration) keep the envelopes they were tuned on.
import { LEOPARD2_HULL } from './leopard2HullDatums.ts';
import { EARLY_LEOPARD2_FORE_SKIRT_DROP_M } from './leopard2a3B4Armor.ts';
import {
  LEOPARD2A4_FAMILY_FRONT, LEOPARD2A4_FAMILY_GUN, LEOPARD2A4_FAMILY_IDS, kitPlate, leopard2A4FamilyArmor, lineAtStations,
  type KitPlate, type Leopard2A4FamilyId,
} from './leopard2A4FamilyArmor.ts';
import { stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { rightCheekPlate as chR, leftCheekPlate as chL, rightSidePlate as sR, leftSidePlate as sL } from './specHelpers.ts';
import type { FleetTankSpec } from './specContracts.ts';


const H = LEOPARD2_HULL;
const glacisY = (z: number): number => lineAtStations(H.deck, z);

/** A field on the upper glacis between the headlight pods, ahead of the driver's periscopes. */
const glacisField = (name: string, halfW: number, z0: number, z1: number): KitPlate =>
  kitPlate('hull', name, [-halfW, glacisY(z1) + 0.06, z1], [halfW, glacisY(z1) + 0.06, z1], [-halfW, glacisY(z0) + 0.06, z0],
    { kind: 'era' });

/** A cassette course on a skirt's carrier, the length of the run, at the cassettes' centre plane (leopard2A4A5nlKit.ts). */
const skirtCourse = (name: string, sx: 1 | -1, x: number): KitPlate => sx > 0
  ? kitPlate('hull', name, [x, 0.797, 3.171], [x, 0.797, -3.161], [x, 1.373, 3.171], { kind: 'era' })
  : kitPlate('hull', name, [-x, 0.797, -3.161], [-x, 0.797, 3.171], [-x, 1.373, -3.161], { kind: 'era' });

interface FamilyEnvelope {
  readonly kitPlates?: Readonly<Record<string, KitPlate>>;
  /** Published dimensions that follow the vehicle's identity (the 2A4's L/44 gun-forward length). */
  readonly dims?: Partial<FleetTankSpec['dims']>;
}

// The gun's depression by turret yaw on the construction, measured with tools/gun-depression-sweep.mjs at 26 mm. The
// square turret's guns run free to the rear quarters, where the engine deck and its stowage lift them; on the wedge
// turrets the 2A6 mantlet cover rides the 2A4's deeper trunnion, and its underside holds the gun over the deck and the
// sponsons' stowage at the sides.
const GUN_PITCH_BY_YAW_DEG: Readonly<Record<Leopard2A4FamilyId, NonNullable<FleetTankSpec['gunPitchByYawDeg']>>> = {
  leo2a4: [[0, -9], [20, -9], [21, -8.6], [24, -8.3], [26, -8.3], [28, -9], [138, -9], [143, -6.3], [147, -4.3],
    [149, -2.2], [150, -0.9], [152, 0.5], [153, 0.7], [156, 0.7], [157, 1.3], [158, 1.6], [160, 1.6], [163, 1],
    [178, 0.9], [180, 0.4]],
  leo2a4_v: [[0, -9], [20, -9], [21, -8.6], [24, -8.3], [26, -8.3], [28, -9], [138, -9], [143, -6.3], [147, -4.3],
    [149, -2.2], [150, -0.9], [152, 0.5], [153, 0.7], [156, 0.7], [157, 1.3], [158, 1.6], [159, 1.6], [160, 2.6],
    [163, 3], [171, 3], [173, 2.9], [176, 2.2], [177, 2.4], [180, 2.4]],
  leo2a4m: [[0, -9], [11, -9], [16, -8.4], [21, -8.4], [22, -7.8], [23, -7.5], [28, -7], [30, -7], [31, -7.3],
    [32, -7.7], [34, -9], [37, -9], [47, -5.7], [48, -5.5], [61, -5.5], [68, -7.1], [76, -9], [102, -9], [113, -6],
    [121, -4.3], [124, -3.7], [127, -3.5], [130, -3.4], [131, -2.8], [132, -2.3], [149, -1.5], [152, 0.5], [153, 0.7],
    [156, 0.7], [157, 1.3], [158, 1.6], [159, 1.6], [160, 2.6], [163, 3], [171, 3], [173, 2.9], [176, 2.2],
    [177, 2.4], [180, 2.4]],
  leo2a4m_can: [[0, -9], [20, -9], [21, -8.6], [24, -8.3], [26, -8.3], [28, -9], [135, -9], [137, -3.9], [138, -3],
    [139, -2.6], [147, -0.5], [148, 0.2], [149, 0.7], [153, 0.7], [154, 1.4], [156, 1.8], [159, 1.8], [165, 0.9],
    [166, 0.9], [167, 4.3], [168, 5.9], [170, 7.3], [172, 7.9], [173, 8], [176, 8], [178, 7.5], [180, 6.2]],
  leo2a4_otco: [[0, -9], [11, -9], [21, -7.8], [25, -6.9], [26, -6.2], [29, -6.1], [31, -6.7], [37, -6.7], [39, -6.8],
    [40, -7.6], [44, -6.8], [47, -5.7], [48, -5.5], [56, -5.5], [59, -3.6], [63, -3.4], [72, -3.5], [89, -4.9],
    [95, -4.2], [100, -4], [105, -4], [106, -3.6], [108, -3.2], [121, -1.8], [127, -1.4], [139, -1.4], [140, -1.5],
    [143, -1.9], [149, -0.5], [150, -0.4], [155, -0.4], [156, 0.8], [157, 1.7], [158, 1.9], [160, 1.9], [161, 1.5],
    [162, 0.6], [170, 0.5], [171, 0.8], [174, 0.9], [180, 0.8]],
  leo2_improved: [[0, -9], [11, -9], [16, -8.4], [26, -8.4], [28, -8.5], [29, -9], [37, -9], [47, -5.7], [48, -5.5],
    [53, -5.5], [54, -4.4], [56, -3.5], [59, -3.4], [69, -3.4], [72, -3.6], [74, -5.1], [87, -6.5], [88, -6.7],
    [90, -5.2], [95, -5], [108, -4.8], [116, -3.8], [118, -3.6], [119, -3.6], [120, -2.6], [138, -2.5], [148, -1.5],
    [151, -1.3], [152, 2.8], [153, 5.1], [154, 5.8], [159, 6.1], [161, 6.1], [163, 5.4], [164, 4.7], [165, 3.8],
    [166, 0.4], [173, 0.9], [180, 0.8]],
};

const ENVELOPES: Readonly<Record<Leopard2A4FamilyId, FamilyEnvelope>> = Object.freeze({
  // the Leopard 2A4's L/44 (the build it replaces drew a 2A6's L/55): 9.67 m gun forward
  leo2a4: { dims: { overallLengthM: 9.67 } },
  leo2a4_v: {},
  leo2a4m: { kitPlates: {
    a5nl_skirt_era_R: skirtCourse('a5nl_skirt_era_R', 1, 1.93),
    a5nl_skirt_era_L: skirtCourse('a5nl_skirt_era_L', -1, 1.93),
  } },
  // the CAN's cheek and side plates on its MEXAS-style appliqué faces, its one skirt plate a side on the stand-off
  // cassettes' faces (leopard2A4CanKit.ts: cheek wedges 0.45 m ahead of the faces at the slot, flank modules at wall + 0.21)
  leo2a4m_can: { kitPlates: {
    turret_cheek_R: { rig: 'turret', plate: chR('turret_cheek_R', 1, 0.475, 2.10, 1.387, 1.732, 0.12, 0.61) },
    turret_cheek_L: { rig: 'turret', plate: chL('turret_cheek_L', 1, 0.475, 2.10, 1.484, 1.692, 0.12, 0.61) },
    turret_side_R: { rig: 'turret', plate: sR('turret_side_R', 1, 1.387, 0.12, 1.387, 0.662, -1.10, 1.732) },
    turret_side_L: { rig: 'turret', plate: sL('turret_side_L', 1, 1.484, 0.12, 1.484, 0.662, -1.10, 1.692) },
    skirt_R: { rig: 'hull', plate: sR('skirt_R', 1, 1.84, 0.88, 1.84, 1.40, -2.83, 3.60) },
    skirt_L: { rig: 'hull', plate: sL('skirt_L', 1, 1.84, 0.88, 1.84, 1.40, -2.83, 3.60) },
  } },
  leo2a4_otco: { kitPlates: {
    // the OTCO's 50 tiles in chevron courses round the splash board, back to z 2.13 on the left (leopard2A4OtcoKit.ts)
    a6m_upper_glacis_era: glacisField('a6m_upper_glacis_era', 1.31, 2.13, 3.39),
    // the cheek fields on the wedges' sloped tops, 7 courses x 8 stations a side as on the old OTCO (leopard2A4OtcoKit.ts)
    a6m_turret_cheek_era_R: kitPlate('turret', 'a6m_turret_cheek_era_R', [0.283, 0.458, 2.685], [1.158, 0.478, 2.204],
      [0.276, 0.745, 1.807], { kind: 'era' }),
    a6m_turret_cheek_era_L: kitPlate('turret', 'a6m_turret_cheek_era_L', [-1.263, 0.427, 2.198], [-0.283, 0.444, 2.666],
      [-1.256, 0.729, 1.366], { kind: 'era' }),
  } },
  // the Improved's plates where its kit builds them (leopard2ImprovedKit.ts): the glacis field between the pods ahead of
  // the periscopes, the layered cheek blocks 0.10 m out along the wedges' normals, the deep skirts' faces
  leo2_improved: { kitPlates: {
    a7v_upper_glacis_era: glacisField('a7v_upper_glacis_era', 0.975, 2.47, 3.44),
    a7v_turret_cheek_layer_R: kitPlate('turret', 'a7v_turret_cheek_layer_R', [0.460, 0.21, 2.747], [1.202, 0.21, 2.289],
      [0.460, 0.42, 2.747], { kind: 'spaced' }),
    a7v_turret_cheek_layer_L: kitPlate('turret', 'a7v_turret_cheek_layer_L', [-1.289, 0.20, 2.292], [-0.418, 0.20, 2.750],
      [-1.289, 0.38, 2.292], { kind: 'spaced' }),
    skirt_heavy_R: { rig: 'hull', plate: sR('skirt_heavy_R', 1, 1.82, 0.55, 1.82, 1.38, 1.40, 3.16) },
    skirt_heavy_L: { rig: 'hull', plate: sL('skirt_heavy_L', 1, 1.82, 0.55, 1.82, 1.38, 1.40, 3.16) },
    skirt_rear_R: { rig: 'hull', plate: sR('skirt_rear_R', 1, 1.82, 0.55, 1.82, 1.38, -2.85, 1.40) },
    skirt_rear_L: { rig: 'hull', plate: sL('skirt_rear_L', 1, 1.82, 0.55, 1.82, 1.38, -2.85, 1.40) },
  } },
});

/**
 * Re-envelope the six records on the construction. Called once by fleetRegistration.ts after the registration-time
 * copies (source-X, second wave) and before the era fold.
 */
export function applyLeopard2A4FamilyEnvelopes(specs: Readonly<Record<string, FleetTankSpec>>): void {
  for (const id of LEOPARD2A4_FAMILY_IDS) {
    const spec = specs[id];
    if (!spec) throw new Error(`leopard2A4FamilySpecs: ${id} is not registered`);
    const e = ENVELOPES[id];
    stripSilhouetteDimensions(spec.dims);
    spec.gunPitchByYawDeg = GUN_PITCH_BY_YAW_DEG[id];
    if (e.dims) Object.assign(spec.dims, e.dims);
    spec.armor = leopard2A4FamilyArmor(id, spec.armor, {
      gun: LEOPARD2A4_FAMILY_GUN[id], front: LEOPARD2A4_FAMILY_FRONT[id], foreSkirtDropM: EARLY_LEOPARD2_FORE_SKIRT_DROP_M, kitPlates: e.kitPlates,
    });
  }
}
