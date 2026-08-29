/**
 * Retryable owner for the battle-only HUD graph.
 *
 * The garage does not render the combat HUD, damage schematic, or their
 * top-down mask rig. Keeping those modules behind this boundary removes them
 * from the first-visit graph while preserving one shared runtime for solo,
 * network, capture, and debug entry paths.
 */

import type { DamagePanelController } from './damagePanel.ts';

export type DamagePanelRuntime = DamagePanelController;

export interface BattleHudRuntime {
  setDamagePanel(panel: DamagePanelRuntime): void;
}

export interface BattleHudBundle {
  hud: BattleHudRuntime;
  damagePanel: DamagePanelRuntime;
}

interface HudModule {
  initHud(bus: unknown): BattleHudRuntime;
}

interface DamagePanelModule {
  createDamagePanel(): DamagePanelRuntime;
}

interface TankThumbModule {
  initTopMaskRig(engineCtx: unknown): void;
}

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
  // The legacy JS modules intentionally expose broad Function annotations.
  // This access boundary narrows only the methods it owns and validates by
  // immediate construction; consumers receive the explicit runtime contract.
  hud: async () => await import('./hud.js') as unknown as HudModule,
  damagePanel: async () => await import('./damagePanel.ts'),
  tankThumbs: async () => await import('./tankThumbs.ts') as unknown as TankThumbModule,
};

export function createBattleHudAccess(
  bus: unknown,
  engineCtx: unknown,
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
    }).catch((error: unknown) => {
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
