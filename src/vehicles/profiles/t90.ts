import { captureAuxiliaryStock } from './auxiliaryStation.ts';
import { auxiliaryWeaponProfile } from '../auxiliaryWeapons.ts';
import * as THREE from 'three';
import { KIT as UNTYPED_KIT, FITTINGS, orientedSlab } from './kit.ts';
import { sweptTube } from '../accessoryPrimitives.ts';
import { pushConvexQuad } from '../factoryGeometry.ts';
import { buildPT91MPendekar } from './pt91mPendekar.ts';
import { T90_X_PROFILES } from './t90X.ts';
import { T90_AW_X_PROFILES } from './t90AwX.ts';
import { buildT90MSXWithoutShtora } from './t90msX.ts';
import { addT90Mark1992Kit } from './t90Mark1992.ts';
import { addT90MarkA2004Kit } from './t90MarkA2004.ts';
import { addT90MarkA2006Kit } from './t90MarkA2006.ts';
import { addT90MarkMS2011Kit } from './t90MarkMS2011.ts';
import { addT90MarkSM2013Kit } from './t90MarkSM2013.ts';
import { addT90MarkAMKit } from './t90MarkAM.ts';
import { addT90MarkAM2Kit } from './t90MarkAM2.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import type { RuntimeValue } from '../../runtimeTypes.ts';
import type { SnapGroupOptions, TankBuilderPort } from '../tankFactoryCore.ts';
import { addVehicleGhillieSuit } from '../ghillieSuit.ts';

type Vec3Tuple = readonly [number, number, number];
type MutableVec3 = [number, number, number];
type GeometryScale = number | readonly number[];
type WeldedStation = readonly [
  z: number, y0: number, y1: number, xl: number, xr: number,
  xbl: number, xbr: number, xtl: number, xtr: number,
];

interface T90Materials extends Record<string, THREE.MeshStandardMaterial> {
  readonly dark: THREE.MeshStandardMaterial;
  readonly hull: THREE.MeshStandardMaterial;
  readonly canvasCloth: THREE.MeshStandardMaterial;
}

interface T90BuilderPort {
  extendHullLength(factor: number): void;
  readonly hullG: THREE.Group;
  readonly turretG: THREE.Group;
  readonly gunG: THREE.Group;
  readonly mats: T90Materials;
  readonly disposables: Array<THREE.BufferGeometry | THREE.Material>;
  readonly spec: {
    readonly id: string;
    readonly visual: { readonly number?: string };
    readonly armor: { readonly gunBarrel: { lengthM: number } };
  };
  readonly rng: () => number;
  readonly q?: boolean;
  topY?: number;
  _shtoraRed?: THREE.MeshStandardMaterial;
  gear?: {
    contactGeom?: { halfWidM: number };
    trackHitbox?: Array<{ x0: number; x1: number }>;
  };
  postAssemble?: (context: { hullG: THREE.Group }) => void;
  add(
    slot: string,
    geometry: THREE.BufferGeometry,
    x?: number,
    y?: number,
    z?: number,
    rotationX?: number,
    rotationY?: number,
    rotationZ?: number,
    scale?: GeometryScale,
  ): void;
  addGunExtra(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtraDark(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addCupola(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addEquipment(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addHatch(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addMudguard(label: string, slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  clear(...slots: string[]): void;
  destructibleCluster(label: string, build: () => void): void;
  visualEraCluster(label: string, owner: 'hull' | 'turret', build: () => void): void;
  decal(
    owner: 'hull' | 'turret',
    kind: string,
    label: string | null,
    scale: number,
    position: Vec3Tuple,
    ...orientation: number[]
  ): void;
  offsetBuckets(slots: readonly string[], x?: number, y?: number, z?: number): void;
  scaleBuckets(slots: readonly string[], x?: number, y?: number, z?: number): void;
  forEachBucketPart(
    slots: readonly string[],
    visit: (geometry: THREE.BufferGeometry, bounds: THREE.Box3) => void,
  ): void;
  /** Registered like addMudguard, then hung from the hull stock above its top edge (mudguardHangers.ts). */
  hangMudguard(label: string, slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  /** Seats the fittings authored in `build` on their rig group's stock once the profile is done (fittingSnap.ts). */
  snapGroup(label: string, build: () => void, options?: SnapGroupOptions): void;
}

const KIT = UNTYPED_KIT;

const T90_FAMILY_HULL_DATUM_DROP_M = 0.05;
const T90_FAMILY_RING_Y = 1.51 - T90_FAMILY_HULL_DATUM_DROP_M;

function isRecord(value: RuntimeValue): value is Record<string, RuntimeValue> {
  return value !== null && typeof value === 'object';
}

const T90_BUILDER_GROUP_KEYS = Object.freeze(['hullG', 'turretG', 'gunG'] as const);
const T90_BUILDER_FUNCTION_KEYS = Object.freeze([
  'add', 'addGunExtra', 'addGunExtraDark', 'addCupola', 'addEquipment',
  'addHatch', 'addMudguard', 'clear', 'destructibleCluster',
  'visualEraCluster', 'decal', 'offsetBuckets', 'scaleBuckets',
  'forEachBucketPart',
] as const);

function hasT90BuilderGroups(value: Record<string, RuntimeValue>): boolean {
  return T90_BUILDER_GROUP_KEYS.every((key) => value[key] instanceof THREE.Group);
}

function hasT90BuilderFunctions(value: Record<string, RuntimeValue>): boolean {
  return T90_BUILDER_FUNCTION_KEYS.every((key) => typeof value[key] === 'function');
}

function isT90Builder(value: RuntimeValue): value is T90BuilderPort {
  if (!isRecord(value)) return false;
  return hasT90BuilderGroups(value)
    && isRecord(value.mats)
    && isRecord(value.spec)
    && Array.isArray(value.disposables)
    && typeof value.rng === 'function'
    && hasT90BuilderFunctions(value);
}

function requireT90Builder(value: RuntimeValue): T90BuilderPort {
  if (!isT90Builder(value)) {
    throw new TypeError('T-90 profile requires the complete procedural builder contract');
  }
  return value;
}

function weldedStationLoft(stations: readonly WeldedStation[], convexPanels=false): THREE.BufferGeometry {
  const positions: number[] = [];
  const tri = (a: Vec3Tuple, b: Vec3Tuple, c: Vec3Tuple, expect: Vec3Tuple): void => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    if (n[0] * expect[0] + n[1] * expect[1] + n[2] * expect[2] < 0) positions.push(...a, ...c, ...b);
    else positions.push(...a, ...b, ...c);
  };
  const quad = (
    a: Vec3Tuple, b: Vec3Tuple, c: Vec3Tuple, d: Vec3Tuple, expect: Vec3Tuple,
  ): void => {
    if(!convexPanels){tri(a,b,c,expect);tri(a,c,d,expect);return;}
    const normal=new THREE.Vector3().crossVectors(
      new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),
      new THREE.Vector3(...c).sub(new THREE.Vector3(...a)));
    if(normal.dot(new THREE.Vector3(...expect))<0)pushConvexQuad(positions,a,d,c,b);
    else pushConvexQuad(positions,a,b,c,d);
  };
  const rings: MutableVec3[][][] = stations.map(([z, y0, y1, xl, xr, xbl, xbr, xtl, xtr]) => {
    const ym = y0 + (y1 - y0) * 0.46;
    return [
      [[xbl, y0, z], [xbr, y0, z]],
      [[xl, ym, z], [xr, ym, z]],
      [[xtl, y1, z], [xtr, y1, z]],
    ];
  });
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i], b = rings[i + 1];
    for (let k = 0; k < 2; k++) {
      quad(a[k][0], b[k][0], b[k + 1][0], a[k + 1][0], [-1, 0, 0]);
      quad(a[k][1], a[k + 1][1], b[k + 1][1], b[k][1], [1, 0, 0]);
    }
    quad(a[2][0], a[2][1], b[2][1], b[2][0], [0, 1, 0]);
    quad(a[0][0], b[0][0], b[0][1], a[0][1], [0, -1, 0]);
  }
  const cap = (r: MutableVec3[][], expect: Vec3Tuple): void => {
    for (let k = 0; k < 2; k++) quad(r[k][0], r[k][1], r[k + 1][1], r[k + 1][0], expect);
  };
  // The loft is used in both ascending- and descending-Z station order.
  // Derive each terminal's outward direction from that order; hard-coding
  // the caps made descending bustles closed but mixed-wound.
  const zDirection = Math.sign(stations[stations.length - 1][0] - stations[0][0]) || 1;
  cap(rings[0], [0, 0, -zDirection]);
  cap(rings[rings.length - 1], [0, 0, zDirection]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((positions.length / 3) * 2).fill(0), 2));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Release 230: where an automated station's moving parts reach, in the station's frame before it is placed: the gun's
 * recoil group at rest (its pitch about the trunnion's x axis and its recoil along its bore keep every point's x), and
 * `cradleRearZ`, the rearmost z the cradle (its shield) reaches over an x band at or below a height as it pitches about
 * the trunnion through the weapon's range (its vertices, a degree apart).
 */
function automatedStationReach(weapon: THREE.Object3D, depression: number, elevation: number) {
  weapon.updateMatrixWorld(true);
  const pitch = weapon.getObjectByName('auxiliaryWeaponPitch')!, recoil = weapon.getObjectByName('auxiliaryWeaponRecoil')!;
  const gun = new THREE.Box3().setFromObject(recoil), pivot = pitch.position, cradle: THREE.Vector3[] = [];
  const toPitch = new THREE.Matrix4().copy(pitch.matrixWorld).invert(), toPitchFrame = new THREE.Matrix4();
  pitch.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (let up: THREE.Object3D | null = mesh; up; up = up.parent) if (up === recoil) return;
    toPitchFrame.multiplyMatrices(toPitch, mesh.matrixWorld);
    const position = mesh.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) cradle.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(toPitchFrame));
  });
  const pitches: number[] = [];
  for (let e = -depression; e < elevation; e += Math.PI / 180) pitches.push(e);
  pitches.push(elevation);
  return {
    gunMinX: gun.min.x,
    gunMaxX: gun.max.x,
    cradleRearZ(x0: number, x1: number, yMax: number): number {
      let rear = Infinity;
      for (const e of pitches) {
        const c = Math.cos(e), s = Math.sin(e);
        for (const v of cradle) {
          if (v.x < x0 || v.x > x1 || pivot.y + v.y * c + v.z * s > yMax) continue;
          rear = Math.min(rear, pivot.z - v.y * s + v.z * c);
        }
      }
      return rear;
    },
  };
}

// Tagil-derived integrated commander station. The panoramic optic, armored
// slew race, ammunition box, elevation yoke and Kord occupy one connected
// remote mount instead of being scattered between a sight tower and one or
// more hand-served pintles. Only the buried race/foundation is structural;
// sensors and weapon fittings stay in equipment buckets.
function addT90AutomatedCommanderStation(P: T90BuilderPort, {
  x,
  z,
  seatY,
  yaw = 0,
  scale = 1,
  heightScale = 1,
  weaponScale = 1,
  weaponYaw = 0,
  weaponClass = 'kord',
  includeRace = true,
  weaponName,
  receiptKey,
}: {
  x: number;
  z: number;
  seatY: number;
  yaw?: number;
  scale?: number;
  heightScale?: number;
  weaponScale?: number;
  weaponYaw?: number;
  weaponClass?: 'kord' | 'nsvt';
  includeRace?: boolean;
  weaponName: string;
  receiptKey: string;
}): THREE.Group {
  const { box, cylY, torus } = KIT;
  const fit = (value: number): number => value * scale;
  const fitY = (value: number): number => value * scale * heightScale;
  const raceBottomY = seatY;
  const raceTopY = seatY + (includeRace ? fitY(0.24) : 0);
  const foundationTopY = raceTopY + fitY(0.15);
  const headCenterY = foundationTopY + fitY(0.18);
  const weaponFootY = foundationTopY + fitY(0.04);

  if (includeRace) {
    P.addCupola('turret', cylY(fit(0.24), fit(0.27), raceTopY - raceBottomY, 18),
      x, (raceBottomY + raceTopY) * 0.5, z);
    P.add('turretDark', torus(fit(0.255), fit(0.022), 20), x, raceTopY + fit(0.01), z);
  }
  P.addCupola('turret', box(fit(0.62), fitY(0.18), fit(0.58)),
    x, raceTopY + fitY(0.08), z + fit(0.03), 0, yaw, 0);
  P.addCupola('turret', orientedSlab(
    [-fit(0.25), -fitY(0.15), -fit(0.21)], [fit(0.25), -fitY(0.15), -fit(0.21)],
    [fit(0.25), -fitY(0.15), fit(0.21)], [-fit(0.25), -fitY(0.15), fit(0.21)],
    [-fit(0.18), fitY(0.15), -fit(0.15)], [fit(0.18), fitY(0.15), -fit(0.15)],
    [fit(0.18), fitY(0.15), fit(0.15)], [-fit(0.18), fitY(0.15), fit(0.15)],
  ), x, foundationTopY, z + fit(0.03), 0, yaw, 0);

  // VH.14 (coordinator ruling 2026-10-14: every drawn gun works): every host's automated station works, not only the
  // T-90's and the Proryv's — the armoured head turns with its gun and the gun fires.
  const weapon = FITTINGS.pintleMG({
    mats: P.mats,
    cls: weaponClass,
    remoteControlled: true, ridingCradle: true,
    // The weapon and yoke stay dark against the painted armored head so the
    // single automated package remains legible in the normal three-quarter
    // gallery view. A camouflage-painted receiver made the consolidated
    // station read as an unarmed roof box at icon scale.
    tone: 'dark',
    elev: -0.075,
    ammo: true,
    shield: true,
    scale: weaponScale,
    barrelBridge: true,
  });
  // Release 230 (the owner's field-equipment standard: nothing that moves passes through what does not): the station's
  // stock stands clear of everything its gun sweeps through its pitch range and recoil (workingPintleCradleAudit
  // measures the whole station). Every host seats the gun in the open bay (the closed head buried the receiver, which
  // swept through it at every pitch); the cheek plates and the housings beside the gun stand outboard of the gun's sides
  // (the can's side by the can), and the sight and the work light stand back of the shield's sweep at their height.
  const profile = auxiliaryWeaponProfile(12.7, P.spec.id);
  const reach = automatedStationReach(weapon, profile.depressionRad, profile.elevationRad);
  const clear = 0.008; // the audit's 1.5 mm, its sampling and room
  const lean = fit(0.08), plateH = fitY(0.27);
  const cheekIn = fit(0.23) - fit(0.035) * Math.cos(lean) - plateH / 2 * Math.sin(lean); // its top edge, leaning in
  const outL = Math.max(0, -reach.gunMinX + clear - Math.min(cheekIn, fit(0.157)));
  const outR = Math.max(0, reach.gunMaxX + clear - Math.min(cheekIn, fit(0.165)));
  // the sight (its hood's front edge and top) and the work light (its lens and top), from the gun's foot
  const footZ = z + fit(0.10);
  const sightBack = Math.max(0, z + fit(0.381) - footZ + clear
    - reach.cradleRearZ(fit(0.165) + outR - clear, Infinity, headCenterY + fitY(0.096) + fit(0.007) - weaponFootY + clear));
  const lightBack = Math.max(0, z + fit(0.30) - footZ + clear
    - reach.cradleRearZ(-Infinity, -(fit(0.18) + outL) + clear, headCenterY + fitY(0.08) + fit(0.07) - weaponFootY + clear));
  const sx = x + fit(0.27) + outR, sz = (value: number): number => z + fit(value) - sightBack;
  const ax = x - fit(0.27) - outL, lx = x - fit(0.25) - outL, lz = (value: number): number => z + fit(value) - lightBack;
  const finishStation = captureAuxiliaryStock(P,weaponName);
  // 2026-10-07 (tank-accessories round 3): the critics read the T-90M station as "a stack of plain boxes around a
  // bare tube": the Kord's receiver, feed and can sat inside the 0.34 m head box and only the barrel showed. The head
  // becomes a low pedestal and deck under the gun's own cradle, so the receiver, feed cover, can and belt stand in
  // the open yoke between the armored cheek plates, beside the sight and the ammunition housing.
  const pedestalTopY = weaponFootY + 0.012;
  P.addEquipment('turret', box(fit(0.36), pedestalTopY - (foundationTopY - fitY(0.02)), fit(0.34)),
    x, (pedestalTopY + foundationTopY - fitY(0.02)) * 0.5, z + fit(0.04), 0, yaw, 0);
  // 2026-10-08 (tank-accessories round 5, the contact receipt: the cheek plates hung beside the deck, their
  // corners touching nothing within 15 mm): the deck spans the cheeks, and the cheeks stand on it (release 230: out to
  // each plate where it stands outboard).
  const deckL = Math.max(fit(0.29), fit(0.275) + outL), deckR = Math.max(fit(0.29), fit(0.275) + outR);
  P.add('turretDark', box(deckL + deckR, 0.018, fit(0.38)), x + (deckR - deckL) / 2, pedestalTopY + 0.004, z + fit(0.04), 0, yaw, 0);
  // The open bay's deck top, where its cheek plates stand (round 5).
  const deckTopY = pedestalTopY + 0.013;
  for (const side of [-1, 1]) {
    // The plate's lowest (inboard) corner sits 3 mm into the deck: half its rotated height below its centre is
    // h/2 cos(a) + w/2 sin(a).
    const cheekX = x + side * (fit(0.23) + (side < 0 ? outL : outR)), sideLean = side * lean;
    const cheekY = deckTopY - 0.003 + plateH / 2 * Math.cos(lean) + fit(0.035) * Math.sin(lean);
    P.addEquipment('turret', box(fit(0.070), plateH, fit(0.28)),
      cheekX, cheekY, z + fit(0.10),
      0, yaw, sideLean);
    // round 5: the plate's bolt heads, two rows of two on its outer face
    for (const by of [-0.3, 0.3]) for (const bz of [-0.09, 0.09]) {
      const ly = by * plateH;
      P.add('turretDark', KIT.cylX(fit(0.011), fit(0.012), 6),
        cheekX + side * (fit(0.035) * Math.cos(lean) - ly * Math.sin(lean) + fit(0.004)),
        cheekY + ly * Math.cos(lean), z + fit(0.10) + bz * scale, 0, yaw, 0);
    }
  }
  P.addEquipment('turret', box(fit(0.19), fitY(0.21), fit(0.22)),
    sx, headCenterY - fitY(0.02), sz(0.21), 0, yaw, 0);
  P.add('turretGlass', box(fit(0.13), fitY(0.13), fit(0.014)),
    sx, headCenterY, sz(0.328), 0, yaw, 0);
  // 2026-10-08 (tank-accessories round 5; wave 254 on the T-90M: "a stack of blunt slabs (flat side boxes, a
  // camo-painted sensor block and a bare tube barrel) with no cabling, optics glass, ammunition feed chute or
  // fasteners"): the sight's window sits in a dark bezel under a sun hood with the rangefinder's port beside it, the
  // sight and the work light carry their cables down to the station's base, the ammunition housing shows its lid seam
  // and latches, and the armoured plates carry their bolt heads.
  P.add('turretDark', box(fit(0.155), fitY(0.155), fit(0.012)), sx, headCenterY, sz(0.322), 0, yaw, 0);
  // 264 (accessoryContact): the sun hood's rear lower edge rests on the sight housing's top face (headCenterY +
  // fitY(0.085)) and its tilt lifts the front; centred at fitY(0.088) it sank its rear into the housing and crossed the
  // bezel's top with no corner resting on either (the T-90AM II's Kord station, since 230's stock clearance)
  const hoodTilt = 0.18, hoodH = fitY(0.016), hoodD = fit(0.07);
  P.add('turretDark', box(fit(0.21), hoodH, hoodD), sx,
    headCenterY + fitY(0.085) + hoodH / 2 * Math.cos(hoodTilt) + hoodD / 2 * Math.sin(hoodTilt), sz(0.345), -hoodTilt, yaw, 0);
  P.add('turretDark', KIT.cylZ(fit(0.022), fit(0.02), 10), sx + fit(0.062), headCenterY - fitY(0.07), sz(0.326),
    0, yaw, 0);
  P.add('turretGlass', KIT.cylZ(fit(0.014), fit(0.008), 10), sx + fit(0.062), headCenterY - fitY(0.07), sz(0.336),
    0, yaw, 0);
  P.add('turretDark', sweptTube([[sx + fit(0.07), headCenterY - fitY(0.08), sz(0.11)],
    [sx + fit(0.105), headCenterY - fitY(0.10), sz(0.05)],
    [sx + fit(0.105), foundationTopY + fitY(0.02), z + fit(0.0)],
    [x + fit(0.24) + outR, foundationTopY - fitY(0.01), z - fit(0.02)]], fit(0.011), 6, 10));
  P.addEquipment('turret', box(fit(0.22), fitY(0.18), fit(0.28)),
    ax, headCenterY - fitY(0.04), z - fit(0.01), 0, yaw, 0);
  P.add('turretDark', box(fit(0.226), fitY(0.012), fit(0.286)), ax, headCenterY + fitY(0.035), z - fit(0.01), 0, yaw, 0);
  for (const dz of [-0.09, 0.09]) {
    P.add('turretDark', box(fit(0.03), fitY(0.05), fit(0.012)), ax, headCenterY + fitY(0.02),
      z - fit(0.01) + fit(0.14) + fit(0.004), 0, yaw, 0);
    P.add('turretDark', box(fit(0.012), fitY(0.05), fit(0.03)), ax - fit(0.114), headCenterY + fitY(0.02),
      z - fit(0.01) + dz * scale, 0, yaw, 0);
  }
  // A protected coaxial work light gives every family station a readable
  // purpose at gallery distance without turning its weapon or optic into a
  // camouflage-painted lump. The housing and lens remain external equipment.
  P.add('turretDark', KIT.cylZ(fit(0.070), fit(0.075), 14),
    lx, headCenterY + fitY(0.08), lz(0.25), 0, yaw, 0);
  P.add('turretGlass', KIT.cylZ(fit(0.054), fit(0.012), 14),
    lx, headCenterY + fitY(0.08), lz(0.294), 0, yaw, 0);
  P.add('turretDark', sweptTube([[lx, headCenterY + fitY(0.06), lz(0.215)],
    [lx, headCenterY + fitY(0.04), lz(0.15)], [lx - fit(0.01), headCenterY + fitY(0.05), lz(0.11)]],
    fit(0.009), 6, 8));

  finishStation();
  weapon.name = weaponName;
  weapon.position.set(x, weaponFootY, footZ);
  // Keep the armored station's deliberate roof angle, but align the Kord
  // itself with the vehicle centreline. The fitting's barrel axis is +Z.
  weapon.rotation.y = weaponYaw;
  P.turretG.add(weapon);

  P.turretG.userData[receiptKey] = Object.freeze({
    family: 'tagil-integrated-automated-station-r1',
    automated: true,
    remoteControlled: true,
    panoramicIntegrated: true,
    weapon: weaponClass,
    weaponName,
    stationYaw: yaw,
    weaponYaw,
    seat: Object.freeze([x, seatY, z]),
    raceBottomY,
    raceTopY,
    includeRace,
    foundationTopY,
    weaponFootY,
    openWeaponBay: true,
    heightScale,
    structuralFoundation: true,
    separateManualWeaponStations: 0,
  });
  return weapon;
}

// PT-91M now has its owner-selected T-72BU core in pt91mPendekar.ts.

// ---- T-90 family chassis (lane t90-family-266) ----
// One shared chassis for every mark on the T-90 family hull: obr. 1992, T-90AM, T-90AM II, T-90MS obr. 2011 and T-90SM
// obr. 2013 (Main's ruling 2026-10-30: the family has two hulls, the family hull and the T-90A hull, not six lofts).
// The pressure hull, deck, fenders, stern, running gear and mudguards are common; `protection` picks the 1992 tank's
// Kontakt-5 glacis rows and K-5 skirt apron, or the AM-type Relikt glacis, full-length Relikt skirts and rear-quarter
// slat cage. The finished chassis sits at the family datum (the hull 50 mm below its construction stations; the
// running gear keeps its ground datum), so every mark seats its turret ring at T90_FAMILY_RING_Y.

// ---- T-90 obr. 1992 cast turret (lane t90-family-266) ----
// The production cast turret of the 1992 tank (Vitaly Kuzmin's Patriot Park photographs, docs/references/tanks/
// t90-family.md): a low cast dome with no bustle; the Kontakt-5 "horseshoe" of sloped containers across the front arc,
// the two OTShU-1-7 Shtora emitters at the mantlet, six 902B launchers a side, the 1G46 sight box, the commander's
// cupola and machine-gun station, and flat K-5 plates on the crown. These steps belong to t90_1992 alone.

// Burlak uses the proven T-90A chassis and native six-wheel course.  The
// earlier standalone prototype scaffold drifted into a longer, taller hull
// even though the Burlak change is the rotating fighting compartment and
// autoloader bustle.  Reuse the authored family chassis, then replace only
// the complete turret/gun package with the distinct repository-authored
// Burlak assembly.
function addT90BurlakShoulderFoundationNative2026(P: T90BuilderPort, {
  includeProtection = true,
  carrierDrop = 0,
  frontLift = 0,
  frontForward = 0,
}: {
  includeProtection?: boolean;
  carrierDrop?: number;
  frontLift?: number;
  frontForward?: number;
} = {}): void {
  const { box, polyTurret } = KIT;
  // Burlak keeps the mature cast T-90A fighting compartment.  Its defining
  // armor is a clipped, open-edged outer shoulder system rather than a
  // second solid turret.  The inboard thirds disappear into the native dome
  // and the outboard tips thin in both plan and elevation.
  for (const s of [-1, 1]) {
    // Thin horizontal shoulder diamond: this is the broad plan-view plate
    // visible around the gun court, not a deep solid side wall.  Its rear
    // edge overlaps the core and its outboard tip overlaps the terminal leaf.
    P.add('turret', polyTurret([
      [s * 0.28, 1.30], [s * 0.82, 1.30], [s * 1.84, 0.98],
      [s * 1.80, 0.84], [s * 1.46, 0.62], [s * 1.44, 0.05],
      [s * 0.42, 0.48],
    ], 0.07, 1.00, 1.00), 0, 0.40 - carrierDrop + frontLift, frontForward);
    // Unequal planted protection cassettes preserve negative breaks between
    // the wing and the dome instead of recreating the rejected slab wall.
    if (includeProtection) {
      for (const [x, y, z, yaw, roll, w, h, d] of [
        [0.72, 0.39, 1.28, 0.31, -0.24, 0.44, 0.36, 0.10],
        [1.04, 0.37, 1.04, 0.47, -0.20, 0.48, 0.38, 0.11],
        [1.43, 0.33, 0.78, 0.62, -0.14, 0.44, 0.35, 0.12],
        [1.72, 0.37, 0.92, 0.28, -0.08, 0.34, 0.10, 0.11],
      ]) {
        P.add('turret', KIT.xform(box(w, h, d), 0, 0, -0.045), s * x, y, z, roll, -s * yaw, 0);
        P.add('turretDark', KIT.xform(box(w * 0.76, 0.012, d * 0.72), 0, h * 0.52, 0.030), s * x, y, z, roll, -s * yaw, 0);
      }
    }
    // A short return makes the carrier visibly load-bearing in side and yaw
    // views while leaving the lower shoulder undercut open.
    P.add('turret', box(0.16, 0.30, 0.36), s * 1.63, 0.27, -0.50, 0, 0, -s * 0.10);
    P.add('turretDark', box(0.018, 0.24, 0.30), s * 1.72, 0.27, -0.50, 0, 0, -s * 0.10);
    // Full rear cast shoulder: the measured plan remains near 1.5 m half-
    // width through z=-0.9 before entering the narrow autoloader neck.  A
    // buried unequal service pack supplies that supported shoulder volume
    // while retaining the lower undercut and the one-shell topology.
    P.add('turret', box(0.30, 0.31, 0.68), s * 1.42, 0.31, -0.84, -0.06, -s * 0.10, 0);
    P.add('turretDark', box(0.018, 0.24, 0.56), s * 1.58, 0.31, -0.84, -0.06, -s * 0.10, 0);
    P.add('turretDetail', box(0.23, 0.016, 0.040), s * 1.42, 0.48, -0.61, -0.06, -s * 0.10, 0);
  }
  // Buried mantlet/chin bridge.  The reference protection court continues
  // to z≈1.62 while the closed cast core stops near z=1.3; this supported
  // center mass joins both shoulder roots to the gun cradle and prevents a
  // bare barrel from appearing to enter the turret through a narrow slit.
  P.add('turret', box(0.90, 0.36, 0.34), 0, 0.18 + frontLift, 1.43 + frontForward, -0.08, 0, 0);
  P.add('turretDark', box(0.80, 0.29, 0.028), 0, 0.17 + frontLift, 1.605 + frontForward, -0.08, 0, 0);
}

function addT90BurlakBustleNative2026(
  P: T90BuilderPort,
  { scale = 1 }: { scale?: number } = {},
): void {
  const { box } = KIT;
  const rootZ = -1.08;
  const fit = (value: number): number => value * scale;
  const fitZ = (z: number): number => rootZ + (z - rootZ) * scale;
  // One shallow tapered bustle begins inside the existing cast rear bins.
  // It is a closed authored loft with a real floor and roof; lids and rails
  // merely articulate that load-bearing body and never substitute for it.
  // Scale remains available to comparison tools, while production vehicles
  // use the complete source envelope around the fixed neck plane.
  const stations: WeldedStation[] = [
    [-1.08, 0.00, 0.64, -1.10, 1.10, -0.98, 0.98, -1.04, 1.04],
    [-1.50, 0.05, 0.67, -1.02, 1.02, -0.90, 0.90, -0.96, 0.96],
    [-2.08, 0.07, 0.65, -0.84, 0.84, -0.72, 0.72, -0.79, 0.79],
    [-2.68, 0.08, 0.60, -0.72, 0.72, -0.60, 0.60, -0.67, 0.67],
    // (release 240, the owner: "make sure all tank turrets are clear of hulls": the tail's floor stays level with the
    // station ahead of it; it dropped 8 cm to the ring's plane, into the stern's drums and bins it swings over)
    [-3.30, 0.08, 0.58, -0.58, 0.58, -0.47, 0.47, -0.54, 0.54],
  ].map(([z, y0, y1, xl, xr, xbl, xbr, xtl, xtr]): WeldedStation => [
    fitZ(z), fit(y0), fit(y1), fit(xl), fit(xr),
    fit(xbl), fit(xbr), fit(xtl), fit(xtr),
  ]);
  P.add('turret', weldedStationLoft(stations));
  for (const [z, w, d, y] of [
    [-1.34, 1.54, 0.32, 0.68], [-1.80, 1.44, 0.35, 0.69],
    [-2.29, 1.26, 0.36, 0.67], [-2.83, 1.04, 0.36, 0.62],
  ]) {
    // 2026-10-19 (owner float sweep): the lids kept a flat seat while the bustle roof falls aft, leaving them 8-16 mm
    // up; each lid and its strip is dropped onto the roof.
    P.snapGroup('t90-burlak-bustle-lid', () => {
      P.add('turretDark', box(fit(w), fit(0.018), fit(d)), 0, fit(y), fitZ(z));
      P.add('turretDetail', box(fit(w * 0.80), fit(0.012), fit(0.040)),
        0, fit(y + 0.015), fitZ(z + d * 0.39));
    }, { reachM: 0.04, mode: 'down' });
  }
  for (const s of [-1, 1]) {
    // 2026-10-19 (owner float sweep): the yawed side pods stood 25-46 mm off the tapering bustle wall; each pod and its
    // face plate is seated on the wall.
    for (const [x, z, d] of [[1.00, -2.12, 0.33], [0.92, -2.53, 0.31], [0.82, -2.91, 0.29]]) P.snapGroup('t90-burlak-bustle-pod', () => {
      P.add('turret', box(fit(0.19), fit(0.28), fit(d)), s * fit(x), fit(0.37), fitZ(z), 0, -s * 0.32, 0);
      P.add('turretDark', box(fit(0.015), fit(0.22), fit(d * 0.80)),
        s * fit(x + 0.105), fit(0.37), fitZ(z), 0, -s * 0.32, 0);
    }, { reachM: 0.06 });
    if (scale < 0.999) {
      // Keep optional reduced comparison envelopes watertight without changing
      // the visible armour-pod proportions. Production vehicles remain scale=1.
      P.add('turret', box(fit(0.16), fit(0.24), fit(0.20)),
        s * fit(1.07), fit(0.37), fitZ(-2.44), 0, -s * 0.32, 0);
    }
    for (const y of [0.32, 0.43, 0.54]) P.add('turretDetail',
      box(fit(0.030), fit(0.022), fit(0.68)), s * fit(0.50), fit(y), fitZ(-3.00));
    for (const z of [-3.32, -3.08, -2.84, -2.68]) P.add('turretDetail',
      box(fit(0.030), fit(0.24), fit(0.030)), s * fit(0.50), fit(0.43), fitZ(z));
  }
  for (const [x, w, n] of [[-0.42, 0.42, 4], [0.10, 0.34, 3], [0.43, 0.24, 2]]) {
    P.add('turretDark', box(fit(w), fit(0.20), fit(0.022)), fit(x), fit(0.43), fitZ(-3.315));
    for (let i = 0; i < n; i++) P.add('turretDetail',
      box(fit(0.020), fit(0.14), fit(0.016)),
      fit(x - w * 0.34 + i * (w * 0.68 / Math.max(1, n - 1))), fit(0.43), fitZ(-3.332));
  }
  P.turretG.userData.t90BurlakBustleReceipt = Object.freeze({
    scale,
    rootZ,
    rearZ: fitZ(-3.30),
    frontHalfWidth: fit(1.10),
    frontHeight: fit(0.64),
    maxRoofY: fit(0.69),
  });
}

function finishT90BurlakNative2026(P: T90BuilderPort): void {
  const { box, cylY, cylZ, torus } = KIT;
  // Preserve the full authored magazine envelope. A previous 0.90 scale made
  // the Burlak bustle visibly undersized relative to its turret foundation.
  const bustleScale = 1;
  const bustleRootZ = -1.08;
  const fitBustle = (value: number): number => value * bustleScale;
  const fitBustleZ = (z: number): number => (
    bustleRootZ + (z - bustleRootZ) * bustleScale
  );

  addT90BurlakShoulderFoundationNative2026(P);
  addT90BurlakBustleNative2026(P, { scale: bustleScale });

  // Prototype roof hierarchy: a broad slew seat, compact panoramic head,
  // two hatch rings and a clearly founded NSVT.  These forms supply the tall
  // but low-area silhouette visible in the reference without inflating the
  // cast shell itself.
  P.add('turret', box(0.52, 0.14, 0.48), 0.38, 0.63, -0.70);
  P.add('turretDark', torus(0.22, 0.022, 18), 0.38, 0.71, -0.70);
  // 2026-10-19 (owner float sweep): the sight head stood 40 mm over its seat box (and its window 19 mm off its face),
  // and the left hatch ring 74 mm over the crown with the commander station on it. The window lies on the head's
  // raked face, and the ring's collar runs down into the crown.
  // 2026-10-21 (float-gaps 230): the head keeps its 0.92 station (its crown is the turret's top, pinned by
  // fleetResize20261002; the 10-19 sweep had dropped it 42 mm into the box); a 50 mm neck inside the slew ring
  // (corners 21 mm inside the ring's tube) runs from 2.5 mm inside the seat box to 7.5 mm inside the head.
  P.add('turret', box(0.26, 0.05, 0.24), 0.38, 0.7225, -0.70);
  P.add('turret', orientedSlab(
    [-0.15, -0.18, -0.14], [0.15, -0.18, -0.14], [0.15, -0.18, 0.14], [-0.15, -0.18, 0.14],
    [-0.11, 0.18, -0.10], [0.11, 0.18, -0.10], [0.11, 0.18, 0.10], [-0.11, 0.18, 0.10],
  ), 0.38, 0.92, -0.70);
  P.add('turretGlass', box(0.19, 0.16, 0.012), 0.38, 0.92, -0.576, -0.111, 0, 0);
  P.add('turret', cylY(0.25, 0.28, 0.22, 18), -0.48, 0.72, -0.34);
  P.add('turretDark', cylY(0.22, 0.22, 0.022, 16), -0.48, 0.84, -0.34);
  P.add('turret', cylY(0.20, 0.23, 0.09, 16), 0.38, 0.77, -0.24);
  P.add('turretDark', cylY(0.17, 0.17, 0.020, 14), 0.38, 0.825, -0.24);
  // 2026-10-21 (watertight-230): each hatch ring stands on a cast collar down into the roof crown (0.64-0.68 under
  // them). The rings were authored 6-9 cm over the crown, and the gap they and the commander's station closed over
  // read as turret interior: the interior fills filled it as a dark stair-step under the left ring. The collars sit
  // 8 mm inside each ring's lower radius and 1 cm up into it, so no face of a collar is coplanar with its ring.
  P.add('turret', cylY(0.272, 0.272, 0.13, 18), -0.48, 0.675, -0.34);
  P.add('turret', cylY(0.222, 0.222, 0.125, 16), 0.38, 0.6725, -0.24);
  // Restore the richer repository-authored roof cadence from the earlier
  // Burlak pass, but keep it below the corrected low combat envelope.  The
  // long left foundation is half buried in the crown; every periscope and
  // sight head lands on that foundation or a hatch ring instead of becoming
  // the freestanding roof forest used by the discarded prototype.
  P.add('turret', box(0.34, 0.13, 0.86), -1.12, 0.67, -0.28);
  P.add('turretDark', box(0.29, 0.014, 0.78), -1.12, 0.742, -0.28);
  for (const [x, z, yaw] of [
    [-0.78, -0.29, -0.22], [-0.58, -0.22, 0], [-0.38, -0.29, 0.22],
    [0.18, -0.07, -0.18], [0.47, -0.10, 0.18],
  ]) {
    P.add('turretDark', box(0.12, 0.055, 0.070), x, 0.79, z, 0, yaw, 0);
    P.add('turretGlass', box(0.080, 0.032, 0.010), x, 0.802, z + 0.040, 0, yaw, 0);
  }
  P.add('turret', box(0.30, 0.15, 0.28), 0.36, 0.57, 0.31, 0, -0.12, 0);
  P.add('turretDark', box(0.25, 0.090, 0.014), 0.36, 0.58, 0.462, 0, -0.12, 0);
  P.add('turretGlass', box(0.19, 0.060, 0.008), 0.36, 0.58, 0.471, 0, -0.12, 0);
  // Autoloader feed-lid and two longitudinal rub rails.  They overlap the
  // closed bustle roof and add mechanical scale without altering its plan.
  P.add('turretDark', box(fitBustle(0.72), fitBustle(0.014), fitBustle(0.66)),
    fitBustle(0.02), fitBustle(0.695), fitBustleZ(-2.18));
  P.add('turretDetail', box(fitBustle(0.030), fitBustle(0.022), fitBustle(1.42)),
    fitBustle(-0.31), fitBustle(0.710), fitBustleZ(-2.19));
  P.add('turretDetail', box(fitBustle(0.030), fitBustle(0.022), fitBustle(1.42)),
    fitBustle(0.35), fitBustle(0.710), fitBustleZ(-2.19));
  addT90AutomatedCommanderStation(P, {
    x: -0.46,
    z: -0.42,
    seatY: 0.80,
    yaw: 0,
    scale: 0.58,
    heightScale: 0.65,
    weaponScale: 0.58,
    weaponYaw: 0,
    weaponClass: 'nsvt',
    includeRace: false,
    weaponName: 't90aBurlakCommanderNsvt',
    receiptKey: 't90aBurlakAutomatedStationReceipt',
  });
  // Unequal cheek smoke fans are a defining Burlak/T-90 station.  Their
  // broad local shoes overlap the shoulder carrier; the launchers then grow
  // outboard/upward from those seats instead of intersecting the roof.
  for (const s of [-1, 1]) {
    P.add('turret', box(0.20, 0.16, 0.36), s * 1.30, 0.32, 0.12, 0, 0, -s * 0.15);
    const smoke = FITTINGS.smokeBank({ mats: P.mats, count: s < 0 ? 6 : 5, r: 0.040, len: 0.27, pitch: -0.41, splay: 0.30, arc: 0.56, spacing: 0.098 });
    smoke.position.set(s * 1.34, 0.45, 0.13);
    smoke.rotation.y = s * 1.02;
    P.turretG.add(smoke);
  }
  {
    const antenna = FITTINGS.antennaWhip({ mats: P.mats, h:2.67, r:0.014, rake:0.018, seed:61 });
    antenna.position.set(0, 0.63, -1.02);
    P.turretG.add(antenna);
    P.add('turretDark', cylY(0.045, 0.060, 0.12, 8), 0, 0.63, -1.02);
  }

  // The Burlak source uses the same 2A46 family run but terminates slightly
  // inside the mature T-90A muzzle envelope.
  P.add('gun', cylZ(0.105, 1.36, 18), 0, 0, 1.22);
  P.add('gun', cylZ(0.082, 2.34, 18), 0, 0, 3.05);
  for (const z of [0.56, 1.90, 2.18, 3.02, 4.18]) P.add('gunDark', cylZ(z < 2 ? 0.116 : 0.098, 0.030, 16), 0, 0, z);
  P.gunG.scale.z = 0.955;
  P.gunG.scale.y = 1.318;
  P.gunG.position.y += 0.08;
}

function replaceT90BurlakCoreNative2026(P: T90BuilderPort): void {
  const { polyMultiLoft, polyTurret } = KIT;
  // Retain the mature T-90A cannon tree but remove every cast-turret bucket
  // and direct fitting.  This guarantees there is one rotating primary mass,
  // not a Burlak skin laid over a hidden T-90A dome.
  P.turretG.clear();
  P.turretG.add(P.gunG);
  P.clear('turret', 'turretDetail', 'turretDark', 'turretCloth', 'turretGlass', 'turretTrack');

  const plan = [
    [-0.25, 1.28], [0.25, 1.28], [0.76, 1.10], [1.38, 0.78],
    [1.40, 0.45], [1.46, 0.05], [1.58, -0.48], [1.64, -0.72],
    [1.36, -1.08], [0.76, -1.20], [-0.76, -1.20], [-1.36, -1.08],
    [-1.64, -0.72], [-1.58, -0.48], [-1.46, 0.05], [-1.40, 0.45],
    [-1.38, 0.78], [-0.76, 1.10],
  ];
  const shoulder = [0.37, 0.37, 0.40, 0.43, 0.45, 0.47, 0.47, 0.46, 0.44, 0.41, 0.41, 0.44, 0.46, 0.47, 0.47, 0.45, 0.43, 0.40];
  const crown = [0.54, 0.54, 0.58, 0.62, 0.64, 0.66, 0.66, 0.69, 0.65, 0.61, 0.61, 0.65, 0.69, 0.66, 0.66, 0.64, 0.62, 0.58];
  P.add('turret', polyMultiLoft(plan, [
    { height:0.02, inset:1.00 },
    { height:shoulder, inset:0.98 },
    { height:crown, inset:0.82 },
  ]));
  // Closed ring apron overlaps both the hull ring and the shell floor.  The
  // short plan preserves the source undercut ahead of the autoloader neck.
  const apron = [
    [-0.22, 1.02], [0.22, 1.02], [0.92, 0.68], [1.36, 0.08],
    [1.26, -0.68], [0.82, -1.02], [-0.82, -1.02], [-1.26, -0.68],
    [-1.36, 0.08], [-0.92, 0.68],
  ];
  P.add('turret', polyTurret(apron, 0.24, 0.94, 0.95), 0, -0.18, -0.06);
  P.add('turretDark', polyTurret(apron, 0.022, 0.95, 0.97), 0, 0.04, -0.06);
}

// Every turret-owned bucket of a build (tankFactoryCore BUCKET_DEF: turretG, gunG and recoilG owners), for replacing a
// complete donor turret with another.
const T90_TURRET_BUCKETS = Object.freeze([
  'turret', 'turretBark', 'turretCanvasPale', 'turretCloth', 'turretCupola', 'turretDark', 'turretDetail',
  'turretEquipment', 'turretExternalArmor', 'turretFittingPaint', 'turretGlass', 'turretHatch', 'turretOpenLattice',
  'turretOpenLatticeDark', 'turretPaintedDetail', 'turretPermanentMarkingSurface', 'turretTrack', 'turretTrackLinks',
  'turretWeaponSteel',
] as const);

function buildT90BurlakTurret(P: T90BuilderPort): void {
  // Lane t90-family-266 (the owner 2026-10-30: "take inspiration and update from the later t90s we added that have far
  // more accurate models"): the Burlak prototype rides the source-X T-90A hull and running gear; its own Burlak turret
  // (core, shoulders, autoloader bustle and roof suite) is unchanged and seats on that ring. The X turret is cleared
  // whole; its gun stays (the X build runs first, in the profile below).
  P.clear(...T90_TURRET_BUCKETS);
  replaceT90BurlakCoreNative2026(P);
  finishT90BurlakNative2026(P);
  // The inherited cast tree is deliberately compressed only in section; width, plan length, ring location and the
  // independently dimensioned roof stations remain unchanged. The gun group is counter-scaled so the tube stays round.
  P.turretG.scale.set(1.00, 0.85, 1.00);
  P.gunG.scale.y = 1 / 0.85;
}

/** Turret-ring height on the family chassis (builder frame). */
export { T90_FAMILY_RING_Y };

// Lane t90-family-266 (the owner 2026-10-30): "for all of these we can just take inspirration annd update from the
// later t90s we added that have far more accurate models". Each earlier mark builds from its matching source-X build
// (the X ids' own builders, unchanged): obr. 1992 from the cast T-90, obr. 2004 from the T-90A, obr. 2006 from the
// T-90A Vladimir (the obr. 2006 production name), the T-90MS obr. 2011 from the T-90MS Tagil, the T-90SM obr. 2013
// and the T-90AM (one design, docs/references/tanks/t90-family.md) from the T-90SM, and the T-90AM II (the T-90M
// Proryv-3) from the T-90M. Their own kit, camouflage, markings and 1.05 installed size keep them apart.
type T90XBuild = (builder: TankBuilderPort) => void;
// 2026-10-30 (the owner: "tone down that copying a lil"): each mark lays its own fittings (t90Mark*.ts) on its twin.
const withKit = (build: T90XBuild, kit: T90XBuild) => ({ build: (builder: TankBuilderPort): void => { build(builder); kit(builder); } });
// 2026-10-31 (the owner: "make all the variations' machine guns different or look in different directions"): each earlier
// mark parks its roof gun on a bearing of its own (degrees, + toward the hull's left); the source-X twins keep theirs.
// The station turns whole about its yaw axis once the rig is assembled, when its cradle and the stock captured into it
// already hang from it, so the inventory reads the bearing as the station's rest and the battle parks the gun there
// between targets (auxiliarySystems.ts parkStation) and aims from it.
const ROOF_GUN_BEARING_DEG = Object.freeze({
  t90_1992: 35, t90a_2004: -30, t90a_2006: 60, t90ms_2011: -90, t90sm_2013: 25, t90am: 180, t90m_proryv: -45,
  t90a_burlak_proto: 15,
});
type T90MarkId = keyof typeof ROOF_GUN_BEARING_DEG;
const isRoofStation = (node: THREE.Object3D): boolean =>
  node.userData.remoteControlled === true && node.userData.firingAxis === '+Z' && !node.userData.primaryWeapon;
const parkRoofGuns = (build: T90XBuild, id: T90MarkId): T90XBuild => (builder) => {
  build(builder);
  const before = builder.postAssemble;
  builder.postAssemble = (rig) => {
    before?.(rig);
    const stations: THREE.Object3D[] = [];
    rig.turretG.traverse((node) => {
      let outer = node.parent;
      while (outer && !isRoofStation(outer)) outer = outer.parent;
      if (isRoofStation(node) && !outer) stations.push(node);
    });
    for (const station of stations) station.rotateY(THREE.MathUtils.degToRad(ROOF_GUN_BEARING_DEG[id]));
  };
};

export const T90_PROFILES = {
  t90a_2004: withKit(parkRoofGuns(T90_X_PROFILES.t90a.build, 't90a_2004'), addT90MarkA2004Kit),
  t90_1992: withKit(parkRoofGuns(T90_AW_X_PROFILES.t90.build, 't90_1992'), addT90Mark1992Kit),
  t90ms_2011: withKit(parkRoofGuns(buildT90MSXWithoutShtora, 't90ms_2011'), addT90MarkMS2011Kit),
  t90a_burlak_proto: withKit(parkRoofGuns(T90_X_PROFILES.t90a.build, 't90a_burlak_proto'), (builder) => buildT90BurlakTurret(requireT90Builder(builder))),
  pt91m: {build:buildPT91MPendekar},
  t90sm_2013: withKit(parkRoofGuns(T90_X_PROFILES.t90sm.build, 't90sm_2013'), addT90MarkSM2013Kit),
  t90a_2006: withKit(parkRoofGuns(T90_X_PROFILES.t90a_vladimir.build, 't90a_2006'), addT90MarkA2006Kit),
  // 2026-10-09 (owner): the T-90AM's field net and garnish (ghillieFleetSuits.ts), laid on the assembled build
  t90am: withKit(parkRoofGuns((builder) => { addVehicleGhillieSuit(builder); T90_X_PROFILES.t90sm.build(builder); }, 't90am'), addT90MarkAMKit),
  t90m_proryv: withKit(parkRoofGuns(T90_X_PROFILES.t90m.build, 't90m_proryv'), addT90MarkAM2Kit),
} satisfies VehicleProfileRecord;
