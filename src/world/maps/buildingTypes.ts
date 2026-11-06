// src/world/maps/buildingTypes.ts — every building type a battlefield may place, with the years it stood and the cultures
// it belongs to (buildings-271, Main 11-06: "make the wrong type for the place impossible rather than fixed one map at a
// time"). The 3D census found an Orthodox onion church in Catholic Savoie and Podhale, caravanserais and souks on the
// Navajo Nation, and future towers over 1937 Shanghai and 1960s Page; this table and the building-style table's
// `setting` make those placements fail when the map config loads (maps/index.ts) and in buildingTypes.selftest.
//
// A generic type stands on a map when its years overlap the map's and, where it names cultures, one of them is the map's
// (a slot the map's own kit builds is that kit's local building, made for its place, and passes). A type
// with no cultures belongs anywhere its years allow: most do (a barn, a depot, a tavern); the tags mark the types that
// are of one faith or one region (a minaret, an onion dome, a souk, a keep, a sauna).
import type { MapId } from './mapIds.ts';

/** The cultures a type can belong to (only those some type names; a map lists the ones its place has). */
export type Culture = 'orthodox' | 'islamic' | 'arab' | 'central-europe' | 'nordic';

/** The years a type stood or stands, and the cultures it belongs to (absent: anywhere its years allow). */
export interface BuildingTypeRow {
  readonly years: readonly [number, number];
  readonly cultures?: readonly Culture[];
}

/** A battlefield's setting: the years it shows and the cultures of its place. */
export interface MapSetting {
  readonly years: readonly [number, number];
  readonly cultures: readonly Culture[];
}

const ANY: readonly [number, number] = [1000, 2200];
const MODERN = (from: number): readonly [number, number] => [from, 2200];
/** The types of a station off the Earth (the Moon's 2046, Mars' 2100). */
const SPACE: readonly [number, number] = [2030, 2200];

export const BUILDING_TYPES = {
  // houses and farms
  adobe: { years: ANY }, alpine: { years: ANY }, barn: { years: ANY }, cottage: { years: ANY }, farmhouse: { years: ANY },
  granary: { years: ANY }, logcabin: { years: ANY }, longhouse: { years: ANY }, rangerlodge: { years: ANY },
  rowhouse: { years: ANY }, stilthouse: { years: ANY }, terrace: { years: MODERN(1800) }, compound: { years: ANY },
  leanto: { years: ANY }, shed: { years: ANY }, woodshed: { years: ANY }, yardshed: { years: ANY }, mill: { years: ANY },
  fieldhut: { years: ANY }, huntingblind: { years: ANY }, alpinerefuge: { years: MODERN(1850) },
  fishershack: { years: ANY }, boatshed: { years: ANY }, fishery: { years: ANY }, netyard: { years: ANY },
  // town
  tavern: { years: ANY }, cornershop: { years: ANY }, market: { years: ANY }, marketRow: { years: ANY },
  schoolhouse: { years: MODERN(1800) }, civichall: { years: ANY }, church: { years: ANY }, chapel: { years: ANY },
  tower: { years: ANY }, lighthouse: { years: ANY }, ruin: { years: ANY }, bathhouse: { years: ANY },
  firestation: { years: MODERN(1850) }, corneroffice: { years: MODERN(1880) }, watertower: { years: MODERN(1870) },
  // works and depots
  depot: { years: MODERN(1850) }, warehouse: { years: MODERN(1800) }, factory: { years: MODERN(1850) },
  foundryoffice: { years: MODERN(1850) }, stack: { years: MODERN(1850) }, gantry: { years: MODERN(1880) },
  elevator: { years: MODERN(1900) }, transformershed: { years: MODERN(1900) }, servicegarage: { years: MODERN(1910) },
  motorpool: { years: MODERN(1920) }, relaystation: { years: MODERN(1950) }, securityoffice: { years: MODERN(1900) },
  // military and field
  checkpointhut: { years: MODERN(1900) }, guardpost: { years: ANY }, commandtent: { years: MODERN(1900) },
  fieldhospital: { years: MODERN(1900) }, fieldHeadquarters: { years: MODERN(1900) },
  quonsethut: { years: MODERN(1941) }, containerRow: { years: MODERN(1956) },
  // the modern city: a tower, a deck, a mall, a mast (the futuristic towers belong to the off-world future)
  megatower: { years: MODERN(1970) }, terracetower: { years: MODERN(1970) }, broadcasttower: { years: MODERN(1955) },
  parkingdeck: { years: MODERN(1950) }, shoppingCentre: { years: MODERN(1955) },
  arcology: { years: SPACE }, needletower: { years: SPACE },
  // off-world stations
  habdome: { years: SPACE }, habmodule: { years: SPACE }, ascentlander: { years: SPACE }, landingpad: { years: SPACE },
  rovergarage: { years: SPACE }, solararray: { years: SPACE }, missioncontrol: { years: SPACE }, commsmast: { years: SPACE },
  fueltanks: { years: SPACE }, greenhouse: { years: SPACE },
  // of one faith or one region
  onionchurch: { years: ANY, cultures: ['orthodox'] },
  minaret: { years: ANY, cultures: ['islamic'] },
  caravanserai: { years: ANY, cultures: ['arab'] }, compoundSouk: { years: ANY, cultures: ['arab'] },
  deserttent: { years: ANY, cultures: ['arab'] },
  bergfried: { years: ANY, cultures: ['central-europe'] }, palas: { years: ANY, cultures: ['central-europe'] },
  saunahut: { years: ANY, cultures: ['nordic'] },
  ramada: { years: ANY },
} as const satisfies Readonly<Record<string, BuildingTypeRow>>;

/** A building type a battlefield may place. */
export type BuildingTypeId = keyof typeof BUILDING_TYPES;

/** The rows by any id (an id outside the table reads as none). */
const TYPES: Readonly<Record<string, BuildingTypeRow | undefined>> = BUILDING_TYPES;

/** Whether a type stands on a map of this setting: its years overlap the map's and its cultures, if any, meet the map's. */
export function typeFitsSetting(type: string, setting: MapSetting): boolean {
  const row = TYPES[type];
  if (!row) return false;
  if (row.years[1] < setting.years[0] || row.years[0] > setting.years[1]) return false;
  return !row.cultures || row.cultures.some((c) => setting.cultures.includes(c));
}

/** The structure types a map's props name: its plan, planned sites, town plan and rows, destructibles and beats. */
export function placedTypesOf(props: {
  readonly plan?: readonly string[];
  readonly plannedSites?: readonly { readonly structure: string }[];
  readonly townPlan?: readonly { readonly structure: string }[];
  readonly townRowPlan?: readonly unknown[];
  readonly destructibleBuildings?: readonly string[];
  readonly tacticalBeats?: readonly { readonly structure?: string }[];
  readonly orbitalSettlement?: readonly { readonly structure?: string }[];
}): string[] {
  const rows = (props.townRowPlan ?? []).map((r) => (typeof r === 'string' ? r : (r as { structure?: string }).structure));
  return [...new Set([
    ...(props.plan ?? []), ...(props.plannedSites ?? []).map((s) => s.structure), ...(props.townPlan ?? []).map((t) => t.structure),
    ...rows, ...(props.destructibleBuildings ?? []), ...(props.tacticalBeats ?? []).map((b) => b.structure),
    ...(props.orbitalSettlement ?? []).map((b) => b.structure),
  ].filter((t): t is string => typeof t === 'string'))];
}

/**
 * The types a map's props place that its setting does not allow (none, for a map that may load). A type the map's own kit
 * builds is the kit's reading of the slot, made for that place (the Navajo kit's `caravanserai` is Goulding's trading post,
 * its `minaret` the chapter's water tank; the Goral kit's `onionchurch` a Podhale kościół; the Glen Canyon kit's
 * `megatower` the dam's control building): `kitBuilds` names those, and only the generic builders are judged by the table.
 */
export function misplacedTypes(mapId: MapId, setting: MapSetting, props: Parameters<typeof placedTypesOf>[0],
  kitBuilds: (type: string) => boolean = () => false): string[] {
  return placedTypesOf(props).filter((t) => !kitBuilds(t) && !typeFitsSetting(t, setting)).map((t) => `${mapId}: ${t}`);
}
