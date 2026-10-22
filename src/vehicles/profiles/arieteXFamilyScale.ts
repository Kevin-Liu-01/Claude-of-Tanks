import type * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { scaleRunningGearMotion } from '../scaledGroundSampler.ts';
import { ARIETE_X_FAMILY_SCALE as SCALE } from './arieteXFamilyFrame.ts';
import { retainArieteXStructuralLod } from './arieteXStructuralLod.ts';

function scaleGearMotion(P: TankBuilderPort): void {
  // The unchanged canonical solver works in the source authoring frame.
  // Convert world motion/terrain into it, then the scaled children display
  // the solved wheel, band and shoe stock together in installed metres.
  if (P.gear) scaleRunningGearMotion(P.gear, SCALE);
}

/** Bake the complete authored metre frame once; keep simulation rig scales
 * at identity. Gear animation remains inside its uniformly scaled children. */
export function enlargeArieteXFamily(P: TankBuilderPort): void {
  P.scaleAllBuckets(SCALE);
  P.scaleDecals(SCALE);
  const scaleChild = (child: THREE.Object3D): void => {
    child.position.multiplyScalar(SCALE);
    child.scale.multiplyScalar(SCALE);
  };
  for (const child of [...P.hullG.children]) scaleChild(child);
  for (const child of [...P.turretG.children]) if (child !== P.gunG) scaleChild(child);
  for (const child of [...P.gunG.children]) if (child !== P.recoilG) scaleChild(child);
  for (const child of [...P.recoilG.children]) scaleChild(child);
  P.turretG.position.multiplyScalar(SCALE);
  P.gunG.position.multiplyScalar(SCALE);
  P.muzzleZ *= SCALE;
  P.topY *= SCALE;
  const contact = P.gear?.contactGeom;
  if (contact) {
    for (const key of ['halfLenM', 'zCenterM', 'halfWidM', 'bottomYM'] as const) contact[key] *= SCALE;
    if (contact.endRise) for (const key of ['dzM', 'frontM', 'rearM'] as const) contact.endRise[key] *= SCALE;
  }
  for (const lane of P.gear?.trackHitbox ?? []) {
    lane.x0 *= SCALE; lane.x1 *= SCALE;
    lane.poly = lane.poly.map(([z, y]) => [z * SCALE, y * SCALE]);
  }
  const wheels = P.gear?.roadWheelLayout;
  if (wheels) {
    wheels.xc *= SCALE; wheels.wheelY *= SCALE; wheels.wheelR *= SCALE;
    wheels.wheelZs = wheels.wheelZs.map(z => z * SCALE);
  }
  scaleGearMotion(P);
  retainArieteXStructuralLod(P);
  P.hullG.userData.arieteXFamilyScale = Object.freeze({ scale: SCALE,
    bakedGeometry: true, scaledContactGeometry: true, scaledTrackHitboxes: true,
    scaledRoadWheelLayout: true, identityArticulationScale: true });
}
