// src/world/maps/wreckCasts.ts — every map's tank hulks: the one table (wrecks-270, 2026-11-05; the owner: "add a lot
// more tank wreckages and varieties"). A row a map, keyed by its id, so a map without one fails typecheck.
//
// A row names the place and year (the map file's Reference line), the armies that fought there, and the fleet donors
// that fit both: one id a family, never two near-duplicates of one hull, every one a public, in-service vehicle of the
// period. The Second World War fronts (the owner, 2026-11-05: "for the 10world war 2 maps, just use modern tanks") take
// today's armour of the front's nations, since the fleet holds no tank of that war but the KV-2, which Kursk keeps beside
// them, in all eight states; the Moon carries none. The props build (props.ts) seats `count` hulks, each a donor in a
// damage state (wreckStates.ts) its site shows, no two of one bake within a view.
//
// Each map file's props.tankWrecks is its row here; every reader (the builders' preload, the receipts, the tools) keeps
// reading props.tankWrecks.
import type { MapId } from './mapIds.ts';
import type { WreckState } from '../wreckStates.ts';

export interface WreckCast {
  /** The place and year the hulks belong to. */
  readonly setting: string;
  /** The vehicle era the debris dresses for (wreckDebris.ts: wartime all-steel wheels, or post-war rubber). */
  readonly era: 'ww2' | 'cold-war' | 'modern' | 'next-generation';
  /** The armies that fought there. */
  readonly nations: readonly string[];
  /** Hulks the map seats. */
  readonly count: number;
  readonly debris: true;
  /** The donors, in the order the placement reaches for them. */
  readonly ids: readonly string[];
  /** The states this ground shows (default every state). */
  readonly states?: readonly WreckState[];
}

function cast(setting: string, era: WreckCast['era'], nations: readonly string[], count: number, ids: readonly string[],
  states?: readonly WreckState[]): WreckCast {
  return Object.freeze({
    setting, era, nations: Object.freeze(nations), count, debris: true, ids: Object.freeze(ids),
    ...(states ? { states: Object.freeze(states) } : {}),
  });
}

/** The desert's states: the sand takes a hulk over the years; nothing overturns on the flat erg. */
const DESERT: readonly WreckState[] = ['burnt_out', 'turret_blown_off', 'track_thrown', 'nose_down', 'half_buried', 'stripped', 'scrap_cut'];
/** A town fought through street by street: no hulk half-buried on paving. */
const STREETS: readonly WreckState[] = ['burnt_out', 'turret_blown_off', 'track_thrown', 'nose_down', 'stripped', 'overturned', 'scrap_cut'];
/** A war still on (Hostomel, 2022): fresh kills, nothing salvaged, cut up or buried yet. */
const FRESH: readonly WreckState[] = ['burnt_out', 'turret_blown_off', 'track_thrown', 'nose_down', 'overturned'];

export const WRECK_CASTS = {
  airfield: cast('Hostomel airport, north-west of Kyiv, February-March 2022', 'modern', ['Russia', 'Ukraine'], 10,
    ['t72b3', 't80bv', 'bmp2', 't64bv_donbas', 't90a', 'bmp3', 't72b_1987'], FRESH),
  alpine: cast('the Col du Mont-Cenis (April 1945): today\'s armour of the front\'s nations, the owner\'s ruling', 'modern',
    ['France', 'Germany', 'Italy'], 9, ['leclerc_s2', 'leo2a6', 'spz_puma', 'c1_ariete', 'dardo']),
  autumn: cast('the Moselle valley of Lorraine (autumn 1944): today\'s US and German armour', 'modern', ['USA', 'Germany'], 10,
    ['m1a2_abrams_sepv3', 'm3a3_bradley', 'leo2a4', 'spz_puma', 'kf41_lynx']),
  badlands: cast('Wadi Rum, southern Jordan: the Syrian incursion of September 1970 and the Jordanian armour after it',
    'cold-war', ['Jordan', 'Syria'], 12,
    ['challenger1_mk2', 'm60a3', 'chieftain3', 'centurion5_2', 't55a', 'm48a5_patton', 't62_1975', 'm60a1'], DESERT),
  blackglass: cast('Shanghai, Suzhou Creek (autumn 1937): today\'s Chinese and Japanese armour', 'modern', ['China', 'Japan'], 10,
    ['ztz99a', 'type96b', 'aft10', 'type10', 'type90', 'type89']),
  caldera: cast('the Aso caldera, Kyushu: a JGSDF range and its hulks', 'modern', ['Japan'], 10,
    ['type10_tk_x', 'type90', 'type74', 'type89', 'hayate_ifv', 'm41_jgsdf']),
  cliffbridge: cast('Ronda, Málaga: the Spanish Army\'s Cold War armour (AMX-30E, M47E, M48A5E, M41)', 'cold-war',
    ['Spain'], 9, ['amx30b', 'm48a5_patton', 'm47_patton', 'm41a3', 'm60a3']),
  coastal: cast('the Pays de Léon, Brittany: a present-day landing', 'modern', ['France', 'Russia'], 10,
    ['leclerc_s2', 't90am', 'cv90', 'bmp3', 'leo2_improved', 'amx10p_25', 't80u']),
  copper_mesa: cast('Queenstown under Mount Lyell, Tasmania: the Australian Army\'s Centurions and Leopards left in the cuts',
    'cold-war', ['Australia'], 9, ['centurion5_1_aus', 'centurion5_2', 'leo1a5', 'leo1a2a1', 'm41a3']),
  delta: cast('the braided Jamuna, Bangladesh, December 1971', 'cold-war', ['India', 'Pakistan'], 10,
    ['type59', 't55a', 'vickers_mk1', 'm48a3_patton', 'centurion5_2', 'm41a3']),
  desert: cast('the Dahar edge, southern Tunisia: the Tunisian and Libyan armour of the 1980s', 'cold-war',
    ['Tunisia', 'Libya'], 11, ['m60a3', 'm48a5_patton', 'm41a3', 't55a', 't62_1975', 'type59'], DESERT),
  fjord: cast('the Ofotfjord and Bjerkvik, Nordland (May 1940): today\'s armour of the Narvik campaign\'s nations', 'modern',
    ['Norway', 'France', 'Poland', 'UK', 'Germany'], 10, ['leo2a7v', 'cv90', 'leclerc_s2', 'pt91a_twardy', 'challenger2', 'warrior_tes_h']),
  foundry: cast('the Völklingen ironworks on the Saar (March 1945): today\'s US and German armour', 'modern', ['USA', 'Germany'], 10,
    ['m1a2_abrams_tusk', 'm6_linebacker', 'leo2a5', 'puma_s1', 'kf41_lynx']),
  frontier: cast('the Fulda Gap\'s Hünfeld basin, the 1980s', 'cold-war', ['USA', 'West Germany', 'USSR'], 12,
    ['m60a3', 'm1a1', 'leo1a5', 'marder1a3', 't80b', 'bmp2', 'leo2a2', 'm2a2_bradley', 't64bv1', 'm48a2ga2']),
  longleaf: cast('Longleaf, Louisiana (the Louisiana Maneuvers, September 1941): today\'s US armour', 'modern', ['USA'], 8,
    ['m1a2_abrams_sepv2', 'm3a3_bradley', 'm551a1_tts']),
  mangrove: cast('Ca Mau, the Mekong Delta, the Vietnam War', 'cold-war', ['USA', 'South Vietnam', 'North Vietnam'], 10,
    ['m48a3_patton', 'm41a3', 'm551_sheridan', 'type59', 't55a']),
  mars: cast('Olympus Basin, Mars: the next generation\'s prototypes', 'next-generation', ['USA', 'Russia', 'Germany', 'Poland'],
    // (the repeat critic, 11-06: the AbramsX and the M1A3 are one hull, read as one hulk twice; the M1E3 stays)
    8, ['object148_proto', 'pl01', 'm1a3', 'kf51_evo']),
  monsoon: cast('Kohima, the Naga Hills (April-June 1944): today\'s British and Japanese armour', 'modern', ['UK', 'India', 'Japan'], 10,
    ['challenger2', 'warrior_tes_h', 'chieftain_mk10', 'type10', 'type90', 'type89']),
  moon: cast('the Taurus-Littrow valley, December 1972: no war was fought here', 'cold-war', [], 0, []),
  oasis: cast('Siwa, Egypt\'s Western Desert: the Libyan-Egyptian war of July 1977 and the Egyptian armour after it',
    'cold-war', ['Egypt', 'Libya'], 10, ['t55a', 't62_1975', 'm60a3', 'm1a1', 'type59'], DESERT),
  orchard: cast('the Chouf, Mount Lebanon, June 1982', 'cold-war', ['Israel', 'Syria'], 12,
    ['merkava1b', 'magach3', 'magach6b', 'shot_kal', 't55a', 't62_1975', 't72m1_jaguar']),
  polders: cast('the Scheldt polders (autumn 1944): today\'s Canadian, British and German armour', 'modern', ['Canada', 'UK', 'Germany'],
    10, ['leo2a4m_can', 'challenger2', 'ajax', 'warrior_tes_h', 'spz_puma', 'kf41_lynx']),
  railyard: cast('a junction on the coalfield (the Ruhr, Upper Silesia), the Cold War', 'cold-war',
    ['West Germany', 'UK', 'Poland', 'USSR'], 10, ['m48a2ga2', 'leo1a2a1', 'm47_patton', 'centurion5_2', 't55a', 'bwp1'], STREETS),
  reservoir: cast('the Roer dams in the Eifel (winter 1944-45): today\'s US and German armour', 'modern', ['USA', 'Germany'], 10,
    ['m1a1_abrams_aim', 'm6_linebacker', 'leo2a6', 'spz_wotan', 'm551a1_tts']),
  ruinspires: cast('Sarajevo under siege, 1992-96', 'cold-war', ['Yugoslav People\'s Army', 'Bosnia'], 12,
    ['t72m1_jaguar', 't55a', 'bmp2', 'bwp1', 'm47_patton'], STREETS),
  saltwind: cast('the Dalmatian coast, the Croatian War of Independence, 1991-95', 'cold-war',
    ['Croatia', 'Yugoslav People\'s Army'], 10, ['t72m1_jaguar', 't55a', 'bmp2', 'bwp1', 'm47_patton']),
  skybridge: cast('Glen Canyon above Lake Powell: a US Army range of the 1960s and 1970s', 'cold-war', ['USA'], 11,
    ['m48a5_patton', 'm60a1', 'm47_patton', 'm551_sheridan', 'm41a3', 'm60a2']),
  steppe: cast('the Sary-Arka grain steppe, Kazakhstan: a Soviet tank range of the Cold War', 'cold-war', ['USSR'], 10,
    ['t55a', 't62_1975', 't64bv1', 't80', 'bmp2']),
  titan_gorge: cast('Monument Valley on the Colorado Plateau: a US Army range of the 1950s to the 1980s', 'cold-war', ['USA'], 11,
    ['m60a1', 'm48a3_patton', 'm551_sheridan', 'm47_patton', 'm46_patton', 'm60a3']),
  urban: cast('the walled hill towns of Franconia and Saxony, the 1980s inner-German border', 'cold-war',
    ['West Germany', 'USA', 'East Germany', 'USSR'], 10,
    ['leo2a2', 't72m1_jaguar', 'marder1a3', 'bmp2', 'leo1a5', 'm1a1', 't80b', 'm2a2_bradley'], STREETS),
  verdant: cast('the Kursk salient around Prokhorovka (July 1943): the KV-2 of the battle, and the Russian and Ukrainian '
    + 'armour of the 2024 fighting in Kursk oblast', 'modern', ['USSR', 'Russia', 'Ukraine'], 10,
    ['kv2', 't90m', 't72b3m_2022', 't64bm1m', 'ua_m2a3_bradley', 'ua_cv9040c']),
  whiteout: cast('DYE-M on Cape Dyer, Baffin Island, the 1980s', 'cold-war', ['Canada', 'USA', 'Sweden', 'USSR'], 10,
    ['leo1a5', 'leo1a2a1', 'm48a5_patton', 'strv103b', 't80b', 'bmp2']),
  winter: cast('the Podhale under the Tatra (January 1945): today\'s Russian, Polish and German armour', 'modern',
    ['Russia', 'Poland', 'Germany'], 10, ['t90m', 'pt91a_twardy', 'borsuk', 'k2_black_panther', 'leo2a5', 'bmpt_terminator2']),
} satisfies Record<MapId, WreckCast>;
