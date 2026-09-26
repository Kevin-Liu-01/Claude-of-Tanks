// Additive replicas approved 2026-09-25. Originals keep their saved identities,
// upgraded geometry and game equipment; these rows own independent frames.
import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs } from './fleetSpecRegistry.ts';
import { modernArmor } from './specHelpers.ts';
import { applyFleetLauncherMuzzles } from './fleetLauncherMuzzles.ts';
import type { FleetTankSpec } from './specContracts.ts';

export const IFV_REPLICA_IDS = ['spz_puma_s1_x','cv90_x','type89_x'] as const;
// Each replica keeps its original's gameplay era: identical combat tuning must
// sit in the same matchmaking/balance bracket (balancePeerOf only substitutes a
// vote inside one era/tier/role group).
const entries = [
  ['spz_puma_s1_x','spz_puma_s1','Puma S1 X','Germany',30,'modern'],
  ['cv90_x','cv90','CV9040C X','Sweden',40,'modern'],
  ['type89_x','type89_light_tiger','Type 89 X','Japan',35,'next-generation'],
] as const;
const registries=bindFleetRegistries(TANK_SPECS,MODEL_SOURCE,ALL_TANK_IDS);

function applyReplicaFrame(spec: FleetTankSpec): void {
  const puma=spec.id==='spz_puma_s1_x', swedish=spec.id==='cv90_x';
  spec.dims=puma
    ? {hullLengthM:7.60,overallLengthM:7.60,widthM:4.056,heightM:3.647,silhouetteHeightM:3.30}
    : swedish ? {hullLengthM:6.86,overallLengthM:7.0,widthM:3.38,heightM:2.96}
    : {hullLengthM:6.7918,overallLengthM:6.7918,widthM:3.2001,heightM:2.77};
  spec.visual.trackWidthM=puma?.489:swedish?.50:.45;
  spec.armor=modernArmor({
    hl:puma?3.8:3.40,hw:puma?1.90:swedish?1.69:1.60,inW:1.05,
    floor:puma?.36:swedish?.37:.48,trkTop:puma?1.33:1.14,roofY:puma?2.12:swedish?1.94:1.82,
    turretPivot:puma?[.434794,1.947494,-1.319322]:swedish?[0,1.78,-.76]:[.08,1.80,-.82],
    gunPivot:puma?[-.415291,.565616,.527876]:swedish?[0,.405,1.56]:[0,.295,1.20],
    barrelLenM:puma?3.258:swedish?2.75:2.774,barrelRadM:puma?.046:swedish?.070:.037,
    glacis:[75,285,390],lower:[58,210,275],side:[50,145,205],skirt:[10,25,60],rear:40,roof:48,
    tw:puma?.95:1.06,tFrontZ:puma?1.45:1.26,tRearZ:puma?-1.33:-1.27,tH:puma?.87:.78,
    cheek:[100,265,350],tSide:[70,165,245],tRear:50,tRoof:44,mantlet:[120,285,370],loader:false,
  });
  // Armor ratings are game abstractions. The receipts measure the real exterior
  // and the layout registry supplies the manned/unmanned crew arrangement.
}

// Real service ammunition names replace the originals' fictional upgrade
// suffixes. The CV9040C keeps its donor's actual Swedish round names: renaming
// its two APFSDS natures by type would collapse them into one duplicate slot.
const REPLICA_ROUND_NAMES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  spz_puma_s1_x: {APFSDS:'MK30-2 APFSDS-T', HE:'MK30-2 KETF ABM'},
  type89_x: {APFSDS:'KDE 35 mm APFSDS-T', HE:'KDE 35 mm HEI-T'},
};

function applyReplicaArmament(spec: FleetTankSpec, caliber: number): void {
  delete spec.gun.launcherMuzzles;
  delete spec.gun.muzzles;
  spec.gun.caliberMm=caliber;
  spec.gun.muzzleBoreSegments=24;
  const names=REPLICA_ROUND_NAMES[spec.id];
  for(const round of spec.gun.shells) {
    if(!round.guided){round.caliberMm=caliber;if(names?.[round.type])round.name=names[round.type];}
    else if(spec.id==='spz_puma_s1_x') {
      round.name='MELLS / Spike LR';round.caliberMm=152;round.launcherTubes=2;
    } else if(spec.id==='type89_x') {
      round.name='Type 79 Jyu-MAT';round.caliberMm=127;round.launcherTubes=2;round.count=6;
    }
  }
  if(spec.id==='cv90_x')spec.gun.shells=spec.gun.shells.filter(round=>!round.guided);
  applyFleetLauncherMuzzles(spec);
}

const newSpecs: Record<string,FleetTankSpec>={};
for(const [id,donor,name,nation,caliber,era] of entries) {
  const spec=cloneFleetVariant(registries.tankSpecs,id,donor,{name,nation,era,role:'ifv'});
  delete spec.label;delete spec.roster;delete spec.publicVisualFallback;
  spec.balancePeerOf=donor;
  applyReplicaFrame(spec);applyReplicaArmament(spec,caliber);newSpecs[id]=spec;
}
registerFleetSpecs(registries,IFV_REPLICA_IDS,newSpecs);

/** Synchronize combat tuning without borrowing the donor's physical assembly. */
export function synchronizeIfvReplicaCombatMetadata(): void {
  const fields=['hp','enginePowerHp','weightTons','topSpeedKmh','reverseSpeedKmh',
    'hullTraverseDegS','terrainResistance','pivotStyle','turretTraverseDegS',
    'gunPitchDegS','gunElevationDeg','gunDepressionDeg','gun'] as const;
  for(const [id,donor,,,caliber] of entries) {
    const spec=registries.tankSpecs[id];
    for(const field of fields)Object.assign(spec,{[field]:structuredClone(registries.tankSpecs[donor][field])});
    // Geometry and finalized anatomy belong to this replica. Replacing armor
    // here would discard its calibrated crew while retaining the finalized flag.
    applyReplicaArmament(spec,caliber);
  }
}
