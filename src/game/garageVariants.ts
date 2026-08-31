// Ten Garage destinations. Every choice owns a compact scene pack derived
// from its real battlefield terrain, structures, materials, and vegetation.
// This registry is deliberately renderer-free so UI, probes and persistence can
// consume the same immutable contract without importing a world or tank builder.

export const GARAGE_VARIANT_STORAGE_KEY = 'cot.garage.variant';

export interface GarageVariant {
  readonly id: string;
  readonly mapId: string;
  readonly name: string;
  readonly location: string;
  readonly description: string;
  readonly accent: number;
  readonly wallTint: number;
  readonly floorTint: number;
  readonly lightTint: number;
  readonly layout: number;
  readonly architecture: 'field_shed' | 'shade_depot' | 'repair_bunker' |
    'brick_arsenal' | 'naval_drydock' | 'rail_roundhouse' | 'rain_canopy' |
    'rock_cavern' | 'recovery_yard' | 'factory_line';
  readonly weather: 'clear' | 'dust' | 'snow' | 'rain' | 'industrial';
}

export const GARAGE_VARIANTS = Object.freeze<readonly GarageVariant[]>([
  Object.freeze({ id: 'verdant_motor_pool', mapId: 'verdant', name: 'Verdant Motor Pool', location: 'Verdant Fields', description: 'Open-door field maintenance and rapid refit bays.', accent: 0xc8a13a, wallTint: 0x46504a, floorTint: 0x525650, lightTint: 0xf3ecd9, layout: 0, architecture: 'field_shed', weather: 'clear' }),
  Object.freeze({ id: 'desert_forward_depot', mapId: 'desert', name: 'Sirocco Deployment', location: 'Sirocco Wadi', description: 'A compact wadi service terrace beneath a connected shade depot.', accent: 0xd28a32, wallTint: 0x55483b, floorTint: 0x5e5548, lightTint: 0xffdfb0, layout: 1, architecture: 'shade_depot', weather: 'dust' }),
  Object.freeze({ id: 'winter_repair_bunker', mapId: 'winter', name: 'Frosthollow Deployment', location: 'Frosthollow', description: 'A snowbound repair terrace protected by a low field bunker.', accent: 0x83b9d4, wallTint: 0x3d4a52, floorTint: 0x49545a, lightTint: 0xd9f1ff, layout: 2, architecture: 'repair_bunker', weather: 'snow' }),
  Object.freeze({ id: 'urban_arsenal', mapId: 'urban', name: 'Steinburg Deployment', location: 'Steinburg', description: 'A stripped-back city arsenal and connected loading canopy.', accent: 0xd5a04b, wallTint: 0x41474d, floorTint: 0x484b4e, lightTint: 0xf0e6d2, layout: 3, architecture: 'brick_arsenal', weather: 'industrial' }),
  Object.freeze({ id: 'coastal_drydock', mapId: 'coastal', name: 'Saltmere Deployment', location: 'Saltmere Bay', description: 'A coastal hardstand framed by drydock rails and gantry steel.', accent: 0x49aab5, wallTint: 0x364b50, floorTint: 0x435258, lightTint: 0xd8f7f6, layout: 4, architecture: 'naval_drydock', weather: 'clear' }),
  Object.freeze({ id: 'railyard_overhaul', mapId: 'railyard', name: 'Cinder Deployment', location: 'Cinder Junction', description: 'A compact roundhouse road with connected service rails.', accent: 0xb97734, wallTint: 0x493f39, floorTint: 0x504b46, lightTint: 0xffe2be, layout: 5, architecture: 'rail_roundhouse', weather: 'industrial' }),
  Object.freeze({ id: 'monsoon_field_bay', mapId: 'monsoon', name: 'Monsoon Deployment', location: 'Monsoon Ridge', description: 'A raised rain canopy and drainage terrace in dense green terrain.', accent: 0x59a877, wallTint: 0x394b43, floorTint: 0x46524a, lightTint: 0xdff7df, layout: 6, architecture: 'rain_canopy', weather: 'rain' }),
  Object.freeze({ id: 'alpine_service_cavern', mapId: 'alpine', name: 'Glacier Deployment', location: 'Glacier Pass', description: 'A minimal rock service cavern cut into a cold alpine terrace.', accent: 0x97b8c7, wallTint: 0x3f484c, floorTint: 0x4a5052, lightTint: 0xe6f5ff, layout: 7, architecture: 'rock_cavern', weather: 'snow' }),
  Object.freeze({ id: 'badlands_recovery_yard', mapId: 'badlands', name: 'Redrock Deployment', location: 'Redrock Divide', description: 'A redrock recovery pad with a connected heavy-lift frame.', accent: 0xc66d3a, wallTint: 0x514039, floorTint: 0x594940, lightTint: 0xffd6ae, layout: 8, architecture: 'recovery_yard', weather: 'dust' }),
  Object.freeze({ id: 'foundry_heavy_works', mapId: 'foundry', name: 'Ironworks Deployment', location: 'Ironworks', description: 'A compact foundry line of stacks, pipes, and armored service bays.', accent: 0xe07f36, wallTint: 0x453b38, floorTint: 0x4d4642, lightTint: 0xffc894, layout: 9, architecture: 'factory_line', weather: 'industrial' }),
]);

const BY_ID = new Map(GARAGE_VARIANTS.map((variant) => [variant.id, variant]));

export const DEFAULT_GARAGE_VARIANT_ID = GARAGE_VARIANTS[0].id;

export function getGarageVariant(id: string | null | undefined): GarageVariant {
  return BY_ID.get(String(id || '')) || GARAGE_VARIANTS[0];
}

export function loadGarageVariantId(storage: Pick<Storage, 'getItem'> | null =
  typeof localStorage === 'undefined' ? null : localStorage): string {
  try { return getGarageVariant(storage?.getItem(GARAGE_VARIANT_STORAGE_KEY)).id; }
  catch (_) { return DEFAULT_GARAGE_VARIANT_ID; }
}

export function saveGarageVariantId(
  id: string,
  storage: Pick<Storage, 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage,
): string {
  const resolved = getGarageVariant(id).id;
  try { storage?.setItem(GARAGE_VARIANT_STORAGE_KEY, resolved); } catch (_) { /* privacy mode */ }
  return resolved;
}
