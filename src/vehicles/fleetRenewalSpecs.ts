// Owner-directed September fleet rebuilds. Donor shapes are explicit; the
// four hybrids below are original game concepts, not historical variants.
import {TANK_SPECS,MODEL_SOURCE,ALL_TANK_IDS} from './specs.ts';
import {bindFleetRegistries,cloneFleetVariant,registerFleetSpecs,stripSilhouetteDimensions} from './fleetSpecRegistry.ts';
import {createT62MV1XArmorZones} from './t62mv1XArmor.ts';
import {leftSidePlate,rightSidePlate} from './specHelpers.ts';
import type {FleetTankSpec} from './specContracts.ts';

export const FLEET_RENEWAL_NEW_IDS=['type96_72_long','type96_80_feng','type96_72m_lei','t72_rys'] as const;
const registry=bindFleetRegistries(TANK_SPECS,MODEL_SOURCE,ALL_TANK_IDS);
const entries=[
  ['type96_72_long','type96b_x','Type 96-72 Lóng (Concept)','China'],
  ['type96_80_feng','type96b_x','Type 96-80 Fēng (Concept)','China'],
  ['type96_72m_lei','type96b_x','Type 96-72M Léi (Concept)','China'],
  ['t72_rys','t80u_x','T-72 Ryś (Concept)','Poland'],
] as const;
const additions:Record<string,FleetTankSpec>={};
for(const [id,donor,name,nation] of entries){
  const s=cloneFleetVariant(TANK_SPECS,id,donor,{name,nation,era:'modern',role:'mbt'});
  delete s.label;delete s.roster;delete s.publicVisualFallback;delete s.balancePeerOf;
  s.visual={...s.visual,number:id==='t72_rys'?'204':id==='type96_72_long'?'721':id==='type96_80_feng'?'801':'722'};
  if(id==='t72_rys')s.visual={...s.visual,scheme:'nato',base:'#49543c',weather:'#66644f',patches:['#252e25','#716043']};
  additions[id]=s;
}
registerFleetSpecs(registry,FLEET_RENEWAL_NEW_IDS,additions);

export const FLEET_RENEWAL_DONORS=Object.freeze({
  t72b3m:'t72b3m_x',t72bu:'t72bu_x',t80u:'t80u_x',
  t64bv1:'t72b3_x',ua_t64bv:'t72b3_x',t72m1_jaguar:'t72b3_x',
  t62mv1_x:'t62mv1',t72_rys:'t80u_x',
});
let synchronized=false;
function copyPhysicalFrame(s:FleetTankSpec,donor:FleetTankSpec):void{
  s.dims=structuredClone(donor.dims);stripSilhouetteDimensions(s.dims);
  s.armor=structuredClone(donor.armor);
  s.visual.trackWidthM=donor.visual.trackWidthM;
}
// A hybrid may move a module across the ring (the Type 96 radio is in the
// turret while the T-80 radio is in the hull). Keep the installed turret's
// module once; concatenating owner slices would create two damage rolls.
function hybridModules(hull: FleetTankSpec, turret: FleetTankSpec) {
  const upper=turret.armor.modules.filter(m=>m.turretLocal);
  const moved=new Set(upper.map(m=>m.module));
  return structuredClone([...hull.armor.modules.filter(m=>!m.turretLocal&&!moved.has(m.module)),...upper]);
}
/** Runs after source-donor calibration, before anatomy and global size policy. */
export function synchronizeFleetRenewalMetadata():void{
  if(synchronized)return;
  synchronized=true;
  // Snapshot before any reverse donor links are updated (the historical X
  // registrations originated from these older slots).
  const donors=structuredClone(TANK_SPECS);
  for(const [id,donor] of Object.entries(FLEET_RENEWAL_DONORS))copyPhysicalFrame(TANK_SPECS[id],donors[donor]);
  TANK_SPECS.t72b3m.name='T-72B3M obr. 2022';
  TANK_SPECS.t72b3m_x.name='T-72B3M obr. 2016';
  // Owner-directed turret transplants keep hull-local damage owners and use
  // the complete donor turret's plates, gun, crew and turret-local modules.
  const transplant=(id:string,upperId:string,pivot:[number,number,number])=>{
    const target=TANK_SPECS[id],upper=donors[upperId],lower=structuredClone(target);
    target.armor=structuredClone(upper.armor);
    target.armor.hullPlates=lower.armor.hullPlates;
    target.armor.modules=hybridModules(lower,upper);
    target.armor.crew=[...lower.armor.crew.filter(c=>!c.turretLocal),...target.armor.crew.filter(c=>c.turretLocal)];
    target.armor.turretPivot=pivot;target.gun=structuredClone(upper.gun);
    target.gunElevationDeg=upper.gunElevationDeg;target.gunDepressionDeg=upper.gunDepressionDeg;
    target.dims.heightM=upper.dims.heightM-upper.armor.turretPivot[1]+pivot[1];
    target.dims.overallLengthM=lower.dims.hullLengthM/2+pivot[2]+target.armor.gunPivot[2]+target.armor.gunBarrel.lengthM;
  };
  transplant('t72b3m','t90sm_x',[.008,1.545,.114315]);
  transplant('t62mv1_x','t72b_1987_x',[0,1.4804,.676]);
  // The T-62 chassis now carries the complete 125 mm T-72B 1987 upper assembly.
  TANK_SPECS.t62mv1_x.armor.turretPivot=[0,1.4804,.676];
  const t62Era=createT62MV1XArmorZones();
  // The 1975 chassis has an exposed five-wheel course: the donor record's
  // spaced rubber-skirt planes (x +-1.83, from the superseded MV-era model)
  // stand in open air beside the wheels, so the rebuild drops them.
  TANK_SPECS.t62mv1_x.armor.hullPlates=TANK_SPECS.t62mv1_x.armor.hullPlates
    .filter(p=>!(p.kind==='spaced'&&!p.era&&/^skirt(?:_rubber)?_[LR]$/.test(p.name)));
  TANK_SPECS.t62mv1_x.armor.hullPlates.push(...t62Era.hullPlates);
  // The rebuilt MV-1 adds two independently removable side fields beyond
  // the former four-zone package; gameplay must cover those new cassettes.
  const sideEra={kind:'era',era:{...t62Era.hullPlates[0].era!}};
  TANK_SPECS.t62mv1_x.armor.hullPlates.push(
    leftSidePlate('skirt_era_L',15,1.67,.895,1.67,1.325,-2.215,1.915,sideEra),
    rightSidePlate('skirt_era_R',15,1.67,.895,1.67,1.325,-2.215,1.915,sideEra),
  );
  for(const id of ['amx30','amx30b2']) {
    TANK_SPECS[id].armor.turretPivot=[0,1.60,-.05];
    TANK_SPECS[id].armor.gunPivot=[0,.33,1.30];
    TANK_SPECS[id].armor.gunBarrel.lengthM=4.95;
  }
  TANK_SPECS.t72b3m.dims.widthM=4.10;
  const bmpt=TANK_SPECS.bmpt_terminator2, hull=donors.t80u_x;
  bmpt.dims={...hull.dims,overallLengthM:hull.dims.hullLengthM,heightM:3.33};stripSilhouetteDimensions(bmpt.dims);
  bmpt.armor.hullPlates=structuredClone(hull.armor.hullPlates);
  bmpt.armor.modules=hybridModules(hull,bmpt);
  bmpt.armor.turretPivot=[0,1.565,.07187];bmpt.armor.gunPivot=[0,.50,.36];
  bmpt.armor.gunBarrel={lengthM:3.22,radiusM:.033};
  bmpt.visual.trackWidthM=hull.visual.trackWidthM;
  const variants=[['type96_72_long','t72b3_x',1.475,.065591],['type96_80_feng','t80u_x',1.565,.07187],['type96_72m_lei','t72b3m_x',1.545,.114315]] as const;
  for(const [id,donor,y,z] of variants){
    const s=TANK_SPECS[id],base=donors[donor],turret=donors.type96b_x;
    s.dims={...base.dims,overallLengthM:base.dims.hullLengthM/2+z+1.75+4.92211,heightM:3.016-1.6+y};stripSilhouetteDimensions(s.dims);
    s.armor=structuredClone(turret.armor);
    s.armor.hullPlates=structuredClone(base.armor.hullPlates);
    if(id!=='type96_80_feng')s.armor.turretPlates.push(...structuredClone(base.armor.turretPlates.filter(p=>p.era)));
    s.armor.modules=hybridModules(base,s);
    s.armor.crew=[...structuredClone(base.armor.crew.filter(m=>!m.turretLocal)),...s.armor.crew.filter(m=>m.turretLocal)];
    s.armor.turretPivot=[0,y,z];s.visual.trackWidthM=base.visual.trackWidthM;
    for(const field of ['enginePowerHp','weightTons','topSpeedKmh','reverseSpeedKmh','hullTraverseDegS','terrainResistance','pivotStyle'] as const)
      Object.assign(s,{[field]:structuredClone(base[field])});
  }
}
