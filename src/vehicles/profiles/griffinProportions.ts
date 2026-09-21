import type * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

// Owner-directed proportions, applied once to the original authoring frame.
export const GRIFFIN_HULL_LENGTH_SCALE = 1.10;
export const GRIFFIN_TURRET_SCALE = .90;
export const GRIFFIN_TURRET_PIVOT: [number, number, number] = [0, 2.07, -.36 * GRIFFIN_HULL_LENGTH_SCALE];
export const GRIFFIN_HULL_LENGTH_M = 7.26594;

/** Called before gear or turret creation, so only hull stock is stretched. */
export function lengthenGriffinHull(P: TankBuilderPort): void {
  P.scaleAllBuckets(1, 1, GRIFFIN_HULL_LENGTH_SCALE);
  for (const child of P.hullG.children) {
    child.position.z *= GRIFFIN_HULL_LENGTH_SCALE;
    child.scale.z *= GRIFFIN_HULL_LENGTH_SCALE;
  }
}

/** Bake the smaller upper assembly; articulation parents remain unit scale. */
export function reduceGriffinTurret(P: TankBuilderPort): void {
  const scale = GRIFFIN_TURRET_SCALE;
  P.scaleBuckets(['turret', 'turretDetail', 'turretDark', 'turretGlass',
    'turretEquipment', 'turretExternalArmor', 'turretHatch', 'turretCupola',
    'turretCloth', 'gun', 'gunDark', 'gunMount', 'gunMountDark', 'gunMountGlass'], scale, scale, scale);
  const resize = (child: THREE.Object3D): void => {
    child.position.multiplyScalar(scale);
    child.scale.multiplyScalar(scale);
  };
  for (const child of P.turretG.children) if (child !== P.gunG) resize(child);
  // Explicit launcher anchors are installed from already-resized spec datums.
  for (const child of P.gunG.children)
    if (child !== P.recoilG && !child.name.startsWith('rig_launcher_tip_')) resize(child);
  for (const child of P.recoilG.children) resize(child);
  P.turretG.position.set(...GRIFFIN_TURRET_PIVOT);
  P.gunG.position.multiplyScalar(scale);
  P.muzzleZ *= scale;
  P.topY *= scale;
  const cradle = P.turretG.userData.gunCradleSeats;
  if (cradle) cradle.stations = cradle.stations.map((point: number[]) => point.map(value => value * scale));
}
