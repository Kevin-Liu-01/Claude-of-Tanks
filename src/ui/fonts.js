// src/ui/fonts.js — shared UI typography: self-hosted Inter variable
// (Rasmus Andersson, rsms/inter v4.1, SIL OFL 1.1 — see docs/ATTRIBUTION.md)
// + the canonical font stacks and type tokens every UI module imports.
// Injecting once here keeps all screens (garage, HUD, settings, damage panel,
// tech tree, overlays) on the exact same system.
//
// PROVENANCE: the owner originally asked for Klim's "Die Grotesk" (commercial,
// unobtainable for this project); Archivo shipped as the documented free
// substitute; the owner then directed this swap to Inter. TYPE MANDATE with
// Inter: usage weight floor is 500 (body/default 500, hierarchy 600/700/800 —
// nothing in the UI renders below medium).
//
// Hosting (public/fonts/inter/): ONE variable woff2 (wght 100–900 x
// opsz 14–32, roman — no italics in the UI). Inter has NO width axis, so the
// retired condensed layer ('Archivo Condensed' at 79% stretch, before that
// SwitzerCondensed) is now plain Inter: the rules that consumed FONT_COND
// carry slightly negative tracking (-.01em) instead, stepped down a size only
// where the condensed width was load-bearing for fit.

/** Primary UI stack — Inter with metric-adjacent grotesque fallbacks. */
export const FONT_STACK = "'Inter','Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * Numeral / label stack (HUD counters, timers, stat labels, damage panel).
 * Historically a condensed grotesque (WoT-style military HUD look); under
 * Inter it is the same family — the density now comes from tightened
 * letter-spacing at the consuming rules, and the narrow system faces stay in
 * the fallback slot so an unresolved webfont still fits the tight HUD boxes.
 * Every rule that uses this stack also sets tabular numerals (fonts.css block
 * below), so timers and counters never jitter.
 */
export const FONT_COND = "'Inter','Arial Narrow','Avenir Next Condensed','Helvetica Neue Condensed','Roboto Condensed','Liberation Sans Narrow',Arial,sans-serif";

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
  trackTight: '-.01em', // former-condensed layer: Inter tightened for density
  wBody: 500,  // weight floor — no UI text below this
  wLabel: 600,
  wStrong: 700,
  wDisplay: 800,
};

// Weights the UI actually uses (mapped straight onto the wght axis).
// Floor is 500: nothing below medium anywhere in the UI.
const WEIGHTS = [500, 600, 700, 800];

const FONT_URL = '/fonts/inter/InterVariable.woff2';

const FONT_CSS = `@font-face{
  font-family:'Inter';
  src:url('${FONT_URL}') format('woff2');
  font-weight:100 900;font-style:normal;font-display:swap;}
/* stats and timers line up: lining tabular figures across every overlay */
.cot-garage,.cot-hud,.cot-settings,.cot-dp,.cot-tt,.cot-hints,.cot-end{
  font-variant-numeric:lining-nums tabular-nums;}
/* weight floor 500 for every overlay root: unweighted text never renders at
   book/regular (explicit 600/700/800 hierarchy steps are unaffected) */
.cot-garage,.cot-hud,.cot-settings,.cot-dp,.cot-tt,.cot-hints,.cot-end,
.cot-bl,.cot-si,.cot-kc,.cot-touch,.cot-studio{
  font-weight:500;font-optical-sizing:auto;}`;

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
    for (const w of WEIGHTS) {
      document.fonts.load(`${w} 16px Inter`).catch(() => {});
    }
  }
}
