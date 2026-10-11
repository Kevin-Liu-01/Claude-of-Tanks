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

// The weld light (2026-10-10): Verdant's former west-wall fill PointLight now stands at the rolled K2's belly weld,
// 0.35 m out from the torch tip toward the welder, so the arc lights him, the plate and the floor. Garage frame,
// Verdant layout; garageCrewFigures.selftest checks it against the K2 crew's torch.
export const VERDANT_WELD_LIGHT = Object.freeze({ x: 15.72, y: 2.05, z: 16.3 });

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

// The Leopard 2A5/A5NL mobility bay (the hull on its four-post lift, the removed-wheel rack, the impact-wrench kit and
// the wheel-carry crew) stands at this pose inside its half-turned owner (LEOPARD_MOBILITY_BAY_OFFSET). garageDressing.ts
// places the bay with it, and the facility terraces seat the bay's floor with it.
export const LEOPARD_MOBILITY_BAY_LOCAL = Object.freeze({ x: 18.05, z: -11.95, yaw: -0.55 });

// The Leopard bay's working floor in its own frame: one circle whose level core (1.2 radii) covers the lift's feet and
// rails, the wheel rack, the kit and the crew's feet. 2026-10-10 ground audit: on raw terrain this bay's crew floated up
// to 1.44 m over Saltmere's dip and stood buried to 0.79 m in Steinburg's bank, its lift and rack with them.
export const LEOPARD_MOBILITY_FLOOR = Object.freeze({ x: -0.75, z: 1.05, radiusM: 5.6 });

/** A point of the Leopard mobility bay's frame in one Garage's workshop frame (the owner's half-turn, then the layout pose). */
export function leopardBayPointToWorkshop(
  variant: Pick<GarageVariant, 'layout'>,
  x: number,
  z: number,
): { x: number; z: number } {
  const local = LEOPARD_MOBILITY_BAY_LOCAL;
  const c = Math.cos(local.yaw);
  const s = Math.sin(local.yaw);
  const ownerX = -(local.x + x * c + z * s) + LEOPARD_MOBILITY_BAY_OFFSET.x;
  const ownerZ = -(local.z - x * s + z * c) + LEOPARD_MOBILITY_BAY_OFFSET.z;
  const [layoutX, layoutZ, layoutYaw] = getGarageWorkshopLayoutPose(variant);
  const lc = Math.cos(layoutYaw);
  const ls = Math.sin(layoutYaw);
  return { x: layoutX + ownerX * lc + ownerZ * ls, z: layoutZ - ownerX * ls + ownerZ * lc };
}

// The yard crews' floors (2026-10-10 ground audit): the track carry and the power-pack pair stand in the open yard
// beside the hero, where the raw terrain left them buried to 0.47 m (Ironworks) or 0.26 m clear (Saltmere). Each stands
// on a datum floor circle in the shared workshop frame, its level core clear of the podium base.
export const GARAGE_YARD_CREW_FLOORS = Object.freeze([
  Object.freeze({ id: 'yard-track-carry', x: -11.4, z: 1.3, radiusM: 3.8 }),
  Object.freeze({ id: 'yard-power-pack', x: 3.55, z: -11.45, radiusM: 3.8 }),
]);

/** The yard crews' floor circles in one Garage's workshop frame (its layout pose applied). */
export function getGarageYardCrewFloors(
  variant: Pick<GarageVariant, 'layout'>,
): ReadonlyArray<{ readonly id: string; readonly x: number; readonly z: number; readonly radiusM: number }> {
  const [layoutX, layoutZ, layoutYaw] = getGarageWorkshopLayoutPose(variant);
  const c = Math.cos(layoutYaw);
  const s = Math.sin(layoutYaw);
  return GARAGE_YARD_CREW_FLOORS.map((floor) => Object.freeze({
    id: floor.id,
    x: layoutX + floor.x * c + floor.z * s,
    z: layoutZ - floor.x * s + floor.z * c,
    radiusM: floor.radiusM,
  }));
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

/**
 * Regional shelter construction: frame paint and roofing per Garage (sRGB). The outdoor facilities build with it and
 * the shared exhibit's own frames take the same paint in every pack (2026-10-10, wave 357: three-colour tangles).
 */
export const GARAGE_SHELTER_FINISHES: Readonly<Record<GarageVariant['architecture'], { readonly frame: number; readonly roof: number }>> =
  Object.freeze({
    field_shed: { frame: 0x58615a, roof: 0x5d6466 },
    shade_depot: { frame: 0xa48b62, roof: 0xc8b48c }, // sand-painted steel under a desert shade cloth
    repair_bunker: { frame: 0x4e5a4c, roof: 0xb9c2c4 }, // dark green steel, insulated panels, snow-dusted
    brick_arsenal: { frame: 0x6b4638, roof: 0x6e7072 }, // oxide-primed steel, weathered corrugated iron
    naval_drydock: { frame: 0x8b9296, roof: 0x9aa1a3 }, // salt-weathered galvanised steel and sheeting
    rail_roundhouse: { frame: 0x2f3234, roof: 0x55595b }, // black railway steel, sooty sheeting
    rain_canopy: { frame: 0x4f6a52, roof: 0x3f5a48 }, // green steel under a monsoon tarpaulin
    rock_cavern: { frame: 0x6c7478, roof: 0x7e8588 }, // grey steel, rock-dusted sheeting
    recovery_yard: { frame: 0x8a5a3a, roof: 0x9c7a5c }, // rust-red steel under a dust-coloured tarp
    factory_line: { frame: 0x5d6266, roof: 0x45484a }, // mill-grey steel, soot-black sheeting
  });

/**
 * Garages whose Leopard and K2 bays show their alternate tasks (garageCrewFigures.ts GARAGE_BAY_ALTERNATE_SCENES), so
 * no two Garages repeat the same bay story with their left-band task (2026-10-10: "no copy-paste bays"). Verdant keeps
 * the ruled originals.
 */
export const GARAGE_BAY_ALTERNATES: Readonly<Record<GarageVariant['architecture'],
  { readonly leopard: boolean; readonly k2: boolean; readonly abrams: boolean }>> = Object.freeze({
  field_shed: { leopard: false, k2: false, abrams: false },
  shade_depot: { leopard: true, k2: false, abrams: false },
  repair_bunker: { leopard: false, k2: true, abrams: true },
  brick_arsenal: { leopard: true, k2: false, abrams: true },
  naval_drydock: { leopard: false, k2: true, abrams: false },
  rail_roundhouse: { leopard: true, k2: false, abrams: false },
  rain_canopy: { leopard: false, k2: true, abrams: true },
  rock_cavern: { leopard: true, k2: false, abrams: true },
  recovery_yard: { leopard: false, k2: true, abrams: false },
  factory_line: { leopard: true, k2: false, abrams: true },
});

/** The rolled K2's belly is welded in this Garage (the weld light burns there). */
export function garageK2HotWork(variant: Pick<GarageVariant, 'architecture'>): boolean {
  return !(GARAGE_BAY_ALTERNATES[variant.architecture]?.k2 ?? false);
}

