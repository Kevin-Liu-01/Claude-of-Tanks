// The 2A4-era Leopard 2s on the release's construction (profiles/leopard2A4Family.ts; docs/references/tanks/
// leo2a4-family.md): the Leopard 2A4, 2A4 V, 2A4M, 2A4M CAN, 2A4 OTCO and the Leopard 2 Improved, rebuilt in place on the
// release-262 Leopard 2-pattern hull with the 2A4 turret derived from our Leopard 2A6 (the owner, 2026-10-28). Their
// combat data stands: every stat, the gun and its rounds, the paint, and every armour plate's protection (physical, KE and
// CE thickness, kind, ERA, module link) under its own name, with the trims keyed to the ids already applied. Only where the
// plates stand moves: onto the drawn hull and turret (leopard2A4FamilyArmor.ts), with each kit's own plates (ERA fields,
// appliqué layers) seated on its drawn surfaces.
//
// The re-envelope runs once, after every registration-time copy of these records (fleetRegistration.ts): the source-X
// studies leo2a6 (second wave), leo2a5, leo2a5m, leo2a6m and leo2a7v, and the variants cloned at registration (leo2a6_ua
// from leo2a4_otco, strv121 from leo2a4_v), keep the envelopes they were tuned on.
import { LEOPARD2_HULL } from './leopard2HullDatums.ts';
import { EARLY_LEOPARD2_FORE_SKIRT_DROP_M } from './leopard2a3B4Armor.ts';
import {
  LEO2A4_TURRET, LEOPARD2A4_FAMILY_FRONT, LEOPARD2A4_FAMILY_GUN, LEOPARD2A4_FAMILY_IDS, kitPlate, leopard2A4FamilyArmor, lineAtStations,
  type KitPlate, type Leopard2A4FamilyId,
} from './leopard2A4FamilyArmor.ts';
import { stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { rightCheekPlate as chR, leftCheekPlate as chL, rightSidePlate as sR, leftSidePlate as sL } from './specHelpers.ts';
import type { FleetTankSpec } from './specContracts.ts';


const T = LEO2A4_TURRET, H = LEOPARD2_HULL;
const glacisY = (z: number): number => lineAtStations(H.deck, z);

/** A field on the upper glacis between the headlight pods, ahead of the driver's periscopes. */
const glacisField = (name: string, halfW: number, z0: number, z1: number): KitPlate =>
  kitPlate('hull', name, [-halfW, glacisY(z1) + 0.06, z1], [halfW, glacisY(z1) + 0.06, z1], [-halfW, glacisY(z0) + 0.06, z0],
    { kind: 'era' });

/** A layer over a 2A6-look wedge's face, `standM` out along its normal (sx +1 is the spec helpers' "R", +X). */
const wedgeFace = (name: string, sx: 1 | -1, standM: number, kind: string): KitPlate => {
  const W = T.wedge, xi = sx > 0 ? W.innerLeft : W.innerRight, xo = sx > 0 ? W.shoulderLeft : W.shoulderRight;
  const dx = xo - xi, dz = W.shoulderZ - W.tipZ, n = Math.hypot(dx, dz), ox = sx * -dz / n * standM, oz = dx / n * standM;
  const p0: [number, number, number] = [sx * xi + ox, 0.14, W.tipZ + oz], p1: [number, number, number] = [sx * xo + ox, 0.14, W.shoulderZ + oz];
  const p3: [number, number, number] = [sx * xi + ox, 0.56, W.tipZ + oz - 0.10];
  return sx > 0 ? kitPlate('turret', name, p0, p1, p3, { kind }) : kitPlate('turret', name, p1, p0, [p1[0], 0.56, p1[2] - 0.10], { kind });
};

/** A cassette course on a skirt's carrier, the length of the run, at the cassettes' centre plane (leopard2A4A5nlKit.ts). */
const skirtCourse = (name: string, sx: 1 | -1, x: number): KitPlate => sx > 0
  ? kitPlate('hull', name, [x, 0.797, 3.171], [x, 0.797, -3.161], [x, 1.373, 3.171], { kind: 'era' })
  : kitPlate('hull', name, [-x, 0.797, -3.161], [-x, 0.797, 3.171], [-x, 1.373, -3.161], { kind: 'era' });

interface FamilyEnvelope {
  readonly kitPlates?: Readonly<Record<string, KitPlate>>;
  /** Published dimensions that follow the vehicle's identity (the 2A4's L/44 gun-forward length). */
  readonly dims?: Partial<FleetTankSpec['dims']>;
}

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
    skirt_R: { rig: 'hull', plate: sR('skirt_R', 1, 1.96, 0.88, 1.96, 1.40, -2.83, 3.60) },
    skirt_L: { rig: 'hull', plate: sL('skirt_L', 1, 1.96, 0.88, 1.96, 1.40, -2.83, 3.60) },
  } },
  leo2a4_otco: { kitPlates: {
    a6m_upper_glacis_era: glacisField('a6m_upper_glacis_era', 0.98, 2.55, 3.30),
    a6m_turret_cheek_era_R: wedgeFace('a6m_turret_cheek_era_R', 1, 0.05, 'era'),
    a6m_turret_cheek_era_L: wedgeFace('a6m_turret_cheek_era_L', -1, 0.05, 'era'),
  } },
  // the Improved's plates where its kit builds them (leopard2ImprovedKit.ts): the glacis field between the pods ahead of
  // the periscopes, the layered cheek blocks 0.10 m out along the wedges' normals, the deep skirts' faces
  leo2_improved: { kitPlates: {
    a7v_upper_glacis_era: glacisField('a7v_upper_glacis_era', 0.975, 2.47, 3.44),
    a7v_turret_cheek_layer_R: kitPlate('turret', 'a7v_turret_cheek_layer_R', [0.460, 0.21, 2.747], [1.202, 0.21, 2.289],
      [0.460, 0.42, 2.747], { kind: 'spaced' }),
    a7v_turret_cheek_layer_L: kitPlate('turret', 'a7v_turret_cheek_layer_L', [-1.289, 0.20, 2.292], [-0.418, 0.20, 2.750],
      [-1.289, 0.38, 2.292], { kind: 'spaced' }),
    skirt_heavy_R: { rig: 'hull', plate: sR('skirt_heavy_R', 1, 1.965, 0.55, 1.965, 1.38, 1.40, 3.16) },
    skirt_heavy_L: { rig: 'hull', plate: sL('skirt_heavy_L', 1, 1.965, 0.55, 1.965, 1.38, 1.40, 3.16) },
    skirt_rear_R: { rig: 'hull', plate: sR('skirt_rear_R', 1, 1.965, 0.55, 1.965, 1.38, -2.85, 1.40) },
    skirt_rear_L: { rig: 'hull', plate: sL('skirt_rear_L', 1, 1.965, 0.55, 1.965, 1.38, -2.85, 1.40) },
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
    if (e.dims) Object.assign(spec.dims, e.dims);
    spec.armor = leopard2A4FamilyArmor(id, spec.armor, {
      gun: LEOPARD2A4_FAMILY_GUN[id], front: LEOPARD2A4_FAMILY_FRONT[id], foreSkirtDropM: EARLY_LEOPARD2_FORE_SKIRT_DROP_M, kitPlates: e.kitPlates,
    });
  }
}
