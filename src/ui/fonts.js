// src/ui/fonts.js — shared UI typography: self-hosted Switzer (Fontshare /
// ITF Free Font License, see docs/ATTRIBUTION.md) + the canonical font stacks
// and type tokens every UI module imports. Injecting once here keeps all
// screens (garage, HUD, settings, damage panel, tech tree, overlays) on the
// exact same system.
//
// Weights hosted (public/fonts/switzer/): 400 regular, 500 medium,
// 600 semibold, 700 bold, 800 extrabold.

/** Primary UI stack — Switzer with metric-adjacent grotesque fallbacks. */
export const FONT_STACK = "'Switzer','Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * Numeral / label stack (HUD counters, timers, stat labels, damage panel).
 * Condensed grotesque first — WoT and AAA military HUDs set their numeric/
 * label layer in a condensed face, which is what separates them from web-app
 * typography. Every rule that uses this stack also sets tabular numerals
 * (fonts.css block below), so timers and counters never jitter.
 */
export const FONT_COND = "'Arial Narrow','Avenir Next Condensed','Helvetica Neue Condensed','Roboto Condensed','Liberation Sans Narrow',Arial,sans-serif";

// Type scale tokens (px) — one modular scale for every overlay.
export const TYPE = {
  h1: 30,      // screen title (selected tank name)
  h2: 17,      // section headers / brand line
  h3: 15,      // card headers
  label: 11,   // uppercase micro-labels
  body: 12.5,  // body copy
  micro: 9.5,  // hints, footnotes
  trackHead: '.30em', // heading letterspacing (uppercase display lines)
  trackLabel: '.18em', // uppercase label letterspacing
};

const WEIGHTS = [
  ['Regular', 400],
  ['Medium', 500],
  ['Semibold', 600],
  ['Bold', 700],
  ['Extrabold', 800],
];

const FONT_CSS = WEIGHTS.map(([file, w]) => `@font-face{
  font-family:'Switzer';
  src:url('/fonts/switzer/Switzer-${file}.woff2') format('woff2');
  font-weight:${w};font-style:normal;font-display:swap;}`).join('\n') + `
/* stats and timers line up: lining tabular figures across every overlay */
.cot-garage,.cot-hud,.cot-settings,.cot-dp,.cot-tt,.cot-hints,.cot-end{
  font-variant-numeric:lining-nums tabular-nums;}`;

let warmed = false;

/**
 * Inject the @font-face rules (idempotent) and pre-warm the hosted weights so
 * overlays never flash fallback glyphs. Safe to call from every UI module.
 */
export function ensureFonts() {
  if (!document.getElementById('cot-fonts')) {
    const s = document.createElement('style');
    s.id = 'cot-fonts';
    s.textContent = FONT_CSS;
    document.head.appendChild(s);
  }
  if (!warmed && document.fonts && document.fonts.load) {
    warmed = true;
    for (const [, w] of WEIGHTS) {
      document.fonts.load(`${w} 16px Switzer`).catch(() => {});
    }
  }
}
