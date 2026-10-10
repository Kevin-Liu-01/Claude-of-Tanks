import {TANK_SPECS,MODEL_SOURCE,ALL_TANK_IDS} from './specs.ts';
import {bindFleetRegistries,cloneFleetVariant,registerFleetSpecs,stripSilhouetteDimensions} from './fleetSpecRegistry.ts';
import {NATIONAL_LEGACY_CONFIG,NATIONAL_LEGACY_IDS} from './nationalLegacyConfig.ts';
import {NATIONAL_GUN_PIVOT,NATIONAL_BARREL_LENGTH} from './nationalModernizationDesign.ts';
import type {FleetTankSpec} from './specContracts.ts';
import {NATIONAL_PROTECTION_WIDTHS_M} from './nationalProtectionDimensions.ts';
const entries:Record<string,FleetTankSpec>={};
for(const c of NATIONAL_LEGACY_CONFIG){
  const s=cloneFleetVariant(TANK_SPECS,c.id,'t90sm_x',{name:c.name,nation:c.nation,era:'next-generation'});
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
    s.armor.turretPivot=[.008,c.y,c.z];
    s.dims={...s.dims,hullLengthM:d.hullLength,widthM:NATIONAL_PROTECTION_WIDTHS_M[c.id]??d.width,heightM:d.heightM,
      overallLengthM:d.hullLength/2+c.z+NATIONAL_GUN_PIVOT[2]+NATIONAL_BARREL_LENGTH};
    stripSilhouetteDimensions(s.dims);
    s.visual={...s.visual,number:String(830+index)};
    s.description='Original game concept. '+d.description+' Separate development of the earlier welded-turret design; the current '+TANK_SPECS[c.predecessor].name+' remains available.';
  }
}
