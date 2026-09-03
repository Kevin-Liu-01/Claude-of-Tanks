import type { GarageVariant } from './garageVariants.ts';

export type GarageWorkshopBayId =
  | 'burlak_gantry'
  | 'abrams_welding'
  | 't90m_relikt'
  | 'rolled_k2';

export interface GarageWorkshopBayPose {
  readonly id: GarageWorkshopBayId;
  readonly role: 'heavy-lift' | 'welding' | 'component-rebuild' | 'rollover-teardown';
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
}

// These are the final world-space poses after the two legacy half-turn bay
// owners are applied. Facility scenery consumes the same contract as the real
// fleet dressing, so a canopy, crane or service pit cannot drift away from the
// tank/component it is meant to support.
const BASE_BAY_POSES = Object.freeze<readonly GarageWorkshopBayPose[]>([
  Object.freeze({
    id: 'burlak_gantry', role: 'heavy-lift', x: 17.8, z: -15.5, yaw: -0.55,
  }),
  Object.freeze({
    id: 'abrams_welding', role: 'welding', x: -16.9, z: -17.7,
    yaw: -2.03 + Math.PI,
  }),
  Object.freeze({
    id: 't90m_relikt', role: 'component-rebuild', x: -6.6, z: 20.5, yaw: 2.4,
  }),
  Object.freeze({
    id: 'rolled_k2', role: 'rollover-teardown', x: 16.25, z: 16.85,
    yaw: 0.35 + Math.PI,
  }),
]);

// Tiny whole-workshop variations preserve each environment's composition,
// but never rearrange the four service stories internally.
export const GARAGE_WORKSHOP_LAYOUT_POSES = Object.freeze([
  [0, 0, 0], [0.7, -0.4, 0.028], [-0.5, 0.4, -0.022],
  [0.35, 0.55, 0.018], [-0.65, -0.2, -0.026], [0.5, 0.25, 0.022],
  [-0.4, -0.45, -0.018], [0.55, 0.35, 0.024], [-0.6, 0.2, -0.024],
  [0.3, -0.55, 0.016],
] as const);

export function getGarageWorkshopLayoutPose(
  variant: Pick<GarageVariant, 'layout'>,
): readonly [x: number, z: number, yaw: number] {
  return GARAGE_WORKSHOP_LAYOUT_POSES[variant.layout] || GARAGE_WORKSHOP_LAYOUT_POSES[0];
}

export function getGarageWorkshopBayPoses(
  variant: Pick<GarageVariant, 'layout'>,
): readonly GarageWorkshopBayPose[] {
  const [layoutX, layoutZ, layoutYaw] = getGarageWorkshopLayoutPose(variant);
  const cos = Math.cos(layoutYaw);
  const sin = Math.sin(layoutYaw);
  return BASE_BAY_POSES.map((bay) => Object.freeze({
    ...bay,
    x: layoutX + bay.x * cos + bay.z * sin,
    z: layoutZ - bay.x * sin + bay.z * cos,
    yaw: bay.yaw + layoutYaw,
  }));
}
