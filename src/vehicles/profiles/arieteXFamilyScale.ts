import type * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { ARIETE_X_FAMILY_SCALE as SCALE } from './arieteXFamilyFrame.ts';
import { retainArieteXStructuralLod } from './arieteXStructuralLod.ts';

function scaleGearMotion(P: TankBuilderPort): void {
  const gear = P.gear;
  if (!gear) return;
  const update = gear.update.bind(gear), surface = gear.updateSurface?.bind(gear);
  const conform = gear.conform.bind(gear);
  let frame: Parameters<typeof conform>[0] | null = null;
  let ground: Parameters<typeof conform>[1];
  const sourceGround = (x: number, z: number): number => ground(x * SCALE, z * SCALE) / SCALE;
  // The unchanged canonical solver works in the source authoring frame.
  // Convert world motion/terrain into it, then the scaled children display
  // the solved wheel, band and shoe stock together in installed metres.
  gear.update = (left, right, dt) => update(left / SCALE, right / SCALE, dt);
  if (surface) gear.updateSurface = (left, right) => surface(left / SCALE, right / SCALE);
  gear.conform = (state, sampler, pitch, roll, dt) => {
    if (!frame) frame = { ...state, pos: { ...state.pos } };
    frame.pos.x = state.pos.x / SCALE; frame.pos.y = state.pos.y / SCALE;
    frame.pos.z = state.pos.z / SCALE;
    frame.yaw = state.yaw; frame.visualPitch = state.visualPitch; frame.visualRoll = state.visualRoll;
    ground = sampler;
    return conform(frame, sourceGround, pitch, roll, dt);
  };
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
