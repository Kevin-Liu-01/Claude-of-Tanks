import {TANK_SPECS,MODEL_SOURCE,ALL_TANK_IDS} from './specs.ts';
import {bindFleetRegistries,cloneFleetVariant,registerFleetSpecs,stripSilhouetteDimensions} from './fleetSpecRegistry.ts';
import {NATIONAL_MODERNIZATION_CONFIG,NATIONAL_MODERNIZATION_IDS} from './nationalModernizationConfig.ts';
import {leftSidePlate,rightSidePlate} from './specHelpers.ts';
import {nationalModernizationDesign,NATIONAL_GUN_PIVOT,NATIONAL_BARREL_LENGTH,NATIONAL_BARREL_RADIUS} from './nationalModernizationDesign.ts';
import type {FleetTankSpec} from './specContracts.ts';
import {synchronizeNationalLegacyMetadata} from './nationalLegacySpecs.ts';
import {NATIONAL_PROTECTION_WIDTHS_M} from './nationalProtectionDimensions.ts';
import {NATIONAL_DONOR_TURRETS,NATIONAL_GUN_PITCH_BY_YAW} from './nationalDonorTurrets.ts';
import {bustleCutZ} from './donorBustleCut.ts';
const entries:Record<string,FleetTankSpec>={};
for(const c of NATIONAL_MODERNIZATION_CONFIG){
  const s=cloneFleetVariant(TANK_SPECS,c.id,'t90sm',{name:c.name,nation:c.nation,era:'next-generation'});
  delete s.label;delete s.roster;delete s.publicVisualFallback;delete s.balancePeerOf;
  // Audit metadata, not a stat change: twelve modernized legacy hulls with the
  // T-90SM fire control would otherwise outvote the clean-sheet Tier X MBTs and
  // move their median (the preserved Hetman II / Zubr II designs inherit it).
  s.balanceCohort='national-modernization';
  s.variantOf=c.donor;entries[c.id]=s;
}
registerFleetSpecs(bindFleetRegistries(TANK_SPECS,MODEL_SOURCE,ALL_TANK_IDS),NATIONAL_MODERNIZATION_IDS,entries);
let synchronized=false;
export function synchronizeNationalModernizationMetadata():void {
  if(synchronized)return;synchronized=true;
  const upper=TANK_SPECS.t90sm;
  for(const c of NATIONAL_MODERNIZATION_CONFIG){
    const s=TANK_SPECS[c.id],hull=TANK_SPECS[c.donor],design=nationalModernizationDesign(c);
    // Owner 2026-10-15 (VEH-19..VEH-22): a donor-turret concept's turret armour, turret modules, crew, gun trunnion
    // and barrel are the donor turret's own (its builder emits that turret); the hull side stays the native donor's.
    const donorTurret=NATIONAL_DONOR_TURRETS[c.id];
    if(donorTurret){synchronizeDonorTurretConcept(c,design);continue;}
    s.armor=structuredClone(upper.armor);
    s.armor.hullPlates=structuredClone(hull.armor.hullPlates);
    // All three chassis receive new side banks, including T-80 donors whose
    // original gameplay envelope only had glacis ERA. Replace, do not duplicate.
    s.armor.hullPlates=s.armor.hullPlates.filter(p=>!['skirt_era_L','skirt_era_R'].includes(p.name));
    const inheritedEra=upper.armor.turretPlates.find(p=>p.era)?.era;
    if(!inheritedEra)throw new Error('SM turret donor requires ERA definition');
    const x=design.width/2;
    const sideEra={kind:'era',era:structuredClone(inheritedEra)};
    s.armor.hullPlates.push(leftSidePlate('skirt_era_L',15,x,.87,x,1.33,-2.60,2.55,sideEra),
      rightSidePlate('skirt_era_R',15,x,.87,x,1.33,-2.60,2.55,sideEra));
    const upperModules=upper.armor.modules.filter(m=>m.turretLocal);
    const moved=new Set(upperModules.map(m=>m.module));
    s.armor.modules=structuredClone([...hull.armor.modules.filter(m=>!m.turretLocal&&!moved.has(m.module)),...upperModules]);
    s.armor.crew=structuredClone([...hull.armor.crew.filter(m=>!m.turretLocal),...upper.armor.crew.filter(m=>m.turretLocal)]);
    s.armor.turretPivot=[.008,c.y,c.z];
    for(const module of s.armor.modules)if(module.turretLocal&&(module.gunFollow||module.module==='gun')){
      module.min=module.min.map((v,i)=>v+NATIONAL_GUN_PIVOT[i]-upper.armor.gunPivot[i]) as [number,number,number];
      module.max=module.max.map((v,i)=>v+NATIONAL_GUN_PIVOT[i]-upper.armor.gunPivot[i]) as [number,number,number];
    }
    s.armor.gunPivot=[...NATIONAL_GUN_PIVOT];
    s.armor.gunBarrel={...s.armor.gunBarrel,lengthM:NATIONAL_BARREL_LENGTH,radiusM:NATIONAL_BARREL_RADIUS};
    s.dims={...hull.dims,hullLengthM:design.hullLength,widthM:NATIONAL_PROTECTION_WIDTHS_M[c.id]??design.width,
      heightM:design.heightM,
      overallLengthM:design.hullLength/2+c.z+NATIONAL_GUN_PIVOT[2]+NATIONAL_BARREL_LENGTH};
    stripSilhouetteDimensions(s.dims);
    s.visual={...s.visual,trackWidthM:hull.visual.trackWidthM,
      scheme:c.package==='cn'?'digital':c.package==='pl'?'nato':'woodland',
      base:c.package==='cn'?'#626c43':c.package==='pl'?'#4a563b':c.package==='ua'?'#536243':'#586145',
      patches:c.package==='cn'?['#303d34','#a5aa77']:c.package==='ua'?['#283829','#8b9260']:['#29342d','#827458'],
      number:String(810+NATIONAL_MODERNIZATION_IDS.indexOf(c.id))};
    s.gun=structuredClone(upper.gun);
    // Concept capability packages are game balance, not real ammunition data.
    s.enginePowerHp=c.package==='ru'?1500:c.model===0?1350:c.package==='pl'?1200:1300;
    s.weightTons=hull.weightTons+(c.package==='ru'?7:5);
    s.reverseSpeedKmh=c.package==='ru'?25:22;
    s.topSpeedKmh=c.model===0?72:68;
    s.hp=upper.hp+(c.package==='ru'?100:0);
    s.gun.reloadS=upper.gun.reloadS*(c.package==='ru'?.94:1);
    s.turretTraverseDegS=upper.turretTraverseDegS+3;
    // its gun's measured deck clearance over this hull (data, nationalDonorTurrets.ts)
    const pitchByYaw=NATIONAL_GUN_PITCH_BY_YAW[c.id];
    if(pitchByYaw)s.gunPitchByYawDeg=pitchByYaw;
    s.description='Original game concept. '+design.description+' Retains the '+c.donor+' mechanical running gear.';
  }
  synchronizeNationalLegacyMetadata();
}

/** The hull armour and modules of the native hull donor, side ERA banks on its new skirts, and the donor turret's
 * own turret plates, turret modules, turret crew, pivot (on this hull), trunnion and barrel. */
function synchronizeDonorTurretConcept(c:(typeof NATIONAL_MODERNIZATION_CONFIG)[number],design:ReturnType<typeof nationalModernizationDesign>):void {
  const upper=TANK_SPECS.t90sm,s=TANK_SPECS[c.id],hull=TANK_SPECS[c.donor];
  const d=NATIONAL_DONOR_TURRETS[c.id]!,turret=TANK_SPECS[d.donor];
  if(!turret)throw new Error(`${c.id}: donor turret ${d.donor} is not registered`);
  s.armor=structuredClone(turret.armor);
  s.armor.hullPlates=structuredClone(hull.armor.hullPlates).filter(p=>!['skirt_era_L','skirt_era_R'].includes(p.name));
  const inheritedEra=upper.armor.turretPlates.find(p=>p.era)?.era;
  if(!inheritedEra)throw new Error('SM turret donor requires ERA definition');
  const x=design.width/2,sideEra={kind:'era',era:structuredClone(inheritedEra)};
  s.armor.hullPlates.push(leftSidePlate('skirt_era_L',15,x,.87,x,1.33,-2.60,2.55,sideEra),
    rightSidePlate('skirt_era_R',15,x,.87,x,1.33,-2.60,2.55,sideEra));
  // Added national turret ERA sectors take the fleet's modern ERA values where the donor turret has none of its own;
  // the anatomy generator lays each template over the cassettes the kit actually fitted.
  for(const name of d.addedTurretEra??[]){
    if(s.armor.turretPlates.some(p=>p.kind==='era'&&p.name===name))continue;
    const template=upper.armor.turretPlates.find(p=>p.kind==='era'&&p.name===name);
    if(!template)throw new Error(`${c.id}: no modern ERA template for ${name}`);
    s.armor.turretPlates.push(structuredClone(template));
  }
  const turretModules=turret.armor.modules.filter(m=>m.turretLocal);
  const moved=new Set(turretModules.map(m=>m.module));
  s.armor.modules=structuredClone([...hull.armor.modules.filter(m=>!m.turretLocal&&!moved.has(m.module)),...turretModules]);
  s.armor.crew=structuredClone([...hull.armor.crew.filter(m=>!m.turretLocal),...turret.armor.crew.filter(m=>m.turretLocal)]);
  // Release 227: a donor turret built with its bustle cut (the Qilin's ZTZ-99A2, donorBustleCut.ts) carries the same cut in
  // its turret plates, modules and crew, so the hit model is the turret that is drawn.
  const cut=Number(d.builderOptions?.bustleCutM??0);
  if(cut>0)cutDonorTurretArmor(s.armor,cut);
  // A donor turret built without its open side bins (the Yun's Type 96B: its armour housings fill that volume) carries
  // no stowage screens in its hit model either: nothing is drawn where they stood.
  if(d.builderOptions?.bins===false)s.armor.turretPlates=s.armor.turretPlates.filter(p=>!/^turret_stowage_screen_[LR]$/.test(p.name));
  s.armor.turretPivot=[...d.pivot];
  if(d.gunPitchByYawDeg)s.gunPitchByYawDeg=d.gunPitchByYawDeg.map(([yaw,pitch])=>[yaw,pitch] as const);
  s.armor.gunPivot=[...turret.armor.gunPivot];
  s.armor.gunBarrel={...turret.armor.gunBarrel};
  s.dims={...hull.dims,hullLengthM:design.hullLength,widthM:NATIONAL_PROTECTION_WIDTHS_M[c.id]??design.width,
    heightM:d.heightM??design.heightM,
    overallLengthM:design.hullLength/2+d.pivot[2]+turret.armor.gunPivot[2]+turret.armor.gunBarrel.lengthM};
  stripSilhouetteDimensions(s.dims);
  s.visual={...s.visual,trackWidthM:hull.visual.trackWidthM,
    scheme:c.package==='cn'?'digital':c.package==='pl'?'nato':'woodland',
    base:c.package==='cn'?'#626c43':c.package==='pl'?'#4a563b':c.package==='ua'?'#536243':'#586145',
    patches:c.package==='cn'?['#303d34','#a5aa77']:c.package==='ua'?['#283829','#8b9260']:['#29342d','#827458'],
    number:String(810+NATIONAL_MODERNIZATION_IDS.indexOf(c.id))};
  // Concept capability packages are game balance, not real ammunition data: the T-90SM fire control stays.
  s.gun=structuredClone(upper.gun);
  s.enginePowerHp=c.package==='ru'?1500:c.model===0?1350:c.package==='pl'?1200:1300;
  s.weightTons=hull.weightTons+(c.package==='ru'?7:5);
  s.reverseSpeedKmh=c.package==='ru'?25:22;
  s.topSpeedKmh=c.model===0?72:68;
  s.hp=upper.hp+(c.package==='ru'?100:0);
  s.gun.reloadS=upper.gun.reloadS*(c.package==='ru'?.94:1);
  s.turretTraverseDegS=upper.turretTraverseDegS+3;
  // release 227: the rear-arc deck clearance of the donor gun over this hull (data, nationalDonorTurrets.ts)
  const pitchByYaw=NATIONAL_GUN_PITCH_BY_YAW[c.id];
  if(pitchByYaw)s.gunPitchByYawDeg=pitchByYaw;
  s.description='Original game concept. '+design.description+' Retains the '+c.donor+' mechanical running gear.';
}

type ArmorRecord=FleetTankSpec['armor'];
type Vec3=[number,number,number];
/** Every turret-local z of the donor's turret plates, modules and crew mapped through the bustle cut: polygon vertices and
 * box corners map, an ellipsoid or capsule keeps its ends attached (its z extent maps, so it compresses with the band). */
function cutDonorTurretArmor(armor:ArmorRecord,cut:number):void {
  const z=(v:number)=>bustleCutZ(v,cut);
  const point=(p:readonly number[]):Vec3=>[p[0],p[1],z(p[2])];
  for(const plate of armor.turretPlates)plate.verts=plate.verts.map(point) as typeof plate.verts;
  const boxes=(r:{min:readonly number[];max:readonly number[]})=>{r.min=point(r.min) as typeof r.min;r.max=point(r.max) as typeof r.max;};
  for(const item of [...armor.modules.filter(m=>m.turretLocal),...armor.crew.filter(m=>m.turretLocal)] as unknown as Record<string,unknown>[]){
    boxes(item as {min:readonly number[];max:readonly number[]});
    for(const part of (item.parts as {min:number[];max:number[]}[]|undefined)??[])boxes(part);
    for(const shape of (item.shapes as Record<string,unknown>[]|undefined)??[]){
      if(shape.kind==='capsule'){shape.a=point(shape.a as number[]);shape.b=point(shape.b as number[]);}
      else if(Array.isArray(shape.center)&&Array.isArray(shape.radii)){
        const c=shape.center as number[],r=shape.radii as number[],lo=z(c[2]-r[2]),hi=z(c[2]+r[2]);
        shape.center=[c[0],c[1],(lo+hi)/2];shape.radii=[r[0],r[1],(hi-lo)/2];
      }else if(Array.isArray(shape.center))shape.center=point(shape.center as number[]);
      if(Array.isArray(shape.min)&&Array.isArray(shape.max))boxes(shape as {min:number[];max:number[]});
    }
  }
}
