// src/ui/fonts.ts — the shell's font stacks and the overlay type rules every UI module imports.
//
// TYPE (owner ruling 2026-10-17): Chakra Petch (display), IBM Plex Sans (body) and IBM Plex Mono
// (readouts), self-hosted SIL OFL Latin subsets that replace ABC Monument Grotesk everywhere. Their @font-face rules,
// fallbacks and type tokens are declared once, by each document's `<!--cot:type …-->` marker (src/ui/typeFaces.ts,
// expanded by vite.config.ts), so this boot module carries no face data.
//
// 'Cot UI' is the weight-voiced shell family: 400 / 500 IBM Plex Sans (reading text, the 500 UI floor), 600 Chakra
// Petch SemiBold (the label voice), 700 Chakra Petch Bold (titles, buttons, display numerals). Every weight the UI asks
// for is a real face (the type lint holds code to those four). Readouts that tick in place take the `.num` class
// (IBM Plex Mono, tabular figures); nothing else sets tabular figures.

import { ensureStyle } from './styleLayers.ts';

/**
 * Primary UI stack, canvas-safe (canvas text cannot read var()). Equal to TYPE_STACK.ui in src/ui/typeFaces.ts and
 * to the --font-ui token; src/ui/typeSystem.selftest.mjs holds the three together.
 */
export const FONT_STACK = "'Cot UI','Cot Accents','Cot Symbols','Cot Fallback','PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC',sans-serif";

/**
 * Numeral / label stack (HUD counters, timers, stat labels, damage panel). Once a condensed grotesque; it is the
 * same weight-voiced family now: labels at 600/700 are Chakra Petch, whose metric-matched fallback keeps an
 * unresolved webfont inside the tight HUD boxes.
 */
export const FONT_COND = FONT_STACK;

// The faces the shell paints first (resolved against the 'Cot UI' ranges): Plex Sans Medium, Chakra Petch Bold.
const WEIGHTS = [500, 700] as const;

// Weight floor 500 for every overlay root: unweighted text never renders at book/regular (explicit 600/700
// hierarchy steps are unaffected). Figures stay proportional here: `.num` alone sets tabular figures.
const FONT_CSS = `.cot-garage,.cot-hud,.cot-settings,.cot-dp,.cot-hints,.cot-end,
.cot-bl,.cot-si,.cot-kc,.cot-touch,.cot-studio{font-weight:500;font-optical-sizing:auto;}`;

let warmed = false;

/**
 * Inject the overlay type rules (idempotent) and pre-warm the two first-paint faces so late downloads replace the
 * metric-matched fallback. Warm each physical file once, without blocking startup. Safe to call from every UI module.
 */
export function ensureFonts(): void {
  ensureStyle('cot-fonts', FONT_CSS, 'surfaces');
  if (!warmed && document.fonts && document.fonts.load) {
    warmed = true;
    for (const w of WEIGHTS) {
      document.fonts.load(`${w} 16px 'Cot UI'`).catch(() => {});
    }
  }
}
