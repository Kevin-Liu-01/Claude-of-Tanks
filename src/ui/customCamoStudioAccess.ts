export interface CustomCamoStudioController {
  open(): void;
  syncSelected(): void;
  close(options?: { restoreFocus?: boolean; immediate?: boolean }): void;
  dispose(): void;
}

export interface CustomCamoStudioAccess {
  preload(): Promise<CustomCamoStudioController>;
  open(): Promise<CustomCamoStudioController>;
  peek(): CustomCamoStudioController | null;
}

/**
 * Own the optional custom-paint transfer and editor generation. A failed
 * load is forgotten (one that threw for another reason may build next time);
 * the Garage never asks again for a chunk that did not arrive: its trigger
 * keeps the kit's error state and the next press reloads the page
 * (components/loadFailure.ts). Concurrent clicks share one editor instance.
 */
export function createCustomCamoStudioAccess(
  load: () => Promise<CustomCamoStudioController>,
): CustomCamoStudioAccess {
  if (typeof load !== 'function') throw new TypeError('custom camo studio access requires a loader');

  let controller: CustomCamoStudioController | null = null;
  let pending: Promise<CustomCamoStudioController> | null = null;

  const acquire = (): Promise<CustomCamoStudioController> => {
    if (controller) return Promise.resolve(controller);
    if (pending) return pending;
    const request = load().then((loaded) => {
      controller = loaded;
      pending = null;
      return loaded;
    });
    pending = request;
    request.catch(() => {
      if (pending === request) pending = null;
    });
    return request;
  };

  return {
    preload: acquire,
    async open() {
      const loaded = await acquire();
      loaded.open();
      return loaded;
    },
    peek: () => controller,
  };
}
