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

// Verdant Motor Pool: the complete Abrams welding story stands half-turned
// beside Verdant's east FLAMMABLE canister station. This is deliberately a
// two-axis correction: the previous diagonal scalar advanced the bay toward
// the opening but left it roughly 9.8 m from the drums. It is the owner's
// placement: every production build carried it from 2026-09-04 to deploy 206,
// a08175e95 (2026-10-05, gauntlet wave 89) moved it beside the camera, and the
// owner ordered it back on 2026-10-09 ("put the m1 abrams area back to where
// it was in verdant motor pool. fn it got flipped for no reason"). Do not move
// or turn it without the owner.
export const ABRAMS_FLAMMABLE_BAY_OFFSET = Object.freeze({
  x: -0.8,
  z: 7.7,
  rotationRad: Math.PI,
  canisterCenterSeparationM: 3.83,
});

// The nine outdoor Garages: the complete Abrams welding story stands in its authored orientation (no half-turn) on the
// floor between the Burlak gantry and the K2 square, its gun under the west_center hoist's load. 2026-10-05, gauntlet
// wave 89 ("a sand-coloured turret rises right behind the T-90's turret or gun"): beside the east FLAMMABLE canisters
// the tank stood behind the hero from the default and close Garage cameras, 7.5–8.4k px of it inside the hero's dilated
// silhouette with the m1a2, t90m and leo2a7v heroes (13–14k px close); here it stands beside the camera, outside both
// views, on its own terrain pad (garageFacilityDetails.ts). Every outdoor pack seats its signature facility where the
// Verdant canister station would put the tank. One placement carries the tank, removed skirts, tools and floor station.
export const ABRAMS_WELDING_BAY_PLACEMENT = Object.freeze({
  x: -0.4,
  z: -14.5,
  rotationRad: 0,
  /** Exhibit pixels inside the dilated hero silhouette, default and close cameras, three heroes (measured). */
  heroSilhouettePx: 0,
});

/** The placement that carries the complete Abrams welding bay owner in one Garage destination. */
export function getAbramsWeldingBayPlacement(
  variant: Pick<GarageVariant, 'id'>,
): Readonly<{ x: number; z: number; rotationRad: number }> {
  return variant.id === 'verdant_motor_pool' ? ABRAMS_FLAMMABLE_BAY_OFFSET : ABRAMS_WELDING_BAY_PLACEMENT;
}

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
// pit cannot drift away from the tank/component it is meant to support. The
// Abrams pose is the authored tank (16.9, 17.7, yaw -2.03) carried by its
// destination's placement: Verdant's half-turned canister station, or the
// outdoor packs' station beside the camera.
const BURLAK_BAY_POSE = Object.freeze<GarageWorkshopBayPose>({
  id: 'burlak_gantry', role: 'heavy-lift', x: 18.8, z: -10.3, yaw: -0.55,
});
const VERDANT_ABRAMS_BAY_POSE = Object.freeze<GarageWorkshopBayPose>({
  id: 'abrams_welding', role: 'welding', x: -17.7, z: -10.0,
  yaw: -2.03 + Math.PI,
});
const OUTDOOR_ABRAMS_BAY_POSE = Object.freeze<GarageWorkshopBayPose>({
  id: 'abrams_welding', role: 'welding', x: 16.5, z: 3.2, yaw: -2.03,
});
const T90M_BAY_POSE = Object.freeze<GarageWorkshopBayPose>({
  id: 't90m_relikt', role: 'component-rebuild', x: -6.6, z: 20.5, yaw: 2.4,
});
const K2_BAY_POSE = Object.freeze<GarageWorkshopBayPose>({
  id: 'rolled_k2', role: 'rollover-teardown', x: 16.25, z: 16.85,
  yaw: 0.35 + Math.PI,
});

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
  variant: Pick<GarageVariant, 'id' | 'layout'>,
): readonly GarageWorkshopBayPose[] {
  const [layoutX, layoutZ, layoutYaw] = getGarageWorkshopLayoutPose(variant);
  const cos = Math.cos(layoutYaw);
  const sin = Math.sin(layoutYaw);
  const abrams = variant.id === 'verdant_motor_pool' ? VERDANT_ABRAMS_BAY_POSE : OUTDOOR_ABRAMS_BAY_POSE;
  return [BURLAK_BAY_POSE, abrams, T90M_BAY_POSE, K2_BAY_POSE].map((bay) => Object.freeze({
    ...bay,
    x: layoutX + bay.x * cos + bay.z * sin,
    z: layoutZ - bay.x * sin + bay.z * cos,
    yaw: bay.yaw + layoutYaw,
  }));
}
