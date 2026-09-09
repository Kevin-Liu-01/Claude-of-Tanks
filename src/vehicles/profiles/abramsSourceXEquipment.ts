import { drainTankBuild, tankProfileCheckpoint, type TankProfileBuild } from '../tankBuildCooperation.ts';
// First-party sparse reconstruction of the owner's SEP v2 equipment study.
// Numbers are authored surface/axis measurements in the canonical metre frame,
// not an imported mesh, vertex sample cloud, or a legacy Abrams builder.
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { FITTINGS, KIT } from './kit.ts';
import { closedSectionLoft, planeBoundedArmor, profiledTube, roundMember, type XYZ } from './abramsSourceXGeometry.ts';
import { buildAbramsSourceXCitv } from './abramsSourceXCitv.ts';
import { markEraHitFaces } from './eraHitFaces.ts';
import { sourceStowageBag, type SourceStowageBagName } from './abramsSourceXStowage.ts';
import { sourceMainRackStrip, sourceMainRackSupports, sourceExtendedRack } from './abramsSourceXRack.ts';
import { buildAbramsSourceXAftCase } from './abramsSourceXAftCase.ts';
import { sourceContainers, sourceContainerReceivers } from './abramsSourceXContainers.ts';
import { buildAbramsSourceXCrows, abramsCrowsReceiver } from './abramsSourceXCrows.ts';
import { hardenSourceMuzzleRim, sourceMuzzleAssembly } from './abramsSourceXMuzzle.ts';
import { buildAbramsSourceXCounterAssault } from './abramsSourceXCounterAssault.ts';
import { sourceLoaderMount, sourceLoaderWeapon } from './abramsSourceXLoader.ts';
import { sourceLoaderShields } from './abramsSourceXLoaderShields.ts';
import { sourceLoaderFeed } from './abramsSourceXLoaderFeed.ts';
import { abramsCommanderLid, abramsCommanderCap } from './abramsSourceXHatches.ts';
import { abramsAratBracket } from './abramsSourceXAratBrackets.ts';
import { compactRoundMember } from '../compactRoundMember.ts';

export interface AbramsSourceXEquipmentOptions {
  a1: boolean;
  urbanArmor: boolean;
  curvedArat: boolean;
  sepv3: boolean;
  ukrainian: boolean;
}
export interface AbramsSourceXEquipmentFrame {
  turret: [number, number, number];
  gun: [number, number, number];
}
type Owner = 'turret' | 'gun';
type Role = 'equipment' | 'cupola' | 'hatch' | 'external';
interface EquipmentContext {
  P: TankBuilderPort;
  frame: AbramsSourceXEquipmentFrame;
}

export const ABRAMS_SOURCE_X_EQUIPMENT_DATUMS = Object.freeze({
  boreAxis: [-.0200025, 1.849085] as const,
  tubeRearZ: 2.029245,
  muzzleZ: 5.809425,
  boreRadiusM: .06064,
  boreBackZ: 4.843555,
  commanderCenter: [-.507216, 2.391505, -.3524195] as const,
  loaderCenter: [.417919, 2.356985, -.339059] as const,
  citvCenter: [.707125, 2.572145, .4660945] as const,
});

function emit(C: EquipmentContext, name: string, geometry: THREE.BufferGeometry,
  center: XYZ = [0, 0, 0], owner: Owner = 'turret', bucket = 'turret', role: Role = 'equipment',
  yaw = 0): void {
  const f = C.frame[owner];
  geometry.name = `abramsSourceX_${name}`;
  geometry.userData.sourceAuthoredPart = geometry.name;
  const xyz: [number, number, number] = [center[0] - f[0], center[1] - f[1], center[2] - f[2]];
  if (role === 'cupola') C.P.addCupola(bucket, geometry, ...xyz, 0, yaw, 0);
  else if (role === 'hatch') C.P.addHatch(bucket, geometry, ...xyz, 0, yaw, 0);
  else if (role === 'external') C.P.addExternalArmor(bucket, geometry, ...xyz, 0, yaw, 0);
  else C.P.addEquipment(bucket, geometry, ...xyz, 0, yaw, 0);
}

function box(C: EquipmentContext, name: string, size: XYZ, center: XYZ,
  owner: Owner = 'turret', bucket = 'turret', yaw = 0, role: Role = 'equipment'): void {
  emit(C, name, KIT.box(...size), center, owner, bucket, role, yaw);
}

function rail(C: EquipmentContext, name: string, a: XYZ, b: XYZ, r = .0103,
  owner: Owner = 'turret', bucket = 'turret'): void {
  const compact = !C.P.q && /^(?:BasketCourse|HatchHandle|SideGuard)/.test(name);
  // The basket's unchanged 0.8 mm chord oracle requires eight radial sides.
  // Planar cap retriangulation recovers cost without moving occupied stock.
  const segments = C.P.q ? 12 : name.startsWith('BasketCourse') || r > .02 ? 8 : 6;
  const geometry = compact ? compactRoundMember(a, b, r, segments) : roundMember(a, b, r, segments);
  emit(C, name, geometry, [0, 0, 0], owner, bucket);
}

function tubeY(outer: number, inner: number, height: number, segments = 40): THREE.BufferGeometry {
  const path = [[outer, -height / 2], [outer, height / 2], [inner, height / 2],
    [inner, -height / 2], [outer, -height / 2]];
  return new THREE.LatheGeometry(path.map(p => new THREE.Vector2(p[0], p[1])), segments);
}

function annularZ(outer: number, inner: number, depth: number, segments = 32): THREE.BufferGeometry {
  return tubeY(outer, inner, depth, segments).rotateX(Math.PI / 2);
}

function curvedWallY(outer: number, inner: number, height: number,
  start: number, end: number, segments: number): THREE.BufferGeometry {
  const points: THREE.Vector2[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = start + (end - start) * i / segments;
    points.push(new THREE.Vector2(outer * Math.sin(a), -outer * Math.cos(a)));
  }
  for (let i = segments; i >= 0; i--) {
    const a = start + (end - start) * i / segments;
    points.push(new THREE.Vector2(inner * Math.sin(a), -inner * Math.cos(a)));
  }
  return new THREE.ExtrudeGeometry(new THREE.Shape(points), { depth: height, bevelEnabled: false,
    steps: 1 }).rotateX(-Math.PI / 2).translate(0, -height / 2, 0);
}

/** Five separate walls and inset glazing: the mouth has actual empty depth. */
function opticalHood(C: EquipmentContext, name: string, center: XYZ, size: XYZ,
  yaw = 0, owner: Owner = 'turret'): void {
  const [w, h, d] = size, t = Math.min(.018, w * .13, h * .14, d * .18);
  const bucket = owner === 'gun' ? 'gunMount' : 'turret';
  const point = (x: number, y: number, z: number): XYZ => [center[0] + x * Math.cos(yaw) + z * Math.sin(yaw),
    center[1] + y, center[2] - x * Math.sin(yaw) + z * Math.cos(yaw)];
  box(C, `${name}Back`, [w, h, t], point(0, 0, -d / 2 + t / 2), owner, bucket, yaw);
  for (const s of [-1, 1]) {
    box(C, `${name}Side${s}`, [t, h, d], point(s * (w - t) / 2, 0, 0), owner, bucket, yaw);
    box(C, `${name}Lip${s}`, [w - 2 * t, t, d], point(0, s * (h - t) / 2, 0), owner, bucket, yaw);
  }
  box(C, `${name}Lens`, [w - 2.1 * t, h - 2.1 * t, .003], point(0, 0, -d / 2 + t + .002),
    owner, owner === 'gun' ? 'gunMountGlass' : 'turretGlass', yaw);
}

function mantleSection(z: number, left: number, right: number, bottom: number, top: number) {
  const bevel = Math.min(.038, (right - left) * .45, (top - bottom) * .45);
  return { z, ring: [[left + bevel, bottom], [right - bevel, bottom], [right, bottom + bevel],
    [right, top - bevel], [right - bevel, top], [left + bevel, top],
    [left, top - bevel], [left, bottom + bevel]] as [number, number][] };
}

function internalGunLinkage(C: EquipmentContext): void {
  // Measured L-section of source68's connected lower linkage. Its lower
  // leg occupies only the outboard 82mm: the 190mm-wide notch stays empty.
  // Source has no separate top-face pair here; closing the concealed top is
  // an authored construction choice, not a claim of watertight source data.
  const section = (z: number, outer: number, leg: number, top: number) => ({ z,
    ring: [[leg, 1.220255], [outer, 1.220255], [outer, top], [.292131, top],
      [.292131, 1.339615], [leg, 1.339615]] as [number, number][] });
  emit(C, 'InternalGunLinkage', closedSectionLoft([
    section(.390384, .564231, .481781, 1.652585),
    section(.845705, .563665, .481521, 1.652155),
  ]), [0, 0, 0], 'gun', 'gunMount');
}

function mainGun(C: EquipmentContext): void {
  internalGunLinkage(C);
  // The casting is asymmetric. Its fore face tapers down around the tube;
  // neither it nor the cheek owner fills the triangular under-mantlet air.
  emit(C, 'PitchingMantlet', closedSectionLoft([
    mantleSection(1.395935, -.40270, .21346, 1.60152, 2.1279),
    mantleSection(1.676425, -.40270, .21346, 1.571595, 2.192965),
    mantleSection(1.896715, -.40270, .21346, 1.639225, 2.152325),
    mantleSection(2.228905, -.40270, .21346, 1.702415, 2.138755),
    mantleSection(2.402465, -.40270, .21346, 1.81380, 1.88438),
    mantleSection(2.423585, -.3647, .17546, 1.82480, 1.87338),
  ]), [0, 0, 0], 'gun', 'gunMount');
  const [x, y] = ABRAMS_SOURCE_X_EQUIPMENT_DATUMS.boreAxis;
  emit(C, 'MainTube', hardenSourceMuzzleRim(profiledTube([
    { z: 2.029245, r: .18258 }, { z: 2.097555, r: .16516 },
    { z: 2.421735, r: .16516 }, { z: 2.425975, r: .1500 },
    { z: 2.454015, r: .118915 }, { z: 2.849805, r: .118915 },
    { z: 2.849805, r: .13212 }, { z: 2.920915, r: .13212 },
    { z: 2.920915, r: .118915 }, { z: 3.299475, r: .118915 },
    { z: 3.357005, r: .13375 }, { z: 3.366715, r: .116535 },
    { z: 4.044085, r: .116535 }, { z: 4.055745, r: .096885 },
    { z: 4.119945, r: .096885 }, { z: 4.120, r: .09045 },
    { z: 5.508415, r: .09040 }, { z: 5.509385, r: .096775 },
    { z: 5.558175, r: .096775 }, { z: 5.558175, r: .094165 },
    { z: 5.574435, r: .094165 }, { z: 5.587425, r: .08434 },
    { z: 5.605275, r: .08434 }, { z: 5.605275, r: .07724 },
    { z: 5.809425, r: .07724 },
  ], .06064, C.P.q ? 64 : 20)), [x, y, 0], 'gun', 'gun');
  // Recess terminates at the measured source bore stock, not at the muzzle.
  emit(C, 'BoreRearWall', KIT.cylZ(.06064, .003, C.P.q ? 40 : 24), [x, y, 4.842055], 'gun', 'gunDark');
  // Eccentric evacuator: r=.160675 m, with its axis 36.115 mm above the
  // bore. Using its .19679 m crown as a centred radius would overfill below.
  const oval = (z: number, rx: number, ry: number, cy: number) => ({ z,
    ring: Array.from({ length: C.P.q ? 40 : 24 }, (_, i) => {
      const a = i * 2 * Math.PI / (C.P.q ? 40 : 24);
      return [x + Math.cos(a) * rx, cy + Math.sin(a) * ry] as [number, number];
    }) });
  emit(C, 'EccentricEvacuator', closedSectionLoft([
    oval(3.357005, .13375, .1336, y), oval(3.366715, .1345, .1345, y),
    oval(3.433955, .1590, .1590, 1.8835), oval(3.449985, .16068, .160675, 1.8852),
    oval(3.854995, .16068, .160675, 1.8852), oval(3.871015, .1590, .1590, 1.8835),
    oval(3.944565, .1166, .116535, y), oval(3.954265, .1166, .116535, y),
  ]), [0, 0, 0], 'gun', 'gun');
  for(const part of sourceMuzzleAssembly())emit(C,part.name,part.geometry,[0,0,0],'gun','gun');
  emit(C, 'CoaxSleeve', annularZ(.04441, .014, .43585, C.P.q ? 32 : 16), [-.338839, 1.984485, 2.61298], 'gun', 'gunMount');
  opticalHood(C, 'MantletLamp', [-.212357, 2.097845, 2.5261], [.10382, .10484, .0988], 0, 'gun');
}

function mgMesh(C: EquipmentContext, group: THREE.Group, name: string, geometry: THREE.BufferGeometry,
  point: XYZ, material: THREE.Material = C.P.mats.dark): void {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `abramsSourceX_${name}`;
  mesh.position.set(...point);
  mesh.castShadow = true;
  group.add(mesh);
  C.P.disposables.push(geometry);
}

/** Source M2 receiver axes; the native weapon is geometry, not a marker. */
function sourceM2(C: EquipmentContext, name: string, center: XYZ, owner: Owner,
  yaw = 0): THREE.Group {
  const group = new THREE.Group();
  mgMesh(C, group, `${name}Receiver`, name === 'CrowsM2' ? abramsCrowsReceiver()
    : KIT.box(.09324, .13899, .58707), [0, 0, 0]);
  mgMesh(C, group, `${name}TopCover`, KIT.box(.098, .023, .31), [0, .080, -.045]);
  mgMesh(C, group, `${name}FeedCover`, KIT.box(.143, .046, .135), [0, .024, .09]);
  mgMesh(C, group, `${name}Barrel`, profiledTube([
    { z: .2935, r: .02596 }, { z: 1.206, r: .02596 },
    { z: 1.207, r: .01903 }, { z: 1.279, r: .01903 },
  ], .00635, 20), [0, 0, 0]);
  // Perforated heat jacket made from real hoops and longitudinal ribs. The
  // holes stay open in both detail levels, rather than painted black dots.
  for (let i = 0; i < 5; i++) mgMesh(C, group, `${name}JacketHoop${i}`,
    annularZ(.04023, .031, .012, 20), [0, 0, .304 + i * .057]);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    mgMesh(C, group, `${name}JacketRib${i}`, KIT.box(.010, .010, .248),
      [Math.cos(a) * .033, Math.sin(a) * .033, .421]);
  }
  for (const s of [-1, 1]) {
    mgMesh(C, group, `${name}Spade${s}`, KIT.box(.03299, .126, .033), [s * .0622, .004, -.348]);
    mgMesh(C, group, `${name}SpadeLink${s}`, KIT.box(.081, .023, .052), [s * .040, -.027, -.303]);
  }
  mgMesh(C, group, `${name}ChargingHandle`, KIT.cylX(.010, .064, 10), [.068, -.012, .02]);
  mgMesh(C, group, `${name}FrontSight`, KIT.box(.012, .055, .014), [0, .045, 1.166]);
  group.position.set(center[0] - C.frame[owner][0], center[1] - C.frame[owner][1], center[2] - C.frame[owner][2]);
  group.rotation.y = yaw;
  FITTINGS.markExact(group, 'pintleMG');
  group.name = `abramsSourceX_${name}`;
  group.userData.sourceOwner = name === 'CrowsM2' ? 'Object_90' : 'Object_67';
  (owner === 'gun' ? C.P.gunG : C.P.turretG).add(group);
  return group;
}

function counterAssaultMount(C: EquipmentContext): void {
  for (const { name, geometry } of buildAbramsSourceXCounterAssault(!!C.P.q))
    emit(C, name, geometry, [0, 0, 0], 'gun', 'gunMount');
  sourceM2(C, 'CounterAssaultM2', [-.015043, 2.35038, 2.61955], 'gun');
}

function citv(C: EquipmentContext): void {
  for (const part of buildAbramsSourceXCitv()) {
    emit(C, part.name, part.geometry, [0, 0, 0], 'turret', part.glass ? 'turretGlass' : 'turret');
  }
}

function roofHatches(C: EquipmentContext): void {
  // Source core includes this shallow raised seat above the broad roof field;
  // it is structural coaming, not an equipment pedestal or a roof-wide lift.
  emit(C, 'CommanderCoaming', tubeY(.537, .389, .03071, C.P.q ? 48 : 20), [-.507216, 2.37615, -.3524195],
    'turret', 'turret', 'cupola');
  emit(C, 'CommanderSeat', KIT.cylY(.537, .537, .0494, C.P.q ? 48 : 20), [-.507216, 2.416205, -.3524195],
    'turret', 'turret', 'cupola');
  commanderRim(C);
  emit(C, 'CommanderLid', abramsCommanderLid(!!C.P.q), [0, 0, 0],
    'turret', 'turret', 'hatch');
  for (const part of abramsCommanderCap()) emit(C, part.name, part.geometry);
  emit(C, 'LoaderRim', tubeY(.352, .302, .027, C.P.q ? 48 : 20), [.417919, 2.376, -.339059],
    'turret', 'turret', 'cupola');
  emit(C, 'LoaderLid', KIT.cylY(.31432, .31432, .02024, C.P.q ? 40 : 20), [.417919, 2.356985, -.339059],
    'turret', 'turret', 'hatch');
  for (const [x, foot, crown] of [[-.5084, 2.61, 2.648], [.417919, 2.366, 2.474375]]) {
    rail(C, `HatchHandle${x}A`, [x - .075, foot, -.38], [x - .075, crown, -.38], .009);
    rail(C, `HatchHandle${x}B`, [x - .075, crown, -.38], [x + .075, crown, -.38], .009);
    rail(C, `HatchHandle${x}C`, [x + .075, crown, -.38], [x + .075, foot, -.38], .009);
  }
  commanderPeriscopes(C);
  for (const [x, label] of [[.3640055, 'Left'], [-.500608, 'Right']] as const) {
    box(C, `BlastPanel${label}`, [.80316, .04552, 1.12474], [x, 2.429685, -1.510275], 'turret', 'turret', 0, 'hatch');
    for (const z of [-1.80, -1.35]) emit(C, `BlastLatch${label}${z}`, KIT.cylY(.072, .072, .017, 20), [x, 2.46094, z]);
  }
  gunnersPrimarySight(C);
}

function gunnersPrimarySight(C: EquipmentContext): void {
  // Source59/1791's broad low mounting flanges do NOT describe a vertical
  // .785m-wide hood. Its actual left wall is nearX−1.155; the earlier bbox
  // interpretation falsely blocked the separate CROWS cover's side relief.
  emit(C, 'GunnersSightLeftWall', planeBoundedArmor([
    [-.99999701, .00244432, 0, 1.16096452], [1, -.00029783, 0, -1.08268929],
    [0, -1, 0, -2.247195], [0, 1, 0, 2.478315], [0, 0, -1, -.498876], [0, 0, 1, .937266],
  ]));
  emit(C, 'GunnersSightRightWall', planeBoundedArmor([
    [1, .0004, -.00000226, -.51127073], [-1, -.00000495, 0, .59628873],
    [0, -1, 0, -2.277835], [0, 1, 0, 2.478315], [0, 0, -1, -.498876], [0, 0, 1, .937266],
  ]));
  emit(C, 'GunnersSightBack', new THREE.BoxGeometry(.58204, .16108, .03932), [-.83388, 2.397775, .488796]);
  emit(C, 'GunnersSightRoof', new THREE.BoxGeometry(.58689, .02212, .51874), [-.829735, 2.493605, .760426]);
  for (const [name, x, w] of [['Left', -1.118565, .07291], ['Right', -.563545, .06609]] as const) {
    emit(C, `GunnersSightRoofSeat${name}`, new THREE.BoxGeometry(w, .0266, .42476), [x, 2.491415, .711256]);
  }
  for (const [name, x, y, w, h] of [['Left', -1.13074, 2.36360, .02974, .22915],
    ['Right', -.55733, 2.382875, .02204, .1817]] as const) {
    emit(C, `GunnersSightForeJamb${name}`, new THREE.BoxGeometry(w, h, .07707), [x, y, .986481]);
  }
  gunnersSightFlanges(C);
  // Source106 has two slightly warped single-surface panes, not an opaque
  // front cap. Their mean planes receive a concealed2mm authored thickness.
  for (const [i, nx, ny, nz, d, x0, x1] of [
    [0, -.140643, -.060291, .988206, .82945352, -1.00256, -.82426],
    [1, -.001685, -.060553, .998163, .72433328, -.81443, -.64131],
  ]) emit(C, `GunnersSightPane${i}`, planeBoundedArmor([
    [nx, ny, nz, d], [-nx, -ny, -nz, -d + .002],
    [1, 0, 0, x1], [-1, 0, 0, -x0], [0, 1, 0, 2.45555], [0, -1, 0, -2.276235],
  ]), [0, 0, 0], 'turret', 'turretGlass');
}

function gunnersSightFlanges(C: EquipmentContext): void {
  // Separate source-parallel mounting shoulders meet the unchanged main
  // roof; there is no solid floor closing the optical interior.
  for (const [name, x0, x1, nx, ny, nz, d] of [
    ['Left', -1.23377, -1.08195, -.08978823, .98945238, .11367525, 2.44577742],
    ['Right', -.596301, -.44866, -.04482877, .99321899, .10726799, 2.40934828],
  ] as const) emit(C, `GunnersSightFlange${name}`, planeBoundedArmor([
    [1, 0, 0, x1], [-1, 0, 0, -x0], [0, 0, -1, -.364026], [0, 0, 1, 1.019796],
    [nx, ny, nz, d], [.063661, -.991288, -.115304, -2.397732],
  ]));
}

function commanderRim(C: EquipmentContext): void {
  // Owner84/89's broad wall ends at2.5596, then folds inward to2.5714.
  // Its2.6034 maximum belongs to a local tab, not a continuous high drum.
  // The lower source106 windows must remain outside this receiving shoulder.
  const profile = [[.5035, 2.440895], [.5035, 2.559595], [.4591, 2.5714],
    [.2583, 2.5714], [.2583, 2.440895], [.5035, 2.440895]];
  emit(C, 'CommanderRim', new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(p[0], p[1])),
    C.P.q ? 40 : 20, Math.PI / 40), [-.507216, 0, -.3524195], 'turret', 'turret', 'cupola');
}

function commanderPeriscopes(C: EquipmentContext): void {
  // Eight independently measured lower pane planes (source106). The source
  // panes are single surfaces: a3mm concealed backing closes our authored
  // glazing without moving the measured outward face. Paired mildly warped
  // source triangles use their area-weighted plane, not transferred vertices.
  const panes = [
    [.7049960641, -.0400103397, .7080816047, -.2884857855, -.1050426043],
    [-.7030410653, -.0400422213, -.7100209430, .9260000630, .1164892967],
    [.9991971648, -.0399618432, .0028420032, -.1883658723, .3566749189],
    [.0042786004, -.0402662887, -.9991797022, .6690426735, .5132292921],
    [-.9991981592, -.0400379655, 0, .8253394238, -.3484190032],
    [.7091652321, -.0396620047, -.7039258469, .2091212213, .6127141827],
    [-.7070199401, -.0400401975, .7060591229, .4277905383, -.6032065982],
    [-.0014636213, -.0398096521, .9992062097, -.0327351783, -.5024667795],
  ];
  panes.forEach(([nx, ny, nz, d, u], i) => {
    const r = Math.hypot(nx, nz), tx = nz / r, tz = -nx / r;
    emit(C, `CommanderPeriscope${i}Lens`, planeBoundedArmor([
      [nx, ny, nz, d], [-nx, -ny, -nz, -d + .003],
      [tx, 0, tz, u + .1635], [-tx, 0, -tz, -u + .1635],
      [0, 1, 0, 2.700025], [0, -1, 0, -2.569005],
    ]), [0, 0, 0], 'turret', 'turretGlass');
    const shift = u - (tx * -.507216 + tz * -.3524195);
    const center: XYZ = [-.507216 + tx * shift, 0, -.3524195 + tz * shift];
    commanderPeriscopeStock(C, i, Math.atan2(-nz, nx), center);
  });
}

function commanderPeriscopeStock(C: EquipmentContext, i: number, yaw: number, center: XYZ): void {
  // Source85's periscope has a broad raked18mm receiving back, not a small
  // upright box. The lower glass stands in front of this inclined body.
  const ring: [number, number][] = [[.3438, 2.5713], [.3615, 2.5713], [.3615, 2.60015],
    [.4294, 2.69894], [.4117, 2.69908], [.3683, 2.63569], [.3438, 2.59235]];
  emit(C, `CommanderPeriscope${i}Back`, closedSectionLoft([
    { z: -.164, ring }, { z: .164, ring },
  ]), center, 'turret', 'turret', 'equipment', yaw);
  // Separate end walls support the pane edges and preserve the space between
  // the near-vertical glazing and the raked metal back at its lower half.
  for (const s of [-1, 1]) {
    const jamb: [number, number][] = [[.3438, 2.5713], [.423, 2.5713],
      [.431, 2.69908], [.4117, 2.69908]];
    emit(C, `CommanderPeriscope${i}Jamb${s}`, closedSectionLoft([
      { z: s * .164 - .007, ring: jamb }, { z: s * .164 + .007, ring: jamb },
    ]), center, 'turret', 'turret', 'equipment', yaw);
  }
  const plan = new THREE.Shape([new THREE.Vector2(.324, -.1337), new THREE.Vector2(.440, -.1818),
    new THREE.Vector2(.440, .1818), new THREE.Vector2(.324, .1337)]);
  const band = new THREE.ExtrudeGeometry(plan, { depth: .01808, bevelEnabled: false })
    .rotateX(-Math.PI / 2).translate(0, 2.695375, 0);
  emit(C, `CommanderPeriscope${i}TopBand`, band, center, 'turret', 'turret', 'equipment', yaw);
}

function crows(C: EquipmentContext, lowProfile: boolean): void {
  // LP is an independently shortened support/yoke configuration, not a
  // scaled complete source vehicle. Its exact stock dimensions are photo
  // inferences; only the full-height SEP v2 station is measured by this OBJ.
  const drop = lowProfile ? .265 : 0;
  crowsFoldedCover(C);
  emit(C, 'CrowsSlew', KIT.cylY(.125, .125, .0327, 40), [-.713066, 2.560105, .633836]);
  emit(C, 'CrowsStem', KIT.cylY(.09473, .09473, .06173, 20), [-.713066, 2.60731, .633896]);
  emit(C, 'CrowsRotator', KIT.cylY(.10692, .10692, .06682, 20), [-.713084, 2.671185, .633811]);
  crowsCrosshead(C);
  crowsSideCabinet(C, drop);
  for (const s of [-1, 1]) {
    crowsYoke(C, s, drop);
  }
  box(C, 'CrowsCrossmember', [.5983, .052, .314], [-.713147, 2.83942, .35096]);
  box(C, 'CrowsFrontCradle', [.39757, .040, .19237], [-.714809, 2.83935, .854761]);
  box(C, 'CrowsAmmoBox', [.35601, .15999, .41181], [-.441105, 3.28964 - drop, .524621]);
  box(C, 'CrowsFeedNeck', [.119, .050, .137], [-.640, 3.248 - drop, .493]);
  buildAbramsSourceXCrows((name, geometry, glass) => emit(C, name, geometry,
    [0, 0, 0], 'turret', glass ? 'turretGlass' : 'turret'), C.P.q, drop);
  sourceM2(C, 'CrowsM2', [-.714903, 3.251900 - drop, .465713], 'turret');
}

function crowsFoldedCover(C: EquipmentContext): void {
  // Measured84/3 receiving cover. Three sparse crown/underside stations
  // retain the real24mm stock and under-cover air; the very shallow source
  // compound top differs by at most0.7mm from this ruled construction.
  const levels = [[.397286, 2.54092, 2.51664], [.710665, 2.54376, 2.51906],
    [.801686, 2.54376, 2.51976], [.901576, 2.54376, 2.51976]];
  emit(C, 'CrowsReceivingCover', closedSectionLoft(levels.map(([z, top, bottom]) => ({ z,
    ring: [[-1.222020, bottom], [-.464731, bottom], [-.464731, top], [-1.222020, top]] }))));
  crowsSideReturns(C);
  // The actual forward right receiving finger follows source84/2531's
  // lower plane, which meets the permanent source59 shoulder atZ.89–.90.
  // The24mm concealed closure joins the measured vertical side stock;
  // neither the centre-left air nor the higher front slot is filled.
  emit(C, 'CrowsRightReceivingFoot', planeBoundedArmor([
    [1, 0, 0, -.464731], [-1, 0, 0, .479601],
    [0, 0, -1, -.830216], [0, 0, 1, .901576],
    [.0446590777324, -.993128062571, -.108176790998, -2.409853350214],
    [-.0446590777324, .993128062571, .108176790998, 2.433853350214],
  ]));
  // The aft return is stepped below its continuous upper course. Its left
  // measured segment descends onto the existing permanent sight housing.
  emit(C, 'CrowsAftReturnCrown', new THREE.BoxGeometry(.757289, .0791, .025),
    [-.8433755, 2.50137, .409786]);
  const ring: [number, number][] = [[-1.20582, 2.345168], [-.87, 2.362123],
    [-.87, 2.49092], [-1.20582, 2.49092]];
  emit(C, 'CrowsAftReturnLeft', closedSectionLoft([{ z: .397286, ring }, { z: .422286, ring }]));
}

function crowsSideReturns(C: EquipmentContext): void {
  // Principal cut-edge levels from independent source84 side-plane sections.
  // The deep fingers alternate with raised returns; notably the open front
  // slot must not be bridged by a uniform side wall. Small edge chamfers are
  // authored linear transitions, not a copy of the484-triangle source mesh.
  const left: [number, number][] = [[.397286, 2.429145], [.442796, 2.423385], [.457846, 2.410035],
    [.457846, 2.332638], [.573276, 2.319565], [.577636, 2.401935], [.586496, 2.403835],
    [.629106, 2.398725], [.637966, 2.394635], [.638686, 2.311835], [.765276, 2.296225],
    [.772076, 2.378955], [.779966, 2.381215], [.819166, 2.376475], [.828026, 2.371955],
    [.830216, 2.288565], [.901576, 2.279005]];
  const right: [number, number][] = [[.397286, 2.462355], [.445955, 2.462355], [.454935, 2.459355],
    [.457845, 2.383695], [.573275, 2.371875], [.578855, 2.439435], [.586495, 2.441185],
    [.629105, 2.437975], [.636745, 2.433675], [.638685, 2.362755], [.765275, 2.348025],
    [.772075, 2.419165], [.779965, 2.421645], [.819165, 2.417985], [.828025, 2.413755],
    [.830215, 2.340285], [.901576, 2.330435]];
  for (const [name, x, width, edge] of [['Left', -1.222020, .016200, left],
    ['Right', -.479601, .014870, right]] as const) {
    const contour = [...edge, [.901576, 2.421555], [.834216, 2.435855], [.825356, 2.439945],
      [.825356, 2.492545], [.834336, 2.495535], [.901576, 2.495535],
      [.901576, 2.54376], [.397286, 2.54092]];
    const shape = new THREE.Shape(contour.map(([z, y]) => new THREE.Vector2(-z, y)));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false }).rotateY(Math.PI / 2);
    emit(C, `CrowsReturn${name}`, geometry, [x, 0, 0]);
  }
}

function crowsCrosshead(C: EquipmentContext): void {
  // Source87/6 lower transverse body has an asymmetric stepped underside.
  // The right lower foot overlaps the real rotator; the centre is not filled
  // down to the bearing simply to manufacture centreline contact.
  const lower: [number, number][] = [[-.991784, 2.720505], [-.814084, 2.716635], [-.612084, 2.716635],
    [-.612084, 2.663085], [-.461264, 2.663085], [-.481504, 2.857365]];
  const ring: [number, number][] = [...lower, [-.963044, 2.857365]];
  const recessed: [number, number][] = [...lower, [-.616324, 2.857365], [-.616324, 2.822425],
    [-.809834, 2.822425], [-.809834, 2.857365], [-.963044, 2.857365]];
  for (const [name, z0, z1, contour] of [['Aft', .543996, .572516, ring],
    ['Centre', .572516, .718286, recessed], ['Fore', .718286, .725926, ring]] as const) {
    emit(C, `CrowsCrosshead${name}`, closedSectionLoft([{ z: z0, ring: contour }, { z: z1, ring: contour }]));
  }
}

function crowsYoke(C: EquipmentContext, side: number, drop: number): void {
  // Source87/21,177: broad eight-millimetre outer skins with separate inward
  // edge/rib stock. The open space between the two yokes remains real air.
  const outer = side < 0 ? -1.002210 : -.430654, inner = outer - side * .008040;
  const cut = (x0: number, x1: number, bottom: number, top: number, aft: number, fore: number, d: number) =>
    planeBoundedArmor([[1, 0, 0, x1], [-1, 0, 0, -x0], [0, -1, 0, -bottom + drop],
      [0, 1, 0, top - drop], [0, 0, -1, -aft], [0, 0, 1, fore],
      [0, .906341, -.422547, d - .906341 * drop]]);
  emit(C, `CrowsYoke${side}`, cut(Math.min(outer, inner), Math.max(outer, inner),
    2.884365, 3.327495, .721555, 1.074145, 2.575202));
  const a = outer - side * .024230, b = inner;
  for (const z of [.71828, 1.078695]) box(C, `CrowsYoke${side}End${z}`, [.01619, .45663 - drop, .00655],
    [(a + b) / 2, 3.10669 - drop / 2, z]);
  box(C, `CrowsYoke${side}Foot`, [.01619, .010, .36824], [(a + b) / 2, 2.883375, .899125]);
  // Inward diagonal rib, bounded by the source's two independent planes.
  const c = outer - side * .06459;
  emit(C, `CrowsYoke${side}Rib`, planeBoundedArmor([
    [1, 0, 0, Math.max(a, c)], [-1, 0, 0, -Math.min(a, c)],
    [0, 0, -1, -.721555], [0, 0, 1, 1.080455],
    [0, -.866350, .499437, -2.184512 + .866350 * drop],
    [0, .896873, -.442289, 2.406164 - .896873 * drop],
  ]));
}

function crowsSideCabinet(C: EquipmentContext, drop: number): void {
  // Source87/411 is a compact closed case with a genuine U-shaped underside,
  // not a diagonal open scaffold or a box filling the space under the case.
  // Only the full-height station is source-measured. LP compresses this one
  // housing above its unchanged lower attachment as a declared photo inference.
  const height = (y: number) => y - drop * Math.min(1, Math.max(0, (y - 2.707375) / .428680));
  const edge = [[.274555, 2.721525], [.279165, 2.711965], [.288755, 2.707375],
    [.470325, 2.707375], [.470325, 2.719625], [.522635, 2.882245], [.725565, 2.882245],
    [.777995, 2.719625], [.777995, 2.707375], [.956415, 2.707375], [.966005, 2.711965],
    [.970615, 2.721525], [.970615, 3.136055], [.274555, 3.136055]];
  const shape = new THREE.Shape(edge.map(([z, y]) => new THREE.Vector2(-z, height(y))));
  emit(C, 'CrowsSideCabinet', new THREE.ExtrudeGeometry(shape,
    { depth: .144851, bevelEnabled: false }).rotateY(Math.PI / 2), [-.392755, 0, 0]);
  // The separate source301 lid and10 upper stock meet the retained ammo box;
  // their overlap is geometric, not a metadata-only mounting declaration.
  emit(C, 'CrowsSideCabinetLid', new THREE.BoxGeometry(.160121, .026780, .705040),
    [-.3239145, 3.141565 - drop, .622585]);
  crowsCabinetAmmoSeat(C, drop);
  crowsCabinetLinks(C);
}

function crowsCabinetAmmoSeat(C: EquipmentContext, drop: number): void {
  // Source87/10's crown is a shallow saddle with two tiny raised end tabs,
  // not a full-width56mm-high block inferred from the tabs' overall bound.
  const edge = [[.287785, 3.154805], [.425535, 3.154805], [.372375, 3.175015],
    [.359515, 3.185775], [.350775, 3.198435], [.342515, 3.188875], [.318005, 3.188875],
    [.309145, 3.198065], [.300285, 3.174945], [.287785, 3.174945]];
  const shape = new THREE.Shape(edge.map(([z, y]) => new THREE.Vector2(-z, y - drop)));
  emit(C, 'CrowsSideCabinetAmmoSeat', new THREE.ExtrudeGeometry(shape,
    { depth: .157920, bevelEnabled: false }).rotateY(Math.PI / 2), [-.403105, 0, 0]);
  for (const [i, x0, x1, crown] of [[0, -.397735, -.395805, 3.211495],
    [1, -.254475, -.252555, 3.211415]]) {
    const tab = [[.315815, 3.188875], [.341305, 3.188875], [.341305, 3.207775],
      [.333535, crown], [.325165, crown], [.315815, 3.207775]];
    const profile = new THREE.Shape(tab.map(([z, y]) => new THREE.Vector2(-z, y - drop)));
    emit(C, `CrowsAmmoSeatTab${i}`, new THREE.ExtrudeGeometry(profile,
      { depth: x1 - x0, bevelEnabled: false }).rotateY(Math.PI / 2), [x0, 0, 0]);
  }
}

function crowsCabinetLinks(C: EquipmentContext): void {
  // Two actual11.9mm side links (87/121,125) support the cabinet through its
  // lower channel. The37.9mm space to the upper yoke is genuinely open.
  const ring: [number, number][] = [[-.426404, 2.722835], [-.377084, 2.722835],
    [-.301074, 2.816955], [-.301074, 2.877355], [-.423354, 2.877355], [-.473344, 2.847665]];
  for (const [i, z0, z1] of [[0, .567785, .579675], [1, .670215, .682115]]) {
    emit(C, `CrowsCabinetLink${i}`, closedSectionLoft([{ z: z0, ring }, { z: z1, ring }]));
  }
  emit(C, 'CrowsCabinetBottomChannel', new THREE.BoxGeometry(.069170, .019550, .188490),
    [-.335659, 2.872760, .624040]);
  for (const [i, x0, x1, low, bevel, top] of [[0, -.382594, -.370244, 2.816955, 2.834975, 2.882535],
    [1, -.301074, -.288734, 2.818045, 2.835995, 2.880135]]) {
    const edge = [[.528095, bevel], [.541205, low], [.707235, low], [.720345, bevel],
      [.720345, top], [.528095, top]];
    const shape = new THREE.Shape(edge.map(([z, y]) => new THREE.Vector2(-z, y)));
    emit(C, `CrowsCabinetChannelSide${i}`, new THREE.ExtrudeGeometry(shape,
      { depth: x1 - x0, bevelEnabled: false }).rotateY(Math.PI / 2), [x0, 0, 0]);
  }
  emit(C, 'CrowsCabinetCrossheadFlange', planeBoundedArmor([
    [.91858036181, .395234258254, 0, .697108872045],
    [-.988261604463, -.152771074305, 0, .0396739419285],
    [0, -1, 0, -2.716415], [-.106141404926, .994351045738, 0, 2.891852920393],
    [0, 0, -1, -.546175], [0, 0, 1, .728115],
  ]));
}

function localCommanderStation(C: EquipmentContext, a1: boolean): void {
  // A1 deletes CITV and remote station. The independently authored local
  // commander weapon and low trunnion cradle are primary-photo inferences.
  const label = a1 ? 'A1Station' : 'A2SCWS';
  emit(C, `${label}Race`, tubeY(.315, .284, .032, 40), [-.507216, 2.641, -.3524195]);
  for (const s of [-1, 1]) box(C, `${label}WeaponEar${s}`, [.035, .172, .112],
    [-.507216 + s * .071, 2.723, -.014]);
  box(C, `${label}WeaponCradle`, [.177, .028, .184], [-.507216, 2.794, -.014]);
  sourceM2(C, `${label}CommanderM2`, [-.507216, 2.863, .050], 'turret');
}

function shieldPanel(C: EquipmentContext, name: string, a: XYZ, b: XYZ, bottom: number, top: number): void {
  // An open bent shield consists of distinct stock and inset transparent
  // panes. Closed side returns have visible thickness, not double-sided faces.
  const dx = b[0] - a[0], dz = b[2] - a[2], w = Math.hypot(dx, dz), yaw = -Math.atan2(dz, dx);
  const center: XYZ = [(a[0] + b[0]) / 2, (bottom + top) / 2, (a[2] + b[2]) / 2];
  box(C, `${name}Lower`, [w, .195, .026], [center[0], bottom + .0975, center[2]], 'turret', 'turret', yaw);
  box(C, `${name}Top`, [w, .024, .026], [center[0], top - .012, center[2]], 'turret', 'turret', yaw);
  for (const [i, p] of [a, b].entries()) box(C, `${name}Edge${i}`, [.025, top - bottom, .028],
    [p[0], (bottom + top) / 2, p[2]], 'turret', 'turret', yaw);
  box(C, `${name}Pane`, [w - .030, top - bottom - .219, .015],
    [center[0], (bottom + .195 + top - .024) / 2, center[2]], 'turret', 'turretGlass', yaw);
}

function shieldStock(C: EquipmentContext, name: string, u0: number, u1: number,
  bottom: number, top: number, v0: number, v1: number): void {
  // Owner85's screen uses this measured horizontal basis, not a world AABB.
  // Its panel normal is (.46175,0,-.88701); u runs along the screen.
  const yaw = -Math.atan2(.461746, .887012), u = (u0 + u1) / 2, v = (v0 + v1) / 2;
  const x = u * Math.cos(yaw) + v * Math.sin(yaw), z = -u * Math.sin(yaw) + v * Math.cos(yaw);
  emit(C, name, new THREE.BoxGeometry(u1 - u0, top - bottom, v1 - v0),
    [x, (bottom + top) / 2, z], 'turret', 'turret', 'equipment', yaw);
}

function loaderInboardShield(C: EquipmentContext): void {
  // Source85/5267 is an open 16.2mm panel surrounding a 282×301mm
  // opening. The separate 5185 outer rim must not become a solid screen.
  shieldStock(C, 'LoaderInboardLower', .0240, .4017, 2.438095, 2.573425, -.08815, -.07190);
  shieldStock(C, 'LoaderInboardCrown', .0253, .4004, 2.874075, 2.944775, -.08815, -.07190);
  for (const [label, lo, hi] of [['Left', .0113, .0719], ['Right', .3539, .4146]] as const) {
    shieldStock(C, `LoaderInboardJamb${label}`, lo, hi, 2.450135, 2.931785, -.08815, -.07190);
  }
  for (const [label, lo, hi] of [['Left', .0095, .0245], ['Right', .4011, .4167]] as const) {
    shieldStock(C, `LoaderInboardRim${label}`, lo, hi, 2.520755, 2.936525, -.09055, -.06935);
  }
  shieldStock(C, 'LoaderInboardRimCrown', .0142, .4115, 2.932585, 2.945935, -.09055, -.06935);
  // Owner106/44 is supported64.44mm glazing. Only the METAL frame is open:
  // the complete source aperture correctly hits this recessed real pane.
  emit(C, 'LoaderInboardGlazing', planeBoundedArmor([
    [.46190274, 0, -.88693058, .08379407], [-.46188926, 0, .88693760, -.01935477],
    [-.88720665, 0, -.46137225, -.07320948], [.88711003, 0, .46155800, .35251480],
    [0, -1, 0, -2.567375], [0, 1, 0, 2.880205],
  ]), [0, 0, 0], 'turret', 'turretGlass');
  loaderShieldFoot(C);
}

function loaderShieldFoot(C: EquipmentContext): void {
  // Measured curved5455 flange and five separate5375-series radial feet;
  // the spaces between feet stay open rather than a screen-sized pedestal.
  loaderShieldFlange(C);
  for (const a of [-.1935, -.3433, -.4861, -.6268, -.7770]) {
    const point = (r: number): XYZ => [.4522 + r * Math.sin(a), 0, -.40044 + r * Math.cos(a)];
    screenStrip(C, `LoaderShieldFoot${a}`, point(.410), point(.558), 2.381555, 2.392575, .014);
  }
  // Source leaves1.89mm between hinge and frame. A concealed2mm upper
  // seating extension joins them; every visible frame/glass datum is fixed.
  const ring: [number, number][] = [[.0619, 2.403225], [.0989, 2.403225], [.089482, 2.415705],
    [.089482, 2.438205], [.071412, 2.438205], [.071412, 2.415705]];
  const hinge = closedSectionLoft([{ z: .01489, ring }, { z: .41029, ring }]);
  hinge.rotateY(Math.atan2(.88675, .46225));
  emit(C, 'LoaderShieldHinge', hinge);
}

function loaderShieldFlange(C: EquipmentContext): void {
  // Independently fitted six-section arc rulers, not a copied contour.
  // The two source circles differ slightly; do not force a common center.
  const points: THREE.Vector2[] = [], count = C.P.q ? 24 : 16;
  for (const outer of [true, false]) for (let i = 0; i <= count; i++) {
    const t = outer ? i / count : 1 - i / count;
    const a = outer ? 1.6366 + .8491 * t : 1.6447 + .8423 * t;
    const x = outer ? .454844 : .454335, z = outer ? -.404887 : -.403821, r = outer ? .565821 : .417057;
    points.push(new THREE.Vector2(x + r * Math.cos(a), -(z + r * Math.sin(a))));
  }
  emit(C, 'LoaderShieldFlange', new THREE.ExtrudeGeometry(new THREE.Shape(points), {
    depth: .01591, bevelEnabled: false, steps: 1 }).rotateX(-Math.PI / 2), [0, 2.392205, 0]);
}

function screenStrip(C: EquipmentContext, name: string, a: XYZ, b: XYZ,
  bottom: number, top: number, depth: number): void {
  const dx = b[0] - a[0], dz = b[2] - a[2];
  emit(C, name, new THREE.BoxGeometry(Math.hypot(dx, dz), top - bottom, depth),
    [(a[0] + b[0]) / 2, (bottom + top) / 2, (a[2] + b[2]) / 2],
    'turret', 'turret', 'equipment', -Math.atan2(dz, dx));
}

function commanderScreenPanel(C: EquipmentContext, label: string, a: XYZ, b: XYZ,
  depth: number, jamb: number): void {
  const point = (t: number): XYZ => [a[0] + (b[0] - a[0]) * t, 0, a[2] + (b[2] - a[2]) * t];
  const f = jamb / Math.hypot(b[0] - a[0], b[2] - a[2]);
  // Both the lower service opening and upper viewing opening are real air.
  for (const [i, y0, y1] of [[0, 2.476565, 2.579795], [1, 2.689815, 2.832005], [2, 3.077355, 3.145495]]) {
    screenStrip(C, `${label}Course${i}`, a, b, y0, y1, depth);
  }
  screenStrip(C, `${label}JambA`, a, point(f), 2.476565, 3.145495, depth);
  screenStrip(C, `${label}JambB`, point(1 - f), b, 2.476565, 3.145495, depth);
}

function commanderFrame(C: EquipmentContext, label: string, a: XYZ, b: XYZ): void {
  const dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz);
  const n: XYZ = [dz / length, 0, -dx / length];
  const shift = (p: XYZ, d: number): XYZ => [p[0] + n[0] * d, 0, p[2] + n[2] * d];
  // Source84's 57mm bounding height is a folded channel, not a solid beam:
  // 4.6mm web plus two opposed narrow returns retain the under-web air.
  for (const [i, y] of [[0, 2.812675], [1, 3.096395]]) {
    screenStrip(C, `${label}Web${i}`, a, b, y, y + .0046, .051);
    screenStrip(C, `${label}OuterLip${i}`, shift(a, .0265), shift(b, .0265), y - .02867, y + .0011, .0059);
    screenStrip(C, `${label}InnerLip${i}`, shift(a, -.025), shift(b, -.025), y + .0046, y + .02845, .0079);
  }
  for (const [i, p] of [a, b].entries()) {
    const inset: XYZ = [p[0] + (i ? -1 : 1) * dx * .016 / length, 0,
      p[2] + (i ? -1 : 1) * dz * .016 / length];
    screenStrip(C, `${label}LegWeb${i}`, p, inset, 2.842215, 3.066555, .052);
    screenStrip(C, `${label}LegLip${i}`, shift(p, .027), shift(inset, .027), 2.842215, 3.066555, .006);
  }
}

function commanderOuterShield(C: EquipmentContext): void {
  // Two principal planes measured on84/5, plus its short forward return.
  commanderScreenPanel(C, 'CommanderOuterSide', [-1.05157, 0, -.514084], [-1.04896, 0, -.152464], .01216, .058);
  commanderScreenPanel(C, 'CommanderOuterAft', [-1.05157, 0, -.514084], [-.8025, 0, -.81733], .0143, .073);
  screenStrip(C, 'CommanderOuterForeReturn', [-1.04896, 0, -.152464], [-.9781, 0, -.06781],
    2.682955, 3.145495, .0132);
  commanderFrame(C, 'CommanderOuterSideFrame', [-1.08431, 0, -.182984], [-1.08643, 0, -.484594]);
  commanderFrame(C, 'CommanderOuterAftFrame', [-1.04840, 0, -.57738], [-.85037, 0, -.80956]);
  commanderShieldFoot(C);
  commanderShieldGlazing(C);
}

function commanderShieldGlazing(C: EquipmentContext): void {
  // Complete-source106/0 and106/6 are44.6mm laminated panes, not empty
  // windows. Their steel frame stays independently open and visibly thick.
  emit(C, 'CommanderOuterSideGlazing', planeBoundedArmor([
    [1, 0, .00047645, -1.06359347], [-1, 0, -.00047602, 1.10820328],
    [0, 0, 1, -.196334], [0, 0, -1, .469304],
    [0, 1, -.00025679, 3.09410533], [0, -1, 0, -2.814205],
  ]), [0, 0, 0], 'turret', 'turretGlass');
  emit(C, 'CommanderOuterAftGlazing', planeBoundedArmor([
    [-.76567563, 0, -.64322688, 1.19391197], [.76580220, 0, .64307619, -1.14934738],
    [-.64227598, 0, .76647346, .21388623], [.64304938, 0, -.76582471, .05787125],
    [.00016516, 1, -.00019669, 3.09399968], [0, -1, 0, -2.814205],
  ]), [0, 0, 0], 'turret', 'turretGlass');
}

function commanderShieldFoot(C: EquipmentContext): void {
  // Nine held-out source201 outer rays bound this sparse ellipse within
  // .561mm. Its source inner wall is open into the cupola; the authored
  // closed inner edge is concealed about10mm inside the unchanged real rim.
  const points: THREE.Vector2[] = [], segments = C.P.q ? 32 : 20;
  for (const outer of [true, false]) {
    for (let i = 0; i <= segments; i++) {
      const t = outer ? i / segments : 1 - i / segments, a = -2.6348 + 1.6322 * t;
      points.push(new THREE.Vector2((outer ? .565373 : .470) * Math.sin(a),
        -(outer ? .577020 : .495) * Math.cos(a)));
    }
  }
  const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(points), { depth: .00912,
    bevelEnabled: false, steps: 1 }).rotateX(-Math.PI / 2);
  emit(C, 'CommanderShieldFoot', geometry, [-.528499, 2.470435, -.335225]);
}

function loaderWeapon(C: EquipmentContext, shields: boolean): void {
  for(const part of sourceLoaderMount())emit(C,part.name,part.geometry);
  // Source loader M240 is traversed outward at rest, independent of the
  // main gun. Its narrow receiver and open muzzle are not a second M2.
  const group = new THREE.Group();
  for(const part of sourceLoaderWeapon(!!C.P.q))mgMesh(C,group,part.name,part.geometry,[0,0,0]);
  for(const part of sourceLoaderFeed())mgMesh(C,group,part.name,part.geometry,[0,0,0]);
  mgMesh(C, group, 'LoaderM240Barrel', profiledTube([{ z: .18, r: .0116 }, { z: .644, r: .0116 },
    { z: .655, r: .013205 }, { z: .696, r: .013205 }], .004, 16), [0, .011, 0]);
  group.position.set(.840 - C.frame.turret[0], 2.69153 - C.frame.turret[1], -.06037 - C.frame.turret[2]);
  group.rotation.y = Math.atan2(.829, .559);
  FITTINGS.markExact(group, 'pintleMG');
  group.name = 'abramsSourceX_LoaderM240';
  group.userData.sourceOwner = 'Object_102';
  C.P.turretG.add(group);
  if (!shields) return;
  for(const part of sourceLoaderShields())emit(C,part.name,part.geometry,[0,0,0],'turret',part.glass?'turretGlass':'turret');
  shieldPanel(C, 'CommanderShieldInboard', [-.075, 0, .041], [-.286, 0, -.395], 2.678275, 3.146435);
  shieldPanel(C, 'CommanderShieldAft', [-.286, 0, -.395], [-.366, 0, -.538], 2.678275, 3.146435);
  commanderOuterShield(C);
  loaderInboardShield(C);
}

function smoke(C: EquipmentContext): void {
  for (const [side, x] of [[-1, -1.566945], [1, 1.430295]] as const) {
    box(C, `SmokeBase${side}`, [.277, .054, .297], [x, 2.035, .579], 'turret', 'turret', side * .31);
    for (let row = 0; row < 2; row++) for (let i = 0; i < 3; i++) {
      const geometry = annularZ(.043, .032, .166, C.P.q ? 18 : 8);
      geometry.rotateX(-.70);
      geometry.rotateY(side * .46);
      emit(C, `SmokeTube${side}_${row}_${i}`, geometry,
        [x + (i - 1) * .096, 2.105 + row * .072, .635 - row * .105]);
    }
  }
}

function basketRail(C: EquipmentContext, label: string, y: number, rearZ: number,
  left: number, right: number, frontZ: number): void {
  // Source59 courses have ~192mm plan bends, not the old85mm corners.
  const radius = .19213, points: XYZ[] = [[left, y, frontZ], [left, y, rearZ + radius]];
  for (let i = 1; i <= 4; i++) {
    const a = Math.PI + i * Math.PI / 8;
    points.push([left + radius + radius * Math.cos(a), y, rearZ + radius + radius * Math.sin(a)]);
  }
  points.push([right - radius, y, rearZ]);
  for (let i = 1; i <= 4; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 8;
    points.push([right - radius + radius * Math.cos(a), y, rearZ + radius + radius * Math.sin(a)]);
  }
  points.push([right, y, frontZ]);
  for (let i = 1; i < points.length; i++) rail(C, `${label}_${i}`, points[i - 1], points[i]);
}

function bag(C: EquipmentContext, name: SourceStowageBagName): void {
  for (const part of sourceStowageBag(name, !!C.P.q)) {
    emit(C, part.name, part.geometry, [0, 0, 0], 'turret', 'turretCloth');
  }
}

function* rearEquipmentCooperativeSteps(C: EquipmentContext, fullLoadout: boolean, cooperative = false): TankProfileBuild {
  // Four source U-shaped courses, posts and sparse floor rails. There is no
  // opaque basket-sized slab and no membrane closing the spaces between bars.
  for (const [i, y] of [1.910915, 2.029575, 2.159575, 2.28926].entries()) {
    basketRail(C, `BasketCourse${i}`, y, -2.7842, -1.5498, 1.4209, -2.2914);
  }
  yield* tankProfileCheckpoint(cooperative, "rearEquipment:for (const [i, y] of [1.910915, 2.029575, 2.159575, 2.28926].entries()) {");
  const lowerStrip = sourceMainRackStrip();
  emit(C, lowerStrip.name, lowerStrip.geometry);
  yield* tankProfileCheckpoint(cooperative, "rearEquipment:emit(C, lowerStrip.name, lowerStrip.geometry);");
  for (const part of sourceMainRackSupports()) emit(C, part.name, part.geometry);
  yield* tankProfileCheckpoint(cooperative, "rearEquipment:for (const part of sourceMainRackSupports()) emit(C, part.name, part.geometry);");
  for (const s of [-1, 1]) {
    const x = s < 0 ? -1.562 : 1.430;
    rail(C, `SideGuard${s}`, [x, 1.811, .733], [x, 1.832, -1.601], .012);
    for (const z of [.65, -.5, -1.52]) rail(C, `SideGuardFoot${s}_${z}`, [x, 1.71, z], [x, 1.832, z], .011);
  }
  yield* tankProfileCheckpoint(cooperative, "rearEquipment:for (const s of [-1, 1]) {");
  for (const part of buildAbramsSourceXAftCase()) emit(C, part.name, part.geometry);
  yield* tankProfileCheckpoint(cooperative, "rearEquipment:for (const part of buildAbramsSourceXAftCase()) emit(C, part.name, part.geometry);");
  rearRadioMast(C);
  yield* tankProfileCheckpoint(cooperative, "rearEquipment:rearRadioMast(C);");
  if (fullLoadout) {
    for (const part of sourceExtendedRack()) emit(C, part.name, part.geometry);
  yield* tankProfileCheckpoint(cooperative, "rearEquipment:for (const part of sourceExtendedRack()) emit(C, part.name, part.geometry);");
    bag(C, 'AftBagLeft');
  yield* tankProfileCheckpoint(cooperative, "rearEquipment:bag(C, 'AftBagLeft');");
    bag(C, 'AftBagCenter');
  yield* tankProfileCheckpoint(cooperative, "rearEquipment:bag(C, 'AftBagCenter');");
    bag(C, 'AftBagRight');
  yield* tankProfileCheckpoint(cooperative, "rearEquipment:bag(C, 'AftBagRight');");
    for (const part of sourceContainers(!!C.P.q)) emit(C, part.name, part.geometry);
  yield* tankProfileCheckpoint(cooperative, "rearEquipment:for (const part of sourceContainers(!!C.P.q)) emit(C, part.name, part.geometry);");
    for (const part of sourceContainerReceivers()) emit(C, part.name, part.geometry);
  yield* tankProfileCheckpoint(cooperative, "rearEquipment:for (const part of sourceContainerReceivers()) emit(C, part.name, part.geometry);");
    // The tall source item is a thick electronic antenna stock, not a whip.
    rearTallMastSeat(C);
  yield* tankProfileCheckpoint(cooperative, "rearEquipment:rearTallMastSeat(C);");
    emit(C, 'RearTallMastBase', KIT.cylY(.0649, .0649, .01991, 24), [-.69135, 2.41354, -2.66557]);
  yield* tankProfileCheckpoint(cooperative, "rearEquipment:emit(C, 'RearTallMastBase', KIT.cylY(.0649, .0649, .01991, 24), [-.69135, 2.41354, -2.6655");
    rail(C, 'RearTallMastSupport', [-.69161, 2.419265, -2.665505], [-.69161, 2.880345, -2.665505], .042485);
  yield* tankProfileCheckpoint(cooperative, "rearEquipment:rail(C, 'RearTallMastSupport', [-.69161, 2.419265, -2.665505], [-.69161, 2.880345, -2.6655");
    emit(C, 'RearTallMastUpperFlange', KIT.cylY(.069765, .069765, .023710, 16),
      [-.69135, 2.885560, -2.665570]);
  yield* tankProfileCheckpoint(cooperative, "rearEquipment:emit(C, 'RearTallMastUpperFlange', KIT.cylY(.069765, .069765, .023710, 16),");
    emit(C, 'RearTallMastInsulator', KIT.cylY(.0425, .0425, .2255, 24), [-.69135, 3.003455, -2.66557]);
  yield* tankProfileCheckpoint(cooperative, "rearEquipment:emit(C, 'RearTallMastInsulator', KIT.cylY(.0425, .0425, .2255, 24), [-.69135, 3.003455, -2");
    emit(C, 'RearTallMast', KIT.cylY(.0549, .0549, 1.06077, 24), [-.69135, 3.646590, -2.66557]);
  yield* tankProfileCheckpoint(cooperative, "rearEquipment:emit(C, 'RearTallMast', KIT.cylY(.0549, .0549, 1.06077, 24), [-.69135, 3.646590, -2.66557]");
  }
  yield* tankProfileCheckpoint(cooperative, "rearEquipment:if (fullLoadout) {");
  for (const x of [1.069285, -1.20545]) {
    // Selected source owner58, distinct from the aft electronic mast78.
    // Its narrow upper rods retain the source's stepped section and height.
    emit(C, `WhipFoot${x}`, KIT.cylY(.020, .033075, .0944, 24), [x, 2.421745, -2.101085]);
    emit(C, `WhipStock${x}`, KIT.cylY(.033075, .033075, 1.1729, 24), [x, 3.055395, -2.101085]);
    emit(C, `WhipTip${x}`, KIT.cylY(.0172, .0172, .53513, 12), [x, 3.909410, -2.101085]);
  }
  yield* tankProfileCheckpoint(cooperative, "rearEquipment:for (const x of [1.069285, -1.20545]) {");
}

function rearTallMastSeat(C: EquipmentContext): void {
  // Source79/0 is a real closed equipment case with an overhanging lid. It
  // rests on the existing basket floor; a narrow408 socket and472 flange
  // receive the78 mast. This is not an invented mast-sized pedestal.
  emit(C, 'RearTallMastCase', new THREE.BoxGeometry(.472915, .420870, .467640),
    [-.8439625, 2.132810, -2.534365]);
  emit(C, 'RearTallMastCaseLid', new THREE.BoxGeometry(.496145, .019700, .490210),
    [-.8439675, 2.353095, -2.534370]);
  emit(C, 'RearTallMastSocket', KIT.cylY(.048, .048, .033780, 16),
    [-.691915, 2.375675, -2.665510]);
  emit(C, 'RearTallMastFlange', KIT.cylY(.06475, .06475, .017210, 16),
    [-.691350, 2.398840, -2.665570]);
}

function rearRadioMast(C: EquipmentContext): void {
  // Source59/1453 is the actual receiving foot, not the nearby offset left
  // roof plate. It overlaps the aft wall and the round lower stock by1.32mm.
  emit(C, 'RearRadioMastFoot', planeBoundedArmor([
    [1, 0, 0, .076217], [-1, 0, 0, .050633], [0, 1, 0, 2.300175], [0, -1, 0, -2.281865],
    [.00954007, 0, .99995449, -2.28453398], [-.00094540, 0, -.99999955, 2.39841181],
  ]));
  emit(C, 'RearRadioMastFootTab', KIT.cylZ(.01094, .06627, 8), [-.061733, 2.292805, -2.34120]);
  emit(C, 'RearRadioMastLower', KIT.cylY(.05607, .05607, .18414, 12), [.0057215, 2.390925, -2.34144]);
  emit(C, 'RearRadioMastNeck', KIT.cylY(.05188, .05188, .00504, 12), [.005686, 2.485515, -2.34138]);
  // The .22mm source collar seam is kept; a concealed axial tenon supports
  // these separately authored skins without altering their visible levels.
  emit(C, 'RearRadioMastTenon', KIT.cylY(.025, .025, .460, 12), [.005686, 2.712, -2.34138]);
  emit(C, 'RearRadioMastCollar', KIT.cylY(.06383, .06383, .03698, 12), [.005686, 2.506745, -2.341435]);
  emit(C, 'RearRadioMastStock', KIT.cylY(.04890, .04890, .40709, 24), [.005685, 2.729000, -2.341195]);
  box(C, 'RearRadioMastCap', [.14663, .03874, .08411], [.005620, 2.951845, -2.340530]);
  for (const z of [-2.31201, -2.369475]) box(C, `RearRadioMastCapLug${z}`, [.02553, .00840, .02555],
    [.00567, 2.96775, z]);
}

function curvedTile(C: EquipmentContext, name: string, side: number, crownX: number,
  z: number, bottom: number, top: number): void {
  // Source74/76 section rays show about13mm closed sheet, bowed in plan and
  // canted outward .248m per metre of height. A vertical .48m extrusion loses
  // both the raked front profile and the real stand-off behind the shell.
  const n = C.P.q ? 12 : 8, radius = .235, halfWidth = .1668;
  const stations = Array.from({ length: n + 1 }, (_, i) => {
    const dz = -halfWidth + i * 2 * halfWidth / n;
    const bow = Math.sqrt(radius * radius - dz * dz) - radius;
    const endRise = .019 * Math.abs(dz / halfWidth);
    const low = bottom + endRise, high = top - .019 + endRise;
    const outer = (y: number) => side * (crownX + bow + .0686 * dz + .248 * (y - top));
    const lo = outer(low), hi = outer(high), thickness = side * .0132;
    const ring: [number, number][] = [[lo, low], [hi, high], [hi - thickness, high], [lo - thickness, low]];
    if (side < 0) ring.reverse();
    return { z: z + dz, ring };
  });
  emit(C, name, markEraHitFaces(closedSectionLoft(stations), [side, 0, 0], .05),
    [0, 0, 0], 'turret', 'turret', 'external');
}

function reactiveBox(C: EquipmentContext, name: string, size: XYZ, center: XYZ, side: number): void {
  emit(C, name, markEraHitFaces(KIT.box(...size), [side, 0, 0]), center, 'turret', 'turret', 'external');
}

function reactiveCassette(C: EquipmentContext, side: number, build: () => void): void {
  const suffix = side < 0 ? 'turret_era_L' : 'turret_era_R';
  const plate = C.P.spec.armor.turretPlates.find(p => p.kind === 'era' && p.name.endsWith(suffix));
  if (!plate) throw new Error(`Urban Abrams cassette has no gameplay owner ${suffix}`);
  C.P.destructibleCluster(plate.name, build);
}

function rearAratCourse(C: EquipmentContext, curved: boolean, side: number): void {
  for (let i = 0; i < 7; i++) {
    const z = -1.793205 + i * .33286, topX = 1.66374 + i * .02265 + (side < 0 ? .13617 : 0);
    const bottom = i < 4 ? 1.832995 : 1.761055, top = bottom + .43671;
    const x = side * (topX - .110);
    reactiveCassette(C, side, () => {
      reactiveBox(C, `AratMount${side}_${i}`, [.018, .265, .243], [x, bottom + .218, z], side);
      if (curved) curvedTile(C, `CurvedArat${side}_${i}`, side, topX, z, bottom, top);
      else reactiveBox(C, `SquareArat${side}_${i}`, [.075, .410, .307], [x + side * .047, bottom + .217, z], side);
    });
    for (const dy of [.090, .340]) emit(C, `AratBracket${side}_${i}_${dy}`,
      abramsAratBracket(side, x - side * .035, bottom + dy, z, .105));
  }
}

function foreAratCourse(C: EquipmentContext, curved: boolean, side: number): void {
  // Source72 is a separate lower shoulder course: three +X / four -X shells.
  for (let i = 0; i < (side > 0 ? 3 : 4); i++) {
    const z = .54236 + i * .3321, crown = 1.79372 - i * .01745 + (side < 0 ? .13624 : 0);
    const x = side * (crown - .106);
    reactiveCassette(C, side, () => {
      reactiveBox(C, `ForeAratMount${side}_${i}`, [.020, .264, .235], [x, 1.9232, z], side);
      if (curved) curvedTile(C, `ForeCurvedArat${side}_${i}`, side, crown, z, 1.704025, 2.140805);
      else reactiveBox(C, `ForeSquareArat${side}_${i}`, [.075, .410, .307], [x + side * .047, 1.9224, z], side);
    });
    for (const dy of [.10, .33]) emit(C, `ForeAratBracket${side}_${i}_${dy}`,
      abramsAratBracket(side, x - side * .045, 1.704025 + dy, z, .13));
  }
}

function turretArat(C: EquipmentContext, curved: boolean): void {
  for (const side of [-1, 1]) {
    rearAratCourse(C, curved, side);
    foreAratCourse(C, curved, side);
  }
}

export function buildAbramsSourceXEquipment(P: TankBuilderPort, options: AbramsSourceXEquipmentOptions,
  frame: AbramsSourceXEquipmentFrame): void {
  drainTankBuild(buildAbramsSourceXEquipmentCooperativeSteps(P, options, frame, false));
}

export function* buildAbramsSourceXEquipmentCooperativeSteps(P: TankBuilderPort, options: AbramsSourceXEquipmentOptions, frame: AbramsSourceXEquipmentFrame, cooperative = true): TankProfileBuild {
  const C = { P, frame };
  mainGun(C);
  yield* tankProfileCheckpoint(cooperative, "buildAbramsSourceXEquipment:mainGun(C);");
  roofHatches(C);
  yield* tankProfileCheckpoint(cooperative, "buildAbramsSourceXEquipment:roofHatches(C);");
  if (options.a1) localCommanderStation(C, true);
  else {
    citv(C);
    if (options.urbanArmor || options.sepv3) crows(C, options.sepv3);
    else localCommanderStation(C, false);
  }
  yield* tankProfileCheckpoint(cooperative, "buildAbramsSourceXEquipment:if (options.a1) localCommanderStation(C, true);");
  if (options.urbanArmor) counterAssaultMount(C);
  yield* tankProfileCheckpoint(cooperative, "buildAbramsSourceXEquipment:if (options.urbanArmor) counterAssaultMount(C);");
  loaderWeapon(C, options.urbanArmor);
  yield* tankProfileCheckpoint(cooperative, "buildAbramsSourceXEquipment:loaderWeapon(C, options.urbanArmor);");
  smoke(C);
  yield* tankProfileCheckpoint(cooperative, "buildAbramsSourceXEquipment:smoke(C);");
  yield* rearEquipmentCooperativeSteps(C, options.curvedArat, cooperative);
  if (options.urbanArmor) turretArat(C, options.curvedArat);
  yield* tankProfileCheckpoint(cooperative, "buildAbramsSourceXEquipment:if (options.urbanArmor) turretArat(C, options.curvedArat);");
  // Ukrainian service does not, by itself, prove a specific field cage or ERA
  // kit. The documented A1 station remains the only roof configuration delta.
  P.muzzleZ = ABRAMS_SOURCE_X_EQUIPMENT_DATUMS.muzzleZ - frame.gun[2];
  yield* tankProfileCheckpoint(cooperative, "buildAbramsSourceXEquipment:P.muzzleZ = ABRAMS_SOURCE_X_EQUIPMENT_DATUMS.muzzleZ - frame.gun[2];");
}

