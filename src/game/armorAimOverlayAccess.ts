export interface ArmorAimOverlayRuntime {
  prime(target: unknown): unknown;
  warm(): () => void;
  update(options: unknown): void;
  hide(): void;
  clear(): void;
  dispose(): void;
}

interface ArmorAimOverlayModule {
  createArmorAimOverlay(): ArmorAimOverlayRuntime;
}

export interface ArmorAimOverlayAccess extends ArmorAimOverlayRuntime {
  preload(): Promise<ArmorAimOverlayRuntime>;
  isReady(): boolean;
  readonly current: ArmorAimOverlayRuntime | null;
}

const loadDefaultOverlay = async (): Promise<ArmorAimOverlayModule> =>
  await import('./armorAimOverlay.js') as unknown as ArmorAimOverlayModule;

/**
 * Retryable battle-only owner for the exact plate flashlight. Garage boot can
 * safely clear/hide an absent overlay; construction and sampling require the
 * covered battle/capture acquisition barrier to have completed.
 */
export function createArmorAimOverlayAccess(
  load: () => Promise<ArmorAimOverlayModule> = loadDefaultOverlay,
): ArmorAimOverlayAccess {
  let current: ArmorAimOverlayRuntime | null = null;
  let pending: Promise<ArmorAimOverlayRuntime> | null = null;

  const preload = (): Promise<ArmorAimOverlayRuntime> => {
    if (current) return Promise.resolve(current);
    if (pending) return pending;
    const request = load().then((module) => {
      current = module.createArmorAimOverlay();
      return current;
    }).catch((error: unknown) => {
      if (pending === request) pending = null;
      throw error;
    });
    pending = request;
    return request;
  };

  const requireRuntime = (): ArmorAimOverlayRuntime => {
    if (!current) throw new Error('Armor aim overlay runtime is not ready.');
    return current;
  };

  return {
    preload,
    isReady: () => current !== null,
    prime: (target) => requireRuntime().prime(target),
    warm: () => requireRuntime().warm(),
    update: (options) => requireRuntime().update(options),
    hide: () => { current?.hide(); },
    clear: () => { current?.clear(); },
    dispose: () => { current?.dispose(); },
    get current() { return current; },
  };
}
