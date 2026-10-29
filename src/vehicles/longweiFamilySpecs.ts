// The Longwei family's spec rows — release 264 (owner 2026-10-28: "make 4 new chinnese tannks combining variations of
// vt4a1, qilin, kunlun, annd ztz 99a2 with modernized versions of the lonngwei turret which i like the shape of";
// longweiFamilyConfig.ts). Each concept keeps its host's hull, hull armour, running gear and mobility, and takes the
// ZTZ-99 Longwei's turret: its turret plates, turret modules, turret crew, trunnion, 125 mm gun and fire control, on the
// host's ring. Spec data only: no builders, no Three.js.
// First-party: Kevin B. Liu (NOTICE.md).

import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { leftSidePlate, rightSidePlate } from './specHelpers.ts';
import { LONGWEI_FAMILY, LONGWEI_FAMILY_IDS } from './longweiFamilyConfig.ts';
import type { FleetTankSpec } from './specContracts.ts';

const entries: Record<string, FleetTankSpec> = {};
for (const m of LONGWEI_FAMILY) {
  const s = cloneFleetVariant(TANK_SPECS, m.id, m.host, { name: m.name, nation: 'China', era: 'modern', role: 'mbt' });
  delete s.label; delete s.roster; delete s.publicVisualFallback; delete s.balancePeerOf;
  entries[m.id] = s;
}
registerFleetSpecs(bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS), LONGWEI_FAMILY_IDS, entries);

let synchronized = false;
/** Runs after the national modernization sync (the Qilin's and Kunlun's rows are final then), before the fleet's era
 * fold, tier floors and size policy. */
export function synchronizeLongweiFamilyMetadata(): void {
  if (synchronized) return;
  synchronized = true;
  const turret = TANK_SPECS.ztz99_longwei;
  if (!turret) throw new Error('Longwei family: the ztz99_longwei turret donor is not registered');
  const turretEra = turret.armor.turretPlates.find((p) => p.kind === 'era' && p.era)?.era;
  if (!turretEra) throw new Error('Longwei family: the Longwei turret carries no ERA definition');
  for (const m of LONGWEI_FAMILY) {
    const s = TANK_SPECS[m.id], host = TANK_SPECS[m.host];
    if (!host) throw new Error(`${m.id}: host ${m.host} is not registered`);
    // the host's hull plates, hull modules and hull crew; the Longwei's turret plates, turret modules and turret crew
    s.armor = structuredClone(turret.armor);
    s.armor.hullPlates = structuredClone(host.armor.hullPlates);
    const turretModules = turret.armor.modules.filter((x) => x.turretLocal);
    const moved = new Set(turretModules.map((x) => x.module));
    s.armor.modules = structuredClone([...host.armor.modules.filter((x) => !x.turretLocal && !moved.has(x.module)), ...turretModules]);
    s.armor.crew = structuredClone([...host.armor.crew.filter((x) => !x.turretLocal), ...turret.armor.crew.filter((x) => x.turretLocal)]);
    // the side modules' cassettes (profiles/longwei.ts sideEra): seed sectors the anatomy generator fits over them
    if (m.kit.sideEra) {
      const era = { kind: 'era' as const, era: structuredClone(turretEra) };
      s.armor.turretPlates.push(
        leftSidePlate('turret_side_era_L', 15, 1.60, 0.23, 1.60, 0.65, -0.97, -0.03, era),
        rightSidePlate('turret_side_era_R', 15, 1.60, 0.23, 1.60, 0.65, -0.97, -0.03, era));
    }
    s.armor.turretPivot = [...m.kit.pivot];
    s.armor.gunPivot = [...turret.armor.gunPivot];
    s.armor.gunBarrel = { ...turret.armor.gunBarrel };
    s.armor.boundingRadiusM = Math.max(host.armor.boundingRadiusM, turret.armor.boundingRadiusM);
    // a modernized turret keeps its host's fire control and ammunition (concept capability packages are game balance:
    // every host fires a 125 mm, and the Longwei's own tier-VI package left the T-72 pair at a 0.25 fairness mean at
    // their hosts' tier); the Longwei's turret drives and gun range
    s.gun = structuredClone(host.gun);
    s.turretTraverseDegS = turret.turretTraverseDegS;
    s.gunPitchDegS = turret.gunPitchDegS;
    s.gunElevationDeg = turret.gunElevationDeg;
    s.gunDepressionDeg = turret.gunDepressionDeg;
    // the host's mobility under a turret about 3 t heavier than the Type 96B's and the VT-4A1's
    s.enginePowerHp = host.enginePowerHp;
    s.weightTons = host.weightTons + 3;
    s.topSpeedKmh = host.topSpeedKmh;
    s.reverseSpeedKmh = host.reverseSpeedKmh;
    s.hullTraverseDegS = host.hullTraverseDegS;
    s.terrainResistance = structuredClone(host.terrainResistance);
    s.hp = Math.max(host.hp, turret.hp);
    // the host's measured gun stops belonged to its own turret; this one's are measured on the concept
    delete s.gunPitchByYawDeg;
    if (m.gunPitchByYawDeg) s.gunPitchByYawDeg = m.gunPitchByYawDeg.map(([yaw, pitch]) => [yaw, pitch] as const);
    s.dims = {
      ...host.dims,
      overallLengthM: host.dims.hullLengthM / 2 + m.kit.pivot[2] + s.armor.gunPivot[2] + s.armor.gunBarrel.lengthM,
      ...(m.listedHeightM ? { heightM: m.listedHeightM } : {}),
    };
    stripSilhouetteDimensions(s.dims);
    s.visual = { ...host.visual, number: m.number };
    s.variantOf = m.host;
    s.description = `Original game concept: ${m.summary}.`;
  }
}
