// Photo-inspired, owner-requested game concept. The launcher is newly authored;
// its chassis and protection vocabulary come from the playable T-90MS Tagil.
// All combat numbers below are game tuning, not real weapon specifications.
import './sourceXSecondWaveSpecs.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs } from './fleetSpecRegistry.ts';
import { crewBox, moduleBox, plate, type ArmorPlate } from './specHelpers.ts';
import { TOS1A_TAGIL_LAYOUT as D, TOS1A_TAGIL_LAUNCHER_MUZZLES, TOS1A_TAGIL_PACK_CONTOUR } from './tos1aTagilLayout.ts';

export const TOS1A_TAGIL_ID = 'tos1a_tagil';
const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
const spec = cloneFleetVariant(registries.tankSpecs, TOS1A_TAGIL_ID, 't90ms_x', {
  name: 'TOS-1A Tagil', nation: 'Russia', era: 'modern', role: 'spg',
});
delete spec.balancePeerOf;
delete spec.publicVisualFallback;
delete spec.label;
delete spec.roster;

Object.assign(spec, {
  hp: 2400, enginePowerHp: 1130, weightTons: 49,
  topSpeedKmh: 58, reverseSpeedKmh: 18, hullTraverseDegS: 32,
  terrainResistance: { hard: .80, medium: .98, soft: 1.65 },
  pivotStyle: 'neutral', turretTraverseDegS: 30, gunPitchDegS: 24,
  gunElevationDeg: D.elevationDeg, gunDepressionDeg: D.depressionDeg,
});
spec.gun = {
  caliberMm: 220, reloadS: 48, baseAccuracy: .48, aimTimeS: 1.65,
  soundProfile: 'konkurs-launch', fixedLaunchCanisters: true,
  launcherMuzzles: TOS1A_TAGIL_LAUNCHER_MUZZLES.map(mouth => ({ ...mouth })),
  autoloader: { magazineSize: 24, intraClipS: .25, fullReloadS: 48 },
  bloom: { move: .075, hullRot: .085, turret: .040, afterShot: .09 },
  shells: [{
    name: '220 mm Salvo HE', type: 'HE', caliberMm: 220,
    pen100Mm: 55, pen1000Mm: 55, pen2000Mm: 55,
    dmg: 240, velocityMps: 300, moduleDmg: 48, tracer: 'HE',
    count: 72, launcherTubes: 24, soundProfile: 'konkurs-launch',
  }],
};

// These are the explicit concept envelope; they are not a production TOS-1A
// dimension claim. The retained chassis length is the donor's own hull datum.
spec.dims = {
  hullLengthM: 6.36530017853, overallLengthM: 7.4785,
  widthM: 3.7802, heightM: D.stowedHeight,
};
spec.armor.turretPivot = [...D.turretPivot];
spec.armor.gunPivot = [...D.gunPivot];
spec.armor.gunBarrel = { lengthM: D.mouthZ, radiusM: D.boreRadius, collision: false };

// The open cell face has no imaginary front armor sheet. Side/top/back sheets
// follow the pitching launcher; the visible cradle receives its own yaw armor.
const launcherProtection = { keMm: 35, ceMm: 45, gunFollow: true, kind: 'spaced' };
function launcherPlate(name: string, a: [number, number, number], b: [number, number, number], c: [number, number, number]): ArmorPlate {
  const rest = (p: [number, number, number]): [number, number, number] => [
    p[0] + D.gunPivot[0], p[1] + D.gunPivot[1], p[2] + D.gunPivot[2],
  ];
  return plate(name, 20, rest(a), rest(b), rest(c), launcherProtection);
}
type Point = [number, number, number];
function fixedPlate(name: string, points: Point[], main = false): ArmorPlate {
  return { ...plate(name, 35, points[0], points[1], points[2],
    { keMm: 35, ceMm: 45, kind: main ? 'main' : 'spaced', moduleLink: main ? undefined : 'gun' }),
  verts: points, convexPolygon: true };
}
function platformPlates(): ArmorPlate[] {
  const stations = [[-1.63,1.54,.08],[-1.40,1.75,.22],[.67,1.75,.22],[.95,1.42,.22]];
  const rings = stations.map(([z,w,h]) => [[-w,.05,z],[w,.05,z],[w,h-.02,z],
    [w-.055,h,z],[-w+.055,h,z],[-w,h-.02,z]] as Point[]);
  const faces = rings.slice(0,-1).flatMap((ring,s) => ring.map((p,i) => {
    const j=(i+1)%ring.length;
    return fixedPlate(`platform_${s}_${i}`, [p,ring[j],rings[s+1][j],rings[s+1][i]],true);
  }));
  return [...faces,fixedPlate('platform_aft', [...rings[0]].reverse(),true),
    fixedPlate('platform_forward', rings.at(-1)!,true)];
}
function bearingPlates(): ArmorPlate[] {
  const ring=(y:number):Point[]=>Array.from({length:48},(_,i)=>{
    const angle=i*Math.PI/24;return[Math.sin(angle)*1.2,y,Math.cos(angle)*1.2];
  });
  const low=ring(-.015),high=ring(.065);
  return [...low.map((p,i)=>fixedPlate(`bearing_side_${i}`,
    [p,low[(i+1)%48],high[(i+1)%48],high[i]],true)),
  fixedPlate('bearing_top',high,true),fixedPlate('bearing_floor',[...low].reverse(),true)];
}
function supportBox(name: string, center: Point, size: Point): ArmorPlate[] {
  const p = (x: number,y: number,z: number): Point => [center[0]+x*size[0]/2,center[1]+y*size[1]/2,center[2]+z*size[2]/2];
  return [
    [[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]],
    [[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]],
    [[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]],
    [[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]],
    [[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]],
    [[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
  ].map((face,i)=>fixedPlate(`${name}_${i}`,face.map(([x,y,z])=>p(x,y,z))));
}
const cradlePlates = [-1,1].flatMap(side => [
  ...supportBox(`cradle_foot_${side}`, [side*1.63,.246,-1.27], [.24,.09,.49]),
  ...supportBox(`cradle_tower_${side}`, [side*1.63,.745,-1.30], [.14,1.07,.22]),
]);
spec.armor.turretPlates = [
  ...platformPlates(), ...bearingPlates(), ...cradlePlates,
  ...TOS1A_TAGIL_PACK_CONTOUR.map(([x, y], index) => {
    const [nx, ny] = TOS1A_TAGIL_PACK_CONTOUR[(index + 1) % TOS1A_TAGIL_PACK_CONTOUR.length];
    return launcherPlate(`launcher_skin_${index}`, [x, y, -1], [nx, ny, -1], [x, y, D.skinFrontZ]);
  }),
  { ...launcherPlate('launcher_back', [1.42,-.48,-1], [-1.42,-.48,-1], [1.42,.48,-1]),
    convexPolygon: true,
    verts: [...TOS1A_TAGIL_PACK_CONTOUR].reverse().map(([x,y]) =>
      [x+D.gunPivot[0],y+D.gunPivot[1],-1+D.gunPivot[2]] as Point),
  },
];

// Three crew remain protected in the hull. No commander or carousel is left
// suspended in the replaced MBT turret. The generator fits the finite volumes.
spec.armor.crew = [
  crewBox('driver', [-.30,.66,1.25], [.30,1.32,1.90]),
  crewBox('gunner', [.18,.66,-.36], [.82,1.30,.55]),
  crewBox('commander', [-.82,.66,-.36], [-.18,1.30,.55]),
];
spec.armor.modules = [
  ...spec.armor.modules.filter(item => ['engine', 'fuelTank', 'trackL', 'trackR'].includes(item.module)),
  moduleBox('ammoRack', [-.72,.66,-1.66], [.72,1.27,-.70]),
  moduleBox('radio', [-.72,1.00,.60], [-.35,1.34,.96]),
  moduleBox('turretRing', [-.85,1.36,-.66], [.85,1.65,.86]),
  { ...moduleBox('gun', [.77,.19,.07], [1.05,.36,.45], true), external: true },
  moduleBox('optics', [.78,.20,-.08], [1.08,.52,.18], true),
  { ...moduleBox('missileRack', [-1.38,.87,-1.98], [1.38,1.74,.80], true),
    gunFollow: true, external: true },
];
spec.visual = {
  scheme: 'nato', base: '#596044', weather: '#797b5e',
  patches: ['#b5aa82', '#30382c'], marking: 'number', number: '024',
  trackWidthM: .4876, camoScale: .72,
};
registerFleetSpecs(registries, [TOS1A_TAGIL_ID], { [TOS1A_TAGIL_ID]: spec });
