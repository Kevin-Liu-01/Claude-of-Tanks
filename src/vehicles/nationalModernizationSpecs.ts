import {TANK_SPECS,MODEL_SOURCE,ALL_TANK_IDS} from './specs.ts';
import {bindFleetRegistries,cloneFleetVariant,registerFleetSpecs,stripSilhouetteDimensions} from './fleetSpecRegistry.ts';
import {NATIONAL_MODERNIZATION_CONFIG,NATIONAL_MODERNIZATION_IDS} from './nationalModernizationConfig.ts';
import {leftSidePlate,rightSidePlate} from './specHelpers.ts';
import {nationalModernizationDesign,NATIONAL_GUN_PIVOT,NATIONAL_BARREL_LENGTH,NATIONAL_BARREL_RADIUS} from './nationalModernizationDesign.ts';
import type {FleetTankSpec} from './specContracts.ts';
import {synchronizeNationalLegacyMetadata} from './nationalLegacySpecs.ts';
import {NATIONAL_PROTECTION_WIDTHS_M} from './nationalProtectionDimensions.ts';
const entries:Record<string,FleetTankSpec>={};
for(const c of NATIONAL_MODERNIZATION_CONFIG){
  const s=cloneFleetVariant(TANK_SPECS,c.id,'t90sm_x',{name:c.name,nation:c.nation,era:'next-generation'});
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
  const upper=TANK_SPECS.t90sm_x;
  for(const c of NATIONAL_MODERNIZATION_CONFIG){
    const s=TANK_SPECS[c.id],hull=TANK_SPECS[c.donor],design=nationalModernizationDesign(c);
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
    s.description='Original game concept. '+design.description+' Retains the '+c.donor+' mechanical running gear.';
  }
  synchronizeNationalLegacyMetadata();
}
