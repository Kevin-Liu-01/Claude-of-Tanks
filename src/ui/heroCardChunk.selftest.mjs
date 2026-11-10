// heroCardChunk.selftest.mjs — the hero cards' one load for the document (2026-11-02 audit R6, review round 2).
// Copyright © 2026 Kevin B. Liu.
//
// heroCard.css had six boundaries in the game (the Garage's roster and tech tree, the loading screen, the report, the
// Studio's inspector; the Gallery its own), each with its own state. Vite's preload keeps one `seen` map for the
// document and never adds a failed stylesheet again: a later load that names it skips it and succeeds, so after the
// sheet failed at one boundary the next surface drew its cards unstyled. Here a resolve hook plays Vite's preload for
// heroCard.css (the first ask fails as Vite's does, every later one is "skipped" and succeeds); the browser hazard
// itself needs a document and was not reproduced. Asserted: the one owner keeps the failure for every surface and never
// asks the sheet again, where a second owner of its own (the old shape) "loads" without it.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const CARD_STUB = `data:text/javascript,${encodeURIComponent('export const decorateHeroTile = () => true;')}`;
const SHEET_STUB = `data:text/javascript,${encodeURIComponent('export default {};')}`;
let sheetAsks = 0;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === './heroCard.ts') return { url: CARD_STUB, shortCircuit: true };
    if (specifier === './heroCard.css') {
      // Vite's preloadOnce: a failed href stays in `seen` (seen[href] = void 0), and a later preload of it adds nothing
      if (sheetAsks++ === 0) throw new Error('Unable to preload CSS for /assets/heroCard-k3x9q2a1.css');
      return { url: SHEET_STUB, shortCircuit: true };
    }
    return next(specifier, context);
  },
});
const { heroCardChunk } = await import('./heroCardChunk.ts');
const { createLazyChunk, importAll } = await import('../app/lazyChunk.ts');

// the battle report's card asks first, and the sheet does not arrive
const first = await heroCardChunk.load().then(() => null, (error) => error);
assert.match(String(first?.message), /unable to preload css/i, 'the first surface sees the stylesheet fail');
assert.equal(heroCardChunk.terminal, true, 'a failed sheet is terminal for the document');
// the next surfaces (the Studio's inspector, the loading screen's cards, the Garage's tech tree) ask the same load
for (let i = 0; i < 3; i++) {
  await assert.rejects(heroCardChunk.load(), /unable to preload css/i, 'each later surface keeps its fallback portrait');
}
assert.equal(sheetAsks, 1, 'and the sheet is never asked again, so no surface can draw a card without it');

// the old shape, a second owner with its own state: Vite's preload skips the failed sheet, and the load "succeeds"
const ownBoundary = createLazyChunk(() => importAll([import('./heroCard.ts'), import('./heroCard.css')]));
const [cards] = await ownBoundary.load();
assert.equal(typeof cards.decorateHeroTile, 'function', 'a second owner loads the cards without their sheet (the hazard)');
console.log('heroCardChunk: one hero card load keeps a failed heroCard.css for every surface and never asks it again (a second owner would draw unstyled cards)');
