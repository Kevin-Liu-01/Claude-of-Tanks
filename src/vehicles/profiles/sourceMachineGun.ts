import * as THREE from 'three';
import { KIT, FITTINGS } from './kit.ts';
import { beginAuxiliaryStation, type StationDatum } from './auxiliaryStation.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Slot = 'turretDark' | 'turretDetail' | 'turretGlass';
type Point = readonly [number, number, number];

/** Preserve an authored weapon's actual solids while giving it one fitting owner. */
export function sourceMachineGun(P: TankBuilderPort, yaw: Point, datum?: StationDatum) {
  const local = (point: Point): [number,number,number] => point.map((v,i)=>v-yaw[i]) as [number,number,number];
  const station = datum && beginAuxiliaryStation(P, {...datum,
    yaw: local(datum.yaw), pivot: local(datum.pivot), muzzle: local(datum.muzzle)});
  const parts: Record<Slot, THREE.BufferGeometry[]> = { turretDark: [], turretDetail: [], turretGlass: [] };
  const material = (slot:Slot) => slot==='turretDark' ? P.mats.dark : slot==='turretGlass' ? P.mats.glass : P.mats.detail;
  let stage: 'yaw'|'pitch' = 'pitch';
  return {
    stage(value: 'yaw'|'pitch'): void { stage=value; },
    markSupport(): void { station?.mark('yaw'); },
    add(slot: Slot, geometry: THREE.BufferGeometry, x: number, y: number, z: number, rx=0, ry=0, rz=0): void {
      const part=KIT.xform(geometry, x-yaw[0], y-yaw[1], z-yaw[2], rx, ry, rz);
      if (station && stage==='yaw') {
        const mesh=new THREE.Mesh(part, material(slot));
        mesh.name='sourceMachineGun_yawSupport';mesh.castShadow=mesh.receiveShadow=true;
        mesh.position.copy(station.root.position).negate();station.root.add(mesh);
        P.disposables.push(part);
      } else parts[slot].push(part);
    },
    finish(): THREE.Group {
      const group = new THREE.Group();
      for (const slot of ['turretDark', 'turretDetail', 'turretGlass'] as const) {
        if (!parts[slot].length) continue;
        const geometry = KIT.mergeAll(parts[slot]);
        // mergeAll owns flattened intermediates, but indexed authored inputs
        // remain ours. Their CPU-only resources must not be retained either.
        for (const part of parts[slot]) if (part.index) part.dispose();
        const mesh = new THREE.Mesh(geometry, material(slot));
        mesh.name = `sourceMachineGun_${slot}`;
        mesh.castShadow = mesh.receiveShadow = true;
        group.add(mesh);
        P.disposables.push(geometry);
      }
      group.userData.firingAxis = '+Z';
      group.userData.barrelAxisLocal = [0, 0, 1];
      group.userData.barrelElevationRad = 0;
      if (station) {
        station.attachPitch(group);
        const name=station.root.name;
        FITTINGS.markExact(station.root, 'pintleMG');
        station.root.name=name;
        return station.root;
      }
      FITTINGS.markExact(group, 'pintleMG');
      P.turretG.add(group);
      return group;
    },
  };
}
