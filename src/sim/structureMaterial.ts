/**
 * structureMaterial.ts — what a structure's walls are made of, for the ram law (destruction core lane, 2026-10-08;
 * docs/DESTRUCTION.md §4.4).
 *
 * A host has no rendered kit, only collision records, so a structure's material comes from what the world build
 * itself decides: the map's regional architecture style (its config's `props.architecture`) gives the walls of its
 * houses — earth (mudbrick under render: the desert, steppe and collective-farm styles), poured concrete (the dam
 * style), else stone or brick masonry — sheds are timber and sheet on every map, and large buildings and landmarks are
 * at least masonry (no mud halls). The world's default damage kit reads the same earth list (props.ts), so what a
 * hull's ram prices and what the breach draws agree.
 */
import type { StructureMassClass } from './destructionEvents.ts';

export type StructureMaterial = 'timber' | 'adobe' | 'masonry' | 'concrete';

/** The regional styles whose walls are earth (mudbrick under render). */
export const EARTH_ARCHITECTURE_STYLES: ReadonlySet<string> = new Set(['wadirum', 'ksar', 'siwa', 'navajo', 'kolkhoz']);
/** The regional styles whose walls are poured concrete. */
export const CONCRETE_ARCHITECTURE_STYLES: ReadonlySet<string> = new Set(['glencanyon']);

/**
 * A map's house walls from its architecture style (its config's `props.architecture`; null: none): earth, concrete,
 * else masonry.
 */
export function wallMaterialForStyle(style: string | null | undefined): StructureMaterial {
  if (style && EARTH_ARCHITECTURE_STYLES.has(style)) return 'adobe';
  if (style && CONCRETE_ARCHITECTURE_STYLES.has(style)) return 'concrete';
  return 'masonry';
}

/** The architecture style a map config names (null: none). */
export function architectureStyleOf(config: { props?: unknown } | null | undefined): string | null {
  const style = (config?.props as { architecture?: unknown } | undefined)?.architecture;
  return typeof style === 'string' ? style : null;
}

/** A structure's material from its mass class and its map's walls (sheds timber; halls and landmarks no softer than masonry). */
export function structureMaterialFor(massClass: StructureMassClass, wallMaterial: StructureMaterial): StructureMaterial {
  if (massClass === 'shed') return 'timber';
  if (massClass === 'house') return wallMaterial;
  return wallMaterial === 'concrete' ? 'concrete' : 'masonry';
}
