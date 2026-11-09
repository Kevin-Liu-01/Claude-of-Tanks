/**
 * Environment scenes: what each battlefield sounds like when nobody is
 * shooting. A stereo bed, an optional water/machinery layer, positional spot
 * sounds scattered around the listener, the outdoor tail every gunshot rings
 * into, the reverb family, and how much of the distant war bleeds in.
 *
 * Pure data keyed by map id; the ambience director plays it.
 */

import type { ReverbId } from './mixPolicy.ts';
import type { MapId } from '../world/maps/mapIds.ts';

type GunTail = 'open' | 'forest' | 'urban' | 'mountain' | 'none';

/** How a map's towers ring: a Western bell swung to a slow toll, or an Orthodox tower's struck bells. */
type BellTradition = 'western' | 'orthodox';

export interface EnvironmentScene {
  readonly bed: string;
  readonly bedDb: number;
  readonly layer: { readonly asset: string; readonly db: number } | null;
  /** [spot asset id, relative weight]. */
  readonly spots: readonly (readonly [string, number])[];
  /**
   * The night's own spots (world-sfx-269, 2026-11-03): heard after dark in place of the day's (SPOT_HOURS), where the
   * place has night life. A night battle no longer hears songbirds, larks, hawks and roosters.
   */
  readonly night: readonly (readonly [string, number])[];
  /** Seconds between spot sounds (uniform in range). */
  readonly spotEveryS: readonly [number, number];
  readonly tail: GunTail;
  readonly reverb: ReverbId;
  /** Level of the distant-battle bed under the scene (0 = none). */
  readonly war: number;
  /** Indoors: spot sounds come from a few metres away instead of across the field. */
  readonly indoor: boolean;
  /**
   * The bells of the map's church, belfry or campanile, tolled rarely and only in a quiet stretch (BELL_POLICY), or
   * null where no tower rings (the Bengal kit's 'chapel' is a mosque). Six maps ring (2026-10-06): Verdant's Orthodox
   * village church, Frontier's and Steinburg's churches, Glacier Pass's hospice and chapel, the Podhale's wooden
   * churches and belfry, Saltwind's campanile.
   */
  readonly bells: BellTradition | null;
  /** [aircraft sound, weight] for the front's flyovers: the period's own engines (FLYOVER_BY_AIRCRAFT names a type). */
  readonly flyovers: readonly (readonly [string, number])[];
}

type SceneSeed = Partial<EnvironmentScene> & Pick<EnvironmentScene, 'bed'>;
const NO_NIGHT: readonly (readonly [string, number])[] = Object.freeze([]);

const fly = (...entries: (readonly [string, number])[]) => Object.freeze(entries.map((entry) => Object.freeze([...entry] as const)));
/** The front's aircraft by era (the map-vehicles lane's types, src/world/flyoverAircraft.ts MAP_FLYOVERS). */
const JETS = fly(['jet_flyover', 1]);
const PISTON = fly(['flyover_piston', 1]);
const BOMBERS = fly(['flyover_bomber', 1]);
const PISTON_AND_BOMBERS = fly(['flyover_piston', 1], ['flyover_bomber', 1]);

// A battlefield's spots are mostly wind, crows, hawks, gulls, rubble and
// machinery; songbirds, bees and a distant siren can be among them.
const SPOT_NAMES = Object.freeze([
  'bees', 'boat_creak', 'branch_fall', 'cable_hum', 'camel', 'cattle', 'cicadas', 'conveyor', 'crow', 'debris_settle', 'dog',
  'dust_devil', 'eagle', 'far_brewup', 'far_collapse', 'far_engine', 'far_mg_duel', 'far_mortar', 'far_tank_column',
  'fire_crackle', 'flag_flap', 'foghorn', 'forge_hammer', 'frog', 'geese', 'geo_rumble', 'goats', 'gulls', 'hawk', 'heron',
  'hornbill', 'horse', 'ice_crack', 'jet_taxi', 'lark', 'metal_groan', 'monkeys', 'oystercatcher', 'radio_far', 'raven',
  'rockfall', 'rooster', 'sheep', 'shutter_bang', 'siren_far', 'snow_slide', 'songbird', 'steam_hiss', 'tin_roof',
  'train_horn', 'tropical_bird', 'vent_hiss', 'wagon_clank', 'wave_crash', 'wind_gust', 'wind_howl', 'windmill', 'woodpecker',
  'crane_chain',
  // the night's (world-sfx-269)
  'owl', 'crickets', 'nightjar', 'night_insects', 'fox',
] as const);
type SpotName = typeof SPOT_NAMES[number];
type SpotHours = 'day' | 'night' | 'any';

/**
 * When each spot is heard (world-sfx-269, 2026-11-03): the day's birds, insects and farmyard by day, the night's owls,
 * crickets, nightjars and foxes after dark, the wind, water, livestock, machinery and the far war at any hour. 10 % of
 * battles fall at night (engine/battleWeatherPolicy.ts TIME_WEIGHTS) and the scenes never knew it. Exhaustive over the
 * spot names, so a new spot names its hours.
 */
export const SPOT_HOURS: Readonly<Record<SpotName, SpotHours>> = Object.freeze({
  songbird: 'day', lark: 'day', hawk: 'day', eagle: 'day', woodpecker: 'day', gulls: 'day', oystercatcher: 'day',
  tropical_bird: 'day', cicadas: 'day', bees: 'day', rooster: 'day', crow: 'day', raven: 'day', hornbill: 'day',
  monkeys: 'day', goats: 'day',
  owl: 'night', crickets: 'night', nightjar: 'night', night_insects: 'night', fox: 'night',
  geese: 'any', heron: 'any', frog: 'any', dog: 'any', cattle: 'any', sheep: 'any', horse: 'any', camel: 'any',
  boat_creak: 'any', branch_fall: 'any', cable_hum: 'any', conveyor: 'any', debris_settle: 'any', dust_devil: 'any',
  far_brewup: 'any', far_collapse: 'any', far_engine: 'any', far_mg_duel: 'any', far_mortar: 'any', far_tank_column: 'any',
  fire_crackle: 'any', flag_flap: 'any', foghorn: 'any', forge_hammer: 'any', geo_rumble: 'any', ice_crack: 'any',
  jet_taxi: 'any', metal_groan: 'any', radio_far: 'any', rockfall: 'any', shutter_bang: 'any', siren_far: 'any',
  snow_slide: 'any', steam_hiss: 'any', tin_roof: 'any', train_horn: 'any', vent_hiss: 'any', wagon_clank: 'any',
  wave_crash: 'any', wind_gust: 'any', wind_howl: 'any', windmill: 'any', crane_chain: 'any',
});

/** Whether a spot asset id is heard at this time of day ('night', or the day's: 'day' and 'sunset'). */
export function spotHeardAt(assetId: string, night: boolean): boolean {
  const name = assetId.replace(/^spot_/, '');
  const hours = Object.hasOwn(SPOT_HOURS, name) ? SPOT_HOURS[name as SpotName] : 'any';
  return hours === 'any' || (hours === 'night') === night;
}

const spots = (...entries: (readonly [SpotName, number])[]) => Object.freeze(entries.map(([id, w]) => Object.freeze([`spot_${id}`, w] as const)));

/** The night's life by habitat (each scene names its own below): open fields, woods, wetland, jungle, dry country. */
const NIGHT_FIELD = spots(['crickets', 3], ['owl', 1], ['nightjar', 1], ['fox', 1]);
const NIGHT_WOODS = spots(['owl', 2], ['nightjar', 1], ['fox', 1], ['crickets', 1]);
const NIGHT_WET = spots(['night_insects', 2], ['crickets', 1]);
const NIGHT_JUNGLE = spots(['night_insects', 3]);
const NIGHT_DRY = spots(['fox', 1], ['crickets', 1]);
const NIGHT_COLD = spots(['owl', 1], ['fox', 1]);

/**
 * The far war (AU.06, 2026-10-13; the owner: "so its not quiet all the time"): every inhabited battlefield hears the
 * battle beyond its edge between its own fights — a tank column, a brew-up, a machine-gun duel, mortars, a town coming
 * down, an engine behind a hill, each recorded a kilometre or more away. They join a scene whose distant-war bed plays
 * (war > 0), at WAR_SHARE of the place's own spot weight, so about a third of the spots are the war's.
 */
const WAR_SPOTS = spots(['far_tank_column', 1], ['far_brewup', 1], ['far_mg_duel', 1], ['far_mortar', 1], ['far_collapse', 1], ['far_engine', 1]);
const WAR_SHARE = 0.5;

function withWar(own: readonly (readonly [string, number])[], war: number): readonly (readonly [string, number])[] {
  const weight = own.reduce((sum, [, w]) => sum + w, 0);
  if (!(war > 0) || !(weight > 0)) return own;
  const each = +(weight * WAR_SHARE / WAR_SPOTS.length).toFixed(3);
  return Object.freeze([...own, ...WAR_SPOTS.map(([id]) => Object.freeze([id, each] as const))]);
}

function scene(value: SceneSeed): EnvironmentScene {
  const war = value.war ?? 0.35;
  return Object.freeze({
    bedDb: 0,
    layer: null,
    spotEveryS: Object.freeze([9, 20]) as readonly [number, number],
    tail: 'open' as GunTail,
    reverb: 'open' as ReverbId,
    indoor: false,
    bells: null,
    flyovers: JETS,
    night: NO_NIGHT,
    ...value,
    war,
    spots: withWar(value.spots ?? Object.freeze([]), war),
  });
}

const L = (asset: string, db: number) => Object.freeze({ asset: `layer_${asset}`, db });

/** Every battlefield's scene: exhaustive over the map ids, so a new map fails typecheck until it has one. */
export const MAP_SCENES: Readonly<Record<MapId, EnvironmentScene>> = Object.freeze({
  // Prokhorovka, 1943: the Il-2s and Ju 87s over the fields, the village church's Orthodox bells
  verdant: scene({ bed: 'amb_field', night: NIGHT_FIELD, spots: spots(['crow', 5], ['hawk', 2], ['wind_gust', 2], ['dog', 1], ['songbird', 3], ['lark', 2], ['cattle', 2], ['horse', 1], ['rooster', 1]), bells: 'orthodox', flyovers: PISTON }),
  desert: scene({ bed: 'amb_desert', night: NIGHT_DRY, spots: spots(['hawk', 2], ['wind_gust', 3], ['dust_devil', 1], ['rockfall', 1], ['camel', 1], ['goats', 1]), reverb: 'desert', spotEveryS: [10, 20] }),
  // the Podhale, January 1945: the wooden churches' and the belfry's bells under the Il-2s and Bf 109s
  winter: scene({ bed: 'amb_alpine', night: NIGHT_COLD, spots: spots(['crow', 2], ['snow_slide', 2], ['ice_crack', 2], ['wind_gust', 2], ['wind_howl', 2], ['raven', 1]), reverb: 'snow', bells: 'western', flyovers: PISTON }),
  urban: scene({ bed: 'amb_urban', night: NIGHT_COLD, spots: spots(['siren_far', 1], ['dog', 1], ['debris_settle', 5], ['fire_crackle', 2], ['radio_far', 1], ['crow', 1], ['shutter_bang', 2], ['tin_roof', 1]), tail: 'urban', reverb: 'urban', war: 0.45, bells: 'western' }),
  coastal: scene({ bed: 'amb_coastal', night: NIGHT_DRY, layer: L('surf', -8), spots: spots(['gulls', 3], ['foghorn', 2], ['wave_crash', 2], ['shutter_bang', 1]) }),
  autumn: scene({ bed: 'amb_forest', night: NIGHT_WOODS, layer: L('river', -14), spots: spots(['crow', 4], ['woodpecker', 2], ['wind_gust', 2], ['songbird', 1], ['branch_fall', 2], ['raven', 1]), tail: 'forest', reverb: 'forest', flyovers: PISTON_AND_BOMBERS }),
  steppe: scene({ bed: 'amb_steppe', night: NIGHT_FIELD, spots: spots(['hawk', 5], ['wind_gust', 3], ['lark', 3], ['horse', 1], ['sheep', 1]) }),
  railyard: scene({ bed: 'amb_railyard', spots: spots(['train_horn', 2], ['wagon_clank', 3], ['steam_hiss', 2], ['metal_groan', 1], ['crow', 1], ['tin_roof', 2]), tail: 'urban', reverb: 'urban', war: 0.4 }),
  frontier: scene({ bed: 'amb_field', night: NIGHT_FIELD, spots: spots(['hawk', 2], ['dog', 1], ['windmill', 1], ['wind_gust', 2], ['crow', 1], ['songbird', 1], ['cattle', 1], ['sheep', 1], ['rooster', 1]), bells: 'western' }),
  // Bjerkvik at the head of the Herjangsfjord, May 1940: calm water at the quays (not amb_coastal's breaking surf),
  // the oystercatchers on the shore, the fishing boats at their moorings, the He 111s and Ju 87s overhead
  fjord: scene({ bed: 'amb_fjord', night: NIGHT_COLD, layer: L('waterfall', -12), spots: spots(['gulls', 3], ['oystercatcher', 2], ['boat_creak', 2], ['eagle', 1], ['foghorn', 1], ['shutter_bang', 1]), tail: 'mountain', reverb: 'mountain', flyovers: PISTON_AND_BOMBERS }),
  // the Jamuna's chars: the country boats tied at the landings
  delta: scene({ bed: 'amb_wetland', night: NIGHT_WET, layer: L('river', -14), spots: spots(['frog', 3], ['heron', 3], ['cicadas', 2], ['tropical_bird', 1], ['boat_creak', 1], ['cattle', 1]), tail: 'forest', reverb: 'forest' }),
  // Wadi Rum: a dry wind in the sand valleys (amb_canyon is a steady distant river), the jebels' echo
  badlands: scene({ bed: 'amb_desert', night: NIGHT_DRY, spots: spots(['hawk', 2], ['eagle', 1], ['rockfall', 2], ['wind_gust', 2], ['goats', 1]), tail: 'mountain', reverb: 'canyon' }),
  monsoon: scene({ bed: 'amb_jungle', night: NIGHT_JUNGLE, spots: spots(['heron', 3], ['cicadas', 2], ['frog', 2], ['tropical_bird', 3], ['monkeys', 2], ['hornbill', 1]), tail: 'forest', reverb: 'forest', spotEveryS: [8, 16], flyovers: PISTON }),
  // Mont-Cenis, April 1945: the hospice's and the Grande Croix's bells, the Thunderbolts and Typhoons
  alpine: scene({ bed: 'amb_alpine', night: NIGHT_COLD, spots: spots(['eagle', 1], ['rockfall', 2], ['ice_crack', 1], ['snow_slide', 1], ['wind_gust', 3], ['wind_howl', 2], ['raven', 1]), tail: 'mountain', reverb: 'mountain', bells: 'western', flyovers: PISTON }),
  caldera: scene({ bed: 'amb_volcanic', spots: spots(['vent_hiss', 3], ['geo_rumble', 2], ['rockfall', 2]), tail: 'mountain', reverb: 'canyon' }),
  foundry: scene({ bed: 'amb_foundry', layer: L('machinery', -12), spots: spots(['forge_hammer', 3], ['steam_hiss', 2], ['crane_chain', 2], ['metal_groan', 1], ['tin_roof', 1]), tail: 'urban', reverb: 'urban', war: 0.4, flyovers: PISTON_AND_BOMBERS }),
  ruinspires: scene({ bed: 'amb_industrial', night: NIGHT_COLD, spots: spots(['debris_settle', 4], ['metal_groan', 2], ['wind_gust', 2], ['crow', 1], ['shutter_bang', 2], ['tin_roof', 2]), tail: 'urban', reverb: 'urban', war: 0.45 }),
  // Suzhou Creek, 1937: the creek's water at the embankments, sampans at their moorings, steamers' horns on the
  // Huangpu, the G3Ms overhead
  blackglass: scene({ bed: 'amb_urban', layer: L('creek', -15), spots: spots(['metal_groan', 1], ['debris_settle', 5], ['siren_far', 1], ['fire_crackle', 1], ['radio_far', 1], ['boat_creak', 2], ['foghorn', 1], ['shutter_bang', 1], ['tin_roof', 1]), tail: 'urban', reverb: 'urban', war: 0.45, flyovers: BOMBERS }),
  // Monument Valley: desert wind over the valley floor and its dry washes; no river runs there
  titan_gorge: scene({ bed: 'amb_desert', night: NIGHT_DRY, spots: spots(['eagle', 2], ['rockfall', 2], ['wind_gust', 2], ['crow', 1], ['raven', 1]), tail: 'mountain', reverb: 'canyon' }),
  skybridge: scene({ bed: 'amb_highwind', spots: spots(['cable_hum', 3], ['wind_gust', 3], ['eagle', 1], ['raven', 1]), tail: 'mountain', reverb: 'canyon' }),
  polders: scene({ bed: 'amb_wetland', night: NIGHT_WET, spots: spots(['windmill', 3], ['geese', 2], ['frog', 2], ['gulls', 1], ['cattle', 2], ['sheep', 1]), flyovers: PISTON_AND_BOMBERS }),
  copper_mesa: scene({ bed: 'amb_mine', spots: spots(['conveyor', 2], ['rockfall', 2], ['metal_groan', 1], ['hawk', 1], ['steam_hiss', 1], ['tin_roof', 1]), tail: 'mountain', reverb: 'canyon' }),
  airfield: scene({ bed: 'amb_airfield', night: NIGHT_FIELD, spots: spots(['jet_taxi', 2], ['flag_flap', 2], ['radio_far', 2], ['hawk', 1], ['wind_gust', 1], ['lark', 1], ['tin_roof', 1]) }),
  oasis: scene({ bed: 'amb_oasis', night: NIGHT_DRY, spots: spots(['hawk', 1], ['dust_devil', 1], ['wind_gust', 2], ['crow', 1], ['songbird', 1], ['camel', 2], ['goats', 1]), reverb: 'desert', spotEveryS: [10, 20] }),
  // DYE-M at Cape Dyer: the plateau's wind, and the station's generators droning behind their steel walls
  whiteout: scene({ bed: 'amb_polar', layer: L('station', -15), spots: spots(['wind_gust', 3], ['ice_crack', 2], ['metal_groan', 1], ['radio_far', 1], ['wind_howl', 3]), reverb: 'snow' }),
  orchard: scene({ bed: 'amb_orchard', night: NIGHT_FIELD, spots: spots(['bees', 2], ['crow', 4], ['woodpecker', 1], ['dog', 1], ['songbird', 3], ['cattle', 1], ['branch_fall', 1], ['rooster', 1]), tail: 'forest', reverb: 'forest' }),
  longleaf: scene({ bed: 'amb_pine', night: NIGHT_WOODS, spots: spots(['woodpecker', 3], ['crow', 3], ['songbird', 1], ['branch_fall', 2], ['raven', 1]), tail: 'forest', reverb: 'forest', flyovers: PISTON }),
  mangrove: scene({ bed: 'amb_mangrove', night: NIGHT_JUNGLE, spots: spots(['frog', 3], ['heron', 4], ['cicadas', 1], ['tropical_bird', 3], ['monkeys', 1], ['hornbill', 1]), tail: 'forest', reverb: 'forest', spotEveryS: [8, 16] }),
  // a sheltered Dalmatian bay: small waves on the pebbles (not the open coast's surf), cicadas in the pines, the
  // fishing boats at the quay, and the campanile's great bell
  saltwind: scene({ bed: 'amb_adriatic', night: NIGHT_FIELD, spots: spots(['gulls', 3], ['cicadas', 3], ['boat_creak', 2], ['wind_gust', 1], ['goats', 1], ['shutter_bang', 1]), bells: 'western' }),
  reservoir: scene({ bed: 'amb_forest', night: NIGHT_WOODS, layer: L('spillway', -13), spots: spots(['crow', 2], ['eagle', 1], ['woodpecker', 1], ['songbird', 2], ['branch_fall', 1], ['raven', 1]), tail: 'mountain', reverb: 'mountain', flyovers: PISTON }),
  mars: scene({ bed: 'amb_mars', spots: spots(['dust_devil', 2], ['wind_gust', 2], ['geo_rumble', 1]), reverb: 'mars', war: 0, spotEveryS: [9, 18] }),
  moon: scene({ bed: 'amb_moon', spots: Object.freeze([]), tail: 'none', reverb: 'none', war: 0 }),
  cliffbridge: scene({ bed: 'amb_highwind', spots: spots(['cable_hum', 2], ['wind_gust', 3], ['eagle', 1], ['gulls', 1], ['raven', 1], ['wind_howl', 1]), tail: 'mountain', reverb: 'canyon' }),
});

/**
 * The towers a scene's bells ring from: a planned building's plan id (props.ts features.buildings `kind`) or a set
 * piece's kind (the landmarks lane's `landmark`). A larger bell is lower and rings longer (the playback rate pitches
 * the recording); the bells hang near the top of the tower.
 */
export const BELL_TOWERS: Readonly<Record<string, { readonly heightM: number; readonly rate: number; readonly gainDb: number }>> = Object.freeze({
  // the campanile's great bell (Saltwind's 34 m tower): the largest and lowest
  campanile: Object.freeze({ heightM: 28, rate: 0.78, gainDb: 1 }),
  church: Object.freeze({ heightM: 18, rate: 0.93, gainDb: 0 }),
  onionchurch: Object.freeze({ heightM: 16, rate: 0.96, gainDb: 0 }),
  chapel: Object.freeze({ heightM: 9, rate: 1.06, gainDb: -2 }),
  // a village's free-standing wooden belfry (the Podhale's dzwonnica): small bells
  belfry: Object.freeze({ heightM: 8, rate: 1.12, gainDb: -2 }),
});

/** The asset each tradition tolls. */
export const BELL_ASSET: Readonly<Record<BellTradition, string>> = Object.freeze({ western: 'bell_toll', orthodox: 'bell_orthodox' });

/**
 * Bells are rare and keep out of the fighting: a toll every few minutes, from the nearest tower within earshot, after
 * the rollout, and only once the HDR window (the mixer's loudest recent event) has stayed under `loudDb` for `quietS`
 * — so a cannon within a kilometre or two, an explosion or our own gun holds the bells. A Western toll is one to three strokes of its bell;
 * an Orthodox tower rings once (its recording carries the great bell and, in one take, the small bells' rhythm).
 */
export const BELL_POLICY = Object.freeze({
  firstS: Object.freeze([25, 75]) as readonly [number, number],
  everyS: Object.freeze([110, 240]) as readonly [number, number],
  loudDb: 118,
  quietS: 25,
  maxM: 1600,
  strokes: Object.freeze([1, 3]) as readonly [number, number],
  strokeGapS: Object.freeze([3.4, 4.2]) as readonly [number, number],
  /** A due toll with no tower in reach (or no world yet) looks again this much later. */
  retryS: 30,
});

/**
 * The flyover sound of each aircraft type the front flies (src/world/flyoverAircraft.ts), for an event that names
 * its `aircraft`; an event that does not plays the scene's list.
 */
export const FLYOVER_BY_AIRCRAFT: Readonly<Record<string, string>> = Object.freeze({
  il2: 'flyover_piston', ju87: 'flyover_piston', bf109: 'flyover_piston', p47: 'flyover_piston', typhoon: 'flyover_piston',
  hurricane: 'flyover_piston', p40: 'flyover_piston',
  b26: 'flyover_bomber', he111: 'flyover_bomber', g3m: 'flyover_bomber',
  a10: 'jet_flyover', su25: 'jet_flyover', f16: 'jet_flyover', mig21: 'jet_flyover', f104: 'jet_flyover', f4: 'jet_flyover',
  mirage3: 'jet_flyover',
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
  return (mapId && Object.hasOwn(MAP_SCENES, mapId) ? MAP_SCENES[mapId as MapId] : null) || MAP_SCENES.verdant;
}
