// studioTemplates.ts — every way to start a Studio scene, as one set of templates (owner 2026-10-27: "make template
// presentation a lotttt more and better"). Copyright © 2026 Kevin B. Liu.
//
// Three kinds, one browser (studioTemplateSheet.ts) and one shelf: the Director's sequences (game/studioProduction.ts:
// directed recipes that cast the featured tank), the site's filmed scenes, and every production tank's own take (the
// take index, tools/media-r5/site-media.mjs). Each template is a kit picker item (its card) plus what the browser's
// preview shows: a larger still, the take's muted loop where one ships, its sentence, its facts and, for a sequence, its
// three acts. Pure: the words arrive through a port, so the selftest builds the set without a catalog or a DOM.

import type { PickerItem } from './components/picker.ts';
import type { ProductionCategory } from '../game/studioProduction.ts';

export type TemplateKind = 'sequence' | 'scene' | 'tank';

/** A take of the site's index (public/media/site50-r14/scenes/index.json). */
export interface SiteTake {
  id: string; title: { en: string; zh: string }; short: { en: string; zh: string };
  map: string; durationMs: number | null; scene: string; thumb?: string;
  /** 'fleet': one production vehicle's own take (src/ui/fleetTakes.ts); the default list is every other take. */
  group?: string; vehicle?: string;
}

/** A sequence as the browser needs it (the recipe's fields, without the cast). */
interface SequenceRecipe {
  readonly id: string; readonly title: string; readonly description: string; readonly map: string; readonly timeOfDay: string;
  readonly durationMs: number; readonly category: ProductionCategory; readonly shots: readonly string[];
}

export interface StudioTemplate extends PickerItem {
  readonly kind: TemplateKind;
  /** Its battlefield's id (a missing still falls back to the battlefield's card). */
  readonly map: string;
  /** The preview's still: a larger rung than the card's where one ships. */
  readonly hero: string;
  /** The preview's muted loop, where the take ships a light one. */
  readonly loop?: string;
  /** The preview's sentence: a sequence's description, a take's full title. */
  readonly summary: string;
  /** The preview's facts: the kind, the battlefield, the hour, the length, the shots. */
  readonly meta: readonly string[];
  /** A sequence's acts: each name and when it starts. */
  readonly acts?: readonly (readonly [string, string])[];
  /** What staging it runs: a sequence's preset id or a take's scene. */
  readonly preset?: string;
  readonly take?: SiteTake;
}

/** The words a template shows, in the reader's language (studioProductionPanel.ts binds the catalog). */
export interface TemplateWords {
  readonly zh: boolean;
  mapName(id: string): string;
  tankName(id: string): string;
  time(id: string): string;
  seconds(ms: number): string;
  kind(kind: TemplateKind): string;
  shots(count: number): string;
  presetText(id: string, field: 'title' | 'description', fallback: string): string;
  shotNames(id: string): readonly string[];
}

/** The engine's own frame of each sequence (public/media/studio-r1, its manifest): the card's rung and the preview's. */
export const sequenceStill = (id: string, width: 640 | 1280 = 640): string => `/media/studio-r1/sequence-${id}-${width}.webp`;
/** The scenes whose loop ships at 960 px (public/media/site50-r14/loops): the rest ship only full-size films, too heavy
 *  to play on a hover. */
const LIGHT_SCENE_LOOPS = new Set(['s05-barn-advance', 's07-lake-shellfire', 's18-street-knockout', 's226-church-duel',
  's227-oasis-duel', 's26-minaret-fire']);
/** A filmed scene is a combat take when its title says it fights. */
const COMBAT_WORDS = /\b(fire|fires|firing|duel|knock|kill|assault|barrage|salvo|charge|shellfire|under fire|1v2|returns?|ambush|exchange)\b/i;

const secondsFor = (ms: number | null): number => ms ?? 0;

/** The Director's sequences, in the library's order. */
export function sequenceTemplates(recipes: readonly SequenceRecipe[], words: TemplateWords): StudioTemplate[] {
  return recipes.map((recipe) => {
    const map = words.mapName(recipe.map);
    const names = words.shotNames(recipe.id);
    const starts = [0, 2666.667, 5333.333];
    return {
      id: `seq:${recipe.id}`, kind: 'sequence', map: recipe.map, preset: recipe.id,
      name: words.presetText(recipe.id, 'title', recipe.title),
      facts: [map, words.time(recipe.timeOfDay)],
      media: { poster: sequenceStill(recipe.id) },
      tags: ['sequence', recipe.category, ...(recipe.timeOfDay === 'night' || recipe.timeOfDay === 'dusk' ? ['night'] : [])],
      hero: sequenceStill(recipe.id, 1280),
      summary: words.presetText(recipe.id, 'description', recipe.description),
      meta: [words.kind('sequence'), map, words.time(recipe.timeOfDay), words.seconds(recipe.durationMs), words.shots(names.length)],
      acts: names.map((name, index) => [name, words.seconds(starts[index] ?? 0)] as const),
    };
  });
}

/** The site's filmed scenes, then every tank's own take, in the index's order. */
export function takeTemplates(takes: readonly SiteTake[], words: TemplateWords): StudioTemplate[] {
  const scenes: StudioTemplate[] = [];
  const tanks: StudioTemplate[] = [];
  for (const take of takes) {
    const map = words.mapName(take.map);
    const length = words.seconds(secondsFor(take.durationMs));
    const title = words.zh ? take.title.zh : take.title.en;
    const thumb = take.thumb || `/maps/cards/${take.map}.webp`;
    if (take.group === 'fleet' && take.vehicle) {
      tanks.push({
        id: `take:${take.id}`, kind: 'tank', map: take.map, take, name: words.tankName(take.vehicle), facts: [map, length],
        media: { poster: thumb }, tags: ['tank', 'showcase'], hero: thumb,
        // every fleet take ships its 640 px loop beside its card (fleet/<vehicle>.webm)
        ...(take.thumb?.endsWith('.jpg') ? { loop: take.thumb.replace(/\.jpg$/, '.webm') } : {}),
        summary: title, meta: [words.kind('tank'), map, length],
      });
      continue;
    }
    scenes.push({
      id: `take:${take.id}`, kind: 'scene', map: take.map, take, name: words.zh ? take.short.zh : take.short.en, facts: [map, length],
      media: { poster: thumb }, tags: ['scene', COMBAT_WORDS.test(take.title.en) ? 'combat' : 'environment'],
      hero: take.thumb ? `/media/site50-r14/stills/${take.id}.webp` : thumb,
      ...(LIGHT_SCENE_LOOPS.has(take.id) ? { loop: `/media/site50-r14/loops/${take.id}-960.webm` } : {}),
      summary: title, meta: [words.kind('scene'), map, length],
    });
  }
  return [...scenes, ...tanks];
}
