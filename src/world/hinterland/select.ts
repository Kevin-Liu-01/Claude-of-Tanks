// src/world/hinterland/select.ts — which hinterland block a page draws (HL-1, the horizons stream, 2026-10-13;
// B-architecture §7.1): the map file's block (or its switch, `hinterland: true`: the map's draft) migrates the map on
// every tier; `?hinterland=0` keeps the old ring (the
// one-line A/B); `?hinterland=1` also draws a lab block, or a lab draft for a map whose file carries none. Production
// follows the map file: without the override a lab block or a draft never draws.
import { HINTERLAND_LAB_DRAFTS } from './drafts/index.ts';
import { hinterlandOverride, type HinterlandConfig, type HinterlandMapConfig } from './spec.ts';

export function selectHinterland(cfg: object | null | undefined, search?: string | null): HinterlandConfig | null {
  const override = hinterlandOverride(search);
  if (override === false || !cfg) return null;
  const c = cfg as HinterlandMapConfig;
  // the map file's switch (`hinterland: true`) ships its draft: the block authored for it, out of the lab
  if (c.hinterland === true) {
    const draft = c.id ? HINTERLAND_LAB_DRAFTS[c.id] : undefined;
    return draft ? { ...draft, lab: false } : null;
  }
  const block = c.hinterland ?? (override === true && c.id ? HINTERLAND_LAB_DRAFTS[c.id] : undefined);
  if (!block) return null;
  if (block.lab && override !== true) return null;
  return block;
}

/** The map config with the selected block in place (or without one): what resolveHinterlandSpec reads. */
export function withSelectedHinterland<T extends object>(cfg: T, search?: string | null): T & { hinterland?: HinterlandConfig } {
  const block = selectHinterland(cfg, search);
  return block ? { ...cfg, hinterland: block } : { ...cfg, hinterland: undefined };
}
