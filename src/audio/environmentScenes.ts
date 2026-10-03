/**
 * Environment scenes: what each battlefield sounds like when nobody is
 * shooting. A stereo bed, an optional water/machinery layer, positional spot
 * sounds scattered around the listener, the outdoor tail every gunshot rings
 * into, the reverb family, and how much of the distant war bleeds in.
 *
 * Pure data keyed by map id; the ambience director plays it.
 */

import type { ReverbId } from './mixPolicy.ts';

type GunTail = 'open' | 'forest' | 'urban' | 'mountain' | 'none';

export interface EnvironmentScene {
  readonly bed: string;
  readonly bedDb: number;
  readonly layer: { readonly asset: string; readonly db: number } | null;
  /** [spot asset id, relative weight]. */
  readonly spots: readonly (readonly [string, number])[];
  /** Seconds between spot sounds (uniform in range). */
  readonly spotEveryS: readonly [number, number];
  readonly tail: GunTail;
  readonly reverb: ReverbId;
  /** Level of the distant-battle bed under the scene (0 = none). */
  readonly war: number;
  /** Indoors: spot sounds come from a few metres away instead of across the field. */
  readonly indoor: boolean;
}

type SceneSeed = Partial<EnvironmentScene> & Pick<EnvironmentScene, 'bed'>;

function scene(value: SceneSeed): EnvironmentScene {
  return Object.freeze({
    bedDb: 0,
    layer: null,
    spots: Object.freeze([]),
    spotEveryS: Object.freeze([9, 20]) as readonly [number, number],
    tail: 'open' as GunTail,
    reverb: 'open' as ReverbId,
    war: 0.35,
    indoor: false,
    ...value,
  });
}

const L = (asset: string, db: number) => Object.freeze({ asset: `layer_${asset}`, db });
// No light or jingly spots (bells, birdsong, glass, alarms): a battlefield's
// ambience is wind, crows, gulls, rubble and machinery.
const spots = (...entries: (readonly [string, number])[]) => Object.freeze(entries.map(([id, w]) => Object.freeze([`spot_${id}`, w] as const)));

export const MAP_SCENES: Readonly<Record<string, EnvironmentScene>> = Object.freeze({
  verdant: scene({ bed: 'amb_field', spots: spots(['crow', 5], ['hawk', 2], ['wind_gust', 2], ['dog', 1]) }),
  desert: scene({ bed: 'amb_desert', spots: spots(['hawk', 2], ['wind_gust', 3], ['dust_devil', 1], ['rockfall', 1]), reverb: 'desert', spotEveryS: [10, 20] }),
  winter: scene({ bed: 'amb_alpine', spots: spots(['crow', 2], ['snow_slide', 2], ['ice_crack', 2], ['wind_gust', 2]), reverb: 'snow' }),
  urban: scene({ bed: 'amb_urban', spots: spots(['siren_far', 1], ['dog', 1], ['debris_settle', 5], ['fire_crackle', 2], ['radio_far', 1], ['crow', 1]), tail: 'urban', reverb: 'urban', war: 0.45 }),
  coastal: scene({ bed: 'amb_coastal', layer: L('surf', -8), spots: spots(['gulls', 3], ['foghorn', 2], ['wave_crash', 2]) }),
  autumn: scene({ bed: 'amb_forest', layer: L('river', -14), spots: spots(['crow', 4], ['woodpecker', 2], ['wind_gust', 2]), tail: 'forest', reverb: 'forest' }),
  steppe: scene({ bed: 'amb_steppe', spots: spots(['hawk', 5], ['wind_gust', 3]) }),
  railyard: scene({ bed: 'amb_railyard', spots: spots(['train_horn', 2], ['wagon_clank', 3], ['steam_hiss', 2], ['metal_groan', 1], ['crow', 1]), tail: 'urban', reverb: 'urban', war: 0.4 }),
  frontier: scene({ bed: 'amb_field', spots: spots(['hawk', 2], ['dog', 1], ['windmill', 1], ['wind_gust', 2], ['crow', 1]) }),
  fjord: scene({ bed: 'amb_coastal', layer: L('waterfall', -12), spots: spots(['gulls', 3], ['eagle', 1], ['foghorn', 1], ['wave_crash', 1]), tail: 'mountain', reverb: 'mountain' }),
  delta: scene({ bed: 'amb_wetland', layer: L('river', -14), spots: spots(['frog', 3], ['heron', 3], ['cicadas', 2]), tail: 'forest', reverb: 'forest' }),
  badlands: scene({ bed: 'amb_canyon', spots: spots(['hawk', 2], ['eagle', 1], ['rockfall', 2], ['wind_gust', 2]), tail: 'mountain', reverb: 'canyon' }),
  monsoon: scene({ bed: 'amb_jungle', spots: spots(['heron', 3], ['cicadas', 2], ['frog', 2]), tail: 'forest', reverb: 'forest', spotEveryS: [8, 16] }),
  alpine: scene({ bed: 'amb_alpine', spots: spots(['eagle', 1], ['rockfall', 2], ['ice_crack', 1], ['snow_slide', 1], ['wind_gust', 3]), tail: 'mountain', reverb: 'mountain' }),
  caldera: scene({ bed: 'amb_volcanic', spots: spots(['vent_hiss', 3], ['geo_rumble', 2], ['rockfall', 2]), tail: 'mountain', reverb: 'canyon' }),
  foundry: scene({ bed: 'amb_foundry', layer: L('machinery', -12), spots: spots(['forge_hammer', 3], ['steam_hiss', 2], ['crane_chain', 2], ['metal_groan', 1]), tail: 'urban', reverb: 'urban', war: 0.4 }),
  ruinspires: scene({ bed: 'amb_industrial', spots: spots(['debris_settle', 4], ['metal_groan', 2], ['wind_gust', 2], ['crow', 1]), tail: 'urban', reverb: 'urban', war: 0.45 }),
  blackglass: scene({ bed: 'amb_urban', spots: spots(['metal_groan', 1], ['debris_settle', 5], ['siren_far', 1], ['fire_crackle', 1], ['radio_far', 1]), tail: 'urban', reverb: 'urban', war: 0.45 }),
  titan_gorge: scene({ bed: 'amb_canyon', layer: L('river', -11), spots: spots(['eagle', 2], ['rockfall', 2], ['wind_gust', 2]), tail: 'mountain', reverb: 'canyon' }),
  skybridge: scene({ bed: 'amb_highwind', spots: spots(['cable_hum', 3], ['wind_gust', 3], ['eagle', 1]), tail: 'mountain', reverb: 'canyon' }),
  polders: scene({ bed: 'amb_wetland', spots: spots(['windmill', 3], ['geese', 2], ['frog', 2], ['gulls', 1]) }),
  copper_mesa: scene({ bed: 'amb_mine', spots: spots(['conveyor', 2], ['rockfall', 2], ['metal_groan', 1], ['hawk', 1], ['steam_hiss', 1]), tail: 'mountain', reverb: 'canyon' }),
  airfield: scene({ bed: 'amb_airfield', spots: spots(['jet_taxi', 2], ['flag_flap', 2], ['radio_far', 2], ['hawk', 1], ['wind_gust', 1]) }),
  oasis: scene({ bed: 'amb_oasis', spots: spots(['hawk', 1], ['dust_devil', 1], ['wind_gust', 2], ['crow', 1]), reverb: 'desert', spotEveryS: [10, 20] }),
  whiteout: scene({ bed: 'amb_polar', spots: spots(['wind_gust', 3], ['ice_crack', 2], ['metal_groan', 1], ['radio_far', 1]), reverb: 'snow' }),
  orchard: scene({ bed: 'amb_orchard', spots: spots(['bees', 2], ['crow', 4], ['woodpecker', 1], ['dog', 1]), tail: 'forest', reverb: 'forest' }),
  longleaf: scene({ bed: 'amb_pine', spots: spots(['woodpecker', 3], ['crow', 3]), tail: 'forest', reverb: 'forest' }),
  mangrove: scene({ bed: 'amb_mangrove', spots: spots(['frog', 3], ['heron', 4], ['cicadas', 1]), tail: 'forest', reverb: 'forest', spotEveryS: [8, 16] }),
  saltwind: scene({ bed: 'amb_coastal', layer: L('surf', -9), spots: spots(['gulls', 3], ['wave_crash', 3], ['wind_gust', 2]) }),
  reservoir: scene({ bed: 'amb_forest', layer: L('spillway', -13), spots: spots(['crow', 2], ['eagle', 1], ['woodpecker', 1]), tail: 'mountain', reverb: 'mountain' }),
  mars: scene({ bed: 'amb_mars', spots: spots(['dust_devil', 2], ['wind_gust', 2], ['geo_rumble', 1]), reverb: 'mars', war: 0, spotEveryS: [9, 18] }),
  moon: scene({ bed: 'amb_moon', spots: Object.freeze([]), tail: 'none', reverb: 'none', war: 0 }),
  cliffbridge: scene({ bed: 'amb_highwind', spots: spots(['cable_hum', 2], ['wind_gust', 3], ['eagle', 1], ['gulls', 1]), tail: 'mountain', reverb: 'canyon' }),
});

// The hangar: an audible room tone with workshop sounds a few metres away.
export const GARAGE_SCENE: EnvironmentScene = scene({
  bed: 'amb_garage',
  bedDb: 7,
  // A working hangar: tools, the crane chain, impact wrenches, a hammer on a
  // track pin, the compressor, a diesel being run up, the big door.
  spots: Object.freeze([
    Object.freeze(['garage_clank', 3] as const),
    Object.freeze(['spot_garage_tools', 3] as const),
    Object.freeze(['spot_garage_wrench', 2] as const),
    Object.freeze(['spot_garage_hammer', 2] as const),
    Object.freeze(['spot_crane_chain', 2] as const),
    Object.freeze(['spot_garage_compressor', 1] as const),
    Object.freeze(['spot_garage_engine', 1] as const),
    Object.freeze(['spot_garage_door', 1] as const),
    Object.freeze(['spot_radio_far', 1] as const),
  ]),
  spotEveryS: [4, 10], tail: 'none', reverb: 'hangar', war: 0, indoor: true,
});

export function sceneForMap(mapId: string | null | undefined): EnvironmentScene {
  return (mapId && MAP_SCENES[mapId]) || MAP_SCENES.verdant;
}
