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

// ---- T-90A Burlak prototype turret (lane t90-family-267, S5; Main's ruling 2026-11-01) ----
// The Burlak prototype rides the source-X T-90A hull and running gear; its turret is built to the Burlak X source's
// (t90a_burlak_x_source.glb, the Armored Warfare model the production t90a_burlak follows), true size, from that source's
// measured stations (docs/references/tanks/t90a_burlak_x.source-measurements.json). Its ring datum seats on the T-90A
// X ring, so the source's turret-local stations are this turret's local frame (metres over the ring plane, forward +z).
// What the Burlak is in the BTVT drawings and the prototype's photographs: a tall slab-sided welded turret, an arrow
// plan that is widest at its shoulders and narrows to a neck, the long welded autoloader bustle, two chevron cheek packs
// of four cassettes, the commander's cast pod on the left with his machine gun, the gunner's sight mast and five-tube
// grenade fans on the bustle's flanks. The 266 native turret (a cast dome, diamond wings, tapered bustle) is retired.
// The cannon stays the T-90A X tube on its own seat (the gate's declared departure, SOURCE_WORLD_BUILD_OFFSETS).

// The welded shell, rear to front: z, half-width left and right at the side plates, roof, floor. The side plates stand
// to 46 % of their height and lean 70 mm in to the roof edge (the source's welded top chamfer).
const BURLAK_SHELL_STATIONS: readonly (readonly [z: number, left: number, right: number, top: number, floor: number])[] = [
  [-3.2988, .914, .914, .6534, .2284], [-3.2147, .956, .956, .7006, .1911], [-3.0147, .956, .956, .7006, .1403],
  [-2.8147, .956, .956, .7191, .1402], [-1.6147, .956, .956, .7191, .1396], [-1.4147, .918, .918, .7006, .0907],
  [-1.2147, .7257, .7257, .6998, .0598], [-1.0147, .8184, .8184, .6932, .0598], [-.8147, .911, .911, .6863, .0598],
  [-.6147, 1.0052, 1.0052, .6794, .0598], [-.4147, 1.1008, 1.1008, .6725, .0598], [-.2147, 1.1963, 1.1963, .6630, .0598],
  [-.0147, 1.2919, 1.2919, .6289, .0598], [.1853, 1.3875, 1.3875, .5947, .0598], [.3853, 1.4833, 1.4833, .5606, .0588],
  [.5853, 1.5789, 1.5639, .5265, .0548], [.7853, 1.3972, 1.3356, .4949, .0548], [.9853, 1.1679, 1.1074, .4906, .0548],
  [1.0853, 1.0533, .9933, .4735, .0548],
];
const BURLAK_BUSTLE = Object.freeze({ frontZ: -1.4147, rearZ: -3.2988, halfWidth: .956, roofY: .7191, floorY: .1396 });

function replaceT90BurlakCoreNative2026(P: T90BuilderPort): void {
  const { box, polyTurret } = KIT;
  // Retain the mature T-90A cannon tree but remove every cast-turret bucket and direct fitting: one rotating mass.
  P.turretG.clear();
  P.turretG.add(P.gunG);
  P.clear('turret', 'turretDetail', 'turretDark', 'turretCloth', 'turretGlass', 'turretTrack');
  P.add('turret', weldedStationLoft(BURLAK_SHELL_STATIONS.map(([z, l, r, top, floor]): WeldedStation =>
    [z, floor, top, -l, r, -l, r, -(l - .07), r - .07])));
  // Closed ring collar under the shell's floor (the 267 census fix: closed prisms, so the seat over the deck cannot
  // fold an open one into a lid inside the shell).
  const apron = [
    [-0.22, 1.02], [0.22, 1.02], [0.92, 0.68], [1.36, 0.08],
    [1.26, -0.68], [0.82, -1.02], [-0.82, -1.02], [-1.26, -0.68],
    [-1.36, 0.08], [-0.92, 0.68],
  ];
  P.add('turret', polyTurret(apron, 0.24, 0.94, 0.95, true), 0, -0.18, -0.06);
  P.add('turretDark', polyTurret(apron, 0.022, 0.95, 0.97, true), 0, 0.04, -0.06);
  // the turret's ring flange on the race, inside the ring well's rim (the seat over the deck leaves it as built there)
  P.add('turret', KIT.cylY(.83, .83, .06, 48), 0, .03, 0);
  // The two welded blocks either side of the mantlet and the cradle housing under it (the source's front plates).
  P.add('turret', orientedSlab(
    [-1.0638, .1744, 1.0753], [-.2688, .1744, 1.0753], [-.2758, .0959, 1.3853], [-.7082, .0959, 1.3853],
    [-1.0638, .4744, 1.0753], [-.2688, .4744, 1.0753], [-.2758, .3959, 1.3853], [-.7082, .3959, 1.3853]));
  P.add('turret', orientedSlab(
    [.2913, .1744, 1.0753], [1.0063, .1744, 1.0753], [.7663, .1354, 1.2853], [.2913, .1354, 1.2853],
    [.2913, .4744, 1.0753], [1.0063, .4744, 1.0753], [.7663, .4354, 1.2853], [.2913, .4354, 1.2853]));
  P.add('turret', box(.54, .431, .261), .001, .2505, 1.175);
  P.add('turretDark', box(.46, .34, .014), .001, .2505, 1.312);
}

// The chevron cheek packs: per side four sloped K-5 style panels on five vertical carrier ribs, laid along the pack's axis
// 42 deg out from the bore. Each panel is a 60 mm plate climbing 31 deg from its rear edge at the shell to its front edge
// 0.66 m out; the ribs under them stand to the panels' line from the shell and are cut away under their fronts, so the
// pack's front reads as a raked wedge over air (the source's front cheeks, Object_23). Panels: x, z, width, floor,
// roof; ribs: x, z, top, axis yaw (deg), length.
const BURLAK_CHEEK_PANELS = Object.freeze({
  right: [[1.675, .924, .290, .086, .515], [1.456, 1.116, .251, .060, .489], [1.253, 1.296, .255, .060, .489],
    [1.040, 1.481, .261, .086, .514]],
  left: [[-1.689, .962, .295, .087, .507], [-1.466, 1.163, .248, .060, .489], [-1.261, 1.341, .252, .060, .490],
    [-1.046, 1.517, .270, .090, .510]],
} as const);
const BURLAK_CHEEK_RIBS = Object.freeze({
  right: [[1.792, .819, .551, 42, .673], [1.564, 1.031, .531, 42, .673], [1.359, 1.208, .528, 42, .667],
    [1.157, 1.396, .529, 42, .673], [.945, 1.572, .546, 42, .673], [.752, 1.532, .419, 21, .433], [.295, 1.539, .419, 1, .379]],
  left: [[-1.809, .859, .551, -42, .659], [-1.572, 1.077, .524, -42, .673], [-1.368, 1.257, .524, -42, .673],
    [-1.165, 1.430, .525, -42, .673], [-.945, 1.622, .543, -42, .673], [-.291, 1.630, .538, 0, .482]],
} as const);

/** A four-corner section (u forward along `deg` from +z, y up) as a slab `thick` across that axis, set at (x, z). */
function burlakAxisSlab(quad: readonly (readonly [number, number])[], thick: number, deg: number, x: number, z: number): THREE.BufferGeometry {
  const a = deg * Math.PI / 180, ax = Math.sin(a), az = Math.cos(a);
  const ring = (v: number) => quad.map(([u, y]) => [x + u * ax + v * az, y, z + u * az - v * ax]);
  return orientedSlab(...ring(-thick / 2), ...ring(thick / 2));
}

function addT90BurlakCheekPacksNative2026(P: T90BuilderPort): void {
  // The panels are the turret's reactive cheek armour: each side's are its turret_era cluster (spent and restored with
  // it); the ribs under them are the turret's permanent carriers.
  const endPlates = {
    right: [[.307, .087, 1.345], [.662, .087, 1.346], [.796, .357, 1.676], [.307, .357, 1.678],
      [.307, .147, 1.345], [.662, .147, 1.346], [.796, .381, 1.676], [.307, .381, 1.678]],
    left: [[-1.10, .091, 1.385], [-.30, .091, 1.385], [-.30, .45, 1.859], [-1.156, .45, 1.859],
      [-1.10, .151, 1.385], [-.30, .151, 1.385], [-.30, .51, 1.859], [-1.156, .51, 1.859]],
  } as const;
  for (const side of ['right', 'left'] as const) {
    const s = side === 'right' ? 1 : -1;
    P.destructibleCluster(`turret_era_${side === 'right' ? 'R' : 'L'}`, () => {
      for (const [x, z, width, floor, roof] of BURLAK_CHEEK_PANELS[side]) {
        P.add('turret', burlakAxisSlab([[-.3315, floor], [.3315, roof - .024], [.3315, roof], [-.3315, floor + .06]],
          width - .012, s * 42, x, z));
        // the panel's lid seam, 4 mm proud of its sloped top
        P.add('turretDark', burlakAxisSlab([[-.29, floor + .056], [.29, roof - .008], [.29, roof + .004], [-.29, floor + .068]],
          width * .78, s * 42, x, z));
      }
      // the end plate at the mantlet, climbing forward over the cradle housing (the left the larger)
      P.add('turret', orientedSlab(...endPlates[side]));
    });
    for (const [x, z, top, deg, len] of BURLAK_CHEEK_RIBS[side]) {
      P.add('turretDetail', burlakAxisSlab([[-len / 2, .057], [len / 2, top - .067], [len / 2, top - .01], [-len / 2, .377]],
        .034, deg, x, z));
    }
  }
}

function addT90BurlakBustleNative2026(P: T90BuilderPort): void {
  const { box, cylZ } = KIT;
  const { frontZ, rearZ, halfWidth, roofY, floorY } = BURLAK_BUSTLE;
  // Two longitudinal roof hatches over the autoloader with their stiffeners, and the cable box at the bustle's root.
  for (const x of [-.4667, .4683]) {
    P.add('turretDark', box(.41, .012, 1.371), x, roofY + .011, -2.3155);
    for (const z of [-2.895, -1.735]) P.add('turretDetail', box(.17, .010, .029), x, roofY + .0179, z);
  }
  P.add('turretDetail', box(.4426, .179, .664), .4880, .7555, -1.148);
  // Grab rails along both bustle sides, and the five-tube grenade fans on its flanks: four tubes radiating 70 deg
  // either side of square from a bracket plate run out of the side plate.
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(.12, .063, 1.114), s * .8095, .6505, -1.927);
    for (const z of [-2.93, -2.55, -2.16, -1.77]) P.add('turretDetail', box(.03, .023, .27), s * (halfWidth + .015), .6154, z - .1147);
    // (Drawn tubes, not live launchers: the fleet's banks may not fire aft of 77 deg, vehicleAuxiliaryGeometry.ts.)
    P.add('turretDetail', box(.36, .063, .54), s * (halfWidth + .10), .2995, -2.67);
    for (const [x, z, deg, y] of [[1.100, -2.286, 20, .30], [1.242, -2.518, 62, .30], [1.240, -2.820, 118, .30],
      [1.098, -3.052, 160, .30], [1.050, -3.042, 180, .414]]) {
      const yawRad = s * deg * Math.PI / 180;
      P.add('turretDetail', cylZ(.042, .34, 10).rotateX(-.22).rotateY(yawRad), s * x, y, z);
      P.add('turretDark', cylZ(.036, .012, 10).translate(0, 0, .176).rotateX(-.22).rotateY(yawRad), s * x, y, z);
    }
  }
  // Rear stowage plates with their tie-down bars, and the two lifting hooks over the rear face's top edge.
  for (const [x, w, n] of [[-0.42, 0.42, 4], [0.10, 0.34, 3], [0.43, 0.24, 2]]) {
    P.add('turretDark', box(w, .20, .022), x, .45, rearZ + .002);
    for (let i = 0; i < n; i++) P.add('turretDetail', box(.020, .14, .010), x - w * .34 + i * (w * .68 / Math.max(1, n - 1)), .45, rearZ - .010);
  }
  for (const x of [-.635, .635]) {
    P.add('turretDetail', box(.05, .03, .14), x, .652, rearZ - .045);
    P.add('turretDetail', box(.05, .154, .03), x, .59, rearZ - .10);
  }
  P.turretG.userData.t90BurlakBustleReceipt = Object.freeze({
    scale: 1,
    rootZ: frontZ,
    rearZ,
    frontHalfWidth: halfWidth,
    frontHeight: roofY,
    floorY,
    maxRoofY: roofY + .0229,
  });
}

function finishT90BurlakNative2026(P: T90BuilderPort): void {
  const { box, cylY, cylZ } = KIT;
  addT90BurlakCheekPacksNative2026(P);
  addT90BurlakBustleNative2026(P);
  // The commander's cast pod bulging from the left flank, round in plan (0.51 m about x -1.2654, z -0.85): z,
  // half-width, floor, roof.
  const pod: readonly (readonly [number, number, number, number])[] = [
    [-1.36, .05, .14, .40], [-1.30, .25, .10, .45], [-1.20, .37, .08, .48], [-1.10, .45, .07, .495], [-1.00, .49, .06, .50],
    [-.85, .51, .06, .50], [-.70, .49, .06, .50], [-.60, .45, .06, .495], [-.50, .38, .07, .48], [-.40, .25, .09, .45],
    [-.34, .05, .12, .40]];
  P.add('turret', weldedStationLoft(pod.map(([z, h, floor, roof]): WeldedStation =>
    [z, floor, roof, -1.2654 - h, -1.2654 + h, -1.2654 - h * .88, -1.2654 + h * .88, -1.2654 - h * .62, -1.2654 + h * .62])));
  // The rail bins along the pod and the left roof edge, on three posts.
  for (const [z, d] of [[-.70, .66], [.06, .74]]) P.add('turretDetail', box(.15, .122, d), -1.358, .726, z);
  for (const z of [-.95, -.30, .36]) P.add('turretDetail', box(.07, .30, .07), -1.358, .58, z);
  // the bracket the two left-flank grenade tubes and the bins' middle post stand on
  P.add('turret', box(.50, .39, .30), -1.35, .255, -.15);

  // Roof suite at the source's stations: the gunner's (right) and commander's (left) hatch rings, the gunner's sight
  // housing, the commander's panoramic sight on its pedestal, the gunner's sight mast and the roof boxes.
  P.add('turret', cylY(.292, .292, .10, 28), .5913, .670, -.3747);
  P.add('turretDark', cylY(.274, .274, .025, 28), .5913, .728, -.3747);
  P.add('turret', cylY(.267, .267, .10, 28), -.6788, .687, -.0947);
  P.add('turretDark', cylY(.251, .251, .025, 28), -.6788, .745, -.0947);
  P.add('turret', cylY(.17485, .17485, .4004, 24), .9818, .7240, .24);
  P.add('turretDetail', box(.21, .10, .10), .9818, .865, .40);
  P.add('turretGlass', box(.17, .07, .012), .9818, .865, .451);
  P.add('turret', cylY(.24465, .24465, .129, 24), -.4988, .7206, -.8242);
  P.add('turretDetail', cylY(.145, .145, .2798, 24).scale(1.48, 1, 1), -.4989, .9186, -.795);
  P.add('turretDetail', box(.2978, .0889, .2803), -.4987, 1.1049, -.7881);
  P.add('turretGlass', box(.1873, .2056, .012), -.4994, .9323, -.6745);
  P.add('turretDark', box(.3317, .0117, .0634), -.4989, 1.0634, -.6997);
  P.add('turretDetail', cylY(.056, .056, .90, 12), .2930, 1.1097, -.4709);
  for (const y of [.8354, 1.0554, 1.2854]) P.add('turretDetail', box(.10, .0615, .096), .2930, y, -.4709);
  P.add('turretDetail', box(.30, .18, .22), .395, 1.10, -.49);
  P.add('turretDetail', box(.09, .03, .13), .2930, 1.572, -.4705);
  // the periscope covers in two rows down the roof's centre (tops on the falling roof line)
  for (const x of [-.114, .114]) for (const [z, top] of [[-.326, .752], [-.022, .734], [.269, .684], [.561, .634]]) {
    P.add('turretDetail', box(.123, .14, .285), x, top - .07, z);
  }
  for (const [x, y, z, w, h, d] of [[.6409, .5017, .7075, .25, .3118, .3984], [.5676, .5608, .5470, .3879, .2532, .0984],
    [.5798, .5455, .7629, .4104, .2241, .5701], [.0002, .5475, .9695, .3407, .1988, .188], [-.8622, .6972, -1.0823, .2105, .1914, .3081],
    [1.0201, .4733, -.7451, .2104, .1909, .3086], [-.8254, .8102, -.5438, .1182, .3598, .1184],
    [.555, .64, .64, .39, .10, .32]]) P.add('turretDetail', box(w, h, d), x, y, z);
  addT90AutomatedCommanderStation(P, {
    x: -1.22,
    z: -.87,
    seatY: .43,
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
  // Grenade launchers: three in each cheek pack, two on the left flank and three on the right, at the source's tubes.
  for (const [x, y, z, count, yaw, pitch, spacing] of [
    [1.350, .366, 1.015, 3, .677, -.668, .285], [-1.3709, .3923, 1.0690, 3, -.604, -.668, .295],
    [-1.68, .388, .187, 2, -1.35, -.379, .558], [1.3517, .573, -.314, 2, 1.405, -.458, .227],
    [1.0417, .5413, -1.0435, 1, 1.170, -.266, .1]]) {
    const bank = FITTINGS.smokeBank({ mats: P.mats, count, r: .055, len: .36, pitch, splay: 0, arc: 0, spacing, base: false });
    bank.position.set(x, y, z);
    bank.rotation.y = yaw;
    P.turretG.add(bank);
  }
  {
    // The whip on its pot at the source's station, 0.19 m left of the centreline, to the source's 2.29 m.
    const antenna = FITTINGS.antennaWhip({ mats: P.mats, h: 2.28, r: 0.014, rake: 0, seed: 61 });
    antenna.position.set(-.19, .69, -.94);
    P.turretG.add(antenna);
    P.add('turretDark', cylY(0.045, 0.060, 0.12, 8), -.19, .69, -.94);
  }

  // The Burlak source uses the same 2A46 family run but terminates slightly
  // inside the mature T-90A muzzle envelope.
  P.add('gun', cylZ(0.105, 1.36, 18), 0, 0, 1.22);
  P.add('gun', cylZ(0.082, 2.34, 18), 0, 0, 3.05);
  for (const z of [0.56, 1.90, 2.18, 3.02, 4.18]) P.add('gunDark', cylZ(z < 2 ? 0.116 : 0.098, 0.030, 16), 0, 0, z);
  P.gunG.scale.z = 0.955;
  // 267: the trunnion stays where the 266 rig drew it (80 mm over the T-90A seat, seen through the retired 0.85
  // section squash), so the combat frame (t90MarkFrames.ts) and the gun-pitch curve (turretScaleGunPitch.ts) still
  // describe the drawn gun.
  P.gunG.position.y = (P.gunG.position.y + 0.08) * 0.85;
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
  // more accurate models"): the Burlak prototype rides the source-X T-90A hull and running gear and seats its own Burlak
  // turret on that ring (267: built to the Burlak X source, above). The X turret is cleared whole; its gun stays (the X
  // build runs first, in the profile below).
  P.clear(...T90_TURRET_BUCKETS);
  replaceT90BurlakCoreNative2026(P);
  finishT90BurlakNative2026(P);
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
// between targets (auxiliarySystems.ts parkStation) and aims from it. A station a mark's kit adds itself (its second gun)
// rests where the kit authored it: the kit marks its root userData.t90OwnBearing.
export const ROOF_GUN_BEARING_DEG = Object.freeze({
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
      if (isRoofStation(node) && !outer && node.userData.t90OwnBearing !== true) stations.push(node);
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
