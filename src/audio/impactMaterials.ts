/**
 * What a round's impact sounds like (impact-materials-269): one resolver from the material it struck, what it did
 * there, its calibre and its range to the layers that play.
 *
 * Owner, 2026-11-03: "ricochets off ground shouldnt sound like metal". Until 269 the engine chose an impact by its result
 * alone (pen, ricochet, no pen) and the calibre, so every ricochet rang like sloped steel: off a rubber skirt, a track,
 * a wreck, and off the running gear at ground level, where most grazing rounds land. Now the material picks every
 * layer, and a steel ring or a ricochet's whine plays only where steel was struck (`steel`, checked by
 * audioEngine.selftest.mjs).
 *
 * The materials are a closed set: what a hit event names (sim/plateMaterial.ts, the plate the damage law decided on),
 * the ground under a round that lands (by the terrain's surface) and what a prop is made of. Every table below is a
 * Record over its set, so a new material fails typecheck until it has its sounds.
 *
 * Pure data and functions (no Web Audio), Node-runnable.
 */

import { PLATE_MATERIALS, type PlateMaterial } from '../sim/plateMaterial.ts';

/** The ground a round lands on (the engine's surfaceAt: 'hard' is a road, a bridge deck or ice). */
export const GROUND_MATERIALS = ['earth', 'sand', 'mud', 'snow', 'paved', 'water'] as const;
export type GroundMaterial = typeof GROUND_MATERIALS[number];

/** What a world prop is made of, besides the steel of vehicles, containers and drums (`thinSteel`). */
export const PROP_MATERIALS = ['timber', 'earthwork', 'rock', 'concrete'] as const;
export type PropMaterial = typeof PROP_MATERIALS[number];

export type StruckMaterial = PlateMaterial | GroundMaterial | PropMaterial;
export const STRUCK_MATERIALS: readonly StruckMaterial[] = Object.freeze([...PLATE_MATERIALS, ...GROUND_MATERIALS, ...PROP_MATERIALS]);

/**
 * What the round did there: `through` it went on through (a penetration, a screen pierced), `stop` it struck and
 * stopped (no penetration, a screen that absorbed it, a round into the ground), `glance` it glanced off (a ricochet, a
 * graze along the ground).
 */
export type ImpactResult = 'through' | 'stop' | 'glance';

/** Machine-gun bullets, autocannon rounds, tank and artillery shells (the engine's impact bands). */
export type CalibreBand = 'bullet' | 'autocannon' | 'cannon';

export function calibreBand(caliberMm: number): CalibreBand {
  return caliberMm < 23 ? 'bullet' : caliberMm < 61 ? 'autocannon' : 'cannon';
}

/** One recording of an impact: its asset, level and playback rate re the close bank. */
export interface ImpactLayer {
  readonly id: string;
  readonly gainDb: number;
  readonly rate: number;
  readonly delayS: number;
}

/**
 * A material's distant bank and how it meets the close one: `swap` crossfades the close detail out (260-620 m) as the
 * distant crack or knock comes in (140-440 m), as armour hits always did; `add` lays the distant thump under a close
 * sound that stays (the ground: 200-560 m, cannon only).
 */
export interface DistantBank {
  readonly id: string;
  readonly mode: 'swap' | 'add';
  readonly gainDb: number;
}

interface MaterialSound {
  /** The layers per result and band, nearest first. */
  readonly layers: Readonly<Record<ImpactResult, Readonly<Record<CalibreBand, readonly ImpactLayer[]>>>>;
  /** The distant bank per result (autocannon and cannon only), or null where nothing carries. */
  readonly far: Readonly<Record<ImpactResult, DistantBank | null>> | null;
  /** Steel: the only materials whose layers may ring or whine (the struck plate rings, the deflected round whines). */
  readonly steel: boolean;
  /** Our own hull's bong when this part of it is struck without penetrating (dB re nonpen_interior), or null. */
  readonly interiorDb: number | null;
}

const L = (id: string, gainDb = 0, rate = 1, delayS = 0): ImpactLayer => Object.freeze({ id, gainDb, rate, delayS });
const NONE: readonly ImpactLayer[] = Object.freeze([]);
type Bands = Readonly<Record<CalibreBand, readonly ImpactLayer[]>>;
const bands = (bullet: readonly ImpactLayer[], autocannon: readonly ImpactLayer[], cannon: readonly ImpactLayer[]): Bands =>
  Object.freeze({ bullet: Object.freeze(bullet), autocannon: Object.freeze(autocannon), cannon: Object.freeze(cannon) });
/** One sound for every result. */
const same = (b: Bands): MaterialSound['layers'] => Object.freeze({ through: b, stop: b, glance: b });
const far = (id: string, mode: DistantBank['mode'] = 'swap', gainDb = 0): DistantBank => Object.freeze({ id, mode, gainDb });

/** The tumbling round leaving a steel face: the whine alone, under the strike that set it off. */
const WHINE = L('ricochet_whine', -4, 1, 0.03);
const WHINE_AC = L('ricochet_whine', -9, 1.25, 0.02);

/**
 * Every material's impact. The armour row is the 2026-10 sound unchanged (its close and distant banks, the autocannon's
 * lighter banks); the rest are 269's.
 */
export const MATERIAL_SOUNDS: Readonly<Record<StruckMaterial, MaterialSound>> = Object.freeze({
  // ---- a vehicle's parts (sim/plateMaterial.ts)
  armour: {
    layers: {
      through: bands([L('bullet_armor')], [L('pen_light', -5)], [L('pen_heavy')]),
      stop: bands([L('bullet_armor')], [L('nonpen_heavy', -4, 1.18)], [L('nonpen_heavy')]),
      glance: bands([L('ricochet_light')], [L('ricochet_light', -5)], [L('ricochet_heavy')]),
    },
    far: { through: far('impact_far_pen'), stop: far('impact_far_nonpen'), glance: far('impact_far_ricochet') },
    steel: true,
    interiorDb: 0,
  },
  // sheet steel: thin skirts, side screens, launcher boxes; a map vehicle's body, a container, a drum
  thinSteel: {
    layers: {
      through: bands([L('bullet_metal')], [L('ground_metal', -4, 1.15)], [L('ground_metal')]),
      stop: bands([L('bullet_metal')], [L('ground_metal', -4, 1.15)], [L('ground_metal')]),
      glance: bands([L('bullet_metal'), L('ricochet_light', -8)], [L('ground_metal', -5, 1.15), WHINE_AC], [L('ground_metal', -2), WHINE]),
    },
    far: { through: far('impact_far_nonpen', 'swap', -3), stop: far('impact_far_nonpen', 'swap', -3), glance: far('impact_far_ricochet', 'swap', -3) },
    steel: true,
    interiorDb: -6,
  },
  // rubber-fabric skirts: a flat slap and a tear, nothing rings
  rubberSkirt: {
    layers: same(bands([L('bullet_rubber')], [L('strike_rubber', -3, 1.15)], [L('strike_rubber')])),
    far: null,
    steel: false,
    interiorDb: null,
  },
  trackLinks: {
    layers: {
      through: bands([L('bullet_armor', -2)], [L('strike_track', -3, 1.15)], [L('strike_track')]),
      stop: bands([L('bullet_armor', -2)], [L('strike_track', -3, 1.15)], [L('strike_track')]),
      glance: bands([L('ricochet_light', -2)], [L('strike_track', -4, 1.15), WHINE_AC], [L('strike_track', -1), WHINE]),
    },
    far: { through: far('impact_far_nonpen', 'swap', -3), stop: far('impact_far_nonpen', 'swap', -3), glance: far('impact_far_nonpen', 'swap', -3) },
    steel: true,
    interiorDb: -10,
  },
  // the road wheels behind the links: steel discs on rubber tyres, a heavy dull blow
  roadWheel: {
    layers: {
      through: bands([L('bullet_metal', -2)], [L('strike_wheel', -3, 1.15)], [L('strike_wheel')]),
      stop: bands([L('bullet_metal', -2)], [L('strike_wheel', -3, 1.15)], [L('strike_wheel')]),
      glance: bands([L('bullet_metal', -2)], [L('strike_wheel', -4, 1.15), WHINE_AC], [L('strike_wheel', -1), WHINE]),
    },
    far: { through: far('impact_far_nonpen', 'swap', -3), stop: far('impact_far_nonpen', 'swap', -3), glance: far('impact_far_nonpen', 'swap', -3) },
    steel: true,
    interiorDb: -10,
  },
  // reactive armour: a cassette that fires plays its detonation (the hit's ERA activations); a round glancing off a
  // spent or unfired box strikes its steel case
  era: {
    layers: {
      through: bands(NONE, NONE, NONE),
      stop: bands(NONE, NONE, NONE),
      glance: bands([L('bullet_metal'), L('ricochet_light', -8)], [L('ground_metal', -5, 1.15), WHINE_AC], [L('ground_metal', -2), WHINE]),
    },
    far: { through: null, stop: null, glance: far('impact_far_ricochet', 'swap', -3) },
    steel: true,
    interiorDb: -4,
  },
  // slat and drone cages: steel bars clattering and bending
  cage: {
    layers: {
      through: bands([L('bullet_metal', -2)], [L('strike_cage', -3, 1.15)], [L('strike_cage')]),
      stop: bands([L('bullet_metal', -2)], [L('strike_cage', -3, 1.15)], [L('strike_cage')]),
      glance: bands([L('bullet_metal', -2)], [L('strike_cage', -4, 1.15), WHINE_AC], [L('strike_cage', -1), WHINE]),
    },
    far: null,
    steel: true,
    interiorDb: -14,
  },
  // a bustle rack of stowed kit: canvas, bags and the rack's mesh; nothing rings
  stowage: {
    layers: same(bands([L('bullet_stowage')], [L('strike_stowage', -3, 1.15)], [L('strike_stowage')])),
    far: null,
    steel: false,
    interiorDb: null,
  },
  // a burnt-out hull: a hollow knock in an empty, gutted shell
  wreck: {
    layers: {
      through: bands([L('bullet_armor', -1)], [L('strike_wreck', -3, 1.15)], [L('strike_wreck')]),
      stop: bands([L('bullet_armor', -1)], [L('strike_wreck', -3, 1.15)], [L('strike_wreck')]),
      glance: bands([L('ricochet_light', -2)], [L('strike_wreck', -4, 1.15), WHINE_AC], [L('strike_wreck', -1), WHINE]),
    },
    far: { through: far('impact_far_nonpen'), stop: far('impact_far_nonpen'), glance: far('impact_far_nonpen') },
    steel: true,
    interiorDb: null,
  },
  // ---- the ground (a round that lands; the glance is a graze, a round skipping off it)
  earth: {
    layers: { through: bands([L('bullet_dirt')], [L('ground_dirt')], [L('ground_dirt')]), stop: bands([L('bullet_dirt')], [L('ground_dirt')], [L('ground_dirt')]),
      glance: bands([L('bullet_dirt')], [L('graze_earth', -2, 1.12)], [L('graze_earth')]) },
    far: { through: far('impact_far_ground', 'add', -2), stop: far('impact_far_ground', 'add', -2), glance: far('impact_far_ground', 'add', -4) },
    steel: false,
    interiorDb: null,
  },
  sand: {
    layers: { through: bands([L('bullet_sand')], [L('ground_sand')], [L('ground_sand')]), stop: bands([L('bullet_sand')], [L('ground_sand')], [L('ground_sand')]),
      glance: bands([L('bullet_sand')], [L('graze_sand', -2, 1.12)], [L('graze_sand')]) },
    far: { through: far('impact_far_ground', 'add', -2), stop: far('impact_far_ground', 'add', -2), glance: far('impact_far_ground', 'add', -4) },
    steel: false,
    interiorDb: null,
  },
  mud: {
    layers: { through: bands([L('bullet_mud')], [L('ground_mud')], [L('ground_mud')]), stop: bands([L('bullet_mud')], [L('ground_mud')], [L('ground_mud')]),
      glance: bands([L('bullet_mud')], [L('graze_mud', -2, 1.12)], [L('graze_mud')]) },
    far: { through: far('impact_far_ground', 'add', -2), stop: far('impact_far_ground', 'add', -2), glance: far('impact_far_ground', 'add', -4) },
    steel: false,
    interiorDb: null,
  },
  snow: {
    layers: { through: bands([L('bullet_snow')], [L('ground_snow')], [L('ground_snow')]), stop: bands([L('bullet_snow')], [L('ground_snow')], [L('ground_snow')]),
      glance: bands([L('bullet_snow')], [L('graze_snow', -2, 1.12)], [L('graze_snow')]) },
    far: { through: far('impact_far_ground', 'add', -4), stop: far('impact_far_ground', 'add', -4), glance: far('impact_far_ground', 'add', -6) },
    steel: false,
    interiorDb: null,
  },
  // a road, a bridge deck, a frozen lake: a hard crack and grit, no ring
  paved: {
    layers: { through: bands([L('bullet_paved')], [L('ground_concrete')], [L('ground_concrete')]), stop: bands([L('bullet_paved')], [L('ground_concrete')], [L('ground_concrete')]),
      glance: bands([L('bullet_paved')], [L('graze_paved', -2, 1.12)], [L('graze_paved')]) },
    far: { through: far('impact_far_ground', 'add', -2), stop: far('impact_far_ground', 'add', -2), glance: far('impact_far_ground', 'add', -4) },
    steel: false,
    interiorDb: null,
  },
  water: {
    layers: { through: bands([L('bullet_water')], [L('water_small')], [L('water_big')]), stop: bands([L('bullet_water')], [L('water_small')], [L('water_big')]),
      glance: bands([L('bullet_water')], [L('graze_water', -3, 1.15)], [L('graze_water')]) },
    far: null,
    steel: false,
    interiorDb: null,
  },
  // ---- what a prop is made of (propMaterial)
  timber: {
    layers: same(bands([L('bullet_wood')], [L('ground_wood', -3, 1.12)], [L('ground_wood')])),
    far: null,
    steel: false,
    interiorDb: null,
  },
  earthwork: {
    layers: same(bands([L('bullet_dirt')], [L('ground_dirt', -2, 1.08)], [L('ground_dirt')])),
    far: null,
    steel: false,
    interiorDb: null,
  },
  rock: {
    layers: same(bands([L('bullet_masonry')], [L('ground_rock', -3, 1.12)], [L('ground_rock')])),
    far: null,
    steel: false,
    interiorDb: null,
  },
  concrete: {
    layers: same(bands([L('bullet_masonry')], [L('ground_concrete', -3, 1.12)], [L('ground_concrete')])),
    far: null,
    steel: false,
    interiorDb: null,
  },
});

/** The close layers of an impact. */
export function impactLayers(material: StruckMaterial, result: ImpactResult, band: CalibreBand): readonly ImpactLayer[] {
  return MATERIAL_SOUNDS[material].layers[result][band];
}

/** Its distant bank (bullets carry none). */
export function distantBank(material: StruckMaterial, result: ImpactResult, band: CalibreBand): DistantBank | null {
  if (band === 'bullet') return null;
  return MATERIAL_SOUNDS[material].far?.[result] ?? null;
}

const PLATE_SET: ReadonlySet<string> = new Set(PLATE_MATERIALS);

/** A hit event's material as the wire delivered it: one of the plate set, else armour (an older peer names none). */
export function hitMaterial(material: unknown): PlateMaterial {
  return typeof material === 'string' && PLATE_SET.has(material) ? material as PlateMaterial : 'armour';
}

/** The engine's terrain surface as a ground material. */
export function groundMaterial(surface: 'earth' | 'hard' | 'sand' | 'snow' | 'mud' | 'water'): GroundMaterial {
  return surface === 'hard' ? 'paved' : surface;
}

/**
 * What a struck prop is made of, by its record kind: steel clangs, timber splinters, earthworks thump, stone and
 * masonry crack (never a coin toss between wood and concrete).
 */
export function propMaterial(kind: string): 'thinSteel' | PropMaterial {
  const k = kind.toLowerCase();
  if (/car|truck|van|bus|jeep|vehicle|tractor|container|barrel|drum|tank|cylinder|hedgehog|tetra|metal|steel|iron|crane|gantry|wagon|locomotive|boat|ship|wreck|aagun|gun|artillery|pylon|mast|lamp/.test(k)) return 'thinSteel';
  if (/tree|sapling|stump|trunk|palm|pine|bush|shrub|reed|fence|gate|post|crate|wood|timber|log|pallet|hut|shed|barn|shack|kiosk/.test(k)) return 'timber';
  if (/sandbag|bag|bale|berm|earth|trench|mound|dune|hay/.test(k)) return 'earthwork';
  if (/rock|stone|boulder|cliff|outcrop/.test(k)) return 'rock';
  return 'concrete';
}

/**
 * A round that lands this far off the surface's normal (or more) skips along it: 72° from the normal is 18° to a
 * level ground, about what a tank gun's flat trajectory meets a field at past a few hundred metres.
 */
export const GRAZE_INCIDENCE_DEG = 72;

/** A landing's result: a graze when a solid round meets the ground at a glancing angle, else it digs in. */
export function landingResult(impactAngleDeg: unknown, explodes: boolean): ImpactResult {
  return !explodes && typeof impactAngleDeg === 'number' && impactAngleDeg >= GRAZE_INCIDENCE_DEG ? 'glance' : 'stop';
}

/**
 * What a close burst throws: the debris raining on the ground round it and pattering on our hull, by the ground it dug
 * from (water throws its spray onto the hull and nothing on the ground: the column's fall is in water_big).
 */
export const GROUND_DEBRIS: Readonly<Record<GroundMaterial, { readonly ground: string | null; readonly hull: string }>> = Object.freeze({
  earth: { ground: 'debris_dirt', hull: 'hull_debris_patter' },
  sand: { ground: 'debris_sand', hull: 'hull_patter_sand' },
  mud: { ground: 'debris_mud', hull: 'hull_patter_mud' },
  snow: { ground: 'debris_snow', hull: 'hull_patter_snow' },
  paved: { ground: 'debris_grit', hull: 'hull_patter_grit' },
  water: { ground: null, hull: 'hull_patter_water' },
});

/** Where a round through our own hull bursts in: the turret and fighting compartment, the driver's station, the engine bay. */
export type Compartment = 'fighting' | 'driver' | 'engine';

/** The spall of a penetration inside our hull, by the compartment it bursts into (the crew compartment's is 2026-10's). */
export const SPALL: Readonly<Record<Compartment, string>> = Object.freeze({
  fighting: 'pen_interior',
  driver: 'spall_driver',
  engine: 'spall_engine',
});

/**
 * The compartment a penetration bursts into, from where it struck (hull frame, metres; +z forward): the turret, or the
 * hull ahead of 1.4 m (the driver) or behind -1.2 m (the engine bay), else the fighting compartment.
 */
export function compartmentOf(frame: unknown, localZ: number | null | undefined): Compartment {
  if (frame === 'turret' || frame === 'gun' || frame === 'barrel' || typeof localZ !== 'number' || !Number.isFinite(localZ)) return 'fighting';
  return localZ > 1.4 ? 'driver' : localZ < -1.2 ? 'engine' : 'fighting';
}

/**
 * The near miss of a round passing the listener, by calibre and speed: a bullet's snap, an autocannon round's sharper
 * crack, a sabot's tearing crack, a full-bore round's crack and heavy rush when it is supersonic, a subsonic shell's
 * deep whoosh, a missile's roar.
 */
export type NearMiss = 'bullet_crack' | 'flyby_autocannon' | 'shell_flyby_sabot' | 'flyby_shell_crack' | 'shell_flyby_he' | 'missile_flyby';

/** The speed of sound the near-miss bands split at (m/s; a little over the 343 of sea level, for the round's slowing). */
export const SUPERSONIC_MPS = 360;
/** A long rod's speed: the sabot's crack. */
export const SABOT_MPS = 1250;

export function nearMissAsset(caliberMm: number, velocityMps: number, launcher: boolean): NearMiss {
  if (launcher) return 'missile_flyby';
  if (caliberMm < 15) return 'bullet_crack';
  if (caliberMm < 61) return 'flyby_autocannon';
  if (velocityMps >= SABOT_MPS) return 'shell_flyby_sabot';
  return velocityMps >= SUPERSONIC_MPS ? 'flyby_shell_crack' : 'shell_flyby_he';
}

/** How close a round must pass to be heard going by, by its near-miss sound (m). */
export const NEAR_MISS_REACH_M: Readonly<Record<NearMiss, number>> = Object.freeze({
  bullet_crack: 6,
  flyby_autocannon: 9,
  shell_flyby_sabot: 16,
  flyby_shell_crack: 16,
  shell_flyby_he: 16,
  missile_flyby: 30,
});

/** Every asset this module can name: the battle warm decodes them all before the first shot. */
export function impactAssetIds(): string[] {
  const ids = new Set<string>();
  for (const material of STRUCK_MATERIALS) {
    const sound = MATERIAL_SOUNDS[material];
    for (const result of ['through', 'stop', 'glance'] as const) {
      for (const band of ['bullet', 'autocannon', 'cannon'] as const) for (const layer of sound.layers[result][band]) ids.add(layer.id);
      const bank = sound.far?.[result];
      if (bank) ids.add(bank.id);
    }
  }
  for (const debris of Object.values(GROUND_DEBRIS)) { if (debris.ground) ids.add(debris.ground); ids.add(debris.hull); }
  for (const id of Object.values(SPALL)) ids.add(id);
  for (const id of Object.keys(NEAR_MISS_REACH_M)) ids.add(id);
  return [...ids];
}
