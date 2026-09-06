import * as THREE from 'three';
import { KIT, FITTINGS } from './kit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Slot = 'turretDark' | 'turretDetail';
type Point = readonly [number, number, number];

/** Preserve an authored weapon's actual solids while giving it one fitting owner. */
export function sourceMachineGun(P: TankBuilderPort, yaw: Point) {
  const parts: Record<Slot, THREE.BufferGeometry[]> = { turretDark: [], turretDetail: [] };
  return {
    add(slot: Slot, geometry: THREE.BufferGeometry, x: number, y: number, z: number, rx=0, ry=0, rz=0): void {
      parts[slot].push(KIT.xform(geometry, x-yaw[0], y-yaw[1], z-yaw[2], rx, ry, rz));
    },
    finish(): THREE.Group {
      const group = new THREE.Group();
      for (const slot of ['turretDark', 'turretDetail'] as const) {
        if (!parts[slot].length) continue;
        const geometry = KIT.mergeAll(parts[slot]);
        // mergeAll owns flattened intermediates, but indexed authored inputs
        // remain ours. Their CPU-only resources must not be retained either.
        for (const part of parts[slot]) if (part.index) part.dispose();
        const mesh = new THREE.Mesh(geometry, slot==='turretDark' ? P.mats.dark : P.mats.detail);
        mesh.name = `sourceMachineGun_${slot}`;
        mesh.castShadow = mesh.receiveShadow = true;
        group.add(mesh);
        P.disposables.push(geometry);
      }
      group.userData.firingAxis = '+Z';
      group.userData.barrelAxisLocal = [0, 0, 1];
      group.userData.barrelElevationRad = 0;
      FITTINGS.markExact(group, 'pintleMG');
      P.turretG.add(group);
      return group;
    },
  };
}
