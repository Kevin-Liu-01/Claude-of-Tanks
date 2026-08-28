import type { ArmorAimOverlayRuntime } from './armorAimOverlay.ts';

export type {
  ArmorAimOverlayRuntime,
  ArmorOverlayModel,
  ArmorOverlayTarget,
} from './armorAimOverlay.ts';

interface ArmorAimOverlayModule {
  createArmorAimOverlay(): ArmorAimOverlayRuntime;
}

export interface ArmorAimOverlayAccess extends ArmorAimOverlayRuntime {
  preload(): Promise<ArmorAimOverlayRuntime>;
  isReady(): boolean;
  readonly current: ArmorAimOverlayRuntime | null;
}

const loadDefaultOverlay = async (): Promise<ArmorAimOverlayModule> =>
  await import('./armorAimOverlay.ts') as ArmorAimOverlayModule;

/**
 * Retryable battle-only owner for the exact plate flashlight. The overlay is
 * presentation-only, so every forwarding method is deliberately fail-soft:
 * a delayed or failed optional chunk must never break battle entry or create
 * a per-frame exception storm. Entry paths still preload it under their
 * loading veil so the normal visual contract is unchanged.
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

  return {
    preload,
    isReady: () => current !== null,
    prime: (target) => current?.prime(target) ?? null,
    warm: () => current?.warm() ?? (() => {}),
    update: (options) => { current?.update(options); },
    hide: () => { current?.hide(); },
    clear: () => { current?.clear(); },
    dispose: () => { current?.dispose(); },
    get current() { return current; },
  };
}
