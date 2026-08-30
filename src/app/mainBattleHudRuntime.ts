/**
 * Phase-owned access to the battle HUD and damage panel.
 *
 * The concrete HUD graph remains demand-loaded by `battleHudAccess`. This
 * owner adds the application-level side effects that every acquisition must
 * perform and keeps replay visibility changes atomic across both surfaces.
 */
import {
  createBattleHudAccess,
  type BattleHudAccess,
  type BattleHudBundle,
  type BattleHudRuntime,
  type DamagePanelRuntime,
} from '../ui/battleHudAccess.ts';

type HudBus = Parameters<typeof createBattleHudAccess>[0];
type HudEngineContext = Parameters<typeof createBattleHudAccess>[1];

export interface MainBattleHudRuntimeOptions {
  bus: HudBus;
  engineContext: HudEngineContext;
  directionalHitValuesEnabled(): boolean;
  queueMinimap(): void;
  access?: BattleHudAccess;
}

export interface MainBattleHudRuntime {
  preload(): Promise<BattleHudBundle>;
  currentHud(): BattleHudRuntime | null;
  currentDamagePanel(): DamagePanelRuntime | null;
  veil(hidden: boolean): void;
}

export function createMainBattleHudRuntime(
  options: MainBattleHudRuntimeOptions,
): MainBattleHudRuntime {
  const access = options.access
    ?? createBattleHudAccess(options.bus, options.engineContext);

  const currentHud = (): BattleHudRuntime | null => access.current?.hud ?? null;
  const currentDamagePanel = (): DamagePanelRuntime | null => (
    access.current?.damagePanel ?? null
  );

  const preload = async (): Promise<BattleHudBundle> => {
    const runtime = await access.preload();
    options.bus.emit('ui:directionalHitValues', {
      on: options.directionalHitValuesEnabled(),
    });
    options.queueMinimap();
    return runtime;
  };

  const veil = (hidden: boolean): void => {
    const hud = currentHud();
    if (hud?.root) hud.root.style.display = hidden ? 'none' : '';
    if (hud?.shotInfo?.statsRoot) {
      hud.shotInfo.statsRoot.style.visibility = hidden ? 'hidden' : '';
    }
    const damagePanel = currentDamagePanel();
    if (damagePanel?.root) {
      damagePanel.root.style.visibility = hidden ? 'hidden' : '';
    }
  };

  return { preload, currentHud, currentDamagePanel, veil };
}
