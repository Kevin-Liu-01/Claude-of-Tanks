import { createLazyChunk, importAll } from '../app/lazyChunk.ts';
/**
 * Retryable owner for the battle-only HUD graph (2026-11-02 audit R6: its chunks under the one lazy-chunk policy,
 * app/lazyChunk.ts: a failed module is asked again by the next battle, a failed stylesheet never, so the HUD never runs
 * unstyled; the battle entry's own failure marks the battle button and its next press reloads).
 *
 * The garage does not render the combat HUD, damage schematic, or their
 * top-down mask rig. Keeping those modules behind this boundary removes them
 * from the first-visit graph while preserving one shared runtime for solo,
 * network, capture, and debug entry paths.
 */

import type { DamagePanelController } from './damagePanel.ts';
import type { HudRuntime } from './hud.ts';

export type DamagePanelRuntime = DamagePanelController;
export type BattleHudRuntime = HudRuntime;

export interface BattleHudBundle {
  hud: BattleHudRuntime;
  damagePanel: DamagePanelRuntime;
}

type HudModule = Pick<typeof import('./hud.ts'), 'initHud'>;
type DamagePanelModule = Pick<typeof import('./damagePanel.ts'), 'createDamagePanel'>;
type TankThumbModule = Pick<typeof import('./tankThumbs.ts'), 'initTopMaskRig'>;
type HudBus = Parameters<HudModule['initHud']>[0];
type TankThumbEngineContext = Parameters<TankThumbModule['initTopMaskRig']>[0];

interface BattleHudLoaders {
  hud(): Promise<HudModule>;
  damagePanel(): Promise<DamagePanelModule>;
  tankThumbs(): Promise<TankThumbModule>;
}

export interface BattleHudAccess {
  preload(): Promise<BattleHudBundle>;
  readonly current: BattleHudBundle | null;
}

const DEFAULT_LOADERS: BattleHudLoaders = {
  // The aerial instruments' stylesheet loads beside the HUD, never from inside its graph:
  // plain-Node selftests import hud.ts, and Node cannot load a stylesheet.
  hud: async () => (await importAll([import('./hud.ts'), import('./aerialHud.css'), import('./airSupportHud.css')]))[0],
  damagePanel: async () => await import('./damagePanel.ts'),
  tankThumbs: () => import('./tankThumbs.ts'),
};

export function createBattleHudAccess(
  bus: HudBus,
  engineCtx: TankThumbEngineContext,
  loaders: BattleHudLoaders = DEFAULT_LOADERS,
): BattleHudAccess {
  // (every part settles first, importAll: a module that failed first must not hide aerialHud.css's failure, or the
  // next battle would ask again and run the HUD without it)
  const bundle = createLazyChunk(() => importAll([
    loaders.hud(),
    loaders.damagePanel(),
    loaders.tankThumbs(),
  ]).then(([hudModule, damagePanelModule, tankThumbModule]): BattleHudBundle => {
    tankThumbModule.initTopMaskRig(engineCtx);
    const hud = hudModule.initHud(bus);
    const damagePanel = damagePanelModule.createDamagePanel();
    hud.setDamagePanel(damagePanel);
    // (2026-11-02 audit, 04-ui-1 #7) the return to the Garage ends the battle's panel: a mask retry still pending for
    // its tank never runs a build in the Garage, and the battle's visual is let go
    bus.on('phase:change', (payload) => {
      if ((payload as { phase?: string } | null)?.phase === 'garage') damagePanel.clear();
    });
    return Object.freeze({ hud, damagePanel });
  }));

  return {
    preload: () => bundle.load(),
    get current() { return bundle.value; },
  };
}
