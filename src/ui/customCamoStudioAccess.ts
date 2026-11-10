import { createLazyChunk } from '../app/lazyChunk.ts';

export interface CustomCamoStudioController {
  open(): void;
  syncSelected(): void;
  close(options?: { restoreFocus?: boolean; immediate?: boolean }): void;
  dispose(): void;
}

export interface CustomCamoStudioAccess {
  preload(): Promise<CustomCamoStudioController>;
  /** Load, then open unless `stillWanted` says the page that asked is gone (2026-11-02 audit F5: the Garage hid). */
  open(stillWanted?: () => boolean): Promise<CustomCamoStudioController>;
  peek(): CustomCamoStudioController | null;
}

/**
 * Own the optional custom-paint transfer and editor generation: one opener's chunk (app/lazyChunk.ts, `opener: true`).
 * Any failure is kept for the document, so neither the Garage's intent preload (a pointer or the focus over the swatch,
 * every move) nor a press asks for it again; the Garage marks the swatch, and its next press reloads the page once online
 * (components/loadFailure.ts). (Round 2 U35: the memo here cleared every failure, and each intent asked a failed chunk
 * again at once, with no backoff, no offline gate and no reload path.) Concurrent asks share one load and one editor.
 */
export function createCustomCamoStudioAccess(
  load: () => Promise<CustomCamoStudioController>,
): CustomCamoStudioAccess {
  if (typeof load !== 'function') throw new TypeError('custom camo studio access requires a loader');
  const chunk = createLazyChunk(load, { opener: true });
  return {
    preload: () => chunk.load(),
    async open(stillWanted) {
      const loaded = await chunk.load();
      if (!stillWanted || stillWanted()) loaded.open();
      return loaded;
    },
    peek: () => chunk.value,
  };
}
