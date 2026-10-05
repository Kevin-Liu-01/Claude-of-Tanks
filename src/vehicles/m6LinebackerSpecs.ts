// Kevin B. Liu — game modernization concept using the historical M6 weapon layout.
import {TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS} from './specs.ts';
import {bindFleetRegistries, cloneFleetVariant, registerFleetSpecs} from './fleetSpecRegistry.ts';
import {modernArmor, crewBox, shell, plate} from './specHelpers.ts';
import {LINEBACKER_TURRET_SCALE as T, LINEBACKER_RING, LINEBACKER_GUN, LINEBACKER_MUZZLE, LINEBACKER_MOUTHS,
  LINEBACKER_SKIRT_STATIONS, LINEBACKER_SKIRT_OUTER} from './m6LinebackerLayout.ts';

const spec = cloneFleetVariant(TANK_SPECS, 'm6_linebacker', 'm3a3_bradley', {
  name: 'M6 Linebacker', nation: 'USA', era: 'modern', role: 'ifv',
});
delete spec.label; delete spec.roster; delete spec.publicVisualFallback; delete spec.variantOf;
delete spec.balancePeerOf;
Object.assign(spec, {hp: 2400, enginePowerHp: 800, weightTons: 39.5,
  topSpeedKmh: 60, reverseSpeedKmh: 22, hullTraverseDegS: 42,
  turretTraverseDegS: 65, gunPitchDegS: 50, gunElevationDeg: 45, gunDepressionDeg: 9});
spec.dims = {hullLengthM: 6.71, overallLengthM: 6.71, widthM: 4.12, heightM: LINEBACKER_RING[1] + (3.75-LINEBACKER_RING[1])*T};
// Penetration and damage are game balance, not claims about Stinger armor performance.
// The blast-fragmentation missile is deliberately not the donor's HEAT/TOW round.
spec.gun = {...spec.gun, caliberMm: 25, reloadS: .30, baseAccuracy: .24, aimTimeS: 1,
  soundProfile: 'm242-bushmaster', muzzleBoreSegments: 24,
  launcherMuzzles: LINEBACKER_MOUTHS.map(m => ({x:m.x*T,y:m.y*T,z:m.z*T})), shells: [
    shell('M919 APFSDS-T', 'APFSDS', 25, 190, 175, 72, 1345, {pen2000Mm: 160, reloadS: .30, count: 360}),
    shell('FIM-92 Stinger', 'HE', 70, 18, 18, 340, 750,
      {pen2000Mm: 18, reloadS: 3.0, count: 12, guided: true, launcherTubes: 4, soundProfile: 'tow-launch'}),
    shell('M792 HEI-T', 'HE', 25, 8, 8, 62, 1100, {pen2000Mm: 8, reloadS: .30, count: 300}),
  ]};
for (const key of ['launcherSalvo','autoloader','muzzles','fixedLaunchCanisters','primaryGuided'] as const) delete spec.gun[key];
const armor = modernArmor({hl: 3.27, hw: 1.64, inW: .95, floor: .45, trkTop: .95, roofY: 1.90,
  turretPivot: LINEBACKER_RING, gunPivot: LINEBACKER_GUN, barrelLenM: LINEBACKER_MUZZLE, barrelRadM: .039,
  glacis: [45,70,80], lower: [45,60,60], side: [35,40,45], skirt: null, rear: 25, roof: 20,
  tw: 1.10, tFrontZ: 1.06, tRearZ: -1.48, tH: .90,
  cheek: [65,105,140], tSide: [45,65,90], tRear: 30, tRoof: 25, mantlet: [70,110,150], loader: false});
// Keep the Bradley chassis armor; this build has passive skirts/cages, not
// the M3A3's reactive glacis and side arrays. Do not inherit their damage zones.
armor.hullPlates = structuredClone(spec.armor.hullPlates.filter(p => p.kind !== 'era'));
armor.crew = [crewBox('driver',[-1.15,.75,1.23],[-.50,1.70,2.25]),
  crewBox('gunner',[.20,.08,-.32],[.87,.73,.38],true),
  crewBox('commander',[-.86,.08,-1.03],[-.17,.78,-.32],true)];
for (const side of [-1, 1]) for (let i = 0; i < LINEBACKER_SKIRT_STATIONS.length - 1; i++) {
  const [a, loA, hiA] = LINEBACKER_SKIRT_STATIONS[i];
  const [b, loB, hiB] = LINEBACKER_SKIRT_STATIONS[i + 1];
  const x = side * LINEBACKER_SKIRT_OUTER;
  const points: [number,number,number][] = [[x,loA,a],[x,loB,b],[x,hiB,b],[x,hiA,a]];
  if (side > 0) points.reverse();
  const p = plate(`linebacker_skirt_${side}_${i}`, 22, points[0], points[1], points[3], {kind:'spaced', keMm:40, ceMm:80});
  p.verts = points; p.convexPolygon = true;
  armor.hullPlates.push(p);
}
// Keep the chassis, armor thickness and weapon capabilities unchanged; only
// turret-local geometry, firing datums and contained boxes follow the resize.
armor.gunPivot = LINEBACKER_GUN.map(v => v*T) as [number,number,number];
armor.gunBarrel.lengthM *= T;
armor.gunBarrel.radiusM *= T;
for (const p of armor.turretPlates) p.verts = p.verts.map(v => v.map(n => n*T) as [number,number,number]);
for (const b of [...armor.modules,...armor.crew]) if (b.turretLocal) {
  b.min = b.min.map(n => n*T) as [number,number,number];
  b.max = b.max.map(n => n*T) as [number,number,number];
}
spec.armor = armor;
spec.visual = {...spec.visual, scheme:'nato', base:'#82734f', weather:'#9e8a60',
  patches:['#3f4a35','#3b3830'], number:'LB-06', trackWidthM:.53, camoScale:.62};
registerFleetSpecs(bindFleetRegistries(TANK_SPECS,MODEL_SOURCE,ALL_TANK_IDS), ['m6_linebacker'], {m6_linebacker:spec});
