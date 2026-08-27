import type { EventBus } from './stateCore.ts';

export interface ShellCard {
  name: string;
  type: string;
  dmg: number;
  penLabel: string;
  count: number;
}

interface ShellSpec {
  name: string;
  type: string;
  dmg: number;
  pen100Mm: number;
  count?: number | null;
}

interface TankSpec {
  gun: { shells: ShellSpec[] };
}

interface CombatState {
  destroyed?: boolean;
  shellSlot: number;
  magazine?: unknown;
  crew: Record<string, boolean>;
  fire: {
    burning: boolean;
    ticksLeft: number;
    tickTimer: number;
  };
  [key: string]: unknown;
}

interface PlayerEntity {
  id: string;
  spec: TankSpec;
  combat: CombatState;
  input: { shellSlot: number };
  [key: string]: unknown;
}

interface BattleActionGame {
  phase: string;
  timeS: number;
  player: PlayerEntity | null;
}

interface ActionInput {
  onAction(actionId: string, listener: () => void): () => void;
}

interface ActionRules {
  selectShell(combat: CombatState, slot: number, spec: TankSpec): void;
  repairAllModules(combat: CombatState): Iterable<string>;
  startMagazineReload(combat: CombatState, spec: TankSpec): void;
  activateSpecialAction(player: PlayerEntity): { ok: boolean; [key: string]: unknown };
  specialActionLocksShell(player: PlayerEntity): boolean;
  hasConsumableRule(slot: number): boolean;
  cooldownRemaining(timeS: number, readyAtS: number): number;
  resetConsumableCooldowns(readyAt: number[]): void;
  startConsumableCooldown(
    readyAt: number[],
    slot: number,
    timeS: number,
  ): Record<string, unknown>;
}

interface NetworkActionPort {
  isActive(): boolean;
  queueConsumable(slot: number): void;
  queueAction(action: 'reloadMagazine' | 'specialAction'): void;
}

export interface PlayerBattleActionsOptions {
  game: BattleActionGame;
  bus: EventBus;
  input: ActionInput;
  rules: ActionRules;
  network: NetworkActionPort;
  isSettingsOpen(): boolean;
}

export interface PlayerBattleActions {
  readonly shellCards: ShellCard[];
  setTank(spec: TankSpec): ShellCard[];
  hasAmmo(slot: number): boolean;
  resetConsumables(): void;
  dispose(): void;
}

const SHELL_LOADOUT: Readonly<Record<string, number>> = Object.freeze({
  AP: 24,
  APCR: 20,
  APFSDS: 24,
  HEAT: 16,
  HE: 12,
});

/**
 * Own the player's ammunition, consumables, and action routing.
 *
 * The module is intentionally DOM- and Three-free. Local simulation rules and
 * the multiplayer command lane are ports, so the same public interface can be
 * exercised in Node without importing the battle renderer or authority.
 */
export function createPlayerBattleActions({
  game,
  bus,
  input,
  rules,
  network,
  isSettingsOpen,
}: PlayerBattleActionsOptions): PlayerBattleActions {
  if (!game || !bus || !input || !rules || !network
      || typeof isSettingsOpen !== 'function') {
    throw new TypeError('player battle actions require game, bus, input, rules, and network ports');
  }

  const shellCards: ShellCard[] = [];
  const consumableReadyAt = [0, 0, 0];
  const disposeCallbacks: Array<() => void> = [];
  const listen = (event: string, listener: (payload: unknown) => void): void => {
    disposeCallbacks.push(bus.on(event, listener));
  };
  const onAction = (action: string, listener: () => void): void => {
    disposeCallbacks.push(input.onAction(action, listener));
  };

  const battleInputAllowed = (): boolean =>
    game.phase === 'battle' && !isSettingsOpen();
  const livePlayer = (): PlayerEntity | null => {
    const player = game.player;
    return player?.combat && !player.combat.destroyed ? player : null;
  };

  for (let slot = 0; slot < 3; slot++) {
    onAction(`shell${slot + 1}`, () => {
      if (!battleInputAllowed()) return;
      bus.emit('ui:shellSelect', { slot });
      bus.emit('ui:click', {});
    });
  }

  onAction('reloadMagazine', () => {
    if (!battleInputAllowed()) return;
    bus.emit('ui:magazineReload', {});
  });

  onAction('specialAction', () => {
    if (!battleInputAllowed()) return;
    bus.emit('ui:specialAction', {});
  });

  for (let slot = 0; slot < 3; slot++) {
    onAction(`consumable${slot + 1}`, () => {
      if (!battleInputAllowed()) return;
      bus.emit('ui:consumable', { slot });
    });
  }

  listen('ui:consumable', (payload) => {
    const slot = Number((payload as { slot?: unknown } | null)?.slot);
    const player = battleInputAllowed() ? livePlayer() : null;
    if (!player || !Number.isInteger(slot) || !rules.hasConsumableRule(slot)) return;
    if (network.isActive()) {
      network.queueConsumable(slot);
      bus.emit('ui:click', {});
      return;
    }
    const remainingS = rules.cooldownRemaining(game.timeS, consumableReadyAt[slot]);
    if (remainingS > 0) {
      bus.emit('ui:consumableDenied', { slot, reason: 'COOLDOWN', remainingS });
      return;
    }
    const combat = player.combat;
    let used = false;
    if (slot === 0) {
      for (const name of rules.repairAllModules(combat)) {
        bus.emit('module:state', { id: player.id, module: name, state: 'ok' });
        used = true;
      }
    } else if (slot === 1) {
      for (const name of Object.keys(combat.crew)) {
        if (combat.crew[name] === false) {
          combat.crew[name] = true;
          used = true;
        }
      }
    } else if (slot === 2 && combat.fire.burning) {
      combat.fire.burning = false;
      combat.fire.ticksLeft = 0;
      combat.fire.tickTimer = 0;
      bus.emit('tank:fire', { id: player.id, burning: false });
      used = true;
    }
    if (!used) {
      bus.emit('ui:consumableDenied', { slot, reason: 'NOTHING' });
      return;
    }
    const cooldown = rules.startConsumableCooldown(consumableReadyAt, slot, game.timeS);
    bus.emit('ui:consumableUsed', { slot, ...cooldown });
    bus.emit('ui:click', {});
  });

  onAction('minimapZoom', () => {
    if (game.phase === 'battle') bus.emit('ui:minimapZoom', {});
  });

  onAction('shotLog', () => {
    if (game.phase === 'battle') bus.emit('ui:shotLog', {});
  });

  listen('ui:shellSelect', (payload) => {
    const slot = Number((payload as { slot?: unknown } | null)?.slot);
    const player = livePlayer();
    if (!player || !Number.isInteger(slot) || slot < 0) return;
    if (rules.specialActionLocksShell(player)) return;
    if (slot === player.combat.shellSlot && player.combat.magazine) {
      bus.emit('ui:magazineReload', {});
      return;
    }
    rules.selectShell(player.combat, slot, player.spec);
    player.input.shellSlot = slot;
  });

  listen('ui:magazineReload', () => {
    const player = battleInputAllowed() ? livePlayer() : null;
    if (!player) return;
    if (network.isActive()) network.queueAction('reloadMagazine');
    else rules.startMagazineReload(player.combat, player.spec);
    bus.emit('ui:click', {});
  });

  listen('ui:specialAction', () => {
    const player = battleInputAllowed() ? livePlayer() : null;
    if (!player) return;
    if (network.isActive()) network.queueAction('specialAction');
    else {
      const result = rules.activateSpecialAction(player);
      bus.emit(result.ok ? 'ui:specialActionResult' : 'ui:specialActionDenied', result);
    }
    bus.emit('ui:click', {});
  });

  listen('shell:fired', (payload) => {
    if (!(payload as { isPlayer?: unknown } | null)?.isPlayer || !game.player?.combat) return;
    const card = shellCards[game.player.combat.shellSlot];
    if (card && card.count > 0) card.count -= 1;
  });

  return {
    shellCards,
    setTank(spec) {
      shellCards.length = 0;
      for (const shell of spec.gun.shells) {
        shellCards.push({
          name: shell.name,
          type: shell.type,
          dmg: shell.dmg,
          penLabel: `${Math.round(shell.pen100Mm)} mm`,
          count: shell.count != null
            ? shell.count
            : (SHELL_LOADOUT[shell.type] ?? 20),
        });
      }
      return shellCards;
    },
    hasAmmo(slot) {
      const card = shellCards[slot];
      return shellCards.length === 0 || ((card?.count ?? 0) | 0) > 0;
    },
    resetConsumables() {
      rules.resetConsumableCooldowns(consumableReadyAt);
    },
    dispose() {
      for (const dispose of disposeCallbacks.splice(0)) dispose();
    },
  };
}
