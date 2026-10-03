// src/world/treeBiomes.ts — trees round 2 (2026-10-03): the trees of each battlefield's real place.
//
// The owner's brief: every map should look like the photographs of the place it is built on. A map file names its
// species SLOTS (treeSpecies.ts: the placement mixes, the collision archetypes, the pools, the mobile tier's legacy
// builders, the impostor rows) and the map-layout lanes own those files; this table decides, per map, which regional
// FORM a slot grows as on the desktop tiers (treeGrowth.ts's profiles, treeSprayAtlas.ts's tiles): Tenerife's Canary
// pine where Obsidian Caldera's map names a pine, Dalmatia's holm oak, olive and Aleppo pine where Saltwind Narrows
// names a cedar, an acacia and a pine, the Fulda Gap's beech where Frontier Basin names a pine. A slot keeps its
// archetype (its trunk record, its concealment, its fall) and its mobile look; only the grown tree changes. A map
// file can still name the form itself (a palette's `form`, vegetation.ts palOf), which wins over this table.
//
// THREE-free: the receipts and the tools read it in Node.
import type { TreeSpecies } from './treeSpecies.ts';
import type { GrowthSpecies } from './treeGrowth.ts';

export interface TreeBiomeSlot {
  /** The growth profile and spray atlas the slot's grown trees take. */
  form: GrowthSpecies;
  /** A leafy crown for a birch-family form (the palette's birchLeaves). */
  leaves?: boolean;
}

export interface TreeBiome {
  /** The real place the map is built on (for the record and the reports). */
  place: string;
  slots: Readonly<Partial<Record<TreeSpecies, Readonly<TreeBiomeSlot>>>>;
  /** The form the map's shrubs (its bushes and understorey) grow as, with their own atlas (vegetation.ts createBushes). */
  shrub?: GrowthSpecies;
  /**
   * The place's foliage colour where the map palette names none (treeBiomePalette fills the gaps, every grown slot):
   * the texture tone and the card hue and saturation.
   */
  palette?: Readonly<TreeBiomeColour>;
  /** A hyper-arid place: its stands are open groves in the low ground, its lone trees keep to the wadi beds (vegetation.ts). */
  arid?: true;
}

/** A biome's foliage colour defaults (vegetation.ts VegetationPalette's colour fields). */
export interface TreeBiomeColour {
  cardHue?: number;
  cardSat?: number;
  texTone?: (h: number, s: number, l: number) => [number, number, number];
}

/**
 * Hyper-arid foliage: an acacia of Wadi Rum or the Sahara is a grey, dust-dulled olive, not a lawn's green (the
 * gauntlet's wave 15: "lush green groves on Wadi Rum"). The texture loses half its saturation toward a khaki hue and the
 * card tint is a pale buff, as the desert maps' own oak palettes already paint their trees.
 */
const ARID_FOLIAGE: Readonly<TreeBiomeColour> = Object.freeze({
  cardHue: 0.15, cardSat: 0.14,
  texTone: (_h: number, s: number, l: number): [number, number, number] => [0.17, Math.min(1, s * 0.5), Math.min(1, l * 1.06)],
});

const B = (place: string, slots: TreeBiome['slots'], shrub?: GrowthSpecies, palette?: Readonly<TreeBiomeColour>, arid?: true): Readonly<TreeBiome> =>
  Object.freeze({ place, slots: Object.freeze(slots), ...(shrub ? { shrub } : {}), ...(palette ? { palette } : {}), ...(arid ? { arid } : {}) });

/**
 * Per map id. Slots a map does not plant are harmless (the table is read per planted slot). Maps that are absent keep
 * every slot as its own form.
 */
export const TREE_BIOMES: Readonly<Record<string, Readonly<TreeBiome>>> = Object.freeze({
  // Las Cañadas del Teide: sparse Canary pines on bare cinder (the map's density and its scrub are the maps lane's; its
  // acacia slot, the maps lane's scrub stand-in, grows as young pines among the trees and as broom among the bushes)
  caldera: B('Las Cañadas del Teide, Tenerife', { pine: { form: 'canaryPine' }, cedar: { form: 'canaryPine' }, eucalyptus: { form: 'canaryPine' },
    acacia: { form: 'canaryPine' } }, 'broom'),
  // the Dalmatian coast: Aleppo pine, holm oak and olive (and cypress, which the map names directly)
  saltwind: B('the Dalmatian coast, Croatia', { pine: { form: 'aleppoPine' }, cedar: { form: 'holmOak' }, acacia: { form: 'olive' } }),
  // the Breton bocage: oak and sweet chestnut along the hedgebanks (the maritime pine stays a pine)
  coastal: B('the Breton bocage, Brittany', { cedar: { form: 'chestnut' } }),
  // the Fulda Gap: beech woods with spruce, oak and birch
  frontier: B('the Fulda Gap, Hesse', { pine: { form: 'beech' }, aspen: { form: 'birch', leaves: true } }),
  // Prokhorovka: birch and oak shelterbelts, poplars along the tracks (the map's willow and pine slots grow as birches:
  // wave 4 read the weeping willows of the left treeline as "hanging curtains of flat strips")
  verdant: B('Prokhorovka, Kursk oblast', { pine: { form: 'birch', leaves: true }, willow: { form: 'birch', leaves: true } }),
  // Wadi Rum: sparse, dust-dulled umbrella acacias (and the spring's palms) over white-broom scrub (Retama raetam: the
  // map's oak bushes read as lawn shrubs on the sand)
  badlands: B('Wadi Rum, Jordan', { cedar: { form: 'acacia' }, oak: { form: 'acacia' } }, 'broom', ARID_FOLIAGE, true),
  // a Saharan wadi: date palms and acacias (the map's oak palette dusts them already; the defaults fill any slot it misses)
  desert: B('a Saharan wadi', { eucalyptus: { form: 'acacia' } }, undefined, ARID_FOLIAGE, true),
  oasis: B('a Saharan oasis', { eucalyptus: { form: 'acacia' } }, undefined, ARID_FOLIAGE, true),
  // the Rur dams in the Eifel: spruce plantations and beech, birches in leaf
  reservoir: B('the Rur dams, Eifel', { pine: { form: 'beech' }, fir: { form: 'spruce' }, birch: { form: 'birch', leaves: true } }),
  // the summer battlefields whose maps plant birches: in leaf (a bare birch crown in a green summer read as a dead tree,
  // gauntlet wave 4's "dead brown specimen")
  railyard: B('a Central European rail junction', { birch: { form: 'birch', leaves: true } }),
  foundry: B('a Central European steelworks', { birch: { form: 'birch', leaves: true } }),
  airfield: B('a northern European airfield', { birch: { form: 'birch', leaves: true } }),
  fjord: B('a Norwegian fjord', { birch: { form: 'birch', leaves: true } }),
  // the Alps: spruce and larch
  alpine: B('an Alpine pass', { fir: { form: 'larch' }, pine: { form: 'larch' } }),
  // the Scheldt polders: poplar and willow rows (the map's own slots already)
  polders: B('the Scheldt polders, Zeeland', {}),
});

/** The form a map's shrubs grow as (their own atlas), or none (the bush slot's). */
export function treeBiomeShrub(mapId: string | null | undefined): GrowthSpecies | null {
  return (mapId ? TREE_BIOMES[mapId]?.shrub : null) ?? null;
}

/** The form a map's slot grows as: the table's, or none (the slot's own species). */
export function treeBiomeSlot(mapId: string | null | undefined, slot: TreeSpecies): Readonly<TreeBiomeSlot> | null {
  if (!mapId) return null;
  return TREE_BIOMES[mapId]?.slots[slot] ?? null;
}

/** The colour terms of a map palette that a regional form may set aside (vegetation.ts VegetationPalette's subset). */
export interface TreeBiomePaletteTerms {
  cardHue?: number;
  cardSat?: number;
  texTone?: unknown;
  birchLeaves?: boolean;
}

/**
 * The palette a slot's regional form grows with. A form of another family keeps the map palette's tone and snow but
 * not the card hue and saturation tuned for the slot's family. A form that grows leaves takes them (birchLeaves); on
 * a palette authored for bare crowns (no birchLeaves of its own) it also sets aside that palette's twig colours, the
 * texture tone and the card hue and saturation, which would paint the new leaves the twigs' colour. Cinder Junction's
 * sooty-gold birch twigs turned its leafy birches orange-brown: the gauntlet's "dead/brown foliage scattered randomly
 * among healthy green trees, reading as a widespread asset bug" (wave 6).
 */
export function treeBiomePalette<P extends TreeBiomePaletteTerms>(pal: P, form: { leaves?: boolean } | null, crossFamily: boolean,
  defaults: Readonly<TreeBiomeColour> | null = null): P {
  const bareTuned = !!form && form.leaves === true && pal.birchLeaves !== true;
  const formed: P = !form ? pal : {
    ...pal,
    ...(crossFamily || bareTuned ? { cardHue: undefined, cardSat: undefined } : {}),
    ...(bareTuned ? { texTone: undefined } : {}),
    ...(form.leaves ? { birchLeaves: true } : {}),
  };
  if (!defaults) return formed;
  // the place's colour fills what the map palette leaves unnamed (a named colour always wins)
  return {
    ...formed,
    ...(formed.cardHue === undefined && defaults.cardHue !== undefined ? { cardHue: defaults.cardHue } : {}),
    ...(formed.cardSat === undefined && defaults.cardSat !== undefined ? { cardSat: defaults.cardSat } : {}),
    ...(!formed.texTone && defaults.texTone ? { texTone: defaults.texTone } : {}),
  };
}

/** Whether a map's place is hyper-arid (open groves in the low ground, lone trees in the wadi beds). */
export function treeBiomeArid(mapId: string | null | undefined): boolean {
  return !!(mapId && TREE_BIOMES[mapId]?.arid);
}

/** The foliage colour defaults of a map's place, or none. */
export function treeBiomeColour(mapId: string | null | undefined): Readonly<TreeBiomeColour> | null {
  return (mapId ? TREE_BIOMES[mapId]?.palette : null) ?? null;
}
