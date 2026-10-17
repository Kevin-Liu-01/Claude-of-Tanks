import {TANK_SPECS,MODEL_SOURCE,ALL_TANK_IDS} from './specs.ts';
import {bindFleetRegistries,cloneFleetVariant,registerFleetSpecs,stripSilhouetteDimensions} from './fleetSpecRegistry.ts';
import {NATIONAL_LEGACY_CONFIG,NATIONAL_LEGACY_IDS} from './nationalLegacyConfig.ts';
import {NATIONAL_GUN_PIVOT,NATIONAL_BARREL_LENGTH} from './nationalModernizationDesign.ts';
import type {FleetTankSpec} from './specContracts.ts';
import {NATIONAL_PROTECTION_WIDTHS_M} from './nationalProtectionDimensions.ts';
import {NATIONAL_DONOR_TURRETS} from './nationalDonorTurrets.ts';
const entries:Record<string,FleetTankSpec>={};
for(const c of NATIONAL_LEGACY_CONFIG){
  const s=cloneFleetVariant(TANK_SPECS,c.id,'t90sm',{name:c.name,nation:c.nation,era:'next-generation'});
  delete s.label;delete s.roster;delete s.publicVisualFallback;delete s.balancePeerOf;
  s.variantOf=c.donor;entries[c.id]=s;
}
registerFleetSpecs(bindFleetRegistries(TANK_SPECS,MODEL_SOURCE,ALL_TANK_IDS),NATIONAL_LEGACY_IDS,entries);
let synchronized=false;
/** Called after the native-hull concepts have their complete combat metadata. */
export function synchronizeNationalLegacyMetadata():void {
  if(synchronized)return;synchronized=true;
  for(const [index,c]of NATIONAL_LEGACY_CONFIG.entries()){
    const s=TANK_SPECS[c.id],d=c.design;
    Object.assign(s,cloneFleetVariant(TANK_SPECS,c.id,c.predecessor,{name:c.name,nation:c.nation,era:'next-generation'}));
    delete s.label;delete s.roster;delete s.publicVisualFallback;
    // These preserved designs share their predecessor's combat tuning. Count
    // identical metrics once; the balance audit still checks both vehicles and
    // independently counts any metric that later changes.
    s.balancePeerOf=c.predecessor;
    s.variantOf=c.donor;
    // Owner 2026-10-15 (VEH-21, VEH-22): a donor-turret descendant shares its predecessor's donor turret (armour,
    // modules, trunnion and barrel, cloned above) on its own ring seat.
    const donorTurret=NATIONAL_DONOR_TURRETS[c.id];
    s.armor.turretPivot=donorTurret?[...donorTurret.pivot]:[.008,c.y,c.z];
    const reach=donorTurret?donorTurret.pivot[2]+s.armor.gunPivot[2]+s.armor.gunBarrel.lengthM
      :c.z+NATIONAL_GUN_PIVOT[2]+NATIONAL_BARREL_LENGTH;
    s.dims={...s.dims,hullLengthM:d.hullLength,widthM:NATIONAL_PROTECTION_WIDTHS_M[c.id]??d.width,
      heightM:donorTurret?.heightM??d.heightM,overallLengthM:d.hullLength/2+reach};
    stripSilhouetteDimensions(s.dims);
    s.visual={...s.visual,number:String(830+index)};
    s.description=donorTurret
      ?'Original game concept. '+d.description+' A separate national package from the '+TANK_SPECS[c.predecessor].name+' on the same donor turret.'
      :'Original game concept. '+d.description+' Separate development of the earlier welded-turret design; the current '+TANK_SPECS[c.predecessor].name+' remains available.';
  }
}
