// photoModeChunk.ts — photo mode's module and its stylesheet, one load for the document (photo-mode-271b, shipped in
// settings-unify-278). Copyright © 2026 Kevin B. Liu.
//
// The Garage's Photo action and a solo battle's photo mode (game/battlePhotoMode.ts) open the same bar (photoMode.ts) on
// the same sheet (photoMode.css). Vite's preload keeps one map of stylesheets for the whole document and never adds a
// failed one again, so a sheet asked for at two places that each kept their own state could fail at one and load
// "successfully" unstyled at the other (app/lazyChunkSites.selftest.mjs; as ui/heroCardChunk.ts). Held once, an
// opener's chunk: any failure is terminal, and each trigger's next press reloads the page (components/loadFailure.ts).
import { createLazyChunk, importAll } from '../app/lazyChunk.ts';

export const photoModeChunk = createLazyChunk(() => importAll([import('./photoMode.ts'), import('./photoMode.css')]).then(([module]) => module),
  { opener: true });
