// Shared OTShU emitter vocabulary extracted from the original ruShtora rig.
// Source-X callers use an equipment-only adapter; no Russian hull/turret pack
// is imported merely to construct two optical fittings.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { vehicleAmbientFloorHook } from '../materials.ts';
import { markVehicleNightLens, prepareVehicleNightLensParts, registerVehicleNightLensMesh } from '../vehicleNightLighting.ts';

export interface ShtoraPort {
  readonly mats: { readonly dark: THREE.MeshStandardMaterial };
  readonly turretG: THREE.Group;
  _shtoraRed?: THREE.MeshStandardMaterial;
  add(slot: string, geometry: THREE.BufferGeometry, x: number, y: number, z: number): void;
}

interface ShtoraSeats {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly scale: number;
  readonly round: boolean;
  readonly kit: boolean;
  readonly offset?: readonly [number, number, number];
}

export function addShtoraEyes(P: ShtoraPort, seats: ShtoraSeats): void {
  const { box } = KIT;
  const { x, scale: es } = seats;
  const [dx, dy, dz] = seats.offset ?? [0, 0, 0];
  const y = seats.y + dy, zc = seats.z + dz;
  if (seats.round && !P._shtoraRed) {
    const material = P.mats.dark.clone();
    material.onBeforeCompile = vehicleAmbientFloorHook;
    material.customProgramCacheKey = () => 'veh-ambient-floor-v2';
    material.color.setHex(0x54180e);
    material.emissive.setHex(0x7c2410);
    P._shtoraRed = material;
  }
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.24 * es, 0.27 * es, 0.22 * es), s * x + dx, y, zc);
    if (seats.round) {
      P.add('turretDark', KIT.cylZ(0.100 * es, 0.055 * es, 16), s * x + dx, y, zc + 0.0975 * es);
      P.add('turretDetail', KIT.cylZ(0.106 * es, 0.016 * es, 16), s * x + dx, y, zc + 0.092 * es);
      const geometry = markVehicleNightLens(KIT.cylZ(0.072 * es, 0.014 * es, 16), 'shtora');
      prepareVehicleNightLensParts([geometry]);
      const lens = new THREE.Mesh(geometry, P._shtoraRed);
      lens.position.set(s * x + dx, y, zc + 0.123 * es);
      lens.castShadow = lens.receiveShadow = true;
      P.turretG.add(lens);
      registerVehicleNightLensMesh(lens, [geometry]);
    } else {
      P.add('turretGlass', markVehicleNightLens(box(0.17, 0.18, 0.03), 'shtora'), s * x + dx, y, zc + 0.115);
    }
    P.add('turretDetail', box(0.27 * es, 0.04 * es, 0.24 * es), s * x + dx, y + 0.155 * es, zc + 0.01 * es);
    if (seats.kit) {
      for (let fi = 0; fi < 3; fi++) {
        P.add('turretDark', box(0.19 * es, 0.024 * es, 0.014 * es), s * x + dx, y + (-0.056 + fi * 0.056) * es, zc + 0.118 * es);
      }
      P.add('turretDetail', box(0.014 * es, 0.21 * es, 0.19 * es), s * (x + 0.122 * es) + dx, y, zc - 0.005 * es);
      P.add('turretDetail', box(0.014 * es, 0.21 * es, 0.19 * es), s * (x - 0.122 * es) + dx, y, zc - 0.005 * es);
      P.add('turretDark', box(0.18 * es, 0.045 * es, 0.16 * es), s * x + dx, y - 0.155 * es, zc - 0.045 * es);
    }
  }
}
