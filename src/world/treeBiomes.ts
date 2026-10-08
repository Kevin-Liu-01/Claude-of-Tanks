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
  // the Aso caldera, Kyushu (the map-revival lane, 2026-10-05; was Las Cañadas del Teide): sugi plantations and shrine
  // groves where the map plants its pines and cypresses, Japanese red pine on the dry cinder where it plants its scrub
  // stand-in (the acacia slot), the bushes the evergreen broadleaf scrub of the grazed grassland (azalea, camellia) in
  // the holm oak's dark leaf; the stands stay open groves (treeBiomes open: the placement is the map's)
  // (Caldera round 2, wave 114: the holm oak's big leaf sprays read at shrub size as "a tropical fern or palm-like
  // shrub", and the sugi stood in open groves: the bushes are now the grassland's low twiggy scrub (the broom form: bush
  // clover, Miyama-kirishima azalea) and the sugi stand in closed blocks)
  caldera: B('the Aso caldera, Kyushu', { pine: { form: 'sugi' }, cypress: { form: 'sugi' }, acacia: { form: 'redPine' } }, 'broom'),
  // the Dalmatian coast: Aleppo pine, holm oak and olive (and cypress, which the map names directly)
  saltwind: B('the Dalmatian coast, Croatia', { pine: { form: 'aleppoPine' }, cedar: { form: 'holmOak', colour: HOLM_OAK_FOLIAGE },
    acacia: { form: 'olive', colour: OLIVE_FOLIAGE } }),
  // Longleaf, Louisiana (the map-revival lane, 2026-10-05; the trees lane's row for round 2, gauntlet wave 124): the Gulf
  // coastal plain's longleaf pine flatwoods — tall, straight, clear boles under small tufted crowns, in open groves over
  // the wiregrass, the cutover's young pines in their grass stage (the map's bushes)
  longleaf: B('the Gulf coastal plain longleaf flatwoods', { pine: { form: 'longleafPine' } }, 'longleafSeedling', undefined, undefined, true),
  // the Chouf on Mount Lebanon (the map-revival lane, 2026-10-05): the cedars of the Barouk, the Mediterranean pines of the
  // valley sides, olives on the terraces (the map's contour-planted orchard rows)
  orchard: B('the Chouf, Mount Lebanon', { cedar: { form: 'lebanonCedar' }, pine: { form: 'aleppoPine' },
    oak: { form: 'olive', colour: OLIVE_FOLIAGE } }),
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
  // Monument Valley (the map-revival lane, 2026-10-05; round 2 on trees round 5's forms): Utah and one-seed juniper,
  // low, multi-stemmed and grey-green, for the cedar and acacia slots; pinyon for the oak; the scrub as the white broom
  // standing in for sagebrush; the Arizona uplands' dusty greens. The placement stays the map's (no arid or upland
  // flag: they move the stands)
  titan_gorge: B('Monument Valley, Colorado Plateau', { cedar: { form: 'juniper' }, acacia: { form: 'juniper' }, oak: { form: 'pinyon' } }, 'broom', SONORAN_FOLIAGE),
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
  // Queenstown under Mount Lyell, Tasmania (the map-revival lane, 2026-10-05): eucalypt regrowth where the map plants its
  // acacias and cedars, the radiata plantations' pines as pines, the bushes the tea-tree and myrtle scrub in the holm
  // oak's dark leaf (no 'snag' for the fume-killed stumps: its slot would keep a concealing crown it does not draw);
  // the placement stays the map's
  copper_mesa: B('Queenstown under Mount Lyell, Tasmania', { acacia: { form: 'eucalyptus' }, cedar: { form: 'eucalyptus' } }, 'holmOak'),
  // the Scheldt polders: poplar and willow rows (the map's own slots already)
  polders: B('the Scheldt polders, Zeeland', {}),
  // Glen Canyon and Page, Arizona (the map-revival lane, 2026-10-05, Skybridge round 2; look only: the slots keep their
  // seats): the plateau's Utah juniper (the cedar slot) and Colorado pinyon (the pine slot) in the Arizona uplands'
  // dusty greens, the Fremont cottonwoods and the town's planted poplars staying poplars, the scrub between them the
  // broom form's switches (blackbrush, Mormon tea)
  skybridge: B('Glen Canyon and Page, Arizona', { cedar: { form: 'juniper' }, pine: { form: 'pinyon' } }, 'broom', SONORAN_FOLIAGE),
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
 * reserved (tidalMangrove.ts). Trees round 5 (the gauntlet's wave 98 on Saltwind: "the oak canopies merge into a single
 * flat-topped green wall ... with no sky gaps between individual crowns"): the Dalmatian coast's holm oak and olive
 * woods are open woodland, each crown its own dome — they keep a field tree's spread.
 */
const WOOD_SPREAD: Readonly<Record<string, number>> = Object.freeze({ mangrove: 1, saltwind: 1 });
export function treeBiomeWoodSpread(mapId: string | null | undefined): number {
  if (treeBiomeOpen(mapId)) return 1;
  return (mapId ? WOOD_SPREAD[mapId] : undefined) ?? 1.16;
}

/** Whether a map's place is zoned by height (conifer forms high, broadleaf forms low). */
export function treeBiomeUpland(mapId: string | null | undefined): boolean {
  return !!(mapId && TREE_BIOMES[mapId]?.upland);
}

/**
 * Trees round 2b (wave 28): an upland place's zones from its square's heights sorted ascending — the quantiles at two
 * fifths and three fifths. Its conifer forms stand at or over the second, its broadleaf forms at or under the first,
 * nothing on the slopes between (uplandZoneAllows; vegetation.ts uplandZoneOk). No map sets `upland` since Copper Mesa
 * became Queenstown (batch 4, 2026-10-06); treeCrownShading pins the law on a synthetic fixture.
 */
export function uplandBandOf(sortedHeights: readonly number[]): readonly [number, number] {
  return [sortedHeights[Math.floor(sortedHeights.length * 0.4)], sortedHeights[Math.floor(sortedHeights.length * 0.6)]];
}

/** Whether a form (a conifer or not) may stand at height h under an upland band; with no band, anywhere. */
export function uplandZoneAllows(band: readonly [number, number] | null, conifer: boolean, h: number): boolean {
  if (!band) return true;
  return conifer ? h >= band[1] : h <= band[0];
}

/** Whether a place's stands are open groves: its own flag (`open`) or an arid place's. */
export function treeBiomeIsOpen(biome: Readonly<Pick<TreeBiome, 'open' | 'arid'>> | null | undefined): boolean {
  return !!(biome?.open || biome?.arid);
}

/** Whether a map's stands are open groves (an arid place's, or a place that sets `open`). */
export function treeBiomeOpen(mapId: string | null | undefined): boolean {
  return !!mapId && treeBiomeIsOpen(TREE_BIOMES[mapId]);
}

/** The foliage colour defaults of a map's place, or none. */
export function treeBiomeColour(mapId: string | null | undefined): Readonly<TreeBiomeColour> | null {
  return (mapId ? TREE_BIOMES[mapId]?.palette : null) ?? null;
}

/** Trees round 4: the colour of a place's shrubs over the bush slot's palette (TreeBiome.shrubColour), or none. */
export function treeBiomeShrubColour(mapId: string | null | undefined): Readonly<TreeBiomeColour> | null {
  return (mapId ? TREE_BIOMES[mapId]?.shrubColour : null) ?? null;
}
