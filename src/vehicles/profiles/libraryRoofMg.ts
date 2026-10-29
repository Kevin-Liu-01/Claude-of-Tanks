import * as THREE from 'three';
import { FITTINGS, KIT } from './kit.ts';
import { MG_CLASSES, addPintleBarrel, addPintleReceiver, createPintleLayout } from '../machineGunGeometry.ts';
import { faceBoxUV } from '../factoryGeometry.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Point = readonly [number, number, number];
export interface LibraryRoofMgOptions {
  /** The station group's name (the hierarchy records turret -> station -> cradle -> weapon). */
  station: string;
  cls: 'nsvt' | 'kord';
  /** The pintle foot in the turret frame: the top of the ring or roof it stands on. */
  seat: Point;
  /** Station yaw at rest (radians, +Y), 0 = the gun along the turret's +Z. */
  yaw?: number;
  /** A remotely operated station (the gunner's or commander's remote mount) instead of a crew-served pintle. */
  remote?: boolean;
  /** How far the foot sits into its seat. */
  embedM?: number;
}

/**
 * Owner 2026-10-28 ("fix the machine guns on the t80s and t72s and even t90s that are not registered and show actual
 * machine guns that need to be actual machine guns of current dimensions"): the roof gun is the fleet's own machine
 * gun (FITTINGS.pintleMG, machineGunGeometry.ts: the NSVT's long low receiver, slender barrel with its conical flash
 * hider, gas tube, carrying handle and box, or the Kord's ribbed barrel) at its class's true scale, riding its cradle in
 * a working station, instead of an authored stand-in of boxes and rods. The T-80/T-80B/T-80BV commander's NSVT
 * (t80.ts) is the pattern: a named station at the seat, the fitting's foot `embedM` into it, the gun along local +Z.
 */
export function libraryRoofMg(P: TankBuilderPort, o: LibraryRoofMgOptions): { station: THREE.Group; mg: THREE.Group } {
  const station = new THREE.Group();
  station.name = o.station;
  station.position.set(o.seat[0], o.seat[1] - (o.embedM ?? 0.005), o.seat[2]);
  station.rotation.y = o.yaw ?? 0;
  station.userData.supportAssembly = o.remote ? 'remote-mount' : 'commander-cupola';
  station.userData.weaponAxis = 'local-positive-z';
  const mg = FITTINGS.pintleMG({
    mats: P.mats, cls: o.cls, scale: 1, tone: o.remote ? 'dark' : 'two-tone', ammo: true, shield: !o.remote, elev: 0,
    ridingCradle: true, ...(o.remote ? { remoteControlled: true } : { working: true }),
  });
  mg.userData.supportAssembly = station.name;
  mg.userData.commandedElevationRad = 0;
  station.add(mg);
  P.turretG.add(station);
  paintInTurretFrame(P, station);
  return { station, mg };
}

/**
 * The mount's painted parts (shield, cradle, bearing) take the turret's camouflage where they stand; the gun keeps its
 * gunmetal. fitAssemble projects a fitting's camo from the fitting's own origin, so a small mount sampled the atlas's
 * first patch whatever the scheme (Main 2026-10-28: pale tan on the T-80U, T-80UK, T-72B3 and T-72M1 sheets). They
 * are projected again in the turret's frame at the camo repeat, as the turret's own bucket is (faceBoxUV).
 */
function paintInTurretFrame(P: TankBuilderPort, station: THREE.Group): void {
  P.turretG.updateMatrixWorld(true);
  const toTurret = new THREE.Matrix4().copy(P.turretG.matrixWorld).invert();
  station.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o.userData.camoProjection !== 'continuous-fitting-box-uv') return;
    const placed = (o.geometry as THREE.BufferGeometry).clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(toTurret, o.matrixWorld));
    faceBoxUV(placed, Number(o.userData.camoUvScale));
    (o.geometry as THREE.BufferGeometry).setAttribute('uv', placed.getAttribute('uv'));
    placed.dispose();
  });
}

type StationSlot = 'turretDark' | 'turretDetail' | 'turretGlass' | 'turretAmmo';
/** A station's pitch stock (sourceMachineGun's builder): parts in its authored frame. */
interface StationStock { add(slot: StationSlot, geometry: THREE.BufferGeometry, x: number, y: number, z: number): void }
export interface LibraryStationGunOptions {
  cls: 'nsvt' | 'kord';
  /** The bore: its x and height, the station pivot's z and the published muzzle's z, in the stock's authored frame. */
  x: number; boreY: number; pivotZ: number; muzzleZ: number;
  /** The side the belt enters (the gunner's left is +X; a remote station's housing is built round the right). */
  feed?: 'left' | 'right';
}

/**
 * The same owner ruling for a remote station that keeps its own housing and yaw stage: the gun in its pitch stock is the
 * fleet's NSVT or Kord construction in its remote form (machineGunGeometry.ts: the receiver with its feed cover and
 * trigger housing, the barrel with its gas tube, carrying handle and muzzle device), its bore on the station's axis and
 * the device's front on the published muzzle, so no station datum moves. The national stations' gun
 * (nationalRoofWeapon.ts nationalMachineGun) is the pattern: the receiver's centre 8 cm behind the pivot.
 */
export function libraryStationGun(g: StationStock, o: LibraryStationGunOptions): void {
  const def = MG_CLASSES[o.cls], feed = o.feed ?? 'right';
  // the Kord at 102 %: its ported brake's mouth meets a station's 30 mm muzzle-rim receipt (nationalMachineGun)
  const scale = o.cls === 'kord' ? 1.02 : 1;
  const base = { cls: o.cls, scale, remote: true, ammo: false, mount: 'external-cradle', feed } as const;
  const probe = createPintleLayout(base, { add() {} });
  const dz = o.pivotZ - 0.08 - probe.recZ, dy = o.boreY - probe.trunY;
  const barrelLength = o.muzzleZ - dz - probe.trunZ - 0.10 * probe.s - def.flashL * probe.s;
  const layout = createPintleLayout({ ...base, barrelLength, muzzleBoreDepth: 0.07 }, {
    add(slot: string, geometry: THREE.BufferGeometry, px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0): void {
      if (slot === 'shadow') return;
      g.add(slot === 'glass' ? 'turretGlass' : 'turretDark', KIT.xform(geometry, px, py, pz, rx, ry, rz), o.x, dy, dz);
    },
  });
  addPintleReceiver(layout);
  addPintleBarrel(layout);
}
