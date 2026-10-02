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
}

type SceneSeed = Partial<EnvironmentScene> & Pick<EnvironmentScene, 'bed'>;

function scene(value: SceneSeed): EnvironmentScene {
  return Object.freeze({
    bedDb: 0,
    layer: null,
    spots: Object.freeze([]),
    spotEveryS: Object.freeze([5, 11]) as readonly [number, number],
    tail: 'open' as GunTail,
    reverb: 'open' as ReverbId,
    war: 0.35,
    ...value,
  });
}

const L = (asset: string, db: number) => Object.freeze({ asset: `layer_${asset}`, db });
const spots = (...entries: (readonly [string, number])[]) => Object.freeze(entries.map(([id, w]) => Object.freeze([`spot_${id}`, w] as const)));

export const MAP_SCENES: Readonly<Record<string, EnvironmentScene>> = Object.freeze({
  verdant: scene({ bed: 'amb_field', spots: spots(['songbird', 3], ['crow', 2], ['lark', 2], ['cowbell', 1], ['dog', 1], ['wind_gust', 1]) }),
  desert: scene({ bed: 'amb_desert', spots: spots(['hawk', 2], ['wind_gust', 3], ['dust_devil', 1], ['rockfall', 1]), reverb: 'desert', spotEveryS: [7, 15] }),
  winter: scene({ bed: 'amb_alpine', spots: spots(['crow', 2], ['snow_slide', 2], ['ice_crack', 2], ['wind_gust', 2]), reverb: 'snow' }),
  urban: scene({ bed: 'amb_urban', spots: spots(['siren_far', 1], ['dog', 1], ['glass_fall', 2], ['debris_settle', 3], ['fire_crackle', 2], ['radio_far', 1], ['crow', 1]), tail: 'urban', reverb: 'urban', war: 0.45 }),
  coastal: scene({ bed: 'amb_coastal', layer: L('surf', -8), spots: spots(['gulls', 3], ['foghorn', 1], ['buoy_bell', 1], ['wave_crash', 2]) }),
  autumn: scene({ bed: 'amb_forest', layer: L('river', -14), spots: spots(['crow', 3], ['woodpecker', 2], ['songbird', 1], ['wind_gust', 2]), tail: 'forest', reverb: 'forest' }),
  steppe: scene({ bed: 'amb_steppe', spots: spots(['lark', 3], ['hawk', 2], ['wind_gust', 3]) }),
  railyard: scene({ bed: 'amb_railyard', spots: spots(['train_horn', 2], ['wagon_clank', 3], ['steam_hiss', 2], ['metal_groan', 1], ['crow', 1]), tail: 'urban', reverb: 'urban', war: 0.4 }),
  frontier: scene({ bed: 'amb_field', spots: spots(['hawk', 2], ['dog', 1], ['windmill', 1], ['wind_gust', 2], ['songbird', 1]) }),
  fjord: scene({ bed: 'amb_coastal', layer: L('waterfall', -12), spots: spots(['gulls', 3], ['eagle', 1], ['foghorn', 1], ['wave_crash', 1]), tail: 'mountain', reverb: 'mountain' }),
  delta: scene({ bed: 'amb_wetland', layer: L('river', -14), spots: spots(['frog', 3], ['heron', 2], ['cicadas', 2], ['tropical_bird', 1]), tail: 'forest', reverb: 'forest' }),
  badlands: scene({ bed: 'amb_canyon', spots: spots(['hawk', 2], ['eagle', 1], ['rockfall', 2], ['wind_gust', 2]), tail: 'mountain', reverb: 'canyon' }),
  monsoon: scene({ bed: 'amb_jungle', spots: spots(['tropical_bird', 3], ['cicadas', 2], ['frog', 2]), tail: 'forest', reverb: 'forest', spotEveryS: [4, 9] }),
  alpine: scene({ bed: 'amb_alpine', spots: spots(['eagle', 1], ['rockfall', 2], ['ice_crack', 1], ['snow_slide', 1], ['wind_gust', 3]), tail: 'mountain', reverb: 'mountain' }),
  caldera: scene({ bed: 'amb_volcanic', spots: spots(['vent_hiss', 3], ['geo_rumble', 2], ['rockfall', 2]), tail: 'mountain', reverb: 'canyon' }),
  foundry: scene({ bed: 'amb_foundry', layer: L('machinery', -12), spots: spots(['forge_hammer', 3], ['steam_hiss', 2], ['crane_chain', 2], ['metal_groan', 1]), tail: 'urban', reverb: 'urban', war: 0.4 }),
  ruinspires: scene({ bed: 'amb_industrial', spots: spots(['debris_settle', 3], ['metal_groan', 2], ['wind_gust', 2], ['crow', 1], ['glass_fall', 1]), tail: 'urban', reverb: 'urban', war: 0.45 }),
  blackglass: scene({ bed: 'amb_urban', spots: spots(['car_alarm', 1], ['glass_fall', 3], ['siren_far', 1], ['debris_settle', 2], ['fire_crackle', 1], ['radio_far', 1]), tail: 'urban', reverb: 'urban', war: 0.45 }),
  titan_gorge: scene({ bed: 'amb_canyon', layer: L('river', -11), spots: spots(['eagle', 2], ['rockfall', 2], ['wind_gust', 2]), tail: 'mountain', reverb: 'canyon' }),
  skybridge: scene({ bed: 'amb_highwind', spots: spots(['cable_hum', 3], ['wind_gust', 3], ['eagle', 1]), tail: 'mountain', reverb: 'canyon' }),
  polders: scene({ bed: 'amb_wetland', spots: spots(['windmill', 2], ['geese', 2], ['frog', 2], ['cowbell', 1], ['gulls', 1]) }),
  copper_mesa: scene({ bed: 'amb_mine', spots: spots(['conveyor', 2], ['rockfall', 2], ['metal_groan', 1], ['hawk', 1], ['steam_hiss', 1]), tail: 'mountain', reverb: 'canyon' }),
  airfield: scene({ bed: 'amb_airfield', spots: spots(['jet_taxi', 2], ['flag_flap', 2], ['radio_far', 2], ['lark', 1], ['wind_gust', 1]) }),
  oasis: scene({ bed: 'amb_oasis', spots: spots(['hawk', 1], ['dust_devil', 1], ['wind_gust', 2], ['songbird', 1]), reverb: 'desert', spotEveryS: [7, 14] }),
  whiteout: scene({ bed: 'amb_polar', spots: spots(['wind_gust', 3], ['ice_crack', 2], ['metal_groan', 1], ['radio_far', 1]), reverb: 'snow' }),
  orchard: scene({ bed: 'amb_orchard', spots: spots(['bees', 2], ['songbird', 3], ['woodpecker', 1], ['crow', 1], ['dog', 1]), tail: 'forest', reverb: 'forest' }),
  longleaf: scene({ bed: 'amb_pine', spots: spots(['woodpecker', 3], ['crow', 2], ['songbird', 1]), tail: 'forest', reverb: 'forest' }),
  mangrove: scene({ bed: 'amb_mangrove', spots: spots(['frog', 3], ['tropical_bird', 3], ['heron', 1], ['cicadas', 1]), tail: 'forest', reverb: 'forest', spotEveryS: [4, 9] }),
  saltwind: scene({ bed: 'amb_coastal', layer: L('surf', -9), spots: spots(['gulls', 3], ['wave_crash', 2], ['wind_gust', 2], ['buoy_bell', 1]) }),
  reservoir: scene({ bed: 'amb_forest', layer: L('spillway', -13), spots: spots(['songbird', 2], ['eagle', 1], ['woodpecker', 1]), tail: 'mountain', reverb: 'mountain' }),
  mars: scene({ bed: 'amb_mars', spots: spots(['dust_devil', 2], ['wind_gust', 2], ['geo_rumble', 1]), reverb: 'mars', war: 0, spotEveryS: [9, 18] }),
  moon: scene({ bed: 'amb_moon', spots: Object.freeze([]), tail: 'none', reverb: 'none', war: 0 }),
  cliffbridge: scene({ bed: 'amb_highwind', spots: spots(['cable_hum', 2], ['wind_gust', 3], ['eagle', 1], ['gulls', 1]), tail: 'mountain', reverb: 'canyon' }),
});

export const GARAGE_SCENE: EnvironmentScene = scene({
  bed: 'amb_garage',
  spots: Object.freeze([Object.freeze(['garage_clank', 3] as const), Object.freeze(['spot_radio_far', 1] as const)]),
  spotEveryS: [6, 13], tail: 'none', reverb: 'hangar', war: 0,
});

export function sceneForMap(mapId: string | null | undefined): EnvironmentScene {
  return (mapId && MAP_SCENES[mapId]) || MAP_SCENES.verdant;
}
