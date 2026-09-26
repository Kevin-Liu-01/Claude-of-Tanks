// Photo-led Italian/Polish additions. Equipment follows the dated source packet;
// HP, armor and reloads are gameplay values, not claims about real protection.
import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs } from './fleetSpecRegistry.ts';
import { modernArmor } from './specHelpers.ts';
import { applyFleetLauncherMuzzles } from './fleetLauncherMuzzles.ts';
import type { FleetTankSpec } from './specContracts.ts';

export const EUROPE_PHOTO_IFV_IDS = ['dardo','lrmv_lynx','borsuk'] as const;
const registry=bindFleetRegistries(TANK_SPECS,MODEL_SOURCE,ALL_TANK_IDS);
// Gameplay eras: the Dardo is a 1990s production IFV (modern); the LRMV shares
// the KF41 family's next-generation bracket and the Borsuk is a 2020s new
// design like the Kurganets and Type 100 IFVs.
const entries=[
  ['dardo','m2a2_bradley','Dardo','Italy',25,2150,23,520,70,.42,68,185,'modern'],
  ['lrmv_lynx','kf41_lynx_x','LRMV Lynx','Italy',30,2900,44,1140,70,.38,90,225,'next-generation'],
  ['borsuk','spz_puma_s1','Borsuk','Poland',30,2650,28,720,65,.38,84,210,'next-generation'],
] as const;
const created:Record<string,FleetTankSpec>={};
for(const [id,donor,name,nation,caliber,hp,weight,power,speed,reload,damage,penetration,era] of entries){
  const s=cloneFleetVariant(registry.tankSpecs,id,donor,{name,nation,era,role:'ifv'});
  delete s.label;delete s.roster;delete s.publicVisualFallback;delete s.balancePeerOf;
  s.hp=hp;s.weightTons=weight;s.enginePowerHp=power;s.topSpeedKmh=speed;
  s.reverseSpeedKmh=id==='dardo'?25:30;s.hullTraverseDegS=id==='lrmv_lynx'?40:46;
  s.gunElevationDeg=id==='dardo'?60:45;s.gunDepressionDeg=10;s.gunPitchDegS=40;s.turretTraverseDegS=48;
  s.gun={...s.gun,caliberMm:caliber,reloadS:reload,baseAccuracy:.27,aimTimeS:1.2,muzzleBoreSegments:24,
    shells:s.gun.shells.filter(r=>!r.guided).map(r=>({...r,caliberMm:caliber,
      name:`${caliber} mm ${r.type}`,reloadS:reload,dmg:r.type==='HE'?Math.round(damage*1.12):damage,
      pen100Mm:r.type==='HE'?45:penetration,pen1000Mm:r.type==='HE'?45:penetration-18,pen2000Mm:r.type==='HE'?45:penetration-36}))};
  delete s.gun.launcherMuzzles;delete s.gun.launcherSalvo;delete s.gun.autoloader;delete s.gun.muzzles;delete s.gun.fixedLaunchCanisters;
  if(id==='borsuk'){
    const spike=registry.tankSpecs.spz_puma_s1!.gun.shells.find(r=>r.guided)!;
    s.gun.shells.splice(1,0,{...structuredClone(spike),name:'Spike LR',caliberMm:152,
      dmg:650,pen100Mm:950,pen1000Mm:950,pen2000Mm:950,reloadS:2.8,count:6,launcherTubes:2,velocityMps:180});
  }
  if(id==='lrmv_lynx') {
    // Existing first-party KF41 chassis is the explicit family source. The
    // separate Italian Lance 30 turret is authored in this unchanged chassis frame.
    s.dims={hullLengthM:7.7873,overallLengthM:8.10,widthM:3.60334,heightM:3.60};
    s.armor=structuredClone(s.armor);
    s.armor.gunBarrel={...s.armor.gunBarrel,lengthM:3.50,radiusM:.05};
  }else{
    const d=id==='dardo';
    s.dims={hullLengthM:d?6.71:7.60,overallLengthM:d?6.71:7.60,widthM:d?3.10:3.40,heightM:d?2.61:3.25};
    s.armor=modernArmor({hl:d?3.355:3.80,hw:d?1.55:1.70,inW:d?.96:1.07,
      floor:d?.40:.42,trkTop:d?1.12:1.24,roofY:d?1.75:2.05,
      turretPivot:d?[0,1.72,-.30]:[0,2.02,-.62],gunPivot:d?[0,.40,.95]:[0,.52,1.17],
      barrelLenM:d?2.45:2.35,barrelRadM:d?.043:.05,
      glacis:d?[45,155,190]:[65,235,330],lower:[40,120,155],side:[35,100,145],skirt:[10,25,55],rear:35,roof:35,
      tw:d?.91:1.12,tFrontZ:d?1.16:1.42,tRearZ:d?-1.1:-1.32,tH:d?.70:.91,
      cheek:[70,210,285],tSide:[45,120,185],tRear:35,tRoof:40,mantlet:[90,230,310],loader:false});
  }
  s.visual={...s.visual,scheme:'nato',base:id==='lrmv_lynx'?'#535d42':id==='borsuk'?'#4b553b':'#4d5538',
    weather:'#797762',patches:id==='lrmv_lynx'?['#555f46','#505940']:['#494235','#252c26'],
    number:id==='dardo'?'119097':id==='lrmv_lynx'?'201':'101',trackWidthM:id==='dardo'?.45:id==='borsuk'?.51:s.visual.trackWidthM};
  applyFleetLauncherMuzzles(s);created[id]=s;
}
registerFleetSpecs(registry,EUROPE_PHOTO_IFV_IDS,created);
