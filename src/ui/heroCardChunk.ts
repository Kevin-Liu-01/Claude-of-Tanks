// heroCardChunk.ts — the hero card module and its stylesheet, one load for the document (2026-11-02 audit R6, review
// round 2). Copyright © 2026 Kevin B. Liu.
//
// Every surface that shows hero cards (the Garage's roster and its tech tree, the battle loading screen, the battle
// report, the Studio's inspector, the Gallery) asks for them here. Vite's preload keeps one `seen` map of stylesheets for
// the whole document and never adds a failed one again, so a stylesheet asked for at two places that each kept their
// own state could fail at one and load "successfully" without its sheet at the other: an unstyled card. Held once,
// under the one lazy-chunk policy (app/lazyChunk.ts), a failed heroCard.css is terminal for every surface at once (each
// keeps its packaged portrait or silhouette), and a failed module is asked again by the next surface that needs it.
// No static import of heroCard.ts: the card module stays a lazy chunk (tools/hero-cards.selftest.mjs).
import { createLazyChunk, importAll } from '../app/lazyChunk.ts';

export const heroCardChunk = createLazyChunk(() => importAll([import('./heroCard.ts'), import('./heroCard.css')]).then(([module]) => module));
