// ZTZ-20 (release 262), its turret testbed the ZTZ-20 Prototype and the pre-production ZTZ-100: the gun-tank stages of
// the ZTZ-20 family (ztz20Family.ts).
// The ZTZ-100 Prototype testbed keeps its owner-approved missile turret on the same hull (ztz100Prototype.ts).
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import { buildZtz20Hull, buildZtz20Turret, markZtz20Hull, ztz20Receipt, type Ztz20Stage } from './ztz20Family.ts';

function buildGunTank(stage: Ztz20Stage): (P: TankBuilderPort) => void {
  return (P) => {
    // the measured fixed armour (skirts, cheeks, pods, glacis tiles) carries the shadow silhouette
    P.additionalShadowSources = { hull: ['hullExternalArmor'], turret: ['turretExternalArmor'] };
    buildZtz20Hull(P, stage);
    buildZtz20Turret(P, stage);
    markZtz20Hull(P);
    if (P.geometryReceipt) P.hullG.userData.ztz20Receipt = ztz20Receipt(stage);
  };
}

export const ZTZ20_PROFILES = Object.freeze({
  ztz20: Object.freeze({ build: buildGunTank('ztz20') }),
  ztz20_prototype: Object.freeze({ build: buildGunTank('ztz20_prototype') }),
  ztz100: Object.freeze({ build: buildGunTank('ztz100') }),
}) satisfies VehicleProfileRecord;
