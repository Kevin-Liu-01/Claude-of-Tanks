// First-party Griffin-based game concept; no production-vehicle claim.
import './suppliedSourceFleetSpecs.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs } from './fleetSpecRegistry.ts';
import { shell, moduleBox, crewBox, plate } from './specHelpers.ts';
import { VIPER as D, VIPER_MUZZLES } from './griffinViperLayout.ts';
import { GRIFFIN_HULL_LENGTH_M, GRIFFIN_HULL_LENGTH_SCALE as H, GRIFFIN_TURRET_SCALE as S } from './profiles/griffinProportions.ts';
const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
const spec = cloneFleetVariant(TANK_SPECS, 'griffin_viper', 'griffin50_x', {
  name: 'Griffin Viper', nation: 'USA', era: 'modern', role: 'ifv',
});
for (const key of ['balancePeerOf', 'publicVisualFallback', 'sourceStudyStatus', 'label', 'roster']) delete spec[key];
Object.assign(spec, { hp: 2050, weightTons: 42, enginePowerHp: 1000,
  topSpeedKmh: 68, reverseSpeedKmh: 30, turretTraverseDegS: 50,
  gunPitchDegS: 40, gunElevationDeg: 25, gunDepressionDeg: 6,
  balanceCohort: 'missile-carrier' });
spec.gun = {
  caliberMm: 140, reloadS: 1, baseAccuracy: .30, aimTimeS: 1.2,
  primaryGuided: true, fixedLaunchCanisters: true, soundProfile: 'konkurs-launch',
  launcherMuzzles: VIPER_MUZZLES.map(p => ({ ...p })),
  bloom: { move: .045, hullRot: .060, turret: .035, afterShot: .15 },
  shells: [shell('Viper micro-missile', 'HEAT', 140, 650, 650, 140, 400,
    { pen2000Mm: 650, reloadS: 1, count: 64, guided: true, launcherTubes: 16,
      moduleDmg: 28, soundProfile: 'konkurs-launch' })],
};
spec.dims = { hullLengthM: GRIFFIN_HULL_LENGTH_M, overallLengthM: GRIFFIN_HULL_LENGTH_M,
  widthM: 3.8106, heightM: 2.07 + 1.54 * S };
spec.armor.turretPivot = [...D.turretPivot];
spec.armor.gunPivot = [...D.gunPivot];
spec.armor.gunBarrel = { lengthM: D.mouthZ, radiusM: D.boreRadius, collision: false };
// Main low-profile armored pedestal. Separate pod skins follow gun elevation.
spec.armor.turretPlates = [];
const boxFaces = (name: string, center: number[], size: number[], follow = false) => {
  const p = (x: number, y: number, z: number): [number, number, number] =>
    [(center[0] + x * size[0] / 2)*S, (center[1] + y * size[1] / 2)*S, (center[2] + z * size[2] / 2)*S];
  const corners = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
  const faces = [[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[3,7,6,2],[0,1,5,4]];
  return faces.map((indices, i) => {
    const v = indices.map(j => p(...corners[j] as [number, number, number]));
    return { ...plate(`${name}_${i}`, 35, v[0], v[1], v[2],
      { keMm: 65, ceMm: 90, gunFollow: follow }), verts: v, convexPolygon: true };
  });
};
spec.armor.turretPlates.push(...boxFaces('viper_base', [0,.20,0], [1.50,.40,1.90]));
for (const side of [-1, 1]) {
  // Only finite side/back/top stock; the circular launch mouths remain open.
  for (const dx of [-.515, .515]) spec.armor.turretPlates.push(...boxFaces(
    `viper_pod_${side}_${dx}`, [side*1.02+dx,1.20,0], [.03,.61,2.56], true));
  for (const dy of [-.29,.29]) spec.armor.turretPlates.push(...boxFaces(
    `viper_lid_${side}_${dy}`, [side*1.02,1.20+dy,0], [1.06,.03,2.56], true));
}
spec.armor.crew = [crewBox('driver', [-1.10,.80,1.20], [-.50,1.80,2.10]),
  crewBox('gunner', [.15,.80,-.80], [.75,1.85,.15]),
  crewBox('commander', [-.75,.80,-.80], [-.15,1.85,.15])];
spec.armor.modules = [
  ...spec.armor.modules.filter(m => ['engine','fuelTank','trackL','trackR'].includes(m.module)),
  moduleBox('ammoRack', [-.72,.75,-1.85], [.72,1.65,-1.05]),
  moduleBox('radio', [-1.05,1.20,-1.45], [-.80,1.65,-.95]),
  moduleBox('turretRing', [-.70,1.90,-1.0], [.70,2.20,.30]),
  { ...moduleBox('gun', [-.25,.14,-.20], [.25,.44,.20], true), external: true },
  moduleBox('optics', [-.18,.65,.87], [.18,1.05,1.11], true),
  // One damage state, with disjoint physical parts supplied by the sixteen
  // tagged canisters in the generated anatomy (no hit volume across the gap).
  { ...moduleBox('missileRack', [-1.52,.90,-1.27], [1.52,1.50,1.32], true),
    external: true, gunFollow: true },
];
for (const box of [...spec.armor.crew, ...spec.armor.modules]) {
  if ('module' in box && ['engine','fuelTank','trackL','trackR'].includes(box.module)) continue;
  const size = box.turretLocal ? [S,S,S] : [1,1,H];
  box.min = [box.min[0]*size[0],box.min[1]*size[1],box.min[2]*size[2]];
  box.max = [box.max[0]*size[0],box.max[1]*size[1],box.max[2]*size[2]];
}
spec.visual = { ...spec.visual, scheme: 'nato', base: '#555d42', weather: '#777864',
  patches: ['#343a32','#827756'], number: '016' };
registerFleetSpecs(registries, ['griffin_viper'], { griffin_viper: spec });
