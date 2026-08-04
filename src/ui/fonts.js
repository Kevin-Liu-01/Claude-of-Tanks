// src/ui/fonts.js — shared UI typography: self-hosted ABC Monument Grotesk
// (Dinamo Typefaces — commercial face, owner-provided cut; see
// docs/ATTRIBUTION.md) + the canonical font stacks and type tokens every UI
// module imports. Injecting once here keeps all screens (garage, HUD,
// settings, damage panel, tech tree, overlays) on the exact same system.
//
// PROVENANCE: the owner originally asked for Klim's "Die Grotesk"
// (unobtainable); Archivo shipped as the documented free substitute; then
// Inter (fonts r3); then the owner directed THIS swap to ABC Monument
// Grotesk (fonts r4, 2026-08-04) using their own Dinamo cut. TYPE MANDATE
// carries over: usage weight floor is 500 (body/default 500, hierarchy
// 600/700/800 — nothing in the UI renders below medium).
//
// Hosting (public/fonts/abc-monument-grotesk/): THREE static woff2 faces —
// Regular / Medium / Bold — declared with @font-face weight RANGES so the
// existing weight hierarchy maps without touching call sites: 100-400 →
// Regular, 500-600 → Medium (the UI workhorse), 700-900 → Bold. Monument
// Grotesk has no condensed cut either, so the FONT_COND rules keep their
// tightened tracking and narrow system fallbacks.

/** Primary UI stack — Monument Grotesk with grotesque system fallbacks. */
export const FONT_STACK = "'ABC Monument Grotesk','Inter','Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * Numeral / label stack (HUD counters, timers, stat labels, damage panel).
 * Historically a condensed grotesque (WoT-style military HUD look); under
 * Monument Grotesk it is the same family — the density comes from tightened
 * letter-spacing at the consuming rules, and the narrow system faces stay in
 * the fallback slot so an unresolved webfont still fits the tight HUD boxes.
 * Every rule that uses this stack also sets tabular numerals (fonts.css block
 * below), so timers and counters never jitter.
 */
export const FONT_COND = "'ABC Monument Grotesk','Arial Narrow','Avenir Next Condensed','Helvetica Neue Condensed','Roboto Condensed','Liberation Sans Narrow',Arial,sans-serif";

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

// Weights the UI actually uses (resolved against the face ranges below).
// Floor is 500: nothing below medium anywhere in the UI.
const WEIGHTS = [500, 600, 700, 800];

const FONT_DIR = '/fonts/abc-monument-grotesk';

const FONT_CSS = `@font-face{
  font-family:'ABC Monument Grotesk';
  src:url('${FONT_DIR}/ABCMonumentGrotesk-Regular.woff2') format('woff2');
  font-weight:100 400;font-style:normal;font-display:swap;}
@font-face{
  font-family:'ABC Monument Grotesk';
  src:url('${FONT_DIR}/ABCMonumentGrotesk-Medium.woff2') format('woff2');
  font-weight:500 600;font-style:normal;font-display:swap;}
@font-face{
  font-family:'ABC Monument Grotesk';
  src:url('${FONT_DIR}/ABCMonumentGrotesk-Bold.woff2') format('woff2');
  font-weight:700 900;font-style:normal;font-display:swap;}
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
      document.fonts.load(`${w} 16px 'ABC Monument Grotesk'`).catch(() => {});
    }
  }
}
