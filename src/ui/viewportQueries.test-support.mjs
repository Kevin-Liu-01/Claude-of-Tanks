// viewportQueries.test-support.mjs — the public pages' media queries follow responsiveLayout.ts's viewport bands.
// Copyright © 2026 Kevin B. Liu.
//
// The public stylesheets (home, docs, Gallery, media archive, public nav) lay out at first paint from media queries
// (brand-ui SPEC §5.5) instead of the body[data-cot-*] hooks the boot module writes after it runs. They stay one
// viewport contract with the game shell: every width or height bound in their @media preludes is an edge of
// responsiveLayout.ts's bands (or its density and persistent-panel thresholds, proven here from classifyViewport), in
// range syntax so a band's exclusive edge reads the same in both places.
import { VIEWPORT_HEIGHT_BANDS, VIEWPORT_WIDTH_BANDS, classifyViewport } from './responsiveLayout.ts';

const edges = (bands) => Object.values(bands).map((band) => band.min).filter((min) => min > 0);
/** The first width at which classifyViewport() changes `key` from `from`, searched over whole pixels. */
function threshold(axis, key, from, extra = {}) {
  for (let px = 200; px < 3000; px++) {
    const size = axis === 'width' ? { width: px, height: 800 } : { width: 1600, height: px };
    if (classifyViewport({ ...size, hover: true, coarsePointer: false, ...extra })[key] !== from) return px;
  }
  throw new Error(`no ${key} threshold on ${axis}`);
}
const NARROW_MAX = threshold('width', 'widthDensity', 'narrow') - 1; // narrow: width <= NARROW_MAX
const TIGHT_MAX = threshold('height', 'heightDensity', 'tight') - 1; // tight: height <= TIGHT_MAX
const PANELS_MIN = threshold('width', 'overlayPanels', true); // fine pointer: persistent from PANELS_MIN up

/** Bounds a public stylesheet may name: `<`/`>=` take band edges, `<=`/`>` take the density maxima. */
export const VIEWPORT_QUERY_BOUNDS = Object.freeze({
  width: Object.freeze({ edges: [...edges(VIEWPORT_WIDTH_BANDS), PANELS_MIN], inclusive: [NARROW_MAX] }),
  height: Object.freeze({ edges: edges(VIEWPORT_HEIGHT_BANDS), inclusive: [TIGHT_MAX] }),
});

/** Every violation of the contract in one stylesheet (empty when it holds). */
export function viewportQueryViolations(css, label = 'stylesheet') {
  const text = String(css).replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  if (/data-cot-(?:width|height|width-density|height-density|orientation|input|panels)\b/.test(text)) {
    out.push(`${label}: reads a body[data-cot-*] hook; public pages lay out from media queries at first paint`);
  }
  for (const [, prelude] of text.matchAll(/@media\s*([^{]+)\{/g)) {
    if (/\b(?:max|min)-(?:width|height)\s*:|\borientation\s*:/.test(prelude)) out.push(`${label}: legacy media feature in "@media ${prelude.trim()}" (use range syntax at a band edge)`);
    for (const axis of ['width', 'height']) {
      const allowed = VIEWPORT_QUERY_BOUNDS[axis];
      const check = (op, px) => {
        const list = op === '<' || op === '>=' ? allowed.edges : allowed.inclusive;
        if (!list.includes(px)) out.push(`${label}: "${axis} ${op} ${px}px" in "@media ${prelude.trim()}" is not a responsiveLayout.ts edge (${list.join(', ')})`);
      };
      for (const m of prelude.matchAll(new RegExp(`(\\d+)px\\s*(<=|<)\\s*${axis}\\s*(<=|<)\\s*(\\d+)px`, 'g'))) {
        check(m[2] === '<=' ? '>=' : '>', Number(m[1])); check(m[3], Number(m[4]));
      }
      const single = prelude.replace(new RegExp(`\\d+px\\s*<=?\\s*${axis}\\s*<=?\\s*\\d+px`, 'g'), '');
      for (const m of single.matchAll(new RegExp(`\\b${axis}\\s*(<=|<|>=|>)\\s*(\\d+)px`, 'g'))) check(m[1], Number(m[2]));
    }
  }
  return out;
}
