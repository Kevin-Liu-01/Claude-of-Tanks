// Independent photographic Marder 2; the preserved SPz Wotan is not a donor.
import {TANK_SPECS,MODEL_SOURCE,ALL_TANK_IDS} from './specs.ts';
import {bindFleetRegistries,cloneFleetVariant,registerFleetSpecs} from './fleetSpecRegistry.ts';
import {modernArmor,crewBox,shell} from './specHelpers.ts';
const registry=bindFleetRegistries(TANK_SPECS,MODEL_SOURCE,ALL_TANK_IDS);
const s=cloneFleetVariant(TANK_SPECS,'marder2','m2a2_bradley',{
name:'Marder 2',nation:'Germany',era:'modern',role:'ifv',
});
delete s.label;delete s.roster;delete s.publicVisualFallback;delete s.variantOf;
Object.assign(s, { name: 'Marder 2', hp: 2750, weightTons: 44.3, enginePowerHp: 1000,
  topSpeedKmh: 60, reverseSpeedKmh: 27, hullTraverseDegS: 42,
  turretTraverseDegS: 48, gunPitchDegS: 40, gunElevationDeg: 45, gunDepressionDeg: 10 });
s.dims = { hullLengthM: 7.31, overallLengthM: 9.13, widthM: 3.84, heightM: 3.05 };
// The 50 mm Rh 503 configuration; penetration/damage are game balance.
s.gun = { ...s.gun, caliberMm: 50, reloadS: .55, baseAccuracy: .26, aimTimeS: 1.25,
  soundProfile: 'xm913-50', muzzleBoreSegments: 20, shells: [
    shell('Rh 503 50 mm APFSDS-T', 'APFSDS', 50, 185, 170, 135, 1420,
      { pen2000Mm: 155, reloadS: .55, count: 180 }),
    shell('Rh 503 50 mm HEI-T', 'HE', 50, 48, 48, 152, 1100,
      { pen2000Mm: 48, reloadS: .55, count: 107 }),
  ] };
for (const key of ['launcherMuzzles','launcherSalvo','autoloader','muzzles','fixedLaunchCanisters','primaryGuided'] as const) delete s.gun[key];
s.armor = modernArmor({hl:3.655,hw:1.92,inW:1.12,floor:.44,trkTop:1.25,roofY:2.01,
  turretPivot:[0,2.02,-.48],gunPivot:[0,.54,1.12],barrelLenM:4.835,barrelRadM:.055,
  glacis:[65,215,265],lower:[45,135,180],side:[40,120,155],skirt:[12,30,60],rear:35,roof:35,
  tw:1.02,tFrontZ:1.16,tRearZ:-1.52,tH:.90,cheek:[85,240,285],tSide:[55,140,190],
  tRear:40,tRoof:40,mantlet:[100,260,310],loader:false});
s.armor.crew = [crewBox('driver',[.28,.65,1.33],[.98,1.80,2.33]),
  crewBox('gunner',[-.87,-.02,-.54],[-.19,.74,.45],true),
  crewBox('commander',[.19,-.02,-.54],[.87,.74,.45],true)];
s.visual = {...s.visual,scheme:'nato',base:'#48533f',weather:'#73705b',patches:['#302e27','#242c24'],number:'Y-811479',trackWidthM:.52};
delete s.balancePeerOf;
registerFleetSpecs(registry,['marder2'],{marder2:s});
