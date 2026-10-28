// Owner-directed September fleet rebuilds. Donor shapes are explicit; the
// four hybrids below are original game concepts, not historical variants.
import {TANK_SPECS,MODEL_SOURCE,ALL_TANK_IDS} from './specs.ts';
import {T80UK_X_GUN_PITCH_BY_YAW_DEG} from './t80uXArmor.ts';
import {bindFleetRegistries,cloneFleetVariant,registerFleetSpecs,stripSilhouetteDimensions} from './fleetSpecRegistry.ts';
import {createT62MV1XArmorZones} from './t62mv1XArmor.ts';
import {applyT64PhysicalFrame,T64_DATUMS} from './t64Armor.ts';
import {modernArmor,leftSidePlate,rightSidePlate,plate} from './specHelpers.ts';
import {OPLOT_FLANK_CASSETTE,oplotFlankCassetteSeat} from './oplotFlankLayout.ts';
import type {FleetTankSpec} from './specContracts.ts';

/** Release 227: each Type 96 concept's mechanical gun clearance (absolute turret yaw, minimum pitch, degrees;
 * sim/gunPitchLimits.ts), with its mantlet boot clipped clear of its host (sinoSovietConcepts.ts BOOT_FLOOR). The lowest
 * clash-free pitch of the whole gun against every hull triangle was measured at 2.5-degree yaw steps (both sides) and
 * each curve keeps at least 1 degree above every station; type96MantletClearance.selftest.mjs sweeps them.
 * Lóng (T-72B3 deck): full depression to 132.5 degrees, -5.25..-6.75 to 157.5, then the barrel meets the rear deck's
 * fittings (y 1.61 at x ±0.5, z -2.8..-3.2) even level: it needs +3.75..+6.25 at 162.5-177.5. Fēng (T-80U deck): full
 * depression to 147.5, -6..-6.5 to 157.5, -1.75..-4.25 behind. Léi (T-72B3M deck): the side armour and fittings at
 * 32.5-35 (-6, -6.75), -2..-5.75 from 132.5 to 160, then +1.75..+2.5 behind.
 * The 2026-10-20 follow-up (tools/gun-depression-sweep.mjs: the whole gun 26 mm off every hull mesh at every degree,
 * nationalGunClearance.selftest.mjs) holds each curve and adds where it was short: Lóng's side rubber at 32-35 (-6.2)
 * and its deck from 128 (-5.8..-3.4); Fēng's deck at 143-149; Léi's side armour at 27-54 (down to -4.7 at 49-51), its
 * deck from 122 and its mantlet over the deck at 148-158 (+1.5). */
const CONCEPT_GUN_PITCH_BY_YAW_DEG:Readonly<Record<'type96_72_long'|'type96_80_feng'|'type96_72m_lei',readonly (readonly [number,number])[]>>={
  type96_72_long:[[0,-7],[30,-7],[32,-6.2],[35,-6.2],[38,-7],[127,-7],[130,-5.8],[135,-4.2],[144,-3.8],[145,-3.4],[147,-3.4],[149,-3.6],[151,-4.2],[156,-4.2],[157,-1.9],[159,7.3],[180,7.3]],
  type96_80_feng:[[0,-7],[143,-7],[148,-5],[156,-5],[158,-3.4],[160,0],[180,0]],
  type96_72m_lei:[[0,-7],[27,-7],[30,-5.3],[31,-5],[36,-5],[37,-5.3],[40,-7],[41,-6.5],[42,-6.3],[44,-6.3],[46,-6],[49,-4.7],[51,-4.7],[52,-5.1],[54,-7],[122,-7],[123,-6.2],[124,-5.5],[126,-5.5],[128,-6.2],[129,-5.2],[130,-3.5],[131,-2.9],[132,-1.4],[133,-0.6],[134,-0.5],[138,-0.5],[139,-0.1],[142,-0.1],[145,-1],[147,-0.4],[148,0.8],[149,1.5],[158,1.5],[160,3.5],[180,3.5]],
};
/** Release 230 (the gun-hull lane): the T-72 Ryś rides the T-80U X casting's raised ring (t80uXArmor.ts
 * T80U_X_RING_RAISE_M; its spec takes the T-80U's raised frame). Its main-gun depression by absolute turret yaw (degrees; sim/gunPitchLimits.ts), measured with
 * tools/gun-depression-sweep.mjs (1914 s): no mount conflict at any yaw, full depression to 145, then the engine deck's
 * grilles and fittings (to -4 at 150-157, -0.8 at 171-175). nationalGunClearance.selftest.mjs holds it at 25 mm. */
const T72_RYS_GUN_PITCH_BY_YAW_DEG=Object.freeze([[0,-5],[145,-5],[150,-4],[152,-4],[156,-4.4],[157,-4],[158,-2.9],[159,-2.5],
  [162,-2],[164,-1.8],[169,-1.5],[170,-1],[171,-0.8],[175,-0.8],[176,-0.9],[178,-1.9],[180,-1.9]] as const);
export const FLEET_RENEWAL_NEW_IDS=['type96_72_long','type96_80_feng','type96_72m_lei','t72_rys'] as const;
const registry=bindFleetRegistries(TANK_SPECS,MODEL_SOURCE,ALL_TANK_IDS);
const entries=[
  ['type96_72_long','type96b','Type 96-72 Lóng (Concept)','China'],
  ['type96_80_feng','type96b','Type 96-80 Fēng','China'],
  ['type96_72m_lei','type96b','Type 96-72M Léi','China'],
  ['t72_rys','t80u','T-72 Ryś (Concept)','Poland'],
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
  t72b3m_2022:'t72b3m_2016',t72bu_1989:'t72bu',t80uk:'t80u',
  t64bv1:'t72b3',t64bv_donbas:'t72b3',t72m1_jaguar:'t72b3',
  t62mv1:'t62_1975',t72_rys:'t80u',
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
  // registrations originated from these older slots). (2026-10-26, the boot census) Only the donors read below: a clone
  // of the whole fleet was the boot screen's largest single cost in the fleet chunk's evaluation. A read outside the
  // list throws at import, so a donor added below is listed here with it.
  const donorIds=new Set([...Object.values(FLEET_RENEWAL_DONORS),'t90sm','t72b_1987','t62_1975','t80u','t84','t72b3m_2016','t72b3','type96b']);
  const snapshot=Object.fromEntries([...donorIds].map(id=>[id,structuredClone(TANK_SPECS[id])])) as Record<string,FleetTankSpec>;
  const donors=new Proxy(snapshot,{get(target,id){
    if(typeof id==='string'&&!(id in target))throw new Error(`fleet renewal: donor '${id}' is not in the snapshot`);
    return target[id as string];
  }});
  for(const [id,donor] of Object.entries(FLEET_RENEWAL_DONORS))copyPhysicalFrame(TANK_SPECS[id],donors[donor]);
  // 262: the true T-64s (t64FamilySpecs.ts) take the T-64 frame (t64Armor.ts) on the T-72B3's balanced combat record
  applyT64PhysicalFrame(TANK_SPECS.t64bv,donors.t72b3,'bv',T64_DATUMS.dims);
  applyT64PhysicalFrame(TANK_SPECS.t64b1v_2022,donors.t72b3,'b1v2022',{...T64_DATUMS.dims,widthM:3.72});
  applyT64PhysicalFrame(TANK_SPECS.t64bm1m,donors.t72b3,'bm1m',{...T64_DATUMS.dims,widthM:3.61});
  applyT64PhysicalFrame(TANK_SPECS.pt64_tur,donors.t72b3,'tur',{...T64_DATUMS.dims,widthM:3.55});
  TANK_SPECS.t72_rys.gunPitchByYawDeg=T72_RYS_GUN_PITCH_BY_YAW_DEG;
  // release 231: the T-80UK's own measured stops (its command kit over the rear deck; t80uXArmor.ts)
  TANK_SPECS.t80uk.gunPitchByYawDeg=T80UK_X_GUN_PITCH_BY_YAW_DEG;
  TANK_SPECS.t72b3m_2022.name='T-72B3M obr. 2022';
  TANK_SPECS.t72b3m_2016.name='T-72B3M obr. 2016';
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
  transplant('t72b3m_2022','t90sm',[.008,1.545,.114315]);
  // 247: the transplanted turret sits on the T-62's deck (t62Modernization.ts), 90 mm over the T-62 dome's own seat
  transplant('t62mv1','t72b_1987',[0,1.570,.676]);
  // The T-62 chassis now carries the complete 125 mm T-72B 1987 upper assembly.
  // It keeps its balance peer's fire control: the copied 1987 dispersion and aim
  // time (a modern-era floor, 0.62x its cold-war tier-7 peers) were a side effect
  // of copying the gun, not part of the transplant (fleetBalance.selftest).
  Object.assign(TANK_SPECS.t62mv1.gun,{baseAccuracy:donors.t62_1975.gun.baseAccuracy,aimTimeS:donors.t62_1975.gun.aimTimeS});
  TANK_SPECS.t62mv1.armor.turretPivot=[0,1.570,.676];
  const t62Era=createT62MV1XArmorZones();
  // The 1975 chassis has an exposed five-wheel course: the donor record's
  // spaced rubber-skirt planes (x +-1.83, from the superseded MV-era model)
  // stand in open air beside the wheels, so the rebuild drops them.
  TANK_SPECS.t62mv1.armor.hullPlates=TANK_SPECS.t62mv1.armor.hullPlates
    .filter(p=>!(p.kind==='spaced'&&!p.era&&/^skirt(?:_rubber)?_[LR]$/.test(p.name)));
  TANK_SPECS.t62mv1.armor.hullPlates.push(...t62Era.hullPlates);
  // The rebuilt MV-1 adds two independently removable side fields beyond
  // the former four-zone package; gameplay must cover those new cassettes.
  const sideEra={kind:'era',era:{...t62Era.hullPlates[0].era!}};
  TANK_SPECS.t62mv1.armor.hullPlates.push(
    leftSidePlate('skirt_era_L',15,1.67,.895,1.67,1.325,-2.215,1.915,sideEra),
    rightSidePlate('skirt_era_R',15,1.67,.895,1.67,1.325,-2.215,1.915,sideEra),
  );
  for(const id of ['amx30','amx30b2']) {
    TANK_SPECS[id].armor.turretPivot=[0,1.60,-.05];
    TANK_SPECS[id].armor.gunPivot=[0,.33,1.30];
    TANK_SPECS[id].armor.gunBarrel.lengthM=4.95;
  }
  TANK_SPECS.t72b3m_2022.dims.widthM=4.10;
  const bmpt=TANK_SPECS.bmpt_terminator2, hull=donors.t80u;
  bmpt.dims={...hull.dims,overallLengthM:hull.dims.hullLengthM,heightM:3.33};stripSilhouetteDimensions(bmpt.dims);
  bmpt.armor.hullPlates=structuredClone(hull.armor.hullPlates);
  bmpt.armor.modules=hybridModules(hull,bmpt);
  bmpt.armor.turretPivot=[0,1.565,.07187];bmpt.armor.gunPivot=[0,.50,.36];
  bmpt.armor.gunBarrel={lengthM:3.22,radiusM:.033};
  bmpt.visual.trackWidthM=hull.visual.trackWidthM;
  // Owner-authorized Oplot hybrid: retain the original weapon and protection
  // ratings, replace the physical frame with the 2016 hull and welded turret.
  const oplot=TANK_SPECS.t84, oldOplot=donors.t84, chassis=donors.t72b3m_2016;
  const frame=modernArmor({hl:chassis.dims.hullLengthM/2,hw:1.86,inW:1.25,floor:.39,trkTop:1.22,roofY:1.529,
    turretPivot:[.008,1.535,.114315],gunPivot:[0,.35,1.02],barrelLenM:4.26,barrelRadM:.104,
    glacis:[80,300,450],lower:[80,180,230],side:[80,100,150],rear:45,roof:30,
    tw:1.48,tFrontZ:1.63,tRearZ:-2.15,tH:.74,cheek:[200,400,500],tSide:[80,140,180],
    tRear:60,tRoof:35,mantlet:[200,400,500]});
  for(const plate of frame.turretPlates){
    const previous=oldOplot.armor.turretPlates.find(p=>p.name===plate.name);
    if(previous)Object.assign(plate,{physicalMm:previous.physicalMm,keMm:previous.keMm,ceMm:previous.ceMm});
  }
  // Seed the same protection family as the retained Oplot reactive arrays.
  // Anatomy replaces these seeds with the marked cassette lid triangles.
  const era=oldOplot.armor.turretPlates.find(p=>p.era)?.era;
  if(!era)throw new Error('Oplot modernization requires its existing ERA family');
  const eraOptions={kind:'era',era:{...era}};
  // Each flank seed runs from the front cassette's outer front edge to the rear cassette's outer rear edge
  // (oplotFlankLayout.ts), so it passes through all three seated bodies as they follow the tapering bustle.
  const flankFront=oplotFlankCassetteSeat(0).outerFront,flankRear=oplotFlankCassetteSeat(OPLOT_FLANK_CASSETTE.stations.length-1).outerRear;
  const flankLow=OPLOT_FLANK_CASSETTE.centerY-OPLOT_FLANK_CASSETTE.heightM/2,flankHigh=OPLOT_FLANK_CASSETTE.centerY+OPLOT_FLANK_CASSETTE.heightM/2;
  frame.turretPlates.push(
    plate('oplot_cheek_era_L',15,[-1.20,.50,1.39],[-.50,.50,1.57],[-1.20,.60,1.20],eraOptions),
    plate('oplot_cheek_era_R',15,[.50,.50,1.57],[1.20,.50,1.39],[.50,.60,1.38],eraOptions),
    plate('oplot_side_era_L',15,[-flankRear[0],flankLow,flankRear[1]],[-flankFront[0],flankLow,flankFront[1]],
      [-flankRear[0],flankHigh,flankRear[1]],eraOptions),
    plate('oplot_side_era_R',15,[flankFront[0],flankLow,flankFront[1]],[flankRear[0],flankLow,flankRear[1]],
      [flankFront[0],flankHigh,flankFront[1]],eraOptions),
  );
  oplot.armor={...frame,hullPlates:structuredClone(chassis.armor.hullPlates)};
  oplot.armor.modules=hybridModules(chassis,{...oplot,armor:frame});
  oplot.armor.crew=[...structuredClone(chassis.armor.crew.filter(c=>!c.turretLocal)),...frame.crew.filter(c=>c.turretLocal)];
  oplot.dims={...chassis.dims,overallLengthM:chassis.dims.hullLengthM/2+.114315+1.02+4.26,heightM:3.15};
  stripSilhouetteDimensions(oplot.dims);oplot.visual.trackWidthM=chassis.visual.trackWidthM;
  const variants=[['type96_72_long','t72b3',1.475,.065591],['type96_80_feng','t80u',1.565,.07187],['type96_72m_lei','t72b3m_2016',1.545,.114315]] as const;
  for(const [id,donor,y,z] of variants){
    const s=TANK_SPECS[id],base=donors[donor],turret=donors.type96b;
    s.dims={...base.dims,overallLengthM:base.dims.hullLengthM/2+z+1.75+4.92211,heightM:3.016-1.6+y};stripSilhouetteDimensions(s.dims);
    s.armor=structuredClone(turret.armor);
    s.armor.hullPlates=structuredClone(base.armor.hullPlates);
    if(id!=='type96_80_feng')s.armor.turretPlates.push(...structuredClone(base.armor.turretPlates.filter(p=>p.era)));
    s.armor.modules=hybridModules(base,s);
    s.armor.crew=[...structuredClone(base.armor.crew.filter(m=>!m.turretLocal)),...s.armor.crew.filter(m=>m.turretLocal)];
    s.armor.turretPivot=[0,y,z];s.visual.trackWidthM=base.visual.trackWidthM;
    // release 227: the Type 96B's rear-deck gun clearance (suppliedSourceFleetSpecs.ts) belongs to its own hull; each
    // concept carries the one measured over its own deck (CONCEPT_GUN_PITCH_BY_YAW_DEG)
    s.gunPitchByYawDeg=CONCEPT_GUN_PITCH_BY_YAW_DEG[id];
    for(const field of ['enginePowerHp','weightTons','topSpeedKmh','reverseSpeedKmh','hullTraverseDegS','terrainResistance','pivotStyle'] as const)
      Object.assign(s,{[field]:structuredClone(base[field])});
  }
}
