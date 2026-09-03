import type { RuntimeValue } from '../runtimeTypes.ts';
/**
 * Retryable owner for the battle-only HUD graph.
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
  hud: () => import('./hud.ts'),
  damagePanel: async () => await import('./damagePanel.ts'),
  tankThumbs: () => import('./tankThumbs.ts'),
};

export function createBattleHudAccess(
  bus: HudBus,
  engineCtx: TankThumbEngineContext,
  loaders: BattleHudLoaders = DEFAULT_LOADERS,
): BattleHudAccess {
  let current: BattleHudBundle | null = null;
  let pending: Promise<BattleHudBundle> | null = null;

  const preload = (): Promise<BattleHudBundle> => {
    if (current) return Promise.resolve(current);
    if (pending) return pending;

    const request = Promise.all([
      loaders.hud(),
      loaders.damagePanel(),
      loaders.tankThumbs(),
    ]).then(([hudModule, damagePanelModule, tankThumbModule]) => {
      tankThumbModule.initTopMaskRig(engineCtx);
      const hud = hudModule.initHud(bus);
      const damagePanel = damagePanelModule.createDamagePanel();
      hud.setDamagePanel(damagePanel);
      current = Object.freeze({ hud, damagePanel });
      return current;
    }).catch((error: RuntimeValue) => {
      if (pending === request) pending = null;
      throw error;
    });

    pending = request;
    return request;
  };

  return {
    preload,
    get current() { return current; },
  };
}
