// src/world/maps/layoutBriefMaps.ts — the battlefields redesigned to docs/MAP-LAYOUT-BRIEF.md (maps-and-layouts lane,
// 2026-10-01), in the order they were rebuilt. A map on this roster answers to the brief's measurable checks
// (src/world/mapLayoutBrief.selftest.mjs) instead of the frozen-history witnesses that pinned its old layout byte for
// byte; receipts that preserve the other maps' authoring exclude it by consulting this list.

/** Maps rebuilt to the layout brief: their layout, landform, roads, settlements, spawns and objectives are new. */
export const LAYOUT_BRIEF_MAPS = Object.freeze(['desert', 'urban', 'railyard', 'frontier'] as const);

export type LayoutBriefMapId = (typeof LAYOUT_BRIEF_MAPS)[number];

export function isLayoutBriefMap(mapId: string): boolean {
  return (LAYOUT_BRIEF_MAPS as readonly string[]).includes(mapId);
}
