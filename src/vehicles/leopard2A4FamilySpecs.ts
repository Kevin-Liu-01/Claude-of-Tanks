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
  LEO2A4_TURRET, LEOPARD2A4_FAMILY_GUN, LEOPARD2A4_FAMILY_IDS, kitPlate, leopard2A4FamilyArmor, lineAtStations,
  type KitPlate, type Leopard2A4FamilyId,
} from './leopard2A4FamilyArmor.ts';
import { stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import type { FleetTankSpec } from './specContracts.ts';


const T = LEO2A4_TURRET, H = LEOPARD2_HULL;
const glacisY = (z: number): number => lineAtStations(H.deck, z);

/** A field on the upper glacis between the headlight pods, ahead of the driver's periscopes. */
const glacisField = (name: string, halfW: number, z0: number, z1: number): KitPlate =>
  kitPlate('hull', name, [-halfW, glacisY(z1) + 0.06, z1], [halfW, glacisY(z1) + 0.06, z1], [-halfW, glacisY(z0) + 0.06, z0],
    { kind: 'era' });

/** A layer over a cheek's face, `standM` ahead of it (sx +1 is the spec helpers' "R", +X). */
const cheekFace = (name: string, sx: 1 | -1, standM: number, kind: string): KitPlate => {
  const z = T.faceZ + standM, x0 = sx * T.slotHalfWidthM, x1 = sx * (sx > 0 ? T.faceLeftM : T.faceRightM);
  return sx > 0
    ? kitPlate('turret', name, [x0, T.floorY + 0.02, z], [x1, T.floorY + 0.02, z], [x0, T.blockTopY - 0.02, z], { kind })
    : kitPlate('turret', name, [x1, T.floorY + 0.02, z], [x0, T.floorY + 0.02, z], [x1, T.blockTopY - 0.02, z], { kind });
};

/** A cassette course on a skirt's outer face, the length of the run. */
const skirtCourse = (name: string, sx: 1 | -1, x: number): KitPlate => sx > 0
  ? kitPlate('hull', name, [x, 0.80, 3.10], [x, 0.80, -3.20], [x, 1.42, 3.10], { kind: 'era' })
  : kitPlate('hull', name, [-x, 0.80, -3.20], [-x, 0.80, 3.10], [-x, 1.42, -3.20], { kind: 'era' });

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
  leo2a4m_can: {},
  leo2a4_otco: { kitPlates: {
    a6m_upper_glacis_era: glacisField('a6m_upper_glacis_era', 0.98, 2.55, 3.30),
    a6m_turret_cheek_era_R: cheekFace('a6m_turret_cheek_era_R', 1, 0.05, 'era'),
    a6m_turret_cheek_era_L: cheekFace('a6m_turret_cheek_era_L', -1, 0.05, 'era'),
  } },
  leo2_improved: { kitPlates: {
    a7v_upper_glacis_era: glacisField('a7v_upper_glacis_era', 0.98, 2.55, 3.30),
    a7v_turret_cheek_layer_R: cheekFace('a7v_turret_cheek_layer_R', 1, 0.10, 'spaced'),
    a7v_turret_cheek_layer_L: cheekFace('a7v_turret_cheek_layer_L', -1, 0.10, 'spaced'),
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
      gun: LEOPARD2A4_FAMILY_GUN[id], foreSkirtDropM: EARLY_LEOPARD2_FORE_SKIRT_DROP_M, kitPlates: e.kitPlates,
    });
  }
}
