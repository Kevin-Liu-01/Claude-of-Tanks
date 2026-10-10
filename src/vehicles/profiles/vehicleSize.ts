import type * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { scaledGroundSampler } from '../scaledGroundSampler.ts';

/** Bake one complete vehicle before bucket merge. Articulation parents keep
 * unit scale, and the original suspension solves in its own authoring frame. */
export function resizeAuthoredVehicle(P: TankBuilderPort, factor: number): void {
  P.scaleAllBuckets(factor);
  P.scaleDecals(factor);
  const scaleChild = (child: THREE.Object3D): void => {
    child.position.multiplyScalar(factor);
    child.scale.multiplyScalar(factor);
  };
  for (const child of P.hullG.children) scaleChild(child);
  for (const child of P.turretG.children) if (child !== P.gunG) scaleChild(child);
  for (const child of P.gunG.children) if (child !== P.recoilG) scaleChild(child);
  // Twin-plant tube groups (rig_barrel_N) are articulation parents too: their
  // gunBarrelN buckets merge into them already scaled above, so a scaled group
  // would bake those tubes twice (bmpt_t90: fire axes 0.441 m apart, not 0.42).
  for (const child of P.recoilG.children) if (!/^rig_barrel_\d+$/.test(child.name)) scaleChild(child);
  P.hullG.position.multiplyScalar(factor);
  P.turretG.position.multiplyScalar(factor);
  P.gunG.position.multiplyScalar(factor);
  P.muzzleZ *= factor;
  P.topY *= factor;
  if (P.physicalMuzzleBore) {
    P.physicalMuzzleBore = { outerRadiusM: P.physicalMuzzleBore.outerRadiusM * factor,
      innerRadiusM: P.physicalMuzzleBore.innerRadiusM * factor,
      depthM: P.physicalMuzzleBore.depthM * factor };
  }
  if (P.muzzleMouth) P.muzzleMouth = {
    outerRadiusM: P.muzzleMouth.outerRadiusM * factor,
    innerRadiusM: P.muzzleMouth.innerRadiusM * factor,
  };
  const cradle = P.turretG.userData.gunCradleSeats;
  if (cradle) cradle.stations = cradle.stations.map((p: number[]) => p.map(v => v * factor));
  const gear = P.gear;
  if (gear) {
    const contact = gear.contactGeom;
    for (const key of ['halfLenM', 'zCenterM', 'halfWidM', 'bottomYM'] as const) contact[key] *= factor;
    if (contact.endRise) for (const key of ['dzM', 'frontM', 'rearM'] as const) contact.endRise[key] *= factor;
    if (gear.continuousShoeFloorYM !== undefined) gear.continuousShoeFloorYM *= factor;
    for (const lane of gear.trackHitbox) {
      lane.x0 *= factor; lane.x1 *= factor;
      lane.poly = lane.poly.map(([z, y]) => [z * factor, y * factor]);
    }
    const wheels = gear.roadWheelLayout;
    if (wheels) {
      for (const key of ['xc','wheelY','wheelR','roadWheelOutsetM','roadWheelOutsetLeftM','roadWheelOutsetRightM'] as const)
        if (wheels[key] !== undefined) wheels[key] *= factor;
      for (const key of ['wheelZs','wheelZsLeftM','wheelZsRightM','wheelYs'] as const)
        if (wheels[key]) wheels[key] = wheels[key].map(v => v * factor);
    }
    const update = gear.update.bind(gear), surface = gear.updateSurface?.bind(gear);
    const conform = gear.conform.bind(gear);
    let frame: Parameters<typeof conform>[0] | null = null;
    let ground: Parameters<typeof conform>[1];
    const sourceGround = scaledGroundSampler(factor, () => ground);
    gear.update = (left, right, dt) => update(left / factor, right / factor, dt);
    if (surface) gear.updateSurface = (left, right) => surface(left / factor, right / factor);
    gear.conform = (state, sampler, pitch, roll, dt) => {
      if (!frame) frame = { ...state, pos: { ...state.pos } };
      frame.pos.x = state.pos.x / factor; frame.pos.y = state.pos.y / factor; frame.pos.z = state.pos.z / factor;
      frame.yaw = state.yaw; frame.visualPitch = state.visualPitch; frame.visualRoll = state.visualRoll;
      ground = sampler;
      return conform(frame, sourceGround, pitch, roll, dt);
    };
  }
  P.hullG.userData.vehicleSize = { factor, baked: true };
}
