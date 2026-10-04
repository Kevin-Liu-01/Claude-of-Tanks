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
  /**
   * The form's own foliage colour, over the map palette's (which was tuned for the slot's species, not this form):
   * Dalmatia's olives silver-grey, its holm oaks a dull dark grey-green.
   */
  colour?: Readonly<TreeBiomeColour>;
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
  /**
   * A place whose stands are open groves wherever they stand (a third of a wood's trees over twice the ground each, no
   * clearing): Las Cañadas' pines on the cinder (an arid place's are open too, and seated in the low ground).
   */
  open?: true;
  /**
   * An upland place zoned by height: its conifer forms (juniper, pinyon) on the higher ground, its broadleaf forms
   * (mesquite) in the low washes, nothing on the slopes between (vegetation.ts uplandZoneOk).
   */
  upland?: true;
  /**
   * Trees round 4: the colour of the place's shrubs (its biome shrub form), over the map palette's for the bush slot's
   * species — the Las Cañadas broom an ash-dulled grey-green, not the slot palette's green.
   */
  shrubColour?: Readonly<TreeBiomeColour>;
}

/** A biome's foliage colour defaults (vegetation.ts VegetationPalette's colour fields). */
export interface TreeBiomeColour {
  cardHue?: number;
  cardSat?: number;
  texTone?: (h: number, s: number, l: number) => [number, number, number];
}

/**
 * Hyper-arid foliage: an acacia of Wadi Rum or the Sahara is a grey, dust-dulled green, not a lawn's (the gauntlet's
 * wave 15: "lush green groves on Wadi Rum"). The texture keeps a third of its saturation at a grey-green hue and the
 * card tint is nearly neutral; wave 26 still read the round-2b khaki-olive (hue 0.17) as "lime-green" in the sun, and
 * round 3's yellow-green (0.2) lit golden-olive (wave 31 asks for Acacia raddiana's grey-green).
 */
const ARID_FOLIAGE: Readonly<TreeBiomeColour> = Object.freeze({
  cardHue: 0.26, cardSat: 0.07,
  texTone: (_h: number, s: number, l: number): [number, number, number] => [0.26, Math.min(1, s * 0.32), Math.min(1, l * 1.04)],
});

/**
 * The olive's silver: a grey-green a little toward blue at a fifth of a leaf's saturation, the leaves' pale undersides
 * in the light (wave 26 on Saltwind Narrows: "uniform mid-green oak type with no olive-grey tone").
 */
const OLIVE_FOLIAGE: Readonly<TreeBiomeColour> = Object.freeze({
  cardHue: 0.3, cardSat: 0.06,
  texTone: (_h: number, s: number, l: number): [number, number, number] => [0.28, Math.min(1, s * 0.5), Math.min(1, l * 1.12)],
});

/**
 * The Arizona uplands' dusty greens: every form keeps its own hue (the juniper's grey-blue, the pinyon's dark green, the
 * mesquite's olive) at three fifths of its saturation, a little lighter, under a nearly neutral card tint (gauntlet
 * wave 28: "green broadleaf and fir clumps on sand").
 */
const SONORAN_FOLIAGE: Readonly<TreeBiomeColour> = Object.freeze({
  cardHue: 0.24, cardSat: 0.09,
  texTone: (h: number, s: number, l: number): [number, number, number] => [h, Math.min(1, s * 0.6), Math.min(1, l * 1.05)],
});

/**
 * Las Cañadas' high, dry, volcanic light: the broom a grey-green and the pines a dull green at half their saturation
 * (the gauntlet's wave 31: "the caldera broom is lime"), each keeping its hue.
 */
const VOLCANIC_FOLIAGE: Readonly<TreeBiomeColour> = Object.freeze({
  cardHue: 0.25, cardSat: 0.08,
  texTone: (h: number, s: number, l: number): [number, number, number] => [h, Math.min(1, s * 0.5), Math.min(1, l * 1.04)],
});

/**
 * Trees round 4 (the ground lane, on Obsidian Caldera's establishing view: the broom "saturated green" on the ash plain):
 * the Teide broom (Spartocytisus supranubius) on the cinder is a dry, ash-dulled grey-green — the hue turned toward olive
 * and three tenths of the sprays' saturation, a little paler, as the arid broom of Wadi Rum and the Saharan wadi.
 */
const ASH_SCRUB: Readonly<TreeBiomeColour> = Object.freeze({
  cardHue: 0.23, cardSat: 0.05,
  texTone: (_h: number, s: number, l: number): [number, number, number] => [0.22, Math.min(1, s * 0.3), Math.min(1, l * 1.07)],
});

/** The holm oak's dull dark grey-green (its leaves' felted grey undersides): two thirds of a leaf's saturation. */
const HOLM_OAK_FOLIAGE: Readonly<TreeBiomeColour> = Object.freeze({
  cardHue: 0.25, cardSat: 0.09,
  texTone: (h: number, s: number, l: number): [number, number, number] => [h, Math.min(1, s * 0.68), l],
});

const B = (place: string, slots: TreeBiome['slots'], shrub?: GrowthSpecies, palette?: Readonly<TreeBiomeColour>, arid?: true,
  open?: true, upland?: true): Readonly<TreeBiome> =>
  Object.freeze({ place, slots: Object.freeze(slots), ...(shrub ? { shrub } : {}), ...(palette ? { palette } : {}), ...(arid ? { arid } : {}),
    ...(open ? { open } : {}), ...(upland ? { upland } : {}) });

/**
 * Per map id. Slots a map does not plant are harmless (the table is read per planted slot). Maps that are absent keep
 * every slot as its own form.
 */
export const TREE_BIOMES: Readonly<Record<string, Readonly<TreeBiome>>> = Object.freeze({
  // Las Cañadas del Teide: sparse Canary pines on bare cinder in open groves (wave 26: "evenly spaced, grid-like" stands
  // on a floor that is nearly treeless apart from broom); its acacia slot, the maps lane's scrub stand-in, grows as
  // young pines among the trees and as broom among the bushes
  caldera: Object.freeze({ ...B('Las Cañadas del Teide, Tenerife', { pine: { form: 'canaryPine' }, cedar: { form: 'canaryPine' },
    eucalyptus: { form: 'canaryPine' }, acacia: { form: 'canaryPine' } }, 'broom', VOLCANIC_FOLIAGE, undefined, true), shrubColour: ASH_SCRUB }),
  // the Dalmatian coast: Aleppo pine, holm oak and olive (and cypress, which the map names directly)
  saltwind: B('the Dalmatian coast, Croatia', { pine: { form: 'aleppoPine' }, cedar: { form: 'holmOak', colour: HOLM_OAK_FOLIAGE },
    acacia: { form: 'olive', colour: OLIVE_FOLIAGE } }),
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
  // (trees round 3, the gauntlet's wave 31: the wadi's shrubs were "bright green balls" — a Saharan wadi's scrub is the
  // white broom, Retama raetam, grey-green switches, as Wadi Rum's)
  desert: B('a Saharan wadi', { eucalyptus: { form: 'acacia' } }, 'broom', ARID_FOLIAGE, true),
  oasis: B('a Saharan oasis', { eucalyptus: { form: 'acacia' } }, 'broom', ARID_FOLIAGE, true),
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
  // an abandoned open-pit copper mine in the Arizona uplands (gauntlet wave 28): sparse juniper and pinyon on the higher
  // benches, mesquite (the acacia slot's umbrella, the same bipinnate crown) in the low washes, creosote (the broom
  // form's switches) between them, in open groves
  copper_mesa: B('an open-pit copper mine, the Arizona uplands', { cedar: { form: 'juniper' }, pine: { form: 'pinyon' } }, 'broom',
    SONORAN_FOLIAGE, undefined, true, true),
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
export function treeBiomePalette<P extends TreeBiomePaletteTerms>(pal: P,
  form: { leaves?: boolean; colour?: Readonly<TreeBiomeColour> } | null, crossFamily: boolean,
  defaults: Readonly<TreeBiomeColour> | null = null): P {
  const bareTuned = !!form && form.leaves === true && pal.birchLeaves !== true;
  const formed: P = !form ? pal : {
    ...pal,
    ...(crossFamily || bareTuned ? { cardHue: undefined, cardSat: undefined } : {}),
    ...(bareTuned ? { texTone: undefined } : {}),
    ...(form.leaves ? { birchLeaves: true } : {}),
  };
  // the form's own colour wins over the map palette's, which was tuned for the slot's species (the olive's silver)
  const colour = form?.colour;
  const coloured: P = !colour ? formed : {
    ...formed,
    ...(colour.cardHue !== undefined ? { cardHue: colour.cardHue } : {}),
    ...(colour.cardSat !== undefined ? { cardSat: colour.cardSat } : {}),
    ...(colour.texTone ? { texTone: colour.texTone } : {}),
  };
  if (!defaults) return coloured;
  // the place's colour fills what the map palette leaves unnamed (a named colour always wins)
  return {
    ...coloured,
    ...(coloured.cardHue === undefined && defaults.cardHue !== undefined ? { cardHue: defaults.cardHue } : {}),
    ...(coloured.cardSat === undefined && defaults.cardSat !== undefined ? { cardSat: defaults.cardSat } : {}),
    ...(!coloured.texTone && defaults.texTone ? { texTone: defaults.texTone } : {}),
  };
}

/** Whether a map's place is hyper-arid (open groves in the low ground, lone trees in the wadi beds). */
export function treeBiomeArid(mapId: string | null | undefined): boolean {
  return !!(mapId && TREE_BIOMES[mapId]?.arid);
}

/**
 * Trees round 3 (2026-10-03, the gauntlet's wave 31: "real places have closed woods"): how much wider a closed wood's
 * crowns spread than a field tree's (vegetation.ts placeTreeClusters; an open grove's never do). The tidal mangrove
 * coast keeps its woods' crowns: its stands lend their trees to the mangrove rows, each in the envelope its row
 * reserved (tidalMangrove.ts).
 */
const WOOD_SPREAD: Readonly<Record<string, number>> = Object.freeze({ mangrove: 1 });
export function treeBiomeWoodSpread(mapId: string | null | undefined): number {
  if (treeBiomeOpen(mapId)) return 1;
  return (mapId ? WOOD_SPREAD[mapId] : undefined) ?? 1.16;
}

/** Whether a map's place is zoned by height (conifer forms high, broadleaf forms low). */
export function treeBiomeUpland(mapId: string | null | undefined): boolean {
  return !!(mapId && TREE_BIOMES[mapId]?.upland);
}

/** Whether a map's stands are open groves (an arid place's, Las Cañadas'). */
export function treeBiomeOpen(mapId: string | null | undefined): boolean {
  return !!(mapId && (TREE_BIOMES[mapId]?.open || TREE_BIOMES[mapId]?.arid));
}

/** The foliage colour defaults of a map's place, or none. */
export function treeBiomeColour(mapId: string | null | undefined): Readonly<TreeBiomeColour> | null {
  return (mapId ? TREE_BIOMES[mapId]?.palette : null) ?? null;
}

/** Trees round 4: the colour of a place's shrubs over the bush slot's palette (TreeBiome.shrubColour), or none. */
export function treeBiomeShrubColour(mapId: string | null | undefined): Readonly<TreeBiomeColour> | null {
  return (mapId ? TREE_BIOMES[mapId]?.shrubColour : null) ?? null;
}
