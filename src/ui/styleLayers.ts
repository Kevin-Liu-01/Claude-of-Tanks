// styleLayers.ts — the cascade-layer contract of every stylesheet (brand-ui SPEC §5). Copyright © 2026 Kevin B. Liu.
//
// Every stylesheet declares into one of seven cascade layers, lowest priority first:
//   reset       element resets only;
//   tokens      custom properties (src/ui/tokens/tokens.css, generated);
//   base        document defaults: root type smoothing, html/body, font faces;
//   components  shared, surface-independent controls (src/ui/components/, tooltips, selects, popovers);
//   surfaces    one screen's own styles: the garage, the HUD, settings, the public pages;
//   utilities   single-purpose helper classes;
//   overrides   last-word user preferences.
// A later layer beats an earlier one whatever the selectors' specificity, so a surface restyles a component without
// !important. An !important declaration reverses the order (an earlier layer's !important wins), which is one more
// reason the style-literal census (tools/style-literal-census.mjs) only lets the !important count fall.
//
// The first declaration of a layer name fixes its position in a document, so every sheet opens with the full order
// (STYLE_LAYER_ORDER) before its own `@layer <name>{...}` block: static .css files by hand (the minifier keeps one copy
// per bundle), CSS-in-TS through ensureStyle(), the one injection path.

/** The layer order, lowest priority first (SPEC §5.1). */
export const STYLE_LAYERS = ['reset', 'tokens', 'base', 'components', 'surfaces', 'utilities', 'overrides'] as const;
export type StyleLayer = typeof STYLE_LAYERS[number];

/** The statement each document reads before any layered rule (STYLE_LAYERS in order; styleLayers.selftest pins it). */
export const STYLE_LAYER_ORDER = '@layer reset,tokens,base,components,surfaces,utilities,overrides;';

/**
 * Inject a stylesheet once, into its cascade layer, and return the canonical style element. A style element already
 * in the document under `id` (a first-paint copy in the HTML) is returned untouched. The sheet opens with the layer
 * order, so it can never be the first to name a layer out of place; where the document declared it already, the
 * repeat changes nothing.
 */
export function ensureStyle(id: string, css: string, layer: StyleLayer): HTMLStyleElement {
  const existing = document.getElementById(id);
  if (existing?.tagName === 'STYLE') return existing as HTMLStyleElement;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = `${STYLE_LAYER_ORDER}@layer ${layer}{${css}}`;
  document.head.appendChild(style);
  return style;
}
