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
}

const B = (place: string, slots: TreeBiome['slots']): Readonly<TreeBiome> => Object.freeze({ place, slots: Object.freeze(slots) });

/**
 * Per map id. Slots a map does not plant are harmless (the table is read per planted slot). Maps that are absent keep
 * every slot as its own form.
 */
export const TREE_BIOMES: Readonly<Record<string, Readonly<TreeBiome>>> = Object.freeze({
  // Las Cañadas del Teide: sparse Canary pines on bare cinder (the map's density and its scrub are the maps lane's)
  caldera: B('Las Cañadas del Teide, Tenerife', { pine: { form: 'canaryPine' }, cedar: { form: 'canaryPine' }, eucalyptus: { form: 'canaryPine' } }),
  // the Dalmatian coast: Aleppo pine, holm oak and olive (and cypress, which the map names directly)
  saltwind: B('the Dalmatian coast, Croatia', { pine: { form: 'aleppoPine' }, cedar: { form: 'holmOak' }, acacia: { form: 'olive' } }),
  // the Breton bocage: oak and sweet chestnut along the hedgebanks (the maritime pine stays a pine)
  coastal: B('the Breton bocage, Brittany', { cedar: { form: 'chestnut' } }),
  // the Fulda Gap: beech woods with spruce, oak and birch
  frontier: B('the Fulda Gap, Hesse', { pine: { form: 'beech' }, aspen: { form: 'birch', leaves: true } }),
  // Prokhorovka: birch and oak shelterbelts, poplars along the tracks, willows by the water
  verdant: B('Prokhorovka, Kursk oblast', { pine: { form: 'birch', leaves: true } }),
  // Wadi Rum: sparse umbrella acacias (and the oasis palms)
  badlands: B('Wadi Rum, Jordan', { cedar: { form: 'acacia' }, oak: { form: 'acacia' } }),
  // a Saharan wadi: date palms and acacias
  desert: B('a Saharan wadi', { eucalyptus: { form: 'acacia' } }),
  oasis: B('a Saharan oasis', { eucalyptus: { form: 'acacia' } }),
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

/** The form a map's slot grows as: the table's, or none (the slot's own species). */
export function treeBiomeSlot(mapId: string | null | undefined, slot: TreeSpecies): Readonly<TreeBiomeSlot> | null {
  if (!mapId) return null;
  return TREE_BIOMES[mapId]?.slots[slot] ?? null;
}
