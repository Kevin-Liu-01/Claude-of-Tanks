import * as THREE from 'three';
import { KIT, FITTINGS } from './kit.ts';
import { beginAuxiliaryStation, type StationDatum } from './auxiliaryStation.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { prepareWeaponFinishGeometry } from '../weaponFinish.ts';

type Slot = 'turretDark' | 'turretDetail' | 'turretGlass';
type Point = readonly [number, number, number];

/** Preserve an authored weapon's actual solids while giving it one fitting owner. */
export function sourceMachineGun(P: TankBuilderPort, yaw: Point, datum?: StationDatum) {
  const local = (point: Point): [number,number,number] => point.map((v,i)=>v-yaw[i]) as [number,number,number];
  const station = datum && beginAuxiliaryStation(P, {...datum,
    yaw: local(datum.yaw), pivot: local(datum.pivot), muzzle: local(datum.muzzle)});
  const parts: Record<Slot, THREE.BufferGeometry[]> = { turretDark: [], turretDetail: [], turretGlass: [] };
  // 2026-10-09 (fleet-weapons lane): the gun's steel is weapon steel (weaponFinish.ts) and the station's painted solids
  // (shields, housings, cradles, lids) carry the hull's camouflage on the vehicle-scale box UV, as the real stations are
  // painted with the vehicle; they were the flat hardware gunmetal and the scheme's flat fitting paint. Non-rendering
  // (receipt) builds have no weapon steel and keep their materials and geometry byte-identical.
  const rendered = Boolean(P.mats.weaponSteel);
  const material = (slot:Slot): THREE.Material => slot==='turretDark' ? (P.mats.weaponSteel ?? P.mats.dark)
    : slot==='turretGlass' ? P.mats.glass : rendered ? P.mats.hull : P.mats.detail;
  const finish = (slot:Slot, geometry:THREE.BufferGeometry): THREE.BufferGeometry => {
    const m = material(slot);
    if (m.userData?.weaponUvScale) return prepareWeaponFinishGeometry(geometry, KIT.boxUV);
    const camoUvScale = Number(m.userData?.camoUvScale);
    if (rendered && Number.isFinite(camoUvScale) && camoUvScale > 0) {
      KIT.boxUV(geometry, camoUvScale);
      // the camouflage paint samples vertex colours: a missing attribute renders black (fitAssemble's precedent)
      geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 3).fill(1), 3));
    }
    return geometry;
  };
  let stage: 'yaw'|'pitch' = 'pitch';
  return {
    stage(value: 'yaw'|'pitch'): void { stage=value; },
    markSupport(): void { station?.mark('yaw'); },
    add(slot: Slot, geometry: THREE.BufferGeometry, x: number, y: number, z: number, rx=0, ry=0, rz=0): void {
      const part=KIT.xform(geometry, x-yaw[0], y-yaw[1], z-yaw[2], rx, ry, rz);
      if (station && stage==='yaw') {
        const finished=finish(slot, part);
        const mesh=new THREE.Mesh(finished, material(slot));
        mesh.name='sourceMachineGun_yawSupport';mesh.castShadow=mesh.receiveShadow=true;
        mesh.position.copy(station.root.position).negate();station.root.add(mesh);
        P.disposables.push(finished);
      } else parts[slot].push(part);
    },
    finish(): THREE.Group {
      const group = new THREE.Group();
      for (const slot of ['turretDark', 'turretDetail', 'turretGlass'] as const) {
        if (!parts[slot].length) continue;
        const geometry = finish(slot, KIT.mergeAll(parts[slot]));
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
