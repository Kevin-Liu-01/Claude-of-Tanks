import type { GarageVariant } from './garageVariants.ts';

type GarageWorkshopBayId =
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

// Move the complete Burlak service story toward the opening camera, ahead of
// Verdant's fixed two-level scaffold. Dressing and outdoor facility scenery
// consume the same offset so the tank, gantry and support pad cannot separate.
export const BURLAK_SCAFFOLD_CLEARANCE_OFFSET = Object.freeze({
  x: 1.0,
  z: 5.2,
  cameraAdvanceM: 4.38,
  scaffoldCenterSeparationM: 8.41,
});

// The complete Abrams welding story stands in its authored orientation (no half-turn) on the floor between the Burlak
// gantry and the K2 square, its gun under the west_center hoist's load. 2026-10-05, gauntlet wave 89 ("a sand-coloured
// turret rises right behind the T-90's turret or gun"): beside the east FLAMMABLE canisters the tank stood behind the
// hero from the default and close Garage cameras, 7.5–8.4k px of it inside the hero's dilated silhouette with the m1a2,
// t90m and leo2a7v heroes (13–14k px close). No shift within its square, turret-off teardown or lowering cleared it,
// and every other exhibit swapped in fell into the same sight line; here it stands beside the camera, outside both
// views. One placement carries the tank, removed skirts, tools, floor station and lamp together.
export const ABRAMS_WELDING_BAY_PLACEMENT = Object.freeze({
  x: -0.4,
  z: -14.5,
  rotationRad: 0,
  /** Exhibit pixels inside the dilated hero silhouette, default and close cameras, three heroes (measured). */
  heroSilhouettePx: 0,
});

// The Leopard occupies the neighboring mobility square, not the Abrams
// welding owner. Preserve its established world-space pose when the Abrams
// service story moves independently.
export const LEOPARD_MOBILITY_BAY_OFFSET = Object.freeze({
  x: 1.65,
  z: 1.65,
});

// These are the final world-space poses after the Burlak clearance translation,
// the K2 half-turn bay owner and the Abrams placement are applied. Facility scenery consumes
// the same contract as the real fleet dressing, so a canopy, crane or service
// pit cannot drift away from the tank/component it is meant to support.
const BASE_BAY_POSES = Object.freeze<readonly GarageWorkshopBayPose[]>([
  Object.freeze({
    id: 'burlak_gantry', role: 'heavy-lift', x: 18.8, z: -10.3, yaw: -0.55,
  }),
  Object.freeze({
    id: 'abrams_welding', role: 'welding', x: 16.5, z: 3.2, yaw: -2.03,
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
const GARAGE_WORKSHOP_LAYOUT_POSES = Object.freeze([
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
